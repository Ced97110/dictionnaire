// Faisabilité d'un premier affichage < 1 s : choix du sens seul, une consigne par langue.
// Appels un par un (délai réel d'un lecteur). Anglais : 50 cas SemCor de mise au point.
// Français : les 30 cas jugés à l'aveugle par Sonnet (tests/resultats/sens-fr-aveugle.json),
// donc sans nouvel appel à Sonnet. Usage : LIMITE_APPELS_JOUR=6000 node --env-file=.env.local --import tsx tests/choix-rapide.mts
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { demander, lireJson } from "../lib/modele.ts";
import { decouper, presenter, sensPossibles, verifier, type Sens } from "../lib/sens.ts";

const CHOIX_EN =
  "Dans quel sens le mot est-il employé dans la PHRASE ? La phrase précédente et la suivante servent de contexte.\n" +
  "Choisis exactement un identifiant de la liste. Cite 1 à 3 indices : des mots copiés tels quels de la PHRASE, sans le mot lui-même.\n" +
  'Réponds uniquement par un objet JSON : {"indices": [{"mot": "<mot de la phrase>"}], "sens_retenu": "<identifiant>"}';
const CHOIX_FR =
  "Dans quel sens le mot est-il employé dans la PHRASE ? La phrase précédente et la suivante servent de contexte.\n" +
  "D'abord, dis ce que le mot veut dire dans cette phrase, en 8 mots au plus, avant de regarder la liste. Puis choisis " +
  "l'identifiant de la liste qui correspond à ce sens, ou AUCUN si aucun sens de la liste ne lui correspond.\n" +
  "Cite 1 à 3 indices : des mots copiés tels quels de la PHRASE, sans le mot lui-même.\n" +
  'Réponds uniquement par un objet JSON : {"sens_ici": "<8 mots au plus>", "indices": [{"mot": "<mot de la phrase>"}], "sens_retenu": "<identifiant ou AUCUN>"}';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED }); await c.connect();
const q = async (s: string, p?: unknown[]) => (await c.query(s, p as unknown[])).rows;

async function choisir(consigne: string, ctx: Parameters<typeof presenter>[0], sens: Sens[]) {
  const t0 = performance.now();
  let texte = presenter(ctx, sens);
  for (let essai = 0; essai < 2; essai++) {
    const v = verifier(lireJson(await demander(q, consigne, texte, 300, false)), sens, ctx);
    if ("ok" in v) return { retenu: v.ok.sens_retenu, ms: performance.now() - t0, essais: essai + 1 };
    texte = `${presenter(ctx, sens)}\n\nTa réponse précédente a été rejetée : ${v.erreur}`;
  }
  return { retenu: null, ms: performance.now() - t0, essais: 2 };
}
const stats = (ms: number[]) => { const s = [...ms].sort((a, b) => a - b); const p = (x: number) => Math.round(s[Math.min(s.length - 1, Math.floor(s.length * x))]); return `médiane ${p(0.5)} ms, 90e centile ${p(0.9)} ms, sous 1 s : ${s.filter((x) => x < 1000).length}/${s.length}`; };

const en = (JSON.parse(readFileSync("tests/semcor_dev.json", "utf8")) as any[]).slice(0, 50);
const rEn = [];
for (const x of en) {
  const sens: Sens[] = x.sens.map((s: any, j: number) => ({ id: `W${j + 1}`, source: "WordNet", texte_en: s.definition, synset: s.synset, synonymes: s.synonymes, exemple: s.exemple || undefined }));
  const r = await choisir(CHOIX_EN, { precedente: x.precedente, phrase: x.phrase, suivante: x.suivante, mot: x.mot }, sens);
  rEn.push({ ...r, juste: sens.find((s) => s.id === r.retenu)?.synset === x.attendu, mfs: x.sens[0].synset === x.attendu });
}
console.log(`Anglais : ${rEn.filter((r) => r.juste).length}/50 justes (plus fréquent ${rEn.filter((r) => r.mfs).length}/50) | ${stats(rEn.map((r) => r.ms))}`);

const fr = (JSON.parse(readFileSync("tests/resultats/sens-fr-aveugle.json", "utf8")).resultats as any[]).filter((r) => typeof r.juge === "number");
const rFr = [];
for (const r of fr) {
  const texte = String(r.phrase), pos = texte.toLowerCase().indexOf(String(r.mot).toLowerCase());
  const ctx = decouper(texte, pos, String(r.mot).length)!;
  const sens = await sensPossibles(q, r.mot, "fr");
  const x = await choisir(CHOIX_FR, ctx, sens);
  const systeme = x.retenu === "AUCUN" ? 0 : sens.findIndex((s) => s.id === x.retenu) + 1;
  rFr.push({ ...x, mot: r.mot, systeme, juge: r.juge, juste: systeme === r.juge });
}
await c.end();
console.log(`Français : ${rFr.filter((r) => r.juste).length}/${rFr.length} d'accord avec Sonnet (consigne actuelle du site : 26/30) | « aucun » : système ${rFr.filter((r) => r.systeme === 0).length}, Sonnet ${rFr.filter((r) => r.juge === 0).length} | ${stats(rFr.map((r) => r.ms))}`);
console.log(`Relances (2e essai) : anglais ${rEn.filter((r) => r.essais > 1).length}, français ${rFr.filter((r) => r.essais > 1).length}`);
writeFileSync("tests/resultats/choix-rapide.json", JSON.stringify({ anglais: rEn, francais: rFr }, null, 1));
