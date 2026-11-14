// Sens en contexte, juge extérieur : SemCor (annoté à la main). Pour chaque occurrence,
// le système reçoit la phrase (et ses voisines) et TOUS les sens WordNet du lemme ;
// on compare le sens retenu au sens annoté, et à la règle « toujours le sens le plus fréquent ».
// Objectif : ≥ 80 % ; indices réellement présents dans la phrase : 100 %.
// Usage : LIMITE_APPELS_JOUR=1000 node --env-file=.env.local --import tsx tests/semcor-eval.mts
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { expliquer, type Sens } from "../lib/sens.ts";
import { minuscules } from "../lib/normaliser.ts";

interface Cas { precedente: string; phrase: string; suivante: string; position: number; mot: string; lemme: string; pos: string; sens: { synset: string; definition: string }[]; attendu: string }
const cas = JSON.parse(readFileSync("tests/semcor_cas.json", "utf8")) as Cas[];
const PARALLELE = 6;

const c = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await c.connect();
const q = async (s: string, p?: unknown[]) => (await c.query(s, p as unknown[])).rows;

const resultats: Record<string, unknown>[] = new Array(cas.length);
let suivant = 0;
async function ouvrier() {
  while (suivant < cas.length) {
    const i = suivant++;
    const x = cas[i];
    const sens: Sens[] = x.sens.map((s, k) => ({ id: `W${k + 1}`, source: "WordNet", texte_en: s.definition, synset: s.synset }));
    const t0 = Date.now();
    try {
      const e = await expliquer(q, { precedente: x.precedente, phrase: x.phrase, suivante: x.suivante, mot: x.mot }, sens);
      const retenu = e.tranche ? sens.find((s) => s.id === e.sens_retenu)?.synset ?? null : null;
      const alternatifs = e.sens_alternatifs.map((id) => sens.find((s) => s.id === id)?.synset);
      const indicesPresents = e.indices.every((ind) => ` ${minuscules(x.phrase)} `.includes(` ${minuscules(ind.mot)} `));
      resultats[i] = { mot: x.mot, lemme: x.lemme, pos: x.pos, n_sens: sens.length, attendu: x.attendu, retenu, tranche: e.tranche, alternatifs,
        juste: retenu === x.attendu, mfs: x.sens[0].synset === x.attendu, indices: e.indices.map((ind) => ind.mot), indicesPresents, ms: Date.now() - t0 };
    } catch (err) {
      resultats[i] = { mot: x.mot, lemme: x.lemme, attendu: x.attendu, retenu: null, juste: false, mfs: x.sens[0].synset === x.attendu, rejete: String(err), ms: Date.now() - t0 };
    }
    if ((i + 1) % 25 === 0) console.log(`${i + 1}/${cas.length}`);
  }
}
await Promise.all(Array.from({ length: PARALLELE }, ouvrier));
await c.end();

const n = resultats.length;
const compte = (f: (r: Record<string, unknown>) => boolean) => resultats.filter(f).length;
const parPos = Object.fromEntries(["n", "v", "a", "s"].map((p) => {
  const r = resultats.filter((x) => x.pos === p);
  return [p, { n: r.length, systeme: r.filter((x) => x.juste).length, mfs: r.filter((x) => x.mfs).length }];
}));
const ms = resultats.map((r) => Number(r.ms)).sort((a, b) => a - b);
const resume = {
  occurrences: n,
  systeme: compte((r) => r.juste === true) / n,
  plus_frequent: compte((r) => r.mfs === true) / n,
  non_tranches: compte((r) => r.tranche === false),
  non_tranches_dont_le_bon_sens_est_parmi_les_deux: compte((r) => r.tranche === false && (r.alternatifs as string[]).includes(String(r.attendu))),
  rejetes: compte((r) => !!r.rejete),
  indices_presents: compte((r) => r.indicesPresents === true) / compte((r) => !r.rejete),
  par_nature: parPos,
  latence_ms: { mediane: ms[n >> 1], p95: ms[Math.floor(n * 0.95)] },
};
writeFileSync("tests/resultats/semcor.json", JSON.stringify({ resume, resultats }, null, 1));
console.log(JSON.stringify(resume, null, 1));
