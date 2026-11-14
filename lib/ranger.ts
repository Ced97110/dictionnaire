// Rangement d'un mot nouveau : la règle retenue le 13/11/2026 (eval/ranger.py).
//   1. Haiku écrit une définition courte à partir du mot et de sa traduction ;
//   2. TF-IDF propose 10 sections candidates à partir de cette définition ;
//   3. Haiku en choisit une et dit sa confiance.
// Rangé automatiquement seulement si la confiance est « haute » ET que Haiku choisit
// la première candidate de TF-IDF (mesuré : ~88-91 % justes sur 24-34 % des mots).
// Sinon : file « À valider », avec les 3 meilleures propositions.

import { demander, lireJson } from "./modele";
import type { Requete } from "./reconstruire";
import { classer, Tfidf } from "./tfidf";

// Consignes recopiées de eval/mesure_b.py (CONSIGNE_DEF) et eval/pipeline.py (CONSIGNE).
const CONSIGNE_DEF =
  "Tu rédiges des définitions de dictionnaire bilingue anglais-français. " +
  "On te donne un mot anglais et sa traduction. Écris une définition courte en " +
  "français, puis la même en anglais, sans répéter le mot ni sa traduction. " +
  "Format exact :\nFR: <définition>\nEN: <definition>";
const CONSIGNE_CHOIX =
  "Tu ranges des mots dans un dictionnaire thématique bilingue. On te donne un mot, " +
  "sa traduction, sa définition, et 10 sections candidates avec leur description et " +
  "des exemples de mots déjà rangés. Choisis la section où un lecteur chercherait ce mot. " +
  'Réponds uniquement par un objet JSON : {"choix": <numéro 1-10>, ' +
  '"confiance": "haute" | "moyenne" | "basse"}.';
const JETONS = 4000;
const N_EXEMPLES = 4;

export interface Proposition { section_id: string; libelle: string }
export interface Rangement {
  definition: string;
  propositions: Proposition[]; // 3 au plus, la section choisie d'abord
  confiance: string;
  automatique: boolean;
}

interface Corpus { tfidf: Tfidf; sectionDe: string[]; fiches: Map<string, string>; libelles: Map<string, string> }
let corpus: Promise<Corpus> | null = null;

const ordreTheme = (cle: string) => cle.split("_").map(Number);

// Même ordre que eval/donnees.py : thèmes par clé numérique, sections puis fiches,
// mots dans l'ordre des questions. L'ordre ne compte que pour départager les égalités.
export function chargerCorpusRangement(q: Requete): Promise<Corpus> {
  corpus ??= (async () => {
    const [mots, sections] = await Promise.all([
      q(`SELECT m.t, m.r, m.def_fr, m.def_en, m.gd, m.section_id, s.theme_cle, s.genre, s.ordre AS s_ordre,
                coalesce(qu.ordre, -1) AS q_ordre, m.ordre
         FROM mots m JOIN sections s ON s.id = m.section_id LEFT JOIN questions qu ON qu.id = m.question_id`),
      q(`SELECT s.id, s.fr, s.d, th.fr AS theme FROM sections s JOIN themes th ON th.cle = s.theme_cle`),
    ]);
    const cle = (m: Record<string, unknown>) => [...ordreTheme(String(m.theme_cle)), m.genre === "sec" ? 0 : 1, Number(m.s_ordre), Number(m.q_ordre), Number(m.ordre)];
    mots.sort((a, b) => { const x = cle(a), y = cle(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
    const textes = mots.map((m) => {
      const gd = Array.isArray(m.gd) ? (m.gd as unknown[]).filter(Boolean).join(" ; ") : "";
      return `${m.t} — ${m.r}. ${[m.def_fr, m.def_en, gd].filter(Boolean).join(" ")}`;
    });
    const exemples = new Map<string, string[]>();
    for (const m of mots) {
      const l = exemples.get(String(m.section_id)) ?? [];
      if (l.length < N_EXEMPLES) exemples.set(String(m.section_id), [...l, String(m.t)]);
    }
    const libelles = new Map(sections.map((s) => [String(s.id), `${s.theme} › ${s.fr}`]));
    const fiches = new Map(sections.map((s) => {
      const desc = (Array.isArray(s.d) ? String(s.d[0] ?? "") : "") || "pas de description";
      return [String(s.id), `${libelles.get(String(s.id))} — ${desc} Exemples : ${(exemples.get(String(s.id)) ?? []).join(", ")}.`];
    }));
    return { tfidf: new Tfidf(textes), sectionDe: mots.map((m) => String(m.section_id)), fiches, libelles };
  })().catch((e: unknown) => { corpus = null; throw e; });
  return corpus;
}

export function oublierCorpusRangement(): void { corpus = null; }

export async function ranger(q: Requete, t: string, r: string): Promise<Rangement> {
  const c = await chargerCorpusRangement(q);
  const definition = await demander(q, CONSIGNE_DEF, `${t} — ${r}`, JETONS);
  const cands = classer(c.tfidf, c.sectionDe, definition);
  const texte = [`Mot : ${t} (${r})`, `Définition : ${definition}`, "", "Sections :",
    ...cands.map((s, i) => `${i + 1}. ${c.fiches.get(s)}`)].join("\n");
  const rep = lireJson(await demander(q, CONSIGNE_CHOIX, texte, JETONS));
  const n = Number(rep?.choix ?? 0);
  const choix = n >= 1 && n <= cands.length ? cands[n - 1] : null;
  const confiance = String(rep?.confiance ?? "basse").toLowerCase();
  const ordre = choix ? [choix, ...cands.filter((s) => s !== choix)] : cands;
  return {
    definition,
    propositions: ordre.slice(0, 3).map((s) => ({ section_id: s, libelle: c.libelles.get(s) ?? s })),
    confiance,
    automatique: confiance === "haute" && choix === cands[0],
  };
}
