// La recherche du serveur (lib/recherche.ts, données en base) rend-elle exactement
// ce que rendait l'ancienne recherche du navigateur (index.json, defs_*.json) ?
// Lancer : npx vitest run tests/parite-recherche.test.ts  (DATABASE_URL requise)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chargerCorpus, chercherMot, chercherSens, norm, type LigneDef, type LigneIndex } from "../lib/recherche";

const DONNEES = join(__dirname, "..", "public", "data");
const lire = <T,>(f: string): T => JSON.parse(readFileSync(join(DONNEES, f), "utf8")) as T;
const N_REQUETES = 300;

// --- l'ancienne recherche, recopiée telle quelle de public/dictionnaire.js ---
const IDX = lire<LigneIndex[]>("index.json");
function ancienneRecherche(saisie: string): LigneIndex[] {
  const v = norm(saisie.trim());
  if (!v) return [];
  const a: LigneIndex[] = [], b: LigneIndex[] = [], c: LigneIndex[] = [];
  for (const r of IDX) { const t = norm(r[0]), f = norm(r[1]); if (t === v || f === v) a.push(r); else if (t.startsWith(v) || f.startsWith(v)) b.push(r); else if (v.length > 2 && (t.includes(v) || f.includes(v) || norm(r[4]).includes(v))) c.push(r); if (a.length + b.length > 300) break; }
  let res = a.concat(b, c);
  if (!res.length) { const T = v.split(/\s+/).filter((w) => w.length > 2); if (T.length > 1) for (const r of IDX) { const h = norm(r[0] + " " + r[1] + " " + r[4]); if (T.every((t) => h.includes(t))) { res.push(r); if (res.length > 150) break; } } }
  return res.slice(0, 150);
}
const STOP = new Set("les des une un le la de du et en au aux qui que quoi pour par sur dans avec sans ou est sont son sa ses ce cette ces the of and a an to in on for with by or is are that which who what from as at be it its into not ne pas".split(" "));
const toks = (s: string) => norm(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 5));
const DEFS = [0, 1, 2, 3].flatMap((k) => lire<LigneDef[]>(`defs_${k}.json`)).map((d) => [d, " " + norm(d[2] + " " + d[3] + " " + d[4] + " " + d[5]).replace(/[^a-z0-9 ]/g, " ") + " "] as const);
function ancienSens(q: string): LigneDef[] {
  const T = [...new Set(toks(q))]; if (!T.length) return [];
  const res: [number, LigneDef][] = []; for (const [d, txt] of DEFS) { let sc = 0; for (const t of T) if (txt.includes(" " + t)) sc++; if (sc) res.push([sc, d]); }
  const need = Math.max(1, Math.ceil(T.length * 0.4));
  return res.filter((x) => x[0] >= need).sort((a, b) => b[0] - a[0] || a[1][5].length - b[1][5].length).slice(0, 15).map((x) => x[1]);
}

// --- requêtes de test, tirées avec une graine fixe ---
function hasard(graine: number) { let s = graine >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const alea = hasard(42);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(alea() * xs.length)];
const requetesMot = [
  "", "a", "jenny", "ânesse", "ANESSE", "bull", "cheval blanc", "pouvoir gouvernement", "zzzz", "the", "vote",
  ...Array.from({ length: N_REQUETES }, (_, i) => {
    const r = pick(IDX); const forme = i % 5;
    return forme === 0 ? r[0] : forme === 1 ? r[1] : forme === 2 ? r[0].slice(0, 3) : forme === 3 ? r[4].split(" › ")[1] ?? r[0] : `${r[0].split(" ")[0]} ${r[1].split(" ")[0]}`;
  }),
];
const requetesSens = ["", "the of", "un animal qui vit dans l'eau", "money paid for work", ...Array.from({ length: N_REQUETES }, () => {
  const d = pick(DEFS)[0]; const mots = (alea() < 0.5 ? d[4] : d[5]).split(" "); const debut = Math.floor(alea() * Math.max(1, mots.length - 4));
  return mots.slice(debut, debut + 2 + Math.floor(alea() * 4)).join(" ");
})];

let client: pg.Client;
let corpus: Awaited<ReturnType<typeof chargerCorpus>>;
beforeAll(async () => {
  client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
  await client.connect();
  // Les mots ajoutés depuis l'import (identifiants « n… ») sont rangés après tous les autres ;
  // on les retire pour comparer à l'ancienne recherche, qui ne les connaît pas.
  corpus = await chargerCorpus(async (sql, p) => (await client.query(sql, p as unknown[])).rows);
}, 60_000);
afterAll(async () => { await client?.end(); });

describe("parité avec l'ancienne recherche", () => {
  it(`recherche par mot : ${requetesMot.length} requêtes, mêmes résultats dans le même ordre`, () => {
    const ecarts = requetesMot.filter((q) => JSON.stringify(chercherMot(corpus, q).filter((r) => !/^n[0-9a-f]{12}$/.test(r[2]))) !== JSON.stringify(ancienneRecherche(q)));
    expect(ecarts).toEqual([]);
  });
  it(`recherche par le sens : ${requetesSens.length} requêtes, mêmes résultats dans le même ordre`, () => {
    const ecarts = requetesSens.filter((q) => JSON.stringify(chercherSens(corpus, q).filter((d) => !/^n[0-9a-f]{12}$/.test(d[0]))) !== JSON.stringify(ancienSens(q)));
    expect(ecarts).toEqual([]);
  });
});
