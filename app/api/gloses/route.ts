// POST {fr: [formes…], en: [formes…]} → les formes qui existent, avec leur définition courte.
// Une seule requête par texte affiché ; la page garde les réponses en mémoire.
import { db, erreur, json } from "@/lib/db";
import { gloses } from "@/lib/gloses";

const MAX_CORPS = 200_000;

export async function POST(req: Request): Promise<Response> {
  const brut = await req.text();
  if (brut.length > MAX_CORPS) return erreur("Texte trop long", 413);
  let corps: unknown;
  try { corps = JSON.parse(brut); } catch { return erreur("JSON invalide", 400); }
  const liste = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length <= 80) : []);
  const c = (corps ?? {}) as Record<string, unknown>;
  try {
    return json(await gloses(db(), { fr: liste(c.fr), en: liste(c.en) }), 0);
  } catch (e: unknown) {
    console.error("gloses", e);
    return erreur("Chargement impossible", 500);
  }
}
