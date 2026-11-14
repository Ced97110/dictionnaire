// Sens d'un mot dans une phrase précise, expliqué en étapes simples :
//   a) les sens possibles (dictionnaire, et WordNet pour l'anglais) ;
//   b) les 1 à 3 mots voisins qui décident, et ce que chacun apporte ;
//   c) le sens retenu, reformulé pour cette phrase ;
//   d) le rôle du mot dans la phrase et le mot auquel il se rattache ;
//   e) si les indices ne suffisent pas, les deux sens possibles, sans trancher.
// Haiku doit choisir dans la liste et citer des mots réellement présents dans la phrase :
// le code le vérifie et relance une fois, sinon la réponse est rejetée.

import { demander, lireJson } from "./modele";
import { minuscules } from "./normaliser";
import type { Requete } from "./reconstruire";

export interface Sens {
  id: string; source: "dictionnaire" | "WordNet"; texte_fr?: string; texte_en: string; domaine?: string; mot_id?: string; synset?: string;
  synonymes?: string[]; exemple?: string; // WordNet : ses définitions seules sont trop brèves pour départager
}
export interface Indice { mot: string; apport_fr: string; apport_en: string }
export interface Explication {
  sens: Sens[];
  indices: Indice[];
  tranche: boolean;
  sens_retenu: string | null;
  sens_alternatifs: string[];
  reformulation_fr: string; reformulation_en: string;
  role_fr: string; role_en: string; rattache_a: string;
}
export interface Contexte { precedente: string; phrase: string; suivante: string; mot: string }

const MAX_SENS_WN = 8;
// Aucun sens de la liste ne convient : le lecteur le voit, au lieu d'un sens faux.
export const AUCUN = "AUCUN";
const JETONS = 1200;
const JETONS_REFLEXION = 6000;

// La réponse est écrite dans l'ordre où l'on raisonne : d'abord le sens du mot dans la
// phrase, dit avec ses propres mots, et les indices ; ensuite seulement le choix dans la
// liste (ou « AUCUN »). Sans réflexion préalable, chaque champ s'appuie sur les précédents.
export const CONSIGNE =
  "Tu expliques à un lecteur comment un mot est employé dans une phrase précise, en suivant les étapes " +
  "qu'un modèle de langue suit pour comprendre un mot. Phrases simples, sans métaphore.\n" +
  "On te donne la phrase, la phrase précédente et la suivante, le mot, et la liste numérotée de ses sens possibles.\n" +
  "Procède dans l'ordre des champs : (1) dis ce que le mot veut dire dans CETTE phrase, avec tes mots, avant de " +
  "regarder la liste ; (2) cite 1 à 3 indices, des mots copiés tels quels de LA PHRASE (pas des phrases voisines, " +
  "pas le mot lui-même) ; (3) choisis dans la liste le sens qui correspond à (1). Les sens WordNet (W…) sont classés " +
  "du plus fréquent au moins fréquent : à égalité, prends le plus fréquent. Si aucun sens de la liste ne correspond " +
  "à (1), mets \"sens_retenu\": \"AUCUN\". Exception rare : si la phrase permet vraiment deux sens de la liste, " +
  "mets \"ambigu\": true et donne ces deux sens dans sens_alternatifs.\n" +
  "Chaque texte en français, puis sa traduction en anglais américain. Sois bref : 10 mots au plus par texte.\n" +
  'Réponds uniquement par un objet JSON, champs dans cet ordre : {"reformulation_fr": "<le sens ici>", ' +
  '"reformulation_en": "...", "indices": [{"mot": "<mot de la phrase>", "apport_fr": "<ce qu\'il indique>", ' +
  '"apport_en": "..."}], "sens_retenu": "<identifiant, ou AUCUN>", "ambigu": false, ' +
  '"sens_alternatifs": [], "role_fr": "<ce que fait le mot : sujet, action, qualité de tel nom…>", "role_en": "...", ' +
  '"rattache_a": "<le mot de la phrase auquel il se rattache>"}';

// --- découpage en phrases ------------------------------------------------------

