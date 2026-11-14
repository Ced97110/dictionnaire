// Doublons sur un tirage de contrôle jamais utilisé pour régler le système
// (tests/doublons_controle.json : 50 pluriels de mots existants, 50 mots nouveaux).
// Le détail est écrit dans tests/resultats/doublons-controle.json.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { chercherDoublons } from "../lib/doublons";
import type { Requete } from "../lib/reconstruire";

const cas = JSON.parse(readFileSync(join(__dirname, "doublons_controle.json"), "utf8")) as {
  existants: { saisie: string; attendu: string }[]; nouveaux: { saisie: string }[];
};
let client: pg.Client;
let q: Requete;
beforeAll(async () => {
  client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
  await client.connect();
  q = async (sql, p) => (await client.query(sql, p as unknown[])).rows;
});
afterAll(async () => { await client?.end(); });

it("tirage de contrôle : pluriels reconnus, mots nouveaux non signalés", async () => {
  const manques: string[] = [], faux: string[] = [];
  for (const c of cas.existants) if (!(await chercherDoublons(q, c.saisie)).some((s) => s.id === c.attendu)) manques.push(c.saisie);
  for (const c of cas.nouveaux) { const r = await chercherDoublons(q, c.saisie); if (r.length) faux.push(`${c.saisie} → ${r.map((s) => s.t).join(", ")}`); }
  const rapport = { pluriels_reconnus: `${cas.existants.length - manques.length}/${cas.existants.length}`, manques,
    nouveaux_non_signales: `${cas.nouveaux.length - faux.length}/${cas.nouveaux.length}`, faux };
  writeFileSync(join(__dirname, "resultats", "doublons-controle.json"), JSON.stringify(rapport, null, 1));
  console.log(JSON.stringify(rapport, null, 1));
  expect.soft(manques).toEqual([]);
  expect.soft(faux).toEqual([]);
});
