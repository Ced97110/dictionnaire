// Mise au point du sens en contexte sur le JEU DE MISE AU POINT (tests/semcor_dev.json),
// jamais sur le jeu de test (tests/semcor_cas.json), qui ne sert qu'à la mesure finale.
// Usage : LIMITE_APPELS_JOUR=5000 node --env-file=.env.local --import tsx tests/semcor-variantes.mts [noms de variantes…]
import { readFileSync } from "node:fs";
import pg from "pg";
import { CONSIGNE, expliquer, type Options, type Sens } from "../lib/sens.ts";

// Version 3 (mesurée : 57,5 % sur le test), gardée pour comparaison.
const V3 =
  "Tu expliques à un lecteur comment un mot est employé dans une phrase précise, en suivant les étapes " +
  "qu'un modèle de langue suit pour comprendre un mot. Phrases simples, sans métaphore.\n" +
  "On te donne la phrase, la phrase précédente et la suivante, le mot, et la liste numérotée de ses sens possibles.\n" +
  "Règles : choisis UNIQUEMENT un sens de la liste ; les indices sont 1 à 3 mots copiés tels quels de LA PHRASE " +
  "(pas des phrases voisines, pas le mot lui-même) qui décident du sens ; si les indices ne suffisent pas à " +
  "trancher, dis-le (tranche: false) et donne les deux sens possibles au lieu d'en choisir un.\n" +
  "Les sens WordNet (W…) sont classés du plus fréquent au moins fréquent : sans indice contraire, le plus fréquent est le plus probable.\n" +
  "Si aucun sens de la liste ne correspond à l'emploi dans la phrase, mets \"sens_retenu\": \"AUCUN\" et dis le sens réel dans la reformulation.\n" +
  "Chaque texte en français, puis sa traduction en anglais américain. Sois bref : 10 mots au plus par texte.\n" +
  'Réponds uniquement par un objet JSON : {"indices": [{"mot": "<mot de la phrase>", "apport_fr": "<ce qu\'il indique>", ' +
  '"apport_en": "<same in English>"}], "tranche": true|false, "sens_retenu": "<identifiant, ou null>", ' +
  '"sens_alternatifs": ["<id>", "<id>"], "reformulation_fr": "<le sens retenu, dit pour cette phrase>", ' +
  '"reformulation_en": "...", "role_fr": "<ce que fait le mot : sujet, action, qualité de tel nom…>", "role_en": "...", ' +
  '"rattache_a": "<le mot de la phrase auquel il se rattache>"}';

interface Variante { options: Options; synonymes: boolean }
const VARIANTES: Record<string, Variante> = {
  v3: { options: { consigne: V3 }, synonymes: false },
  v4: { options: {}, synonymes: true },
  "v4-reflexion": { options: { reflechir: true }, synonymes: true },
};
const choisies = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VARIANTES);
const cas = JSON.parse(readFileSync("tests/semcor_dev.json", "utf8")) as any[];
const PARALLELE = 6;
void CONSIGNE;

const c = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await c.connect();
const q = async (s: string, p?: unknown[]) => (await c.query(s, p as unknown[])).rows;

for (const nom of choisies) {
  const v = VARIANTES[nom];
  const res: any[] = new Array(cas.length);
  let k = 0;
  await Promise.all(Array.from({ length: PARALLELE }, async () => {
    while (k < cas.length) {
      const i = k++, x = cas[i];
      const sens: Sens[] = x.sens.map((s: any, j: number) => ({ id: `W${j + 1}`, source: "WordNet", texte_en: s.definition, synset: s.synset,
        ...(v.synonymes ? { synonymes: s.synonymes, exemple: s.exemple || undefined } : {}) }));
      const t0 = Date.now();
      try {
        const e = await expliquer(q, { precedente: x.precedente, phrase: x.phrase, suivante: x.suivante, mot: x.mot }, sens, v.options);
        res[i] = { juste: e.tranche && sens.find((s) => s.id === e.sens_retenu)?.synset === x.attendu, tranche: e.tranche, aucun: e.sens_retenu === "AUCUN", ms: Date.now() - t0 };
      } catch (err) { res[i] = { juste: false, rejet: String(err).slice(0, 120), ms: Date.now() - t0 }; }
    }
  }));
  const ms = res.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`${nom.padEnd(14)} justes ${res.filter((r) => r.juste).length}/${cas.length} | non tranchés ${res.filter((r) => r.tranche === false).length} | AUCUN ${res.filter((r) => r.aucun).length} | rejets ${res.filter((r) => r.rejet).length} | médiane ${ms[ms.length >> 1]} ms`);
}
console.log(`plus fréquent  justes ${cas.filter((x) => x.sens[0].synset === x.attendu).length}/${cas.length}`);
await c.end();
