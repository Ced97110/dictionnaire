// Écritures réservées à l'administrateur : mot de passe ADMIN_PASSWORD, échangé contre
// un cookie httpOnly. Sans ADMIN_PASSWORD définie, toute écriture est refusée.

import { createHash, timingSafeEqual } from "node:crypto";

export const COOKIE = "dico_admin";

export function jeton(): string | null {
  const mdp = process.env.ADMIN_PASSWORD;
  return mdp ? createHash("sha256").update(`dictionnaire:${mdp}`).digest("hex") : null;
}

function egal(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function motDePasseValide(saisi: string): boolean {
  const mdp = process.env.ADMIN_PASSWORD;
  return !!mdp && egal(createHash("sha256").update(saisi).digest("hex"), createHash("sha256").update(mdp).digest("hex"));
}

// Mode test (SANS_LIMITES=1) : pas de mot de passe. À ne jamais laisser sur un site public.
export const sansLimites = (): boolean => process.env.SANS_LIMITES === "1";

export function estAdmin(req: Request): boolean {
  if (sansLimites()) return true;
  const attendu = jeton();
  if (!attendu) return false;
  const cookies = req.headers.get("cookie") ?? "";
  const m = cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return !!m && egal(m[1], attendu);
}
