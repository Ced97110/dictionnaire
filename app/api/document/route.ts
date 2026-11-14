// POST (multipart, champ « fichier ») : téléverse et analyse un document (PDF, Word, texte).
// Même fichier (même empreinte SHA-256) déjà analysé → { statut: "existe", id } sans refaire l'analyse.
import { estAdmin } from "@/lib/auth";
import { db, erreur, json } from "@/lib/db";
import { TAILLE_MAX, televerser } from "@/lib/documents";

const EXTENSIONS = /\.(pdf|docx|txt|md)$/i;

export async function POST(req: Request): Promise<Response> {
  if (!estAdmin(req)) return erreur("Réservé à l'administrateur", 401);
  const form = await req.formData().catch(() => null);
  const f = form?.get("fichier");
  if (!(f instanceof File)) return erreur("Fichier attendu (champ « fichier »)", 400);
  if (!EXTENSIONS.test(f.name)) return erreur("Format non pris en charge : PDF, Word (.docx) ou texte (.txt, .md)", 415);
  if (f.size === 0 || f.size > TAILLE_MAX) return erreur("Fichier vide ou trop grand (4 Mo au plus)", 413);
  try {
    return json(await televerser(db(), f.name.slice(0, 200), Buffer.from(await f.arrayBuffer())), 0);
  } catch (e: unknown) {
    console.error("document", f.name, e);
    return erreur(e instanceof Error ? e.message : "Analyse impossible", 500);
  }
}
