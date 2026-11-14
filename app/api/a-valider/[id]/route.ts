// Trancher un mot en attente (administrateur) : POST {section_id} pour le ranger
// (la fiche est alors rédigée), ou {ecarter: true} pour l'abandonner.
import { estAdmin } from "@/lib/auth";
import { db, erreur, json } from "@/lib/db";
import { enregistrer, rediger } from "@/lib/fiche";
import { PlafondAtteint } from "@/lib/modele";

export async function POST(req: Request, ctx: RouteContext<"/api/a-valider/[id]">): Promise<Response> {
  if (!estAdmin(req)) return erreur("Réservé à l'administrateur", 401);
  const { id } = await ctx.params;
  if (!/^\d{1,12}$/.test(id)) return erreur("Identifiant invalide", 400);
  const corps = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const q = db();
  try {
    const [m] = await q("SELECT t, r, definition, propositions FROM a_valider WHERE id = $1 AND statut = 'en attente'", [id]);
    if (!m) return erreur("Mot introuvable ou déjà traité", 404);
    if (corps?.ecarter === true) {
      await q("UPDATE a_valider SET statut = 'écarté' WHERE id = $1", [id]);
      return json({ statut: "écarté" }, 0);
    }
    const section = (m.propositions as { section_id: string; libelle: string }[]).find((p) => p.section_id === corps?.section_id);
    if (!section) return erreur("Section hors des propositions", 400);
    const fiche = await rediger(q, String(m.t), String(m.r), String(m.definition), section.section_id);
    const mot_id = await enregistrer(q, String(m.t), String(m.r), fiche, section.section_id);
    await q("UPDATE a_valider SET statut = 'rangé', mot_id = $2 WHERE id = $1", [id, mot_id]);
    return json({ statut: "ajouté", id: mot_id, section }, 0);
  } catch (e: unknown) {
    if (e instanceof PlafondAtteint) return erreur(e.message, 429);
    console.error("a-valider POST", id, e);
    return erreur("Le rangement a échoué", 500);
  }
}
