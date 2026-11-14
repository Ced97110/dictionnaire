// Historique « Mes documents » : chaque document avec ses comptes (natures et statuts).
import { db, erreur, json } from "@/lib/db";

export async function GET(): Promise<Response> {
  try {
    const docs = await db()(`
      SELECT d.id::text, d.nom, d.langue, d.taille, d.n_mots, d.etat, d.erreur, d.cree_le,
        count(m.*) FILTER (WHERE m.nature = 'nom')::int AS noms,
        count(m.*) FILTER (WHERE m.nature = 'verbe')::int AS verbes,
        count(m.*) FILTER (WHERE m.nature = 'adjectif')::int AS adjectifs,
        count(m.*) FILTER (WHERE m.statut = 'présent')::int AS presents,
        count(m.*) FILTER (WHERE m.statut = 'nouveau')::int AS nouveaux,
        count(m.*) FILTER (WHERE m.statut = 'ajouté')::int AS ajoutes,
        count(m.*) FILTER (WHERE m.statut = 'à valider')::int AS a_valider
      FROM documents d LEFT JOIN document_mots m ON m.document_id = d.id
      GROUP BY d.id ORDER BY d.cree_le DESC`);
    return json({ documents: docs }, 0);
  } catch (e: unknown) {
    console.error("documents", e);
    return erreur("Chargement impossible", 500);
  }
}
