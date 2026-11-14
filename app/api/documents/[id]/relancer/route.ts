// Relance l'analyse d'un document à partir du fichier d'origine gardé dans Vercel Blob.
import { estAdmin } from "@/lib/auth";
import { db, erreur, json } from "@/lib/db";
import { relancer } from "@/lib/documents";

export async function POST(req: Request, ctx: RouteContext<"/api/documents/[id]/relancer">): Promise<Response> {
  if (!estAdmin(req)) return erreur("Réservé à l'administrateur", 401);
  const { id } = await ctx.params;
  if (!/^\d{1,12}$/.test(id)) return erreur("Identifiant invalide", 400);
  try {
    await relancer(db(), id);
    return json({ statut: "analysé", id }, 0);
  } catch (e: unknown) {
    console.error("document relancer", id, e);
    return erreur(e instanceof Error ? e.message : "Analyse impossible", 500);
  }
}
