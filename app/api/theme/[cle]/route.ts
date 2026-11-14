// Un thème entier, dans la forme de l'ancien fichier t<clé>.json.
import { db, erreur, json } from "@/lib/db";
import { reconstruireTheme } from "@/lib/reconstruire";

// Une minute : un mot ajouté apparaît vite dans son thème.
const UNE_MINUTE = 60;
const CLE = /^\d{1,2}_\d{1,2}$/;

export async function GET(_req: Request, ctx: RouteContext<"/api/theme/[cle]">): Promise<Response> {
  const { cle } = await ctx.params;
  if (!CLE.test(cle)) return erreur("Clé de thème invalide", 400);
  try {
    const theme = await reconstruireTheme(db(), cle);
    return theme ? json(theme, UNE_MINUTE) : erreur("Thème introuvable", 404);
  } catch (e: unknown) {
    console.error("theme", cle, e);
    return erreur("Chargement impossible", 500);
  }
}
