// Ajoute au dictionnaire des mots nouveaux d'un document (5 au plus par requête ; la page
// enchaîne les lots). Chaque mot passe par la même vérification et le même rangement
// que l'onglet « Ajouter ». { nouveau_sens: true } ajoute malgré un mot existant.
import { ajouterMot, traduireVersAnglais } from "@/lib/ajout";
import { estAdmin } from "@/lib/auth";
import { db, erreur, json } from "@/lib/db";
import { PlafondAtteint } from "@/lib/modele";

const LOT_MAX = 5;

export async function POST(req: Request, ctx: RouteContext<"/api/documents/[id]/ajouter">): Promise<Response> {
  if (!estAdmin(req)) return erreur("Réservé à l'administrateur", 401);
  const { id } = await ctx.params;
  if (!/^\d{1,12}$/.test(id)) return erreur("Identifiant invalide", 400);
  const corps = (await req.json().catch(() => null)) as { mots?: { lemme?: unknown; nature?: unknown; nouveau_sens?: unknown }[] } | null;
  const demandes = (corps?.mots ?? []).filter((m) => typeof m.lemme === "string" && typeof m.nature === "string").slice(0, LOT_MAX);
  if (!demandes.length) return erreur("Aucun mot à ajouter", 400);
  const q = db();
  const [doc] = await q("SELECT langue FROM documents WHERE id = $1", [id]);
  if (!doc) return erreur("Document introuvable", 404);
  const resultats = [];
  for (const d of demandes) {
    const [ligne] = await q("SELECT lemme, nature, statut FROM document_mots WHERE document_id = $1 AND lemme = $2 AND nature = $3", [id, d.lemme, d.nature]);
    if (!ligne || ligne.statut !== "nouveau") { resultats.push({ lemme: d.lemme, nature: d.nature, statut: ligne?.statut ?? "introuvable" }); continue; }
    try {
      const lemme = String(ligne.lemme);
      // Le dictionnaire est rangé par mot anglais : un mot français est d'abord traduit.
      const [t, r] = doc.langue === "fr" ? [await traduireVersAnglais(q, lemme), lemme] : [lemme, ""];
      const res = await ajouterMot(q, t, r, d.nouveau_sens === true);
      // Trouvé seulement par la traduction (« banque » → « bank », rampe de skate) : ce peut
      // être un autre sens. Le mot reste « nouveau » ; la page montre les sens existants et
      // propose de l'ajouter comme nouveau sens.
      if (res.statut === "existe") {
        resultats.push({ lemme: d.lemme, nature: d.nature, statut: "autre sens ?", t, sens: res.sens.slice(0, 3) });
        continue;
      }
      const statut = res.statut;
      const motId = res.statut === "ajouté" ? res.id : null;
      await q(`UPDATE document_mots SET statut = $4, mot_id = $5, a_valider_id = $6 WHERE document_id = $1 AND lemme = $2 AND nature = $3`,
        [id, d.lemme, d.nature, statut, motId ?? null, res.statut === "à valider" ? res.id : null]);
      const { statut: _brut, ...detail } = res;
      resultats.push({ lemme: d.lemme, nature: d.nature, statut, ...detail });
    } catch (e: unknown) {
      if (e instanceof PlafondAtteint) return json({ resultats, erreur: e.message }, 0, 429);
      console.error("document ajouter", id, d.lemme, e);
      resultats.push({ lemme: d.lemme, nature: d.nature, statut: "échec" });
    }
  }
  return json({ resultats }, 0);
}
