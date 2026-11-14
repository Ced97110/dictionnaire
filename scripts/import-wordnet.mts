// Charge scripts/.cache/wordnet.jsonl (scripts/wordnet.py) dans la table wn_sens.
// Usage : uv run scripts/wordnet.py && node --env-file=.env.local --import tsx scripts/import-wordnet.mts
import { readFileSync } from "node:fs";
import pg from "pg";

const LOT = 5000;
const lignes = readFileSync("scripts/.cache/wordnet.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
const c = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
await c.connect();
try {
  await c.query(readFileSync("db/schema.sql", "utf8"));
  await c.query("BEGIN");
  await c.query("TRUNCATE wn_sens");
  for (let d = 0; d < lignes.length; d += LOT) {
    await c.query(`INSERT INTO wn_sens SELECT * FROM jsonb_to_recordset($1::jsonb)
      AS x(lemme text, pos text, synset text, rang int, compte int, definition text, exemples jsonb) ON CONFLICT DO NOTHING`,
      [JSON.stringify(lignes.slice(d, d + LOT))]);
  }
  await c.query("COMMIT");
  console.log(`${lignes.length} sens WordNet importés`);
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  await c.end();
}
