// Les parcours existants affichent-ils exactement la même chose qu'avant la migration ?
// On joue chaque parcours sur l'ancien site et sur le nouveau, en largeur 400 px,
// et on compare le texte affiché à chaque étape.
import { expect, test, type Page } from "@playwright/test";

const ANCIEN = "http://localhost:3100";
const NOUVEAU = "http://localhost:3000";

type Etape = (p: Page) => Promise<void>;

async function texte(p: Page, sel = "#out"): Promise<string> {
  await p.waitForFunction(() => !document.querySelector("#out .st")?.textContent?.match(/Chargement|Ouverture/));
  await p.waitForTimeout(300);
  // Le nombre de mots grandit à chaque ajout : il n'est pas comparé.
  return (await p.locator(sel).innerText()).replace(/\s+/g, " ").replace(/^[\d\s\u202f]+ mots et expressions/, "N mots et expressions").trim();
}

async function jouer(base: string, page: Page, etapes: Etape[], sel?: string): Promise<string[]> {
  await page.goto(base);
  await page.waitForSelector("#out [data-wz]");
  const vus = [await texte(page, sel)];
  for (const e of etapes) { await e(page); vus.push(await texte(page, sel)); }
  return vus;
}

async function comparer(browser: import("@playwright/test").Browser, etapes: Etape[], sel?: string) {
  const [a, b] = [await browser.newPage(), await browser.newPage()];
  const avant = await jouer(ANCIEN, a, etapes, sel);
  const apres = await jouer(NOUVEAU, b, etapes, sel);
  expect(apres).toEqual(avant);
  await b.screenshot({ path: `test-results/${test.info().title.replace(/\W+/g, "_")}.png` });
}

const chercher = (mot: string): Etape => async (p) => { await p.fill("#q", mot); await p.waitForTimeout(400); await p.waitForSelector("#out ul.res, #out .st"); };
const cliquer = (sel: string): Etape => async (p) => {
  await p.locator(sel).first().click();
  // Une fiche est ouverte quand son bouton « ← Retour » est là.
  if (sel.includes("data-id")) await p.waitForSelector("#bk");
  await p.waitForTimeout(300);
};

test("parcours guidé « Je connais le sens » : trois niveaux puis retour", async ({ browser }) => {
  await comparer(browser, [cliquer("#out [data-wz]"), cliquer("#out [data-wz]"), cliquer("#out [data-wz]"), cliquer("#out [data-wzback]")]);
});

test("recherche par le sens", async ({ browser }) => {
  const sens: Etape = async (p) => { await p.fill("#wzq", "argent payé pour un travail"); await p.click("#wzgo"); await p.waitForSelector("#mres .wz-word, #mres .st:not(:empty)"); };
  await comparer(browser, [sens], "#mres");
});

test("recherche par mot puis fiche puis retour", async ({ browser }) => {
  await comparer(browser, [cliquer("#tSearch"), chercher("jenny"), cliquer("#out [data-id]"), cliquer("#bk"), chercher("ânesse"), chercher("autocracy"), cliquer("#out [data-id]")]);
});

test("recherche à beaucoup de résultats : même nombre, mêmes 20 premiers", async ({ browser }) => {
  const prem = async (base: string) => {
    const p = await browser.newPage(); await p.goto(base); await p.waitForSelector("#out [data-wz]");
    await p.click("#tSearch"); await chercher("vote")(p);
    return [await p.locator("#out > p.st").first().innerText(), await p.locator("#out ul.res li").evaluateAll((li) => li.slice(0, 20).map((x) => (x as HTMLElement).innerText))];
  };
  expect(await prem(NOUVEAU)).toEqual(await prem(ANCIEN));
});

test("thèmes : ouvrir un thème puis un mot", async ({ browser }) => {
  await comparer(browser, [cliquer("#tBrowse"), cliquer("#out details summary"), cliquer("#out [data-th]"), cliquer("#out [data-id]")]);
});

test("questions et mode d'emploi", async ({ browser }) => {
  await comparer(browser, [cliquer("#tQuest"), cliquer("#tGuide")]);
});
