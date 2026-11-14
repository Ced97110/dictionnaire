// GET ?mot=…&traduction=… : le mot existe-t-il déjà ? (sens présents, avec leur chemin)
// POST {mot, traduction?, nouveau_sens?} : ajoute le mot (administrateur).
//   → { statut: "existe", sens }          s'il existe et que nouveau_sens n'est pas vrai ;
//   → { statut: "ajouté", id, section }   s'il est rangé automatiquement ;
//   → { statut: "à valider", id, propositions } sinon.
import { estAdmin } from "@/lib/auth";
import { db, erreur, json } from "@/lib/db";
import { chercherDoublons } from "@/lib/doublons";
import { enregistrer, rediger } from "@/lib/fiche";
import { demander, PlafondAtteint } from "@/lib/modele";
import { ranger } from "@/lib/ranger";

const LONGUEUR_MAX = 80;
const CONSIGNE_TRAD = "Donne la traduction française usuelle de ce mot ou de cette expression en anglais. Réponds par la traduction seule.";

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
  let traduction = texte(corps?.traduction);
  if (!mot) return erreur("Le mot est vide", 400);
  const q = db();
  try {
    const sens = await chercherDoublons(q, mot, traduction);
    if (sens.length && corps?.nouveau_sens !== true) return json({ statut: "existe", sens }, 0);
    if (!traduction) traduction = (await demander(q, CONSIGNE_TRAD, mot, 200)).split("\n")[0].slice(0, LONGUEUR_MAX);
    const r = await ranger(q, mot, traduction);
    if (r.automatique) {
      const section = r.propositions[0];
      const fiche = await rediger(q, mot, traduction, r.definition, section.section_id);
      const id = await enregistrer(q, mot, traduction, fiche, section.section_id);
      return json({ statut: "ajouté", id, section, confiance: r.confiance }, 0);
    }
    const [{ id }] = await q(
      `INSERT INTO a_valider (t, r, definition, propositions, confiance) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [mot, traduction, r.definition, JSON.stringify(r.propositions), r.confiance]);
    return json({ statut: "à valider", id: String(id), propositions: r.propositions, confiance: r.confiance }, 0);
  } catch (e: unknown) {
    if (e instanceof PlafondAtteint) return erreur(e.message, 429);
    console.error("mots POST", mot, e);
    return erreur("L'ajout a échoué", 500);
  }
}
