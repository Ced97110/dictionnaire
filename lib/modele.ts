// Appels à Claude Haiku, avec un plafond quotidien commun à toute l'application
// (variable LIMITE_APPELS_JOUR, 500 par défaut).

import Anthropic from "@anthropic-ai/sdk";
import type { Requete } from "./reconstruire";

export const HAIKU = "claude-haiku-5-5";
const LIMITE_PAR_DEFAUT = 500;

export class PlafondAtteint extends Error {
  constructor() { super("Plafond quotidien d'appels au modèle atteint"); }
}

let client: Anthropic | null = null;
function api(): Anthropic {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY n'est pas définie");
  client = new Anthropic({ maxRetries: 4 });
  return client;
}

// Réserve un appel ; lève PlafondAtteint si la limite du jour est déjà atteinte.
async function reserver(q: Requete): Promise<void> {
  const limite = Number(process.env.LIMITE_APPELS_JOUR ?? LIMITE_PAR_DEFAUT);
  const [r] = await q(
    `INSERT INTO appels_modele (jour, n) VALUES (current_date, 1)
     ON CONFLICT (jour) DO UPDATE SET n = appels_modele.n + 1 WHERE appels_modele.n < $1 OR $2
     RETURNING n`, [limite, process.env.SANS_LIMITES === "1"]);
  // Mode test (SANS_LIMITES=1) : les appels restent comptés, mais sans plafond.
  if (!r && process.env.SANS_LIMITES !== "1") throw new PlafondAtteint();
}

// reflechir: false coupe la réflexion préalable du modèle (plus rapide ; pour les réponses courtes).
export async function demander(q: Requete, consigne: string, texte: string, jetons: number, reflechir = true): Promise<string> {
  await reserver(q);
  for (let essai = 0; essai < 2; essai++) {
    const r = await api().messages.create({
      model: HAIKU, max_tokens: jetons, system: consigne,
      messages: [{ role: "user", content: texte }],
      ...(reflechir ? {} : { thinking: { type: "disabled" as const } }),
    });
    const sortie = r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    if (sortie) return sortie;
  }
  throw new Error("Réponse vide du modèle, deux fois");
}

// Premier objet JSON trouvé dans une réponse, ou null.
export function lireJson(texte: string): Record<string, unknown> | null {
  const m = texte.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v: unknown = JSON.parse(m[0]);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
