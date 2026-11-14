// Connexion de l'administrateur : POST {mot_de_passe} → cookie httpOnly (30 jours).
// GET : dit si le navigateur est connecté.
import { COOKIE, estAdmin, jeton, motDePasseValide } from "@/lib/auth";
import { erreur, json } from "@/lib/db";

const TRENTE_JOURS = 30 * 86400;

export async function GET(req: Request): Promise<Response> {
  return json({ admin: estAdmin(req) }, 0);
}

export async function POST(req: Request): Promise<Response> {
  const corps: unknown = await req.json().catch(() => null);
  const mdp = corps && typeof corps === "object" ? (corps as Record<string, unknown>).mot_de_passe : null;
  if (typeof mdp !== "string" || !motDePasseValide(mdp)) return erreur("Mot de passe incorrect", 401);
  const r = json({ admin: true }, 0);
  r.headers.append("Set-Cookie", `${COOKIE}=${jeton()}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TRENTE_JOURS}`);
  return r;
}
