// Où se trouve un mot : [mot, traduction, id, clé de thème, chemin], comme une ligne d'index.json.
import { db, erreur, json } from "@/lib/db";

const CINQ_MINUTES = 300;
const ID = /^[A-Za-z0-9_-]{1,40}$/;

export async function GET(_req: Request, ctx: RouteContext<"/api/mot/[id]">): Promise<Response> {
  const { id } = await ctx.params;
  if (!ID.test(id)) return erreur("Identifiant invalide", 400);
  try {
    const [m] = await db()(`
      SELECT m.t, m.r, m.id, s.theme_cle, concat_ws(' › ', th.fr, s.fr, qu.q->>0) AS chemin
      FROM mots m JOIN sections s ON s.id = m.section_id JOIN themes th ON th.cle = s.theme_cle
      LEFT JOIN questions qu ON qu.id = m.question_id WHERE m.id = $1`, [id]);
    return m ? json([m.t, m.r, m.id, m.theme_cle, m.chemin], CINQ_MINUTES) : erreur("Mot introuvable", 404);
  } catch (e: unknown) {
    console.error("mot", id, e);
    return erreur("Chargement impossible", 500);
  }
}
