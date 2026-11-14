// Ajout d'un mot, commun à l'onglet « Ajouter » et aux documents téléversés :
// doublons d'abord, puis rangement (Haiku + TF-IDF) et fiche, ou file « À valider ».

import { chercherDoublons, type SensExistant } from "./doublons";
import { enregistrer, rediger } from "./fiche";
import { demander } from "./modele";
import { type Proposition, ranger } from "./ranger";
import type { Requete } from "./reconstruire";

const LONGUEUR_MAX = 80;
const VERS_FR = "Donne la traduction française usuelle de ce mot ou de cette expression en anglais. Réponds par la traduction seule.";
const VERS_EN = "Donne la traduction anglaise usuelle (anglais américain) de ce mot ou de cette expression en français. Réponds par la traduction seule.";

export type ResultatAjout =
  | { statut: "existe"; sens: SensExistant[] }
  | { statut: "ajouté"; id: string; section: Proposition; confiance: string; t: string; r: string }
  | { statut: "à valider"; id: string; propositions: Proposition[]; confiance: string; t: string; r: string };

const nettoyer = (s: string) => s.split("\n")[0].trim().replace(/^["«»“”]+|["«»“”.]+$/g, "").trim().slice(0, LONGUEUR_MAX);

export async function traduireVersAnglais(q: Requete, francais: string): Promise<string> {
  return nettoyer(await demander(q, VERS_EN, francais, 200));
}

// t : mot anglais (entrée du dictionnaire) ; r : traduction française (facultative).
export async function ajouterMot(q: Requete, t: string, r: string, nouveauSens: boolean): Promise<ResultatAjout> {
  const sens = await chercherDoublons(q, t, r);
  if (sens.length && !nouveauSens) return { statut: "existe", sens };
  const traduction = r || nettoyer(await demander(q, VERS_FR, t, 200));
  const rg = await ranger(q, t, traduction);
  if (rg.automatique) {
    const section = rg.propositions[0];
    const fiche = await rediger(q, t, traduction, rg.definition, section.section_id);
    const id = await enregistrer(q, t, traduction, fiche, section.section_id);
    return { statut: "ajouté", id, section, confiance: rg.confiance, t, r: traduction };
  }
  const [{ id }] = await q(
    `INSERT INTO a_valider (t, r, definition, propositions, confiance) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [t, traduction, rg.definition, JSON.stringify(rg.propositions), rg.confiance]);
  return { statut: "à valider", id: String(id), propositions: rg.propositions, confiance: rg.confiance, t, r: traduction };
}
