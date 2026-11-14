// Accès à la base depuis les routes API : connexion « pooled » de Neon, en HTTP.
import { neon } from "@neondatabase/serverless";
import type { Requete } from "./reconstruire";

let requete: Requete | null = null;

export function db(): Requete {
  if (requete) return requete;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n'est pas définie");
  const sql = neon(url);
  requete = (texte, params = []) => sql.query(texte, params as unknown[]) as Promise<Record<string, unknown>[]>;
  return requete;
}

// Réponse JSON avec durée de cache (en secondes) pour le navigateur et le CDN de Vercel.
export function json(donnees: unknown, cache: number, statut = 200): Response {
  return Response.json(donnees, {
    status: statut,
    headers: { "Cache-Control": cache > 0 ? `public, max-age=${cache}, s-maxage=${cache}, stale-while-revalidate=${cache}` : "no-store" },
  });
}

export function erreur(message: string, statut: number): Response {
  return json({ erreur: message }, 0, statut);
}
