// Rédaction de la fiche bilingue d'un mot nouveau par Haiku, dans le format des
// entrées existantes (def_fr/def_en, gd, propre, fig, ex), puis enregistrement.

import { randomUUID } from "node:crypto";
import { demander, lireJson } from "./modele";
import { minuscules, normaliser, normaliserTraduction } from "./normaliser";
import { oublierCorpusRangement } from "./ranger";
import { oublierCorpus } from "./recherche";
import type { Requete } from "./reconstruire";
import { Tfidf } from "./tfidf";

const CONSIGNE_FICHE =
  "Tu rédiges une entrée de dictionnaire bilingue anglais-français, dans le style exact " +
  "des exemples fournis. L'anglais est de l'anglais américain (orthographe et usage). " +
  "Chaque texte français a sa traduction anglaise fidèle. Champs :\n" +
  "- def_fr, def_en : définition courte, sans répéter le mot ;\n" +
  "- gd : [genre en français, différence en français, genre en anglais, différence en anglais] " +
  "(le genre est la catégorie plus large, la différence ce qui distingue le mot dans ce genre) ;\n" +
  "- propre_fr, propre_en : une phrase où le mot est pris au sens propre ;\n" +
  "- fig_fr, fig_en : une phrase au sens figuré, ou null s'il n'y en a pas d'usuel ;\n" +
  "- ex_en, ex_fr : un exemple naturel, puis sa traduction.\n" +
  "Réponds uniquement par un objet JSON avec ces clés.";
const JETONS = 4000;
const CHAMPS_TEXTE = ["def_fr", "def_en", "propre_fr", "propre_en", "ex_en", "ex_fr"] as const;

export interface Fiche {
  def_fr: string; def_en: string; gd: [string, string, string, string];
  propre_fr: string; propre_en: string; fig_fr: string | null; fig_en: string | null; ex_en: string; ex_fr: string;
}

function valider(v: Record<string, unknown> | null): Fiche | null {
  if (!v) return null;
  if (!CHAMPS_TEXTE.every((k) => typeof v[k] === "string" && (v[k] as string).trim())) return null;
  const gd = v.gd;
  if (!Array.isArray(gd) || gd.length !== 4 || !gd.every((x) => typeof x === "string" && x.trim())) return null;
  const fig = (k: string) => (typeof v[k] === "string" && (v[k] as string).trim() ? (v[k] as string).trim() : null);
  const [fig_fr, fig_en] = [fig("fig_fr"), fig("fig_en")];
  return {
    def_fr: String(v.def_fr).trim(), def_en: String(v.def_en).trim(), gd: gd.map((x: string) => x.trim()) as Fiche["gd"],
    propre_fr: String(v.propre_fr).trim(), propre_en: String(v.propre_en).trim(),
    fig_fr: fig_fr && fig_en ? fig_fr : null, fig_en: fig_fr && fig_en ? fig_en : null,
    ex_en: String(v.ex_en).trim(), ex_fr: String(v.ex_fr).trim(),
  };
}

export async function rediger(q: Requete, t: string, r: string, definition: string, section_id: string): Promise<Fiche> {
  const exemples = await q(
    `SELECT donnees - 'f' - 'c' - 'al' - 'h' - 'gl' - 'b' AS e FROM mots WHERE section_id = $1 AND donnees ? 'gd' ORDER BY ordre LIMIT 2`, [section_id]);
  const texte = [`Mot : ${t}`, `Traduction : ${r}`, `Définition provisoire : ${definition}`, "",
    "Exemples d'entrées de la même section :", ...exemples.map((x) => JSON.stringify(x.e))].join("\n");
  for (let essai = 0; essai < 2; essai++) {
    const f = valider(lireJson(await demander(q, CONSIGNE_FICHE, texte, JETONS)));
    if (f) return f;
  }
  throw new Error("La fiche rédigée par le modèle est incomplète, deux fois");
}

function pluriel(m: string): string {
  if (/(s|x|z|ch|sh)$/.test(m)) return `${m}es`;
  if (/[^aeiou]y$/.test(m)) return `${m.slice(0, -1)}ies`;
  return `${m}s`;
}

// Place le mot dans la section ; dans une section à questions, il rejoint la question
// de son plus proche voisin (TF-IDF sur la définition).
export async function enregistrer(q: Requete, t: string, r: string, f: Fiche, section_id: string): Promise<string> {
  const voisins = await q(
    `SELECT m.question_id, m.def_fr, m.def_en FROM mots m WHERE m.section_id = $1 ORDER BY m.question_id, m.ordre`, [section_id]);
  if (!voisins.length) throw new Error(`Section inconnue ou vide : ${section_id}`);
  let question_id: string | null = null;
  if (voisins[0].question_id !== null) {
    const tf = new Tfidf(voisins.map((v) => `${v.def_fr} ${v.def_en}`));
    const qv = tf.vecteur(`${f.def_fr} ${f.def_en}`);
    let meilleur = -1;
    tf.docs.forEach((d, i) => {
      let s = 0;
      for (const [k, w] of qv) s += w * (d.get(k) ?? 0);
      if (s > meilleur) { meilleur = s; question_id = String(voisins[i].question_id); }
    });
  }
  const id = `n${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const { fig_fr, fig_en, ...reste } = f;
  // Comme les entrées d'origine : pas de clé fig_* quand il n'y a pas de sens figuré.
  const donnees = { i: id, t, r, ...reste, ...(fig_fr && fig_en ? { fig_fr, fig_en } : {}) };
  const [{ ordre }] = await q(
    `SELECT coalesce(max(ordre), -1) + 1 AS ordre FROM (
       SELECT ordre FROM mots WHERE section_id = $1 AND question_id IS NOT DISTINCT FROM $2
       UNION ALL SELECT ordre FROM renvois WHERE question_id = $2) x`, [section_id, question_id]);
  await q(
    `INSERT INTO mots (id, section_id, question_id, ordre, t, r, def_fr, def_en, gd, forme_norm, forme_norm_fr, donnees, origine)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ajout')`,
    [id, section_id, question_id, ordre, t, r, f.def_fr, f.def_en, JSON.stringify(f.gd), normaliser(t), normaliserTraduction(r), JSON.stringify(donnees)]);
  const en = minuscules(t), fr = minuscules(r.replace(/≈/g, " ").split("(")[0]);
  const formes = [[en, "en", "mot"], [/^[a-z]+$/.test(en) ? pluriel(en) : "", "en", "pluriel régulier"], [fr, "fr", "traduction"]]
    .filter(([brute]) => brute);
  for (const [brute, langue, source] of formes) {
    await q("INSERT INTO formes (forme, brute, mot_id, langue, source) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
      [normaliser(brute), brute, id, langue, source]);
  }
  oublierCorpus();
  oublierCorpusRangement();
  return id;
}
