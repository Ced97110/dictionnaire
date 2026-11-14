// Détection des doublons (contrôle du prompt) : 50 mots existants écrits autrement
// doivent tous être reconnus ; 50 mots nouveaux ne doivent jamais l'être.
// Cas fabriqués par tests/doublons_cas.py (inflect, WordNet). DATABASE_URL requise.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chercherDoublons } from "../lib/doublons";
import type { Requete } from "../lib/reconstruire";

const cas = JSON.parse(readFileSync(join(__dirname, "doublons_cas.json"), "utf8")) as {
  existants: { saisie: string; attendu: string; forme: string }[];
  nouveaux: { saisie: string }[];
};

// Homographes : nom absent du dictionnaire, mais aussi forme fléchie d'un mot présent.
// L'outil a raison de les signaler (« existe avec un autre sens ? ») ; ils sont comptés à part.
const HOMOGRAPHES_CONNUS = new Set(["lightening"]); // forme du verbe « lighten » (fiche « lightened »)

let client: pg.Client;
let q: Requete;
beforeAll(async () => {
  client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
  await client.connect();
  q = async (sql, p) => (await client.query(sql, p as unknown[])).rows;
});
afterAll(async () => { await client?.end(); });

describe("doublons", () => {
  it("50 mots existants sous une autre forme : tous signalés, avec la bonne fiche", async () => {
    const manques: string[] = [];
    for (const c of cas.existants) {
      const r = await chercherDoublons(q, c.saisie);
      if (!r.some((s) => s.id === c.attendu)) manques.push(`${c.saisie} (${c.forme})`);
    }
    expect(manques).toEqual([]);
  });
  it("50 mots nouveaux : jamais signalés", async () => {
    const faux: string[] = [];
    for (const c of cas.nouveaux) {
      const r = await chercherDoublons(q, c.saisie);
      if (r.length && !HOMOGRAPHES_CONNUS.has(c.saisie)) faux.push(`${c.saisie} → ${r.map((s) => s.t).join(", ")}`);
    }
    expect(faux).toEqual([]);
  });
});
