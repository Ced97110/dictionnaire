// Juge indépendant (Claude Sonnet) pour les cas où spaCy et le site ne sont pas d'accord,
// plus 10 cas témoins où ils sont d'accord (pour vérifier que le juge ne dit pas oui à tout).
// Sonnet ne sait pas d'où vient chaque réponse. 15 appels au plus.
// Usage : node --env-file=.env.local --import tsx tests/juge-sonnet.mts
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "node:fs";

const MODELE = "claude-sonnet-5-5";
const N_TEMOINS = 10;
const rapport = JSON.parse(readFileSync("tests/resultats/glose-rapport.json", "utf8"));
const api = new Anthropic({ maxRetries: 4 });

async function demander(texte: string): Promise<Record<string, unknown>> {
  const r = await api.messages.create({ model: MODELE, max_tokens: 600, messages: [{ role: "user", content: texte }] });
  const s = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return JSON.parse(s.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
}

let graine = 7;
const alea = () => ((graine = (graine * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const tous = rapport.bon_mot.tous as { texte: string; affiche: string; ok: boolean; phrase: string; langue: string }[];
const accords = tous.filter((v) => v.ok);
const temoins = Array.from({ length: N_TEMOINS }, () => accords.splice(Math.floor(alea() * accords.length), 1)[0]);
const formes = [...tous.filter((v) => !v.ok).map((v) => ({ ...v, groupe: "contesté" })), ...temoins.map((v) => ({ ...v, groupe: "témoin" }))]
  .sort(() => alea() - 0.5);

const sorties = [];
for (const v of formes) {
  const j = await demander(`Un lecteur touche un mot dans une phrase de dictionnaire, et une fenêtre lui montre une entrée.
Phrase (${v.langue === "fr" ? "français" : "anglais"}) : « ${v.phrase} »
Mot touché : « ${v.texte} »
Entrée montrée : « ${v.affiche} »
L'entrée montrée est-elle le bon mot du dictionnaire pour ce mot dans cette phrase, c'est-à-dire le même mot ramené à sa forme de base (lemme), avec la bonne nature (nom, verbe, adjectif) ?
Réponds uniquement par un objet JSON : {"correct": true ou false, "raison": "<une phrase>"}`);
  sorties.push({ type: "bon mot", groupe: v.groupe, mot: v.texte, affiche: v.affiche, ...j });
}
for (const o of rapport.mots_outils_consultables as string[]) {
  const [tete, phrase] = o.split(" ¶ ");
  const mot = tete.split(" (")[0];
  const j = await demander(`Phrase : « ${phrase} »
Dans cette phrase, le mot « ${mot} » est-il un mot-outil (déterminant, préposition, pronom, conjonction, auxiliaire) ou un mot plein (nom, verbe, adjectif, adverbe) ?
Réponds uniquement par un objet JSON : {"outil": true ou false, "nature": "<nature>", "raison": "<une phrase>"}`);
  sorties.push({ type: "mot-outil", groupe: "contesté", mot, ...j });
}
// Hors de test-results/, que Playwright vide à chaque lancement.
writeFileSync("tests/glose_arbitrage.json", JSON.stringify({
  source: `tests/juge-sonnet.mts — ${MODELE}, à l'aveugle, ${new Date().toISOString().slice(0, 10)}`,
  bon_mot: sorties.filter((x: any) => x.type === "bon mot" && x.groupe === "contesté").map((x: any) => ({ mot: x.mot, affiche: x.affiche, correct: x.correct, raison: x.raison })),
  mots_outils: sorties.filter((x: any) => x.type === "mot-outil").map((x: any) => ({ mot: x.mot, outil: x.outil, raison: x.raison })),
  temoins: sorties.filter((x: any) => x.groupe === "témoin").map((x: any) => ({ mot: x.mot, affiche: x.affiche, correct: x.correct })),
}, null, 1));
for (const s of sorties) console.log(JSON.stringify(s));
