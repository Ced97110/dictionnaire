// Import reproductible de public/data dans Postgres (Neon).
// Usage : node --env-file=.env.local --import tsx scripts/import.mts
// Relançable : chaque ligne a une clé stable et passe par ON CONFLICT DO UPDATE.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { normaliser, normaliserTraduction } from "../lib/normaliser.ts";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const DONNEES = join(RACINE, "public", "data");
const CACHE = join(RACINE, "scripts", ".cache");
const MODELE = "Xenova/multilingual-e5-small";
const REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";
const DIM = 384;
const LOT_SQL = 1000;
const LOT_VECTEURS = 128;

type Json = Record<string, unknown>;
interface Entree extends Json { i?: string; ref?: string; t: string; r: string; def_fr?: string; def_en?: string; gd?: unknown }
interface Question extends Json { e: Entree[]; q?: unknown; d?: unknown; qt?: number; k?: unknown }
interface Section extends Json { fr: string; en: string; g?: string | null; d?: unknown; n: Question[] }
interface Fiche extends Json { fr: string; en: string; d?: unknown; w: Entree[] }
interface Theme { fr: string; en: string; d: unknown; fiches: Fiche[]; secs: Section[] }
interface Partie { num: string; fr: string; en: string; vol: string; gen: unknown; themes: unknown[][] }

const lire = <T,>(nom: string): T => JSON.parse(readFileSync(join(DONNEES, nom), "utf8")) as T;

function sans<T extends Json>(o: T, ...cles: string[]): Json {
  return Object.fromEntries(Object.entries(o).filter(([k]) => !cles.includes(k)));
}

export function texteVecteur(e: Entree): string {
  const gd = Array.isArray(e.gd) ? e.gd.filter(Boolean).join(" ; ") : "";
  return `${e.t} — ${e.r}. ${[e.def_fr, e.def_en, gd].filter(Boolean).join(" ")}`;
}

// --- lecture -----------------------------------------------------------------

function construireLignes() {
  const front = lire<Json & { parts: Partie[] }>("front.json");
  const parties: Json[] = [], themes: Json[] = [], sections: Json[] = [];
  const questions: Json[] = [], mots: Json[] = [], renvois: Json[] = [];

  front.parts.forEach((p, pi) => {
    parties.push({ num: p.num, ordre: pi, fr: p.fr, en: p.en, vol: p.vol, gen: p.gen });
    p.themes.forEach((ligne, ti) => {
      const cle = String(ligne[2]);
      const t = lire<Theme>(`t${cle}.json`);
      themes.push({ cle, partie_num: p.num, ordre: ti, fr: t.fr, en: t.en, d: t.d, liste: ligne });
      const ajouterMot = (e: Entree, section_id: string, question_id: string | null, ordre: number) => {
        if (!e.i) throw new Error(`Entrée sans identifiant dans ${section_id}`);
        mots.push({
          id: e.i, section_id, question_id, ordre, t: e.t, r: e.r,
          def_fr: e.def_fr ?? "", def_en: e.def_en ?? "", gd: e.gd ?? null,
          forme_norm: normaliser(e.t), forme_norm_fr: normaliserTraduction(e.r), donnees: e,
        });
      };
      t.secs.forEach((s, si) => {
        const sid = `${cle}:sec:${si}`;
        sections.push({ id: sid, theme_cle: cle, genre: "sec", ordre: si, fr: s.fr, en: s.en, g: s.g ?? null, d: s.d ?? null, extra: sans(s, "fr", "en", "g", "d", "n") });
        s.n.forEach((q, qi) => {
          const qid = `${sid}:${qi}`;
          questions.push({ id: qid, section_id: sid, ordre: qi, q: q.q ?? null, d: q.d ?? null, qt: q.qt ?? null, k: q.k ?? null });
          q.e.forEach((e, ei) => {
            if (e.ref) renvois.push({ id: `${qid}:${ei}`, section_id: sid, question_id: qid, ordre: ei, ref: e.ref, donnees: e });
            else ajouterMot(e, sid, qid, ei);
          });
        });
      });
      t.fiches.forEach((f, fi) => {
        const sid = `${cle}:fiche:${fi}`;
        sections.push({ id: sid, theme_cle: cle, genre: "fiche", ordre: fi, fr: f.fr, en: f.en, g: null, d: f.d ?? null, extra: sans(f, "fr", "en", "d", "w") });
        f.w.forEach((e, ei) => ajouterMot(e, sid, null, ei));
      });
    });
  });
  const rangIndex = new Map(lire<unknown[][]>("index.json").map((x, i) => [String(x[2]), i]));
  const rangDefs = new Map([0, 1, 2, 3].flatMap((k) => lire<unknown[][]>(`defs_${k}.json`)).map((x, i) => [String(x[0]), i]));
  for (const m of mots) Object.assign(m, { rang_index: rangIndex.get(String(m.id)) ?? null, rang_defs: rangDefs.get(String(m.id)) ?? null });
  const autres = Object.entries(front).filter(([k]) => k !== "parts").map(([cle, valeur]) => ({ cle, valeur }));
  return { autres, parties, themes, sections, questions, mots, renvois };
}

