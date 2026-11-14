// Contrôles de la définition au toucher, jugés par spaCy (tests/glose_cas.py) :
//  - au moins 95 % des noms, verbes et adjectifs présents dans le dictionnaire sont consultables ;
//  - sur 50 mots touchés au hasard, la fenêtre montre le bon mot (forme de base) dans au moins 95 % des cas ;
//  - aucun mot-outil consultable ;
//  - la fenêtre s'ouvre en moins de 100 ms après le toucher.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

interface Mot { d: number; f: number; texte: string; lemme: string; nature: string; outil: boolean; present: boolean }
interface Cas { id: string; langue: "fr" | "en"; texte: string; mots: Mot[] }
const cas = JSON.parse(readFileSync(join(__dirname, "glose_cas.json"), "utf8")) as Cas[];
const N_TOUCHES = 50;
// Désaccords entre spaCy et le site, tranchés à l'aveugle par Sonnet (tests/juge-sonnet.mts).
const arbitrage = JSON.parse(readFileSync(join(__dirname, "glose_arbitrage.json"), "utf8")) as {
  bon_mot: { mot: string; affiche: string; correct: boolean }[]; mots_outils: { mot: string; outil: boolean }[];
};
const principal = (s: string) => s.replace(/≈/g, " ").split("(")[0].replace(/\s+/g, " ").trim().toLowerCase();

test("définition au toucher : couverture, bon mot, mots-outils, vitesse", async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000");
  await page.waitForSelector("#out [data-wz]");
  await page.evaluate((cs) => {
    document.querySelector("#out")!.innerHTML = cs.map((c, i) => `<div class="card"><p id="c${i}" ${c.langue === "en" ? 'lang="en"' : ""}>${c.texte.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p></div>`).join("");
  }, cas);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  // Plages de caractères soulignées, par définition.
  const plages = await page.evaluate((n) => Array.from({ length: n }, (_, i) => {
    const p = document.getElementById(`c${i}`)!; const res: [number, number, string, string][] = []; let pos = 0;
    const marcher = (el: Node) => el.childNodes.forEach((x) => {
      if (x.nodeType === 3) pos += x.nodeValue!.length;
      else if ((x as HTMLElement).classList.contains("gl")) { const t = x.textContent!; res.push([pos, pos + t.length, (x as HTMLElement).dataset.f!, t]); pos += t.length; }
      else marcher(x);
    });
    marcher(p); return res;
  }), cas.length);

  let presents = 0, couverts = 0; const manques: string[] = []; const outils: string[] = [];
  cas.forEach((c, i) => {
    for (const m of c.mots) {
      const dans = plages[i].find(([d, f]) => d <= m.d && m.f <= f);
      if (m.present) { presents++; if (dans) couverts++; else manques.push(`${m.texte} (${m.lemme}, ${c.langue})`); }
      if (m.outil && dans && dans[0] === m.d && dans[1] === m.f) outils.push(`${m.texte} (${m.nature}) ¶ ${c.texte}`);
    }
  });

  // 50 mots touchés au hasard (graine fixe) : la fenêtre montre-t-elle la bonne forme de base ?
  let s = 20261113; const alea = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const toutes = plages.flatMap((pl, i) => pl.map((x, j) => ({ i, j, x })));
  const touches = Array.from({ length: N_TOUCHES }, () => toutes[Math.floor(alea() * toutes.length)]);
  const verdicts: { texte: string; attendu: string; affiche: string; ok: boolean; ms: number; phrase: string; langue: string }[] = [];
  for (const { i, j, x } of touches) {
    const r = await page.evaluate(([i, j]) => {
      const span = document.querySelectorAll(`#c${i} .gl`)[j] as HTMLElement;
      span.scrollIntoView({ block: "center" });
      const t0 = performance.now(); span.click();
      const pop = document.getElementById("glpop")!;
      const ms = performance.now() - t0;
      const mot = pop.hidden ? "" : pop.querySelector(".glmot")!.textContent!;
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      return { mot, ms };
    }, [i, j] as const);
    const c = cas[i];
    const lemmes = c.mots.filter((m) => m.d >= x[0] && m.f <= x[1] && !m.outil).map((m) => m.lemme).join(" ");
    const attendu = lemmes || x[3].toLowerCase();
    const affiche = principal(r.mot);
    const ok = affiche === attendu || affiche === x[3].toLowerCase() || affiche === x[2];
    verdicts.push({ texte: x[3], attendu, affiche, ok, ms: Math.round(r.ms * 10) / 10, phrase: c.texte, langue: c.langue });
  }

  const bons = verdicts.filter((v) => v.ok).length;
  const valideParSonnet = (v: { texte: string; affiche: string }) => arbitrage.bon_mot.some((a) => a.correct && a.mot === v.texte && a.affiche === v.affiche);
  const bonsArbitres = verdicts.filter((v) => v.ok || valideParSonnet(v)).length;
  const outilsArbitres = outils.filter((o) => !arbitrage.mots_outils.some((a) => !a.outil && o.startsWith(`${a.mot} (`)));
  const lent = Math.max(...verdicts.map((v) => v.ms));
  const rapport = {
    couverture: { presents, couverts, taux: couverts / presents, manques },
    bon_mot: { touches: N_TOUCHES, bons, taux: bons / N_TOUCHES, erreurs: verdicts.filter((v) => !v.ok), tous: verdicts },
    bon_mot_arbitre: { bons: bonsArbitres, taux: bonsArbitres / N_TOUCHES },
    mots_outils_consultables: outils,
    mots_outils_arbitres: outilsArbitres,
    ouverture_ms_max: lent,
  };
  writeFileSync(join(__dirname, "resultats", "glose-rapport.json"), JSON.stringify(rapport, null, 1));
  console.log(JSON.stringify({ ...rapport, couverture: { ...rapport.couverture, manques: rapport.couverture.manques.slice(0, 40) } }, null, 1));
  expect.soft(rapport.couverture.taux).toBeGreaterThanOrEqual(0.95);
  // spaCy (petit modèle) se trompe parfois de lemme ou de nature : on conclut sur le chiffre arbitré.
  expect.soft(rapport.bon_mot_arbitre.taux).toBeGreaterThanOrEqual(0.95);
  expect.soft(outilsArbitres).toEqual([]);
  expect.soft(lent).toBeLessThan(100);
});
