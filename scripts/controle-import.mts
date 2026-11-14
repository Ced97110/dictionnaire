// Contrôle de l'import : la base rend-elle exactement public/data ?
// Usage : node --env-file=.env.local --import tsx scripts/controle-import.mts
// Sort avec le code 1 si un seul contrôle échoue.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { reconstruireFront, reconstruireTheme, type Requete } from "../lib/reconstruire.ts";

const DONNEES = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const GRAINE = 20261113;
const N_FICHES = 20;
const N_REQUETES_INDEX = 50;
const RAPPEL_MIN = 0.95;
// defs_*.json coupe les deux définitions à 160 caractères ; index.json ajoute la question au chemin.
const DEFS_COUPE = 160;

type Json = Record<string, unknown>;
const lire = (nom: string): any => JSON.parse(readFileSync(join(DONNEES, nom), "utf8"));

// JSON canonique : clés triées, pour comparer sans dépendre de l'ordre des clés.
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Json)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

function hasard(graine: number): () => number {
  let s = graine >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const resultats: [string, boolean, string][] = [];
const noter = (nom: string, ok: boolean, detail: string) => {
  resultats.push([nom, ok, detail]);
  console.log(`${ok ? "OK   " : "ÉCHEC"} ${nom} — ${detail}`);
};

async function main() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
  await c.connect();
  const q: Requete = async (sql, p) => (await c.query(sql, p as unknown[])).rows;

  // 1. Comptes.
  const front = lire("front.json");
  const cles: string[] = front.parts.flatMap((p: any) => p.themes.map((t: any) => String(t[2])));
  const fichiers = readdirSync(DONNEES).filter((f) => /^t\d+_\d+\.json$/.test(f));
  const themes = new Map(cles.map((k) => [k, lire(`t${k}.json`)]));
  let nSec = 0, nQ = 0, nK = 0, nMots = 0, nRenv = 0;
  for (const t of themes.values()) {
    nSec += t.secs.length + t.fiches.length;
    for (const f of t.fiches) nMots += f.w.length;
    for (const s of t.secs) for (const n of s.n) {
      nQ++; if (n.k) nK++;
      for (const e of n.e) e.ref ? nRenv++ : nMots++;
    }
  }
  const [b] = await q(`SELECT (SELECT count(*) FROM themes)::int th, (SELECT count(*) FROM sections)::int sec,
    (SELECT count(*) FROM questions)::int q, (SELECT count(*) FROM questions WHERE k IS NOT NULL)::int k,
    (SELECT count(*) FROM mots WHERE origine='import')::int mots, (SELECT count(*) FROM renvois)::int renv,
    (SELECT count(*) FROM mots WHERE vecteur IS NULL AND origine = 'import')::int sansvec`);
  const attendu = { th: fichiers.length, sec: nSec, q: nQ, k: nK, mots: nMots, renv: nRenv, sansvec: 0 };
  for (const [k, v] of Object.entries(attendu)) noter(`compte ${k}`, b[k] === v, `base ${b[k]} / fichiers ${v}`);

  // 2. Les 66 thèmes et front.json, reconstruits depuis la base, identiques aux fichiers.
  let themesOk = 0; const ecarts: string[] = [];
  for (const [k, t] of themes) {
    const r = await reconstruireTheme(q, k, true);
    if (canon(r) === canon(t)) themesOk++; else ecarts.push(k);
  }
  noter("thèmes identiques", themesOk === themes.size, `${themesOk}/${themes.size}${ecarts.length ? ` ; écarts : ${ecarts.join(", ")}` : ""}`);
  noter("front.json identique", canon(await reconstruireFront(q)) === canon(front), "parties, thèmes, mode d'emploi, texte d'origine, types de questions");

  // 3. 20 fiches tirées au hasard, champ par champ (colonnes + entrée d'origine).
  const tous: Json[] = [];
  for (const t of themes.values()) {
    for (const f of t.fiches) tous.push(...f.w);
    for (const s of t.secs) for (const n of s.n) tous.push(...n.e.filter((e: Json) => !e.ref));
  }
  const alea = hasard(GRAINE);
  const tirage = Array.from({ length: N_FICHES }, () => tous[Math.floor(alea() * tous.length)]);
  let fichesOk = 0; const fichesKo: string[] = [];
  for (const e of tirage) {
    const [m] = await q("SELECT t, r, def_fr, def_en, gd, donnees FROM mots WHERE id = $1", [e.i]);
    const ok = !!m && canon(m.donnees) === canon(e) && m.t === e.t && m.r === e.r &&
      m.def_fr === e.def_fr && m.def_en === e.def_en && canon(m.gd) === canon(e.gd);
    if (ok) fichesOk++; else fichesKo.push(String(e.i));
  }
  noter("20 fiches au hasard", fichesOk === N_FICHES, `${fichesOk}/${N_FICHES} identiques (graine ${GRAINE})${fichesKo.length ? ` ; écarts : ${fichesKo.join(", ")}` : ""}`);

  // 4. index.json et defs_*.json se déduisent de la base.
  const index = lire("index.json") as unknown[][];
  const lignes = await q(`SELECT m.t, m.r, m.id, s.theme_cle,
      concat_ws(' › ', th.fr, s.fr, qu.q->>0) AS chemin
    FROM mots m JOIN sections s ON s.id = m.section_id JOIN themes th ON th.cle = s.theme_cle
    LEFT JOIN questions qu ON qu.id = m.question_id WHERE m.origine = 'import'`);
  const parId = new Map(lignes.map((l) => [l.id, canon([l.t, l.r, l.id, l.theme_cle, l.chemin])]));
  const indexOk = index.filter((x) => parId.get(x[2]) === canon(x)).length;
  noter("index.json", indexOk === index.length, `${indexOk}/${index.length} lignes retrouvées à l'identique`);
  const defs = readdirSync(DONNEES).filter((f) => f.startsWith("defs_")).flatMap((f) => lire(f) as unknown[][]);
  const defsBase = new Map((await q(`SELECT m.id, s.theme_cle, m.t, m.r, left(m.def_fr, $1::int) AS def_fr, left(m.def_en, $1::int) AS def_en FROM mots m JOIN sections s ON s.id = m.section_id`, [DEFS_COUPE]))
    .map((l) => [l.id, canon([l.id, l.theme_cle, l.t, l.r, l.def_fr, l.def_en])]));
  const defsOk = defs.filter((x) => defsBase.get(x[0]) === canon(x)).length;
  noter("defs_*.json", defsOk === defs.length, `${defsOk}/${defs.length} lignes retrouvées à l'identique`);

  // 5. L'index HNSW retrouve-t-il les mêmes voisins qu'une recherche exacte ?
  const ids = (await q("SELECT id FROM mots ORDER BY id")).map((r) => String(r.id));
  let trouves = 0;
  for (let i = 0; i < N_REQUETES_INDEX; i++) {
    const id = ids[Math.floor(alea() * ids.length)];
    const voisins = "SELECT id FROM mots ORDER BY vecteur <=> (SELECT vecteur FROM mots WHERE id = $1) LIMIT 10";
    await c.query("BEGIN");
    await c.query("SET LOCAL enable_indexscan = off");
    const exact = new Set((await q(voisins, [id])).map((r) => r.id));
    await c.query("COMMIT");
    const approx = await q(voisins, [id]);
    trouves += approx.filter((r) => exact.has(r.id)).length;
  }
  const rappel = trouves / (N_REQUETES_INDEX * 10);
  noter("index de proximité (HNSW)", rappel >= RAPPEL_MIN, `retrouve ${(rappel * 100).toFixed(1)} % des 10 plus proches voisins exacts (seuil ${RAPPEL_MIN * 100} %)`);

  await c.end();
  const echecs = resultats.filter((r) => !r[1]).length;
  console.log(echecs ? `\n${echecs} contrôle(s) en échec` : "\nTous les contrôles passent");
  process.exit(echecs ? 1 : 0);
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
