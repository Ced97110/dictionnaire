// Recherche par mot et par le sens, côté serveur.
// Les deux algorithmes sont recopiés de public/dictionnaire.js (version lisant
// index.json et defs_*.json) pour rendre exactement les mêmes résultats, dans le
// même ordre. Seule la source change : les lignes viennent de la base.

import type { Requete } from "./reconstruire";

export type LigneIndex = [t: string, r: string, id: string, cle: string, chemin: string];
export type LigneDef = [id: string, cle: string, t: string, r: string, def_fr: string, def_en: string];

const MAX_RESULTATS = 150;
const MAX_SENS = 15;
const COUPE_DEF = 160;

export const norm = (s: string): string =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const STOP = new Set(
  "les des une un le la de du et en au aux qui que quoi pour par sur dans avec sans ou est sont son sa ses ce cette ces the of and a an to in on for with by or is are that which who what from as at be it its into not ne pas".split(" "),
);
const toks = (s: string): string[] =>
  norm(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 5));

// --- données, chargées une fois par instance du serveur ----------------------

interface Corpus {
  index: LigneIndex[];
  normes: { t: string; r: string; chemin: string }[];
  defs: { d: LigneDef; txt: string }[];
}
let corpus: Promise<Corpus> | null = null;
const rang = (v: unknown): number => (v === null || v === undefined ? Number.MAX_SAFE_INTEGER : Number(v));

// Les autres instances du serveur voient un mot ajouté au plus tard une minute après :
// au-delà, on vérifie le nombre de mots et on recharge s'il a changé.
const VERIFIER_APRES_MS = 60_000;
let verifieLe = 0;
let nbCharge = -1;

export async function chargerCorpus(q: Requete): Promise<Corpus> {
  if (corpus && Date.now() - verifieLe > VERIFIER_APRES_MS) {
    verifieLe = Date.now();
    const [{ n }] = await q("SELECT count(*)::int AS n FROM mots");
    if (n !== nbCharge) corpus = null;
  }
  corpus ??= (async () => {
    verifieLe = Date.now();
    const lignes = await q(`
      SELECT m.t, m.r, m.id, s.theme_cle, m.rang_defs, concat_ws(' › ', th.fr, s.fr, qu.q->>0) AS chemin, m.def_fr, m.def_en
      FROM mots m JOIN sections s ON s.id = m.section_id JOIN themes th ON th.cle = s.theme_cle
      LEFT JOIN questions qu ON qu.id = m.question_id
      ORDER BY m.rang_index NULLS LAST, m.cree_le, m.id`);
    const index = lignes.map((l) => [l.t, l.r, l.id, l.theme_cle, l.chemin] as LigneIndex);
    const defs = [...lignes].sort((x, y) => rang(x.rang_defs) - rang(y.rang_defs)).map((l) => {
      const d: LigneDef = [String(l.id), String(l.theme_cle), String(l.t), String(l.r),
        String(l.def_fr).slice(0, COUPE_DEF), String(l.def_en).slice(0, COUPE_DEF)];
      return { d, txt: " " + norm(`${d[2]} ${d[3]} ${d[4]} ${d[5]}`).replace(/[^a-z0-9 ]/g, " ") + " " };
    });
    const normes = index.map((r) => ({ t: norm(r[0]), r: norm(r[1]), chemin: norm(r[4]) }));
    nbCharge = index.length;
    return { index, normes, defs };
  })().catch((e: unknown) => { corpus = null; throw e; });
  return corpus;
}

export function oublierCorpus(): void {
  corpus = null;
}

// --- recherche par mot (anglais ou français) ---------------------------------

export function chercherMot(c: Corpus, requete: string): LigneIndex[] {
  const v = norm(requete.trim());
  if (!v) return [];
  const a: LigneIndex[] = [], b: LigneIndex[] = [], cc: LigneIndex[] = [];
  for (let i = 0; i < c.index.length; i++) {
    const { t, r: f, chemin } = c.normes[i];
    const r = c.index[i];
    if (t === v || f === v) a.push(r);
    else if (t.startsWith(v) || f.startsWith(v)) b.push(r);
    else if (v.length > 2 && (t.includes(v) || f.includes(v) || chemin.includes(v))) cc.push(r);
    if (a.length + b.length > 300) break;
  }
  let res = a.concat(b, cc);
  if (!res.length) {
    const T = v.split(/\s+/).filter((w) => w.length > 2);
    if (T.length > 1) {
      for (let i = 0; i < c.index.length; i++) {
        const { t, r, chemin } = c.normes[i];
        const h = `${t} ${r} ${chemin}`;
        if (T.every((x) => h.includes(x))) { res.push(c.index[i]); if (res.length > MAX_RESULTATS) break; }
      }
    }
  }
  return res.slice(0, MAX_RESULTATS);
}

// --- recherche par le sens ---------------------------------------------------

export function chercherSens(c: Corpus, requete: string): LigneDef[] {
  const T = [...new Set(toks(requete))];
  if (!T.length) return [];
  const res: [number, LigneDef][] = [];
  for (const { d, txt } of c.defs) {
    let sc = 0;
    for (const t of T) if (txt.includes(" " + t)) sc++;
    if (sc) res.push([sc, d]);
  }
  const need = Math.max(1, Math.ceil(T.length * 0.4));
  return res.filter((x) => x[0] >= need)
    .sort((a, b) => b[0] - a[0] || a[1][5].length - b[1][5].length)
    .slice(0, MAX_SENS).map((x) => x[1]);
}
