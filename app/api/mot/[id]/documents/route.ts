// Les documents d'où vient un mot (affichés sur sa fiche).
import { db, erreur, json } from "@/lib/db";

export async function GET(_req: Request, ctx: RouteContext<"/api/mot/[id]/documents">): Promise<Response> {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return erreur("Identifiant invalide", 400);
  try {
    const docs = await db()(
      `SELECT DISTINCT d.id::text, d.nom, d.cree_le FROM document_mots dm JOIN documents d ON d.id = dm.document_id
       WHERE dm.mot_id = $1 ORDER BY d.cree_le DESC LIMIT 20`, [id]);
    return json({ documents: docs }, 0);
  } catch (e: unknown) {
    console.error("mot documents", id, e);
    return erreur("Chargement impossible", 500);
  }
}
