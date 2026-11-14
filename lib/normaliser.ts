// Normalisation des mots, partagée par l'import, les routes API et les tests.
// Couvre la casse, les accents, les traits d'union et les apostrophes.
// La forme de base (pluriels, conjugaisons) et l'orthographe britannique passent
// par la table `formes`, remplie à l'étape suivante.

const SEPARATEURS = /[-‐‑–—_'’/]+/g;

export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(SEPARATEURS, " ")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// La traduction française peut porter « ≈ » et des variantes entre parenthèses :
// « ≈ vote par inscription (inscription manuscrite…) » → « vote par inscription ».
export function normaliserTraduction(r: string): string {
  return normaliser(r.replace(/≈/g, " ").split("(")[0]);
}

// Comme normaliser(), mais garde les accents : pour relier un texte affiché
// (correctement accentué) à ses mots, « groupes » ≠ « groupés ».
export function minuscules(texte: string): string {
  return texte
    .normalize("NFC")
    .toLowerCase()
    .replace(SEPARATEURS, " ")
    .replace(/[^\p{L}\p{M}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
