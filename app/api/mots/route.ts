// GET ?mot=…&traduction=… : le mot existe-t-il déjà ? (sens présents, avec leur chemin)
// POST {mot, traduction?, nouveau_sens?} : ajoute le mot (administrateur).
//   → { statut: "existe", sens }          s'il existe et que nouveau_sens n'est pas vrai ;
//   → { statut: "ajouté", id, section }   s'il est rangé automatiquement ;
//   → { statut: "à valider", id, propositions } sinon.
import { estAdmin } from "@/lib/auth";
import { db, erreur, json } from "@/lib/db";
import { ajouterMot } from "@/lib/ajout";
import { chercherDoublons } from "@/lib/doublons";
import { PlafondAtteint } from "@/lib/modele";

const LONGUEUR_MAX = 80;

function texte(v: unknown): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, LONGUEUR_MAX) : "";
}

export async function GET(req: Request): Promise<Response> {
  const p = new URL(req.url).searchParams;
  const mot = texte(p.get("mot")), traduction = texte(p.get("traduction"));
  if (!mot) return erreur("Paramètre mot attendu", 400);
  try {
    return json({ sens: await chercherDoublons(db(), mot, traduction) }, 0);
  } catch (e: unknown) {
    console.error("mots GET", e);
    return erreur("Vérification impossible", 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!estAdmin(req)) return erreur("Réservé à l'administrateur", 401);
  const corps = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const mot = texte(corps?.mot);
  const traduction = texte(corps?.traduction);
  if (!mot) return erreur("Le mot est vide", 400);
  try {
    return json(await ajouterMot(db(), mot, traduction, corps?.nouveau_sens === true), 0);
  } catch (e: unknown) {
    if (e instanceof PlafondAtteint) return erreur(e.message, 429);
    console.error("mots POST", mot, e);
    return erreur("L'ajout a échoué", 500);
  }
}
