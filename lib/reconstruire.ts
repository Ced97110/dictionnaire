// Rebâtit, depuis la base, exactement les objets JSON que lisait public/dictionnaire.js
// (t<clé>.json et front.json). Utilisé par les routes API et par le contrôle d'import.

export type Requete = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
type Json = Record<string, unknown>;

// sansAjouts : ignore les mots ajoutés après l'import (pour comparer aux fichiers d'origine).
export async function reconstruireTheme(q: Requete, cle: string, sansAjouts = false): Promise<Json | null> {
  const [theme] = await q("SELECT fr, en, d FROM themes WHERE cle = $1", [cle]);
  if (!theme) return null;
  const [sections, questions, mots, renvois] = await Promise.all([
    q("SELECT id, genre, fr, en, g, d, extra FROM sections WHERE theme_cle = $1 ORDER BY genre, ordre", [cle]),
    q("SELECT q.id, q.section_id, q.q, q.d, q.qt, q.k FROM questions q JOIN sections s ON s.id = q.section_id WHERE s.theme_cle = $1 ORDER BY q.section_id, q.ordre", [cle]),
    q("SELECT m.section_id, m.question_id, m.ordre, m.donnees FROM mots m JOIN sections s ON s.id = m.section_id WHERE s.theme_cle = $1 AND (NOT $2 OR m.origine = 'import')", [cle, sansAjouts]),
    q("SELECT r.question_id, r.ordre, r.donnees FROM renvois r JOIN sections s ON s.id = r.section_id WHERE s.theme_cle = $1", [cle]),
  ]);

  // Entrées (mots et renvois) groupées par question ou par fiche, dans l'ordre d'origine.
  const entrees = new Map<string, { ordre: number; e: unknown }[]>();
  const ranger = (cleGroupe: string, ordre: number, e: unknown) => {
    const liste = entrees.get(cleGroupe) ?? [];
    entrees.set(cleGroupe, [...liste, { ordre, e }]);
  };
  for (const m of mots) ranger(String(m.question_id ?? m.section_id), Number(m.ordre), m.donnees);
  for (const r of renvois) ranger(String(r.question_id), Number(r.ordre), r.donnees);
  const lister = (k: string) => (entrees.get(k) ?? []).sort((a, b) => a.ordre - b.ordre).map((x) => x.e);

  const questionsPar = new Map<string, Json[]>();
  for (const x of questions) {
    const obj: Json = { e: lister(String(x.id)) };
    for (const champ of ["q", "d", "qt", "k"] as const) if (x[champ] !== null) obj[champ] = x[champ];
    questionsPar.set(String(x.section_id), [...(questionsPar.get(String(x.section_id)) ?? []), obj]);
  }

  const parOrdre = (genre: string) => sections.filter((s) => s.genre === genre).sort((a, b) => ordreDe(a.id) - ordreDe(b.id));
  const fiches = parOrdre("fiche").map((s) => ({ fr: s.fr, en: s.en, ...(s.extra as Json), ...(s.d !== null ? { d: s.d } : {}), w: lister(String(s.id)) }));
  const secs = parOrdre("sec").map((s) => ({ fr: s.fr, en: s.en, g: s.g, d: s.d, ...(s.extra as Json), n: questionsPar.get(String(s.id)) ?? [] }));
  return { fr: theme.fr, en: theme.en, d: theme.d, fiches, secs };
}

const ordreDe = (id: unknown) => Number(String(id).split(":").pop());

export async function reconstruireFront(q: Requete): Promise<Json> {
  const [autres, parties, themes] = await Promise.all([
    q("SELECT cle, valeur FROM front"),
    q("SELECT num, fr, en, vol, gen FROM parties ORDER BY ordre"),
    q("SELECT partie_num, liste FROM themes ORDER BY ordre"),
  ]);
  const parts = parties.map((p) => ({
    num: p.num, fr: p.fr, en: p.en, vol: p.vol, gen: p.gen,
    themes: themes.filter((t) => t.partie_num === p.num).map((t) => t.liste),
  }));
  return { ...Object.fromEntries(autres.map((a) => [a.cle, a.valeur])), parts };
}