export function decouper(texte: string, position: number, longueur: number): Contexte | null {
  const bornes: [number, number][] = [];
  const re = /[^.!?…]+(?:[.!?…]+|$)/g;
  for (const m of texte.matchAll(re)) if (m[0].trim()) bornes.push([m.index!, m.index! + m[0].length]);
  const i = bornes.findIndex(([d, f]) => position >= d && position < f);
  if (i < 0) return null;
  const mot = texte.slice(position, position + longueur).trim();
  if (!mot || !/^[\p{L}\p{N}]/u.test(mot) || position + longueur > bornes[i][1]) return null;
  const extrait = ([d, f]: [number, number] = [0, 0]) => texte.slice(d, f).trim();
  return { precedente: extrait(bornes[i - 1]), phrase: extrait(bornes[i]), suivante: extrait(bornes[i + 1]), mot };
}

// --- sens possibles ------------------------------------------------------------

const lemmesAnglais = (m: string): string[] => {
  const x = m.toLowerCase();
  return [...new Set([x, x.replace(/ies$/, "y"), x.replace(/es$/, ""), x.replace(/s$/, ""), x.replace(/ed$/, ""), x.replace(/ed$/, "e"),
    x.replace(/ing$/, ""), x.replace(/ing$/, "e"), x.replace(/(.)\1(ed|ing)$/, "$1")])].filter((l) => l.length > 1);
};

export async function sensPossibles(q: Requete, forme: string, langue: "fr" | "en"): Promise<Sens[]> {
  const brute = minuscules(forme);
  const dico = await q(
    `SELECT DISTINCT ON (m.id) m.id, m.t, m.def_fr, m.def_en, th.fr || ' › ' || s.fr AS domaine, m.rang_index
     FROM formes f JOIN mots m ON m.id = f.mot_id JOIN sections s ON s.id = m.section_id JOIN themes th ON th.cle = s.theme_cle
     WHERE f.brute = $1 AND f.langue = $2 ORDER BY m.id`, [brute, langue]);
  dico.sort((a, b) => Number(a.rang_index ?? 1e9) - Number(b.rang_index ?? 1e9));
  const sens: Sens[] = dico.map((d, i) => ({ id: `D${i + 1}`, source: "dictionnaire", texte_fr: String(d.def_fr), texte_en: String(d.def_en), domaine: String(d.domaine), mot_id: String(d.id) }));
  if (langue === "en") {
    const lemmes = [...new Set([...lemmesAnglais(forme), ...dico.map((d) => String(d.t).toLowerCase())])];
    // Sens du mot exact d'abord (« printed », adjectif), puis ceux de sa forme de base (« print »).
    const wn = await q(
      `SELECT DISTINCT ON (w.synset) w.synset, w.definition, w.exemples->>0 AS exemple, (w.lemme = $2) AS exact, w.compte, w.rang,
              (SELECT array_agg(DISTINCT s.lemme) FROM wn_sens s WHERE s.synset = w.synset) AS synonymes
       FROM wn_sens w WHERE w.lemme = ANY($1::text[]) ORDER BY w.synset, exact DESC`, [lemmes, forme.toLowerCase()]);
    wn.sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.compte) - Number(a.compte) || Number(a.rang) - Number(b.rang));
    wn.splice(MAX_SENS_WN);
    wn.forEach((w, i) => sens.push({
      id: `W${i + 1}`, source: "WordNet", texte_en: String(w.definition), synset: String(w.synset),
      synonymes: ((w.synonymes as string[] | null) ?? []).slice(0, 5), exemple: w.exemple ? String(w.exemple) : undefined,
    }));
  }
  return sens;
}

// --- appel au modèle et vérification -------------------------------------------

const present = (mot: string, phrase: string): boolean => {
  const m = minuscules(mot);
  return !!m && ` ${minuscules(phrase)} `.includes(` ${m} `);
};

