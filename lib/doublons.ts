// Le mot existe-t-il déjà ? Compare après normalisation (casse, accents, trait
// d'union) et par la table des formes (pluriel, conjugaison, orthographe britannique,
// formes de la traduction française). Renvoie chaque sens déjà présent, avec son chemin.

import { normaliser, normaliserTraduction } from "./normaliser";
import type { Requete } from "./reconstruire";

export interface SensExistant {
  id: string;
  t: string;
  r: string;
  def_fr: string;
  def_en: string;
  theme_cle: string;
  chemin: string;
  trouve_par: string; // « mot », « LemmInflect », « VarCon », « Lexique 3 », « traduction »
}

export async function chercherDoublons(q: Requete, mot: string, traduction = ""): Promise<SensExistant[]> {
  const en = normaliser(mot);
  const fr = traduction ? normaliserTraduction(traduction) : "";
  if (!en && !fr) return [];
  const lignes = await q(
    `WITH trouves AS (
       SELECT mot_id, min(source) AS source FROM formes
       WHERE (langue = 'en' AND forme = $1) OR (langue = 'fr' AND forme = $2) GROUP BY mot_id
       UNION ALL SELECT id, 'mot' FROM mots WHERE forme_norm = $1
       UNION ALL SELECT id, 'traduction' FROM mots WHERE $2 <> '' AND forme_norm_fr = $2
     )
     SELECT DISTINCT ON (m.id) m.id, m.t, m.r, m.def_fr, m.def_en, s.theme_cle,
       concat_ws(' › ', th.fr, s.fr, qu.q->>0) AS chemin, tr.source AS trouve_par
     FROM trouves tr JOIN mots m ON m.id = tr.mot_id
     JOIN sections s ON s.id = m.section_id JOIN themes th ON th.cle = s.theme_cle
     LEFT JOIN questions qu ON qu.id = m.question_id
     ORDER BY m.id, (tr.source = 'mot') DESC`,
    [en, fr],
  );
  return lignes.map((l) => ({
    id: String(l.id), t: String(l.t), r: String(l.r), def_fr: String(l.def_fr), def_en: String(l.def_en),
    theme_cle: String(l.theme_cle), chemin: String(l.chemin), trouve_par: String(l.trouve_par),
  }));
}
