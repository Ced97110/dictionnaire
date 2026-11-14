// Recherche par mot (?q=…&page=…, 20 résultats par page)
// ou par le sens (?sens=…, 15 résultats au plus).
import { db, erreur, json } from "@/lib/db";
import { chargerCorpus, chercherMot, chercherSens } from "@/lib/recherche";

const PAR_PAGE = 20;
const LONGUEUR_MAX = 200;
const CINQ_MINUTES = 300;

export async function GET(req: Request): Promise<Response> {
  const p = new URL(req.url).searchParams;
  const q = p.get("q"), sens = p.get("sens");
  const texte = (q ?? sens ?? "").slice(0, LONGUEUR_MAX);
  const page = Math.max(0, Math.min(50, Number.parseInt(p.get("page") ?? "0", 10) || 0));
  if (q === null && sens === null) return erreur("Paramètre q ou sens attendu", 400);
  try {
    const corpus = await chargerCorpus(db());
    if (sens !== null) return json({ resultats: chercherSens(corpus, texte) }, CINQ_MINUTES);
    const tous = chercherMot(corpus, texte);
    return json({ total: tous.length, page, resultats: tous.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE) }, CINQ_MINUTES);
  } catch (e: unknown) {
    console.error("recherche", e);
    return erreur("Recherche impossible", 500);
  }
}
