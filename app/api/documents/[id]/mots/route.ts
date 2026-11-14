// Mots d'un document, avec filtres (?nature=nom|verbe|adjectif, ?statut=…) et pagination (?page=).
import { db, erreur, json } from "@/lib/db";
import { rapprocher } from "@/lib/documents";

const PAR_PAGE = 50;
const NATURES = new Set(["nom", "verbe", "adjectif"]);
const STATUTS = new Set(["présent", "nouveau", "ajouté", "à valider"]);

export async function GET(req: Request, ctx: RouteContext<"/api/documents/[id]/mots">): Promise<Response> {
  const { id } = await ctx.params;
  if (!/^\d{1,12}$/.test(id)) return erreur("Identifiant invalide", 400);
  const p = new URL(req.url).searchParams;
  const nature = NATURES.has(p.get("nature") ?? "") ? p.get("nature") : null;
  const statut = STATUTS.has(p.get("statut") ?? "") ? p.get("statut") : null;
  const page = Math.max(0, Number.parseInt(p.get("page") ?? "0", 10) || 0);
  const q = db();
  try {
    const [doc] = await q("SELECT id::text, nom, langue, etat, n_mots, cree_le FROM documents WHERE id = $1", [id]);
    if (!doc) return erreur("Document introuvable", 404);
    // Un mot ajouté depuis (ailleurs) passe de « nouveau » à « présent ».
    if (doc.langue) await rapprocher(q, id, String(doc.langue));
    const filtre = "document_id = $1 AND ($2::text IS NULL OR nature = $2) AND ($3::text IS NULL OR statut = $3)";
    const [mots, [{ total }]] = await Promise.all([
      q(`SELECT dm.lemme, dm.nature, dm.forme, dm.occurrences, dm.phrase, dm.statut, dm.mot_id, dm.a_valider_id::text,
                m.t, m.r, th.fr || ' › ' || s.fr AS section
         FROM document_mots dm LEFT JOIN mots m ON m.id = dm.mot_id LEFT JOIN sections s ON s.id = m.section_id
         LEFT JOIN themes th ON th.cle = s.theme_cle
         WHERE ${filtre.replace(/document_id|nature|statut/g, (c) => `dm.${c}`)}
         ORDER BY dm.occurrences DESC, dm.lemme LIMIT $4 OFFSET $5`, [id, nature, statut, PAR_PAGE, page * PAR_PAGE]),
      q(`SELECT count(*)::int AS total FROM document_mots WHERE ${filtre}`, [id, nature, statut]),
    ]);
    return json({ document: doc, total, page, par_page: PAR_PAGE, mots }, 0);
  } catch (e: unknown) {
    console.error("documents mots", id, e);
    return erreur("Chargement impossible", 500);
  }
}
