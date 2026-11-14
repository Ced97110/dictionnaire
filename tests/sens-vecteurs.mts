// Choix du sens SANS modèle de langue : vecteurs multilingual-e5-small (local, gratuit).
// On encode la phrase (avec le mot) et chaque sens possible ; on prend le plus proche.
// Mesuré sur le jeu de mise au point SemCor et sur les 30 cas français jugés à l'aveugle
// par Sonnet (tests/resultats/sens-fr-aveugle.json). Aucun appel payant.
// Usage : node --env-file=.env.local --import tsx tests/sens-vecteurs.mts
import { pipeline } from "@huggingface/transformers";
import { readFileSync } from "node:fs";
import pg from "pg";
import { decouper, sensPossibles } from "../lib/sens.ts";

const extraire = await pipeline("feature-extraction", "Xenova/multilingual-e5-small", { dtype: "q8", revision: "761b726dd34fb83930e26aab4e9ac3899aa1fa78" });
const vecteurs = async (textes: string[]) => (await extraire(textes, { pooling: "mean", normalize: true })).tolist() as number[][];
const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const requete = (phrase: string, mot: string) => `query: ${phrase} — sens de « ${mot} »`;

// --- SemCor (jeu de mise au point) ---
const dev = JSON.parse(readFileSync("tests/semcor_dev.json", "utf8")) as any[];
let justes = 0, mfs = 0; const ms: number[] = [];
for (const x of dev) {
  const t0 = performance.now();
  const [q, ...s] = await vecteurs([requete(x.phrase, x.mot), ...x.sens.map((y: any) => `passage: ${y.definition} (${y.synonymes.join(", ")})`)]);
  const scores = s.map((v) => cos(q, v));
  ms.push(performance.now() - t0);
  if (x.sens[scores.indexOf(Math.max(...scores))].synset === x.attendu) justes++;
  if (x.sens[0].synset === x.attendu) mfs++;
}
ms.sort((a, b) => a - b);
console.log(`SemCor dev : vecteurs ${justes}/${dev.length} | plus fréquent ${mfs}/${dev.length} | temps médian ${ms[ms.length >> 1].toFixed(0)} ms, max ${ms[ms.length - 1].toFixed(0)} ms`);

// --- Français (jugés à l'aveugle par Sonnet ; 0 = aucun sens ne convient) ---
const c = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED }); await c.connect();
const db = async (sql: string, p?: unknown[]) => (await c.query(sql, p as unknown[])).rows;
const fr = (JSON.parse(readFileSync("tests/resultats/sens-fr-aveugle.json", "utf8")).resultats as any[]).filter((r) => typeof r.juge === "number");
const lignes: { meilleur: number; score: number; juge: number }[] = [];
for (const r of fr) {
  const sens = await sensPossibles(db, r.mot, "fr");
  const [q, ...s] = await vecteurs([requete(r.phrase, r.mot), ...sens.map((y) => `passage: ${y.texte_fr} ${y.domaine ?? ""}`)]);
  const scores = s.map((v) => cos(q, v));
  const best = Math.max(...scores);
  lignes.push({ meilleur: scores.indexOf(best) + 1, score: best, juge: r.juge });
}
await c.end();
const sansSeuil = lignes.filter((l) => l.juge !== 0 && l.meilleur === l.juge).length;
const avecSens = lignes.filter((l) => l.juge !== 0).length;
console.log(`Français : quand un sens convient (${avecSens} cas), le plus proche est le bon ${sansSeuil}/${avecSens}`);
for (const seuil of [0.80, 0.82, 0.84, 0.86, 0.88]) {
  const ok = lignes.filter((l) => (l.score < seuil ? 0 : l.meilleur) === l.juge).length;
  console.log(`  seuil « aucun » ${seuil.toFixed(2)} : ${ok}/${lignes.length} d'accord avec Sonnet`);
}
console.log("  scores max quand Sonnet dit « aucun » :", lignes.filter((l) => l.juge === 0).map((l) => l.score.toFixed(3)).join(" "));
console.log("  scores max quand un sens convient     :", lignes.filter((l) => l.juge !== 0).map((l) => l.score.toFixed(3)).join(" "));
