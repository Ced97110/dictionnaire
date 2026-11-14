// Sens en contexte en français : 50 occurrences tirées des définitions du dictionnaire
// (mots qui ont au moins 2 sens dans le dictionnaire), expliquées par Haiku, puis jugées
// par un agent Sonnet indépendant (sens retenu correct ou non). Objectif : ≥ 85 %.
// Usage : LIMITE_APPELS_JOUR=1000 node --env-file=.env.local --import tsx tests/sens-fr-eval.mts
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "node:fs";
import pg from "pg";
import { estOutil } from "../lib/gloses.ts";
import { minuscules } from "../lib/normaliser.ts";
import { decouper, expliquer, sensPossibles } from "../lib/sens.ts";

// N=30 MODE=aveugle : le juge choisit le sens sans voir la réponse du système (audit du 2026-11-13).
const N = Number(process.env.N ?? 50);
const AVEUGLE = process.env.MODE === "aveugle";
const JUGE = "claude-sonnet-5-5";
const PARALLELE = 5;
let graine = 20261113;
const alea = () => ((graine = (graine * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await c.connect();
const q = async (s: string, p?: unknown[]) => (await c.query(s, p as unknown[])).rows;

// Mots français qui désignent au moins 2 entrées du dictionnaire.
const ambigus = new Set((await q(`SELECT brute FROM formes WHERE langue = 'fr' GROUP BY brute HAVING count(DISTINCT mot_id) >= 2`)).map((r) => String(r.brute)));
const defs = (await q("SELECT id, def_fr FROM mots WHERE origine = 'import' ORDER BY id")).map((r) => ({ id: String(r.id), texte: String(r.def_fr) }));
const cas: { id: string; texte: string; position: number; mot: string }[] = [];
while (cas.length < N) {
  const d = defs[Math.floor(alea() * defs.length)];
  // Seulement des mots que le site rend consultables (pas les mots-outils comme « pas », « contre »).
  const mots = [...d.texte.matchAll(/[\p{L}]+(?:-[\p{L}]+)*/gu)].filter((m) => m[0].length > 2 && ambigus.has(minuscules(m[0])) && !estOutil(minuscules(m[0]), "fr"));
  if (!mots.length || cas.some((x) => x.id === d.id)) continue;
  const m = mots[Math.floor(alea() * mots.length)];
  cas.push({ id: d.id, texte: d.texte, position: m.index!, mot: m[0] });
}

const api = new Anthropic({ maxRetries: 4 });
// À l'aveugle : le juge donne le numéro du bon sens (0 = aucun ne convient), sans voir le système.
async function choisir(phrase: string, mot: string, sens: string[]): Promise<{ choix: number; raison: string }> {
  const r = await api.messages.create({ model: JUGE, max_tokens: 800, messages: [{ role: "user", content:
`Phrase : « ${phrase} »
Mot : « ${mot} »
Sens possibles :
${sens.map((s, i) => `${i + 1}. ${s}`).join("\n")}
Dans quel sens le mot est-il employé dans cette phrase ? Donne le numéro, ou 0 si aucun sens de la liste ne convient.
Réponds uniquement par un objet JSON : {"choix": <numéro>, "raison": "<une phrase>"}` }] });
  const t = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const j = JSON.parse(t.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
  return { choix: Number(j.choix ?? -1), raison: String(j.raison ?? "") };
}

async function juger(phrase: string, mot: string, sens: string[], verdict: string): Promise<{ correct: boolean; raison: string }> {
  const r = await api.messages.create({ model: JUGE, max_tokens: 800, messages: [{ role: "user", content:
`Tu juges un système qui dit dans quel sens un mot est employé dans une phrase.
Phrase : « ${phrase} »
Mot : « ${mot} »
Sens possibles :
${sens.map((s, i) => `${i + 1}. ${s}`).join("\n")}
Réponse du système : ${verdict}
La réponse du système est-elle correcte pour cette phrase ? (Si le système dit qu'on ne peut pas trancher, elle est correcte seulement si la phrase est vraiment ambiguë entre les deux sens qu'il cite. S'il dit qu'aucun sens proposé ne convient, elle est correcte si c'est vrai et que le sens qu'il donne est juste.)
Réponds uniquement par un objet JSON : {"correct": true ou false, "raison": "<une phrase>"}` }] });
  const t = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const j = JSON.parse(t.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
  return { correct: j.correct === true, raison: String(j.raison ?? "") };
}

const resultats: Record<string, unknown>[] = new Array(cas.length);
let suivant = 0;
async function ouvrier() {
  while (suivant < cas.length) {
    const i = suivant++, x = cas[i];
    const ctx = decouper(x.texte, x.position, x.mot.length)!;
    const sens = await sensPossibles(q, x.mot, "fr");
    const libelle = (id: string) => { const s = sens.find((y) => y.id === id); return s ? `${s.texte_fr} [${s.domaine}]` : id; };
    try {
      const e = await expliquer(q, ctx, sens);
      const verdict = e.tranche && e.sens_retenu === "AUCUN" ? `aucun des sens proposés ne convient ; le sens ici est : « ${e.reformulation_fr} »`
        : e.tranche ? `sens retenu : « ${libelle(e.sens_retenu!)} »` : `on ne peut pas trancher entre « ${libelle(e.sens_alternatifs[0])} » et « ${libelle(e.sens_alternatifs[1])} »`;
      const libelles = sens.map((s) => `${s.texte_fr} [${s.domaine}]`);
      if (AVEUGLE) {
        const j = await choisir(ctx.phrase, x.mot, libelles);
        const systeme = e.tranche ? (e.sens_retenu === "AUCUN" ? 0 : sens.findIndex((y) => y.id === e.sens_retenu) + 1) : -1;
        const alternatifs = e.sens_alternatifs.map((id) => sens.findIndex((y) => y.id === id) + 1);
        resultats[i] = { mot: x.mot, phrase: ctx.phrase, n_sens: sens.length, systeme, alternatifs, juge: j.choix, raison: j.raison,
          aucun_systeme: systeme === 0, aucun_juge: j.choix === 0, correct: systeme === j.choix, partiel: systeme === -1 && alternatifs.includes(j.choix) };
      } else {
        const j = await juger(ctx.phrase, x.mot, libelles, verdict);
        resultats[i] = { mot: x.mot, phrase: ctx.phrase, n_sens: sens.length, verdict, indices: e.indices.map((ind) => ind.mot), ...j };
      }
    } catch (err) {
      resultats[i] = { mot: x.mot, phrase: ctx.phrase, n_sens: sens.length, correct: false, rejete: String(err) };
    }
  }
}
await Promise.all(Array.from({ length: PARALLELE }, ouvrier));
await c.end();
const justes = resultats.filter((r) => r.correct).length;
const resume = { mode: AVEUGLE ? "aveugle" : "le juge voit la réponse", occurrences: N, justes, taux: justes / N,
  rejetes: resultats.filter((r) => r.rejete).length,
  ...(AVEUGLE ? { aucun_systeme: resultats.filter((r) => r.aucun_systeme).length, aucun_juge: resultats.filter((r) => r.aucun_juge).length,
    aucun_les_deux: resultats.filter((r) => r.aucun_systeme && r.aucun_juge).length, non_tranches_avec_bon_sens: resultats.filter((r) => r.partiel).length } : {}) };
writeFileSync(`tests/resultats/sens-fr${AVEUGLE ? "-aveugle" : ""}.json`, JSON.stringify({ resume, resultats }, null, 1));
console.log(JSON.stringify(resume, null, 1));
for (const r of resultats.filter((x) => !x.correct)) console.log("✗", r.mot, "|", String(r.phrase).slice(0, 80), "|", AVEUGLE ? `système ${r.systeme} / juge ${r.juge}` : r.verdict ?? r.rejete, "|", String(r.raison ?? r.rejete ?? "").slice(0, 160));
