// File « À valider » : mots en attente, avec leurs 3 propositions de section.
import { db, erreur, json } from "@/lib/db";

export async function GET(): Promise<Response> {
  try {
    const lignes = await db()(
      `SELECT id::text, t, r, definition, propositions, confiance, cree_le FROM a_valider
       WHERE statut = 'en attente' ORDER BY cree_le LIMIT 200`);
    return json({ mots: lignes }, 0);
  } catch (e: unknown) {
    console.error("a-valider", e);
    return erreur("Chargement impossible", 500);
  }
}
