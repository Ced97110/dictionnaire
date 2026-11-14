// Ce que la page charge au démarrage : parties, thèmes, mode d'emploi (front.json)
// et le nombre de mots. Remplace index.json (5,9 Mo) et front.json.
import { db, erreur, json } from "@/lib/db";
import { reconstruireFront } from "@/lib/reconstruire";

const UN_JOUR = 86400;

export async function GET(): Promise<Response> {
  try {
    const q = db();
    const [front, [n]] = await Promise.all([reconstruireFront(q), q("SELECT count(*)::int AS nb FROM mots")]);
    return json({ front, nb: n.nb }, UN_JOUR);
  } catch (e: unknown) {
    console.error("demarrage", e);
    return erreur("Chargement impossible", 500);
  }
}
