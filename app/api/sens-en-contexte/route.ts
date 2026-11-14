// POST {texte, position, longueur, langue} → explication du mot à cette position dans ce texte.
// Lue en base si elle existe (instantané, pour tous les lecteurs) ; sinon produite par
// Haiku puis enregistrée. Au plus un appel par (texte, position), jamais deux en même temps.
import { createHash } from "node:crypto";
import { db, erreur, json } from "@/lib/db";
import { PlafondAtteint } from "@/lib/modele";
import type { Requete } from "@/lib/reconstruire";
import { decouper, expliquer, sensPossibles } from "@/lib/sens";
import { autoriser, empreinteVisiteur } from "@/lib/visiteur";

const TEXTE_MAX = 4000;
const ATTENTE_MS = 300;
const ATTENTE_MAX_MS = 15_000;
const REPRISE_APRES = "30 seconds"; // une ligne « en cours » plus vieille est reprise

const enVol = new Map<string, Promise<Response>>(); // même instance : une seule production

async function lire(q: Requete, empreinte: string, position: number) {
  const [r] = await q("SELECT statut, reponse FROM sens_en_contexte WHERE empreinte = $1 AND position = $2", [empreinte, position]);
  return r;
}

async function attendre(q: Requete, empreinte: string, position: number): Promise<Response | null> {
  for (let t = 0; t < ATTENTE_MAX_MS; t += ATTENTE_MS) {
    const r = await lire(q, empreinte, position);
    if (r?.statut === "prêt") return json({ ...(r.reponse as object), deja: true }, 0);
    if (!r || r.statut === "échec") return null;
    await new Promise((ok) => setTimeout(ok, ATTENTE_MS));
  }
  return null;
}

async function produire(q: Requete, texte: string, empreinte: string, position: number, longueur: number, langue: "fr" | "en", visiteur: string): Promise<Response> {
  const deja = await lire(q, empreinte, position);
  if (deja?.statut === "prêt") return json({ ...(deja.reponse as object), deja: true }, 0);
  const ctx = decouper(texte, position, longueur);
  if (!ctx) return erreur("Aucun mot à cette position", 400);
  // Seules les explications nouvelles (appel au modèle) comptent dans la limite du visiteur.
  if (!(await autoriser(q, visiteur))) return erreur("Limite quotidienne d'explications atteinte pour ce visiteur", 429);
  // Réserve la ligne ; si quelqu'un d'autre la produit déjà, on attend sa réponse.
  const [pris] = await q(
    `INSERT INTO sens_en_contexte (empreinte, position, mot) VALUES ($1, $2, $3)
     ON CONFLICT (empreinte, position) DO UPDATE SET statut = 'en cours', cree_le = now()
       WHERE sens_en_contexte.statut = 'échec' OR (sens_en_contexte.statut = 'en cours' AND sens_en_contexte.cree_le < now() - $4::interval)
     RETURNING empreinte`, [empreinte, position, ctx.mot, REPRISE_APRES]);
  if (!pris) return (await attendre(q, empreinte, position)) ?? erreur("Explication indisponible, réessayez", 503);
  try {
    const sens = await sensPossibles(q, ctx.mot, langue);
    if (!sens.length) {
      await q("DELETE FROM sens_en_contexte WHERE empreinte = $1 AND position = $2", [empreinte, position]);
      return erreur("Aucun sens connu pour ce mot", 404);
    }
    const reponse = { contexte: ctx, ...(await expliquer(q, ctx, sens)) };
    await q("UPDATE sens_en_contexte SET statut = 'prêt', reponse = $3 WHERE empreinte = $1 AND position = $2", [empreinte, position, JSON.stringify(reponse)]);
    return json({ ...reponse, deja: false }, 0);
  } catch (e: unknown) {
    await q("UPDATE sens_en_contexte SET statut = 'échec' WHERE empreinte = $1 AND position = $2", [empreinte, position]);
    if (e instanceof PlafondAtteint) return erreur(e.message, 429);
    throw e;
  }
}

export async function POST(req: Request): Promise<Response> {
  const c = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const texte = typeof c?.texte === "string" ? c.texte.replace(/\s+/g, " ") : "";
  const position = Number(c?.position);
  const longueur = Number(c?.longueur);
  const langue = c?.langue === "en" ? "en" : "fr";
  if (!texte || texte.length > TEXTE_MAX || !Number.isInteger(position) || position < 0 || position >= texte.length || !Number.isInteger(longueur) || longueur < 1 || longueur > 80) {
    return erreur("Texte ou position invalide", 400);
  }
  const empreinte = createHash("sha256").update(`${langue}\n${texte}`).digest("hex");
  const cle = `${empreinte}:${position}`;
  const enCours = enVol.get(cle);
  if (enCours) return (await enCours).clone();
  const p = produire(db(), texte, empreinte, position, longueur, langue, empreinteVisiteur(req)).catch((e: unknown) => {
    console.error("sens-en-contexte", e);
    return erreur("Explication impossible", 500);
  }).finally(() => enVol.delete(cle));
  enVol.set(cle, p);
  return (await p).clone();
}
