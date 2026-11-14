// Le TF-IDF recopié en TypeScript (lib/tfidf.ts) classe-t-il les sections comme
// scikit-learn dans eval/ ? Référence : tests/tfidf_reference.json (tfidf_reference.py).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { chargerCorpusRangement } from "../lib/ranger";
import { classer } from "../lib/tfidf";

const reference = JSON.parse(readFileSync(join(__dirname, "tfidf_reference.json"), "utf8")) as { requete: string; sections: string[] }[];
let client: pg.Client;
beforeAll(async () => { client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL }); await client.connect(); });
afterAll(async () => { await client?.end(); });

it(`mêmes 10 sections, dans le même ordre, que scikit-learn (${reference.length} définitions)`, async () => {
  const c = await chargerCorpusRangement(async (sql, p) => (await client.query(sql, p as unknown[])).rows);
  const ecarts = reference.filter((r) => JSON.stringify(classer(c.tfidf, c.sectionDe, r.requete)) !== JSON.stringify(r.sections))
    .map((r) => ({ requete: r.requete.slice(0, 60), attendu: r.sections.slice(0, 3), obtenu: classer(c.tfidf, c.sectionDe, r.requete).slice(0, 3) }));
  expect(ecarts).toEqual([]);
}, 120_000);