export function verifier(r: Record<string, unknown> | null, sens: Sens[], ctx: Contexte): { ok: Explication } | { erreur: string } {
  if (!r) return { erreur: "Réponse illisible : il faut un objet JSON." };
  const ids = new Set(sens.map((s) => s.id));
  const indices = Array.isArray(r.indices) ? (r.indices as Record<string, unknown>[]) : [];
  if (indices.length < 1 || indices.length > 3) return { erreur: "Il faut 1 à 3 indices." };
  for (const x of indices) {
    const mot = String(x?.mot ?? "");
    if (!present(mot, ctx.phrase)) return { erreur: `L'indice « ${mot} » n'est pas dans la phrase. Cite des mots copiés de la phrase.` };
    if (` ${minuscules(mot)} `.includes(` ${minuscules(ctx.mot)} `)) return { erreur: "Un indice ne peut pas contenir le mot lui-même." };
  }
  // « Je ne sais pas » seulement si le modèle donne vraiment deux sens de la liste
  // (champ « ambigu » ; « tranche: false » accepté pour les anciennes réponses en base).
  const deuxSens = Array.isArray(r.sens_alternatifs) && (r.sens_alternatifs as unknown[]).filter((x) => ids.has(String(x))).length >= 2;
  const tranche = !((r.ambigu === true || r.tranche === false) && deuxSens);
  const retenu = r.sens_retenu === null || r.sens_retenu === undefined ? null : String(r.sens_retenu);
  const alternatifs = Array.isArray(r.sens_alternatifs) ? (r.sens_alternatifs as unknown[]).map(String).filter((x) => ids.has(x)) : [];
  if (tranche && (!retenu || (!ids.has(retenu) && retenu !== AUCUN))) return { erreur: `Le sens retenu doit être un identifiant de la liste (${[...ids].join(", ")}) ou « AUCUN ».` };
  const rattache = String(r.rattache_a ?? "");
  if (rattache && !present(rattache, ctx.phrase)) return { erreur: `« ${rattache} » (rattache_a) n'est pas dans la phrase.` };
  const t = (k: string) => String(r[k] ?? "").trim();
  return {
    ok: {
      sens, tranche, sens_retenu: tranche ? retenu : null, sens_alternatifs: tranche ? [] : alternatifs.slice(0, 2),
      indices: indices.map((x) => ({ mot: String(x.mot), apport_fr: String(x.apport_fr ?? ""), apport_en: String(x.apport_en ?? "") })),
      reformulation_fr: t("reformulation_fr"), reformulation_en: t("reformulation_en"), role_fr: t("role_fr"), role_en: t("role_en"), rattache_a: rattache,
    },
  };
}

export function presenter(ctx: Contexte, sens: Sens[]): string {
  return [
    `Phrase précédente : ${ctx.precedente || "(aucune)"}`,
    `PHRASE : ${ctx.phrase}`,
    `Phrase suivante : ${ctx.suivante || "(aucune)"}`,
    `Mot : ${ctx.mot}`, "", "Sens possibles :",
    ...sens.map((s) => `${s.id}. ${s.texte_fr ? `${s.texte_fr} / ` : ""}${s.texte_en}${s.domaine ? ` [${s.domaine}]` : ""}` +
      `${s.synonymes?.length ? ` (synonymes : ${s.synonymes.join(", ")})` : ""}${s.exemple ? ` — ex. « ${s.exemple} »` : ""}`),
  ].join("\n");
}

export interface Options { consigne?: string; reflechir?: boolean }
export async function expliquer(q: Requete, ctx: Contexte, sens: Sens[], options: Options = {}): Promise<Explication> {
  let texte = presenter(ctx, sens);
  let raison = "";
  for (let essai = 0; essai < 2; essai++) {
    const v = verifier(lireJson(await demander(q, options.consigne ?? CONSIGNE, texte, options.reflechir ? JETONS_REFLEXION : JETONS, options.reflechir ?? false)), sens, ctx);
    if ("ok" in v) return v.ok;
    raison = v.erreur;
    texte = `${presenter(ctx, sens)}\n\nTa réponse précédente a été rejetée : ${v.erreur}`;
  }
  throw new Error(`Réponse rejetée deux fois : ${raison}`);
}
