// Charge scripts/.cache/formes.tsv (produit par scripts/formes.py) dans la table formes.
// Usage : uv run scripts/formes.py && node --env-file=.env.local --import tsx scripts/import-formes.mts
// Relançable : la table est vidée des formes importées puis remplie, dans une transaction.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { minuscules, normaliser } from "../lib/normaliser.ts";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOT = 5000;

async function main() {
  const lignes = readFileSync(join(RACINE, "scripts", ".cache", "formes.tsv"), "utf8").trim().split(/\r?\n/).slice(1);
  const vues = new Set<string>();
  const formes: { forme: string; brute: string; mot_id: string; langue: string; source: string }[] = [];
  for (const l of lignes) {
    const [brute, mot_id, langue, source] = l.split("\t");
    const forme = normaliser(brute);
    const cle = `${minuscules(brute)}\t${mot_id}\t${langue}`;
    if (!forme || vues.has(cle)) continue;
    vues.add(cle);
    formes.push({ forme, brute: minuscules(brute), mot_id, langue, source });
  }
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query(readFileSync(join(RACINE, "db", "schema.sql"), "utf8"));
    await c.query("BEGIN");
    await c.query("DELETE FROM formes WHERE mot_id IN (SELECT id FROM mots WHERE origine = 'import')");
    for (let d = 0; d < formes.length; d += LOT) {
      await c.query(
        `INSERT INTO formes (forme, brute, mot_id, langue, source)
         SELECT forme, brute, mot_id, langue, source FROM jsonb_to_recordset($1::jsonb) AS x(forme text, brute text, mot_id text, langue text, source text)
         ON CONFLICT DO NOTHING`,
        [JSON.stringify(formes.slice(d, d + LOT))],
      );
    }
    await c.query("COMMIT");
    console.log(`${formes.length} formes importées`);
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
