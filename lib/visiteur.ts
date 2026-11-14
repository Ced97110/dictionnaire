// Limite par visiteur des appels coûteux au modèle. Le visiteur est reconnu par une
// empreinte de son adresse IP (salée avec ADMIN_PASSWORD), jamais par l'adresse en clair.
import { createHash } from "node:crypto";
import type { Requete } from "./reconstruire";

const LIMITE_PAR_DEFAUT = 60;

export function empreinteVisiteur(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "inconnu";
  return createHash("sha256").update(`${process.env.ADMIN_PASSWORD ?? ""}:${ip}`).digest("hex").slice(0, 32);
}

// Compte un appel ; renvoie false si le visiteur a atteint sa limite du jour.
export async function autoriser(q: Requete, visiteur: string): Promise<boolean> {
  const limite = Number(process.env.LIMITE_SENS_VISITEUR ?? LIMITE_PAR_DEFAUT);
  const [r] = await q(
    `INSERT INTO appels_visiteur (visiteur, jour, n) VALUES ($1, current_date, 1)
     ON CONFLICT (visiteur, jour) DO UPDATE SET n = appels_visiteur.n + 1 WHERE appels_visiteur.n < $2
     RETURNING n`, [visiteur, limite]);
  return !!r;
}
