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

const N = 50;
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
      const j = await juger(ctx.phrase, x.mot, sens.map((s) => `${s.texte_fr} [${s.domaine}]`), verdict);
      resultats[i] = { mot: x.mot, phrase: ctx.phrase, n_sens: sens.length, verdict, indices: e.indices.map((ind) => ind.mot), ...j };
    } catch (err) {
      resultats[i] = { mot: x.mot, phrase: ctx.phrase, n_sens: sens.length, correct: false, rejete: String(err) };
    }
  }
}
await Promise.all(Array.from({ length: PARALLELE }, ouvrier));
await c.end();
const justes = resultats.filter((r) => r.correct).length;
const resume = { occurrences: N, justes, taux: justes / N, rejetes: resultats.filter((r) => r.rejete).length };
writeFileSync("tests/resultats/sens-fr.json", JSON.stringify({ resume, resultats }, null, 1));
console.log(JSON.stringify(resume, null, 1));
for (const r of resultats.filter((x) => !x.correct)) console.log("✗", r.mot, "|", String(r.phrase).slice(0, 90), "|", r.verdict ?? r.rejete, "|", r.raison ?? "");