// --- vecteurs (modèle local, mis en cache sur disque) ------------------------

async function calculerVecteurs(textes: string[]): Promise<Float32Array> {
  const empreinte = createHash("sha256").update(`${MODELE}@${REVISION}\n${textes.join("\n")}`).digest("hex").slice(0, 16);
  const chemin = join(CACHE, `vecteurs_${empreinte}.f32`);
  if (existsSync(chemin)) {
    const b = readFileSync(chemin);
    return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  }
  const { pipeline } = await import("@huggingface/transformers");
  const extraire = await pipeline("feature-extraction", MODELE, { dtype: "q8", revision: REVISION });
  const sortie = new Float32Array(textes.length * DIM);
  for (let d = 0; d < textes.length; d += LOT_VECTEURS) {
    const lot = textes.slice(d, d + LOT_VECTEURS).map((t) => `passage: ${t}`);
    const res = await extraire(lot, { pooling: "mean", normalize: true });
    sortie.set(res.data as Float32Array, d * DIM);
    if ((d / LOT_VECTEURS) % 40 === 0) process.stdout.write(`  vecteurs ${d}/${textes.length}\n`);
  }
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(chemin, Buffer.from(sortie.buffer));
  return sortie;
}

// --- écriture ---------------------------------------------------------------

async function inserer(c: pg.Client, table: string, colonnes: Record<string, string>, lignes: Json[], conflit: string) {
  const noms = Object.keys(colonnes);
  const defs = noms.map((n) => `${n} ${colonnes[n]}`).join(", ");
  const maj = noms.filter((n) => n !== conflit).map((n) => `${n} = EXCLUDED.${n}`).join(", ");
  const sql = `INSERT INTO ${table} (${noms.join(", ")})
    SELECT ${noms.join(", ")} FROM jsonb_to_recordset($1::jsonb) AS x(${defs})
    ON CONFLICT (${conflit}) DO UPDATE SET ${maj}`;
  for (let d = 0; d < lignes.length; d += LOT_SQL) {
    await c.query(sql, [JSON.stringify(lignes.slice(d, d + LOT_SQL))]);
  }
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante (fichier .env.local)");
  const L = construireLignes();
  console.log(`lu : ${L.parties.length} parties, ${L.themes.length} thèmes, ${L.sections.length} sections, ${L.questions.length} questions, ${L.mots.length} mots, ${L.renvois.length} renvois`);

  const vecteurs = await calculerVecteurs(L.mots.map((m) => texteVecteur(m.donnees as Entree)));
  const mots = L.mots.map((m, i) => ({ ...m, vecteur: `[${Array.from(vecteurs.subarray(i * DIM, (i + 1) * DIM)).join(",")}]` }));

  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query(readFileSync(join(RACINE, "db", "schema.sql"), "utf8"));
    await c.query("BEGIN");
    await inserer(c, "front", { cle: "text", valeur: "jsonb" }, L.autres, "cle");
    await inserer(c, "parties", { num: "text", ordre: "int", fr: "text", en: "text", vol: "text", gen: "jsonb" }, L.parties, "num");
    await inserer(c, "themes", { cle: "text", partie_num: "text", ordre: "int", fr: "text", en: "text", d: "jsonb", liste: "jsonb" }, L.themes, "cle");
    await inserer(c, "sections", { id: "text", theme_cle: "text", genre: "text", ordre: "int", fr: "text", en: "text", g: "text", d: "jsonb", extra: "jsonb" }, L.sections, "id");
    await inserer(c, "questions", { id: "text", section_id: "text", ordre: "int", q: "jsonb", d: "jsonb", qt: "int", k: "jsonb" }, L.questions, "id");
    await inserer(c, "mots", {
      id: "text", section_id: "text", question_id: "text", ordre: "int", t: "text", r: "text",
      def_fr: "text", def_en: "text", gd: "jsonb", forme_norm: "text", forme_norm_fr: "text", donnees: "jsonb", vecteur: "vector(384)", rang_index: "int", rang_defs: "int",
    }, mots, "id");
    await inserer(c, "renvois", { id: "text", section_id: "text", question_id: "text", ordre: "int", ref: "text", donnees: "jsonb" }, L.renvois, "id");
    // Retire les lignes importées qui ne sont plus dans public/data (les mots ajoutés restent).
    await c.query("DELETE FROM mots WHERE origine = 'import' AND NOT (id = ANY($1::text[]))", [L.mots.map((m) => m.id)]);
    await c.query("DELETE FROM renvois WHERE NOT (id = ANY($1::text[]))", [L.renvois.map((r) => r.id)]);
    await c.query("COMMIT");
    console.log("import terminé");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    await c.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e: unknown) => { console.error(e); process.exit(1); });
}

export { construireLignes };
