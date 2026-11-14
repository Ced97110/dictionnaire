// Documents téléversés : analyse (service spaCy), rapprochement avec le dictionnaire,
// historique. Le fichier d'origine est gardé dans Vercel Blob (accès privé).

import { createHash } from "node:crypto";
import { get, put } from "@vercel/blob";
import { minuscules } from "./normaliser";
import type { Requete } from "./reconstruire";

export const TAILLE_MAX = 4 * 1024 * 1024; // limite du corps d'une requête sur Vercel (4,5 Mo)
const LOT = 1000;

export interface LemmeAnalyse { lemme: string; nature: "nom" | "verbe" | "adjectif"; occurrences: number; phrase: string; forme: string }
interface Analyse { langue: "fr" | "en"; n_mots: number; lemmes: LemmeAnalyse[] }

export const empreinte = (contenu: Buffer): string => createHash("sha256").update(contenu).digest("hex");

async function analyser(nom: string, contenu: Buffer): Promise<Analyse> {
  const url = process.env.ANALYSE_URL ?? "http://127.0.0.1:8001/analyse";
  const r = await fetch(url, {
    method: "POST", body: new Uint8Array(contenu),
    headers: { "x-nom": encodeURIComponent(nom).replace(/%2E/gi, "."), "x-secret": process.env.ANALYSE_SECRET ?? "" },
  }).catch((e: unknown) => { throw new Error(`Service d'analyse injoignable (${url}) : ${String(e)}`); });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail ?? `Analyse impossible (${r.status})`);
  return (await r.json()) as Analyse;
}

// Relie chaque forme de base au dictionnaire (formes fléchies, même langue). Statut des
// lemmes déjà ajoutés ou en attente conservé.
export async function rapprocher(q: Requete, documentId: number | string, langue: string): Promise<void> {
  await q(
    `UPDATE document_mots dm SET mot_id = x.mot_id, statut = 'présent'
     FROM (SELECT DISTINCT ON (dm2.lemme, dm2.nature) dm2.lemme, dm2.nature, f.mot_id
           FROM document_mots dm2 JOIN formes f ON f.brute = dm2.lemme AND f.langue = $2
           WHERE dm2.document_id = $1 AND dm2.statut = 'nouveau'
           ORDER BY dm2.lemme, dm2.nature, (f.source IN ('mot', 'traduction')) DESC) x
     WHERE dm.document_id = $1 AND dm.lemme = x.lemme AND dm.nature = x.nature`, [documentId, langue]);
}

async function inserer(q: Requete, documentId: number | string, lemmes: LemmeAnalyse[]): Promise<void> {
  for (let d = 0; d < lemmes.length; d += LOT) {
    const lot = lemmes.slice(d, d + LOT).map((l) => ({ ...l, lemme: minuscules(l.lemme) })).filter((l) => l.lemme);
    await q(
      `INSERT INTO document_mots (document_id, lemme, nature, forme, occurrences, phrase, statut)
       SELECT $1, lemme, nature, (array_agg(forme ORDER BY occurrences DESC))[1], sum(occurrences), min(phrase), 'nouveau'
       FROM jsonb_to_recordset($2::jsonb) AS x(lemme text, nature text, forme text, occurrences int, phrase text)
       GROUP BY lemme, nature
       ON CONFLICT (document_id, lemme, nature) DO UPDATE SET occurrences = document_mots.occurrences + EXCLUDED.occurrences`,
      [documentId, JSON.stringify(lot)]);
  }
}

export type Televersement = { statut: "existe" | "analysé"; id: string };

export async function televerser(q: Requete, nom: string, contenu: Buffer): Promise<Televersement> {
  const sha = empreinte(contenu);
  const [deja] = await q("SELECT id::text, etat FROM documents WHERE empreinte = $1", [sha]);
  if (deja && deja.etat !== "échec") return { statut: "existe", id: String(deja.id) };
  const [{ id }] = deja
    ? await q("UPDATE documents SET nom = $2, etat = 'en cours', erreur = NULL WHERE id = $1 RETURNING id::text", [deja.id, nom])
    : await q("INSERT INTO documents (nom, empreinte, taille) VALUES ($1, $2, $3) RETURNING id::text", [nom, sha, contenu.length]);
  try {
    const blob = await put(`documents/${sha}/${nom}`, contenu, { access: "private", allowOverwrite: true, addRandomSuffix: false });
    await q("UPDATE documents SET blob_url = $2 WHERE id = $1", [id, blob.url]);
    await analyserEtRanger(q, String(id), nom, contenu);
    return { statut: "analysé", id: String(id) };
  } catch (e: unknown) {
    await q("UPDATE documents SET etat = 'échec', erreur = $2 WHERE id = $1", [id, e instanceof Error ? e.message : String(e)]);
    throw e;
  }
}

async function analyserEtRanger(q: Requete, id: string, nom: string, contenu: Buffer): Promise<void> {
  const a = await analyser(nom, contenu);
  // Une relance garde les mots déjà ajoutés ou en attente de validation.
  await q("DELETE FROM document_mots WHERE document_id = $1 AND statut IN ('présent', 'nouveau')", [id]);
  await inserer(q, id, a.lemmes);
  await rapprocher(q, id, a.langue);
  await q("UPDATE documents SET langue = $2, n_mots = $3, etat = 'prêt', erreur = NULL WHERE id = $1", [id, a.langue, a.n_mots]);
}

// Relance l'analyse à partir du fichier gardé dans Vercel Blob.
export async function relancer(q: Requete, id: string): Promise<void> {
  const [d] = await q("SELECT nom, blob_url FROM documents WHERE id = $1", [id]);
  if (!d?.blob_url) throw new Error("Fichier d'origine introuvable");
  const r = await get(String(d.blob_url), { access: "private" });
  if (!r) throw new Error("Fichier d'origine introuvable dans Vercel Blob");
  const contenu = Buffer.from(await new Response(r.stream).arrayBuffer());
  await analyserEtRanger(q, id, String(d.nom), contenu);
}
