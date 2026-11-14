// Définitions courtes d'une liste de formes (mots ou expressions déjà normalisés),
// pour rendre les mots d'un texte consultables. Une forme fléchie (« couraient »,
// « ran », un pluriel) est reliée à son mot par la table formes ; une forme peut
// désigner plusieurs mots (homonymes) : tous sont renvoyés, 3 au plus.

import { minuscules } from "./normaliser";
import type { Requete } from "./reconstruire";

export type Langue = "fr" | "en";
export interface Glose { id: string; mot: string; traduction: string; def_fr: string; def_en: string; domaine: string; theme_cle: string }

const MAX_FORMES = 3000;
const MAX_SENS = 3;
const COUPE = 160;

// Mots-outils : jamais consultables, même si une entrée porte ce nom.
const OUTILS: Record<Langue, Set<string>> = {
  fr: new Set(("a ai as au aux avec avoir c ca ce ceci cela celle celles celui ces cet cette ceux chaque ci comme comment d dans de des deja depuis donc dont du elle elles en encore entre est et etaient etait etant ete etre eu eux fait faire il ils j je jusqu l la le les leur leurs lors lorsqu lorsque lui m ma mais me meme mes moi moins mon n ne ni non nos notre nous on ont ou par parce pas peu peut plus pour pourquoi qu quand que quel quelle quelles quels qui quoi sa sans se ses si son sont sous sur t ta te tes toi ton tous tout toute toutes tres tu un une unes uns vers voici voila vos votre vous y " +
    "aussi alors ainsi apres avant autre autres bien car celle ici ou la puis sera seront soit sont surtout tant tel telle tels telles " +
    // Prépositions qui sont aussi des noms (« le devant ») : traitées comme mots-outils.
    "après avant devant derrière contre pendant malgré selon envers parmi chez durant hors outre via dès près loin sauf").split(" ")),
  en: new Set(("a about above after again against all also am an and any are as at be been before being below between both but by can could did do does doing down during each either else ever every few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just may me might more most must my myself neither no nor not now of off often on once only or other our ours ourselves out over own rather same she should so some such than that the their theirs them themselves then there these they this those though through thus to too under until up upon us very was we were what when where whether which while who whom whose why will with within without would yet you your yours yourself yourselves " +
    "s t d ll re ve m also one ones something someone anything everything nothing").split(" ")),
};

export function estOutil(forme: string, langue: Langue): boolean {
  return forme.length < 2 || /^\d+$/.test(forme) || (!forme.includes(" ") && OUTILS[langue].has(forme));
}

export async function gloses(q: Requete, demandes: Record<Langue, string[]>): Promise<Record<Langue, Record<string, Glose[]>>> {
  const prep = (l: Langue) => [...new Set((demandes[l] ?? []).map(minuscules))].filter((f) => f && !estOutil(f, l)).slice(0, MAX_FORMES);
  const fr = prep("fr"), en = prep("en");
  const sortie: Record<Langue, Record<string, Glose[]>> = { fr: {}, en: {} };
  if (!fr.length && !en.length) return sortie;
  const lignes = await q(
    `WITH f AS (
       SELECT brute AS forme, mot_id, langue, source FROM formes
       WHERE (langue = 'fr' AND brute = ANY($1::text[])) OR (langue = 'en' AND brute = ANY($2::text[]))
     )
     SELECT f.forme, f.langue, m.id, m.t, m.r, left(m.def_fr, $3) AS def_fr, left(m.def_en, $3) AS def_en,
            th.fr || ' › ' || s.fr AS domaine, s.theme_cle, m.rang_index
     FROM f JOIN mots m ON m.id = f.mot_id JOIN sections s ON s.id = m.section_id JOIN themes th ON th.cle = s.theme_cle
     ORDER BY f.forme, (f.source IN ('mot', 'traduction') OR lower(m.t) = f.forme) DESC, m.rang_index NULLS LAST`,
    [fr, en, COUPE]);
  for (const l of lignes) {
    const langue = l.langue as Langue;
    const liste = (sortie[langue][String(l.forme)] ??= []);
    if (liste.length >= MAX_SENS || liste.some((g) => g.id === l.id)) continue;
    // En français, le mot affiché est la traduction (r) et sa « traduction » le mot anglais.
    liste.push({
      id: String(l.id), mot: String(langue === "fr" ? l.r : l.t), traduction: String(langue === "fr" ? l.t : l.r),
      def_fr: String(l.def_fr), def_en: String(l.def_en), domaine: String(l.domaine), theme_cle: String(l.theme_cle),
    });
  }
  return sortie;
}
