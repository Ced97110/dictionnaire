"""Tiered placement pipeline: Haiku, then Sonnet, then Opus, by difficulty.

Real conditions: each of the 200 test words is described by the definition Haiku
wrote from the word and its translation alone (measure B's cache). TF-IDF
proposes 10 candidate sections; a model picks one and states its confidence.

Each model answers once for every word (cached with token counts); the tiered
pipeline is then replayed from those answers, so it costs no extra call:
  tier 1  Haiku : auto if confidence "haute" and it agrees with TF-IDF's first;
  tier 2  Sonnet: auto if it agrees with Haiku and its confidence is not "basse";
  tier 3  Opus  : auto if it agrees with Sonnet; otherwise "À valider".

Usage (from eval/): python3 pipeline.py
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass

import numpy as np

from classement import bootstrap, voisins, voter, vectoriseur_tfidf
from donnees import charger, texte_corpus
from mesure_a import corpus_et_requetes
from mesure_b import CACHE_HAIKU, MODELE as MODELE_DEF, charger_env
from plongements import CACHE
from sorties import ecrire_md, nb, pct

MODELES = {
    "haiku": "claude-haiku-5-5",
    "sonnet": "claude-sonnet-5-5",
    "opus": "claude-opus-5-5",
}
N_CANDIDATS = 10
K = 20
JETONS = 4000
PARALLELE = 6
CACHE_PIPE = CACHE / "pipeline.jsonl"

CONSIGNE = (
    "Tu ranges des mots dans un dictionnaire thématique bilingue. On te donne un mot, "
    "sa traduction, sa définition, et 10 sections candidates avec leur description et "
    "des exemples de mots déjà rangés. Choisis la section où un lecteur chercherait ce mot. "
    'Réponds uniquement par un objet JSON : {"choix": <numéro 1-10>, '
    '"confiance": "haute" | "moyenne" | "basse"}.'
)


@dataclass(frozen=True)
class Reponse:
    choix: int  # section id, -1 if unreadable
    confiance: str
    jetons_entree: int
    jetons_sortie: int


def definitions_haiku() -> dict[str, str]:
    lignes = (
        json.loads(x) for x in CACHE_HAIKU.read_text(encoding="utf-8").splitlines() if x
    )
    prefixe = f"def|{MODELE_DEF}|"
    return {
        d["cle"][len(prefixe) :]: d["reponse"]
        for d in lignes
        if d["cle"].startswith(prefixe)
    }


def candidats(jeu: list[dict], defs: dict[str, str]) -> dict[str, list[int]]:
    _, corpus, _ = corpus_et_requetes()
    vec = vectoriseur_tfidf()
    c = vec.fit_transform([texte_corpus(m) for m in corpus])
    q = vec.transform([defs[j["id"]] for j in jeu])
    idx, sim = voisins(q, c, K)
    preds = voter(idx, sim, np.array([m.sid for m in corpus]))
    return {j["id"]: list(p.classement[:N_CANDIDATS]) for j, p in zip(jeu, preds)}


def fiches_sections(exclus: set[str]) -> dict[int, str]:
    sections, mots = charger()
    exemples: dict[int, list[str]] = defaultdict(list)
    for m in mots:
        if m.id not in exclus and len(exemples[m.sid]) < 4:
            exemples[m.sid].append(m.t)
    return {
        s.sid: f"{s.libelle} — {s.desc or 'pas de description'} Exemples : {', '.join(exemples[s.sid])}."
        for s in sections
    }


def presenter(
    j: dict, definition: str, cands: list[int], fiches: dict[int, str]
) -> str:
    lignes = [
        f"Mot : {j['t']} ({j['r']})",
        f"Définition : {definition}",
        "",
        "Sections :",
    ]
    lignes += [f"{i}. {fiches[s]}" for i, s in enumerate(cands, 1)]
    return "\n".join(lignes)


def lire(texte: str, cands: list[int]) -> tuple[int, str]:
    m = re.search(r"\{.*\}", texte, re.S)
    try:
        d = json.loads(m.group()) if m else {}
        n = int(d.get("choix", 0))
        conf = str(d.get("confiance", "basse")).lower()
    except (ValueError, TypeError):
        return -1, "basse"
    return (cands[n - 1] if 1 <= n <= len(cands) else -1), conf


def lire_cache() -> dict[str, dict]:
    if not CACHE_PIPE.exists():
        return {}
    return {
        d["cle"]: d
        for d in (
            json.loads(x)
            for x in CACHE_PIPE.read_text(encoding="utf-8").splitlines()
            if x
        )
    }


async def interroger(client, sem, modele: str, texte: str) -> dict:
    async with sem:
        for essai in range(2):
            r = await client.messages.create(
                model=modele,
                max_tokens=JETONS,
                system=CONSIGNE,
                messages=[{"role": "user", "content": texte}],
            )
            sortie = "".join(b.text for b in r.content if b.type == "text").strip()
            if sortie:
                return {
                    "texte": sortie,
                    "entree": r.usage.input_tokens,
                    "sortie": r.usage.output_tokens,
                }
        raise RuntimeError(
            f"{modele} : réponse vide deux fois (stop_reason={r.stop_reason})"
        )


async def collecter(jeu, defs, cands, fiches) -> dict[str, dict]:
    import anthropic

    cache = lire_cache()
    client = anthropic.AsyncAnthropic(max_retries=6)
    sem = asyncio.Semaphore(PARALLELE)
    a_faire = [
        (nom, modele, j)
        for nom, modele in MODELES.items()
        for j in jeu
        if f"{modele}|{j['id']}" not in cache
    ]
    CACHE.mkdir(exist_ok=True)

    async def un(nom, modele, j):
        r = await interroger(
            client, sem, modele, presenter(j, defs[j["id"]], cands[j["id"]], fiches)
        )
        entree = {"cle": f"{modele}|{j['id']}", **r}
        cache[entree["cle"]] = entree
        with open(CACHE_PIPE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entree, ensure_ascii=False) + "\n")

    await asyncio.gather(*(un(*x) for x in a_faire))
    return cache


def reponses(cache, jeu, cands) -> dict[str, dict[str, Reponse]]:
    out: dict[str, dict[str, Reponse]] = defaultdict(dict)
    for nom, modele in MODELES.items():
        for j in jeu:
            d = cache[f"{modele}|{j['id']}"]
            choix, conf = lire(d["texte"], cands[j["id"]])
            out[nom][j["id"]] = Reponse(choix, conf, d["entree"], d["sortie"])
    return out


def cascade(
    j: dict, r: dict[str, dict[str, Reponse]], cands: list[int]
) -> tuple[int | None, str]:
    """Return (section or None for 'À valider', deciding tier)."""
    h, s, o = (r[n][j["id"]] for n in ("haiku", "sonnet", "opus"))
    if h.confiance == "haute" and h.choix == cands[0]:
        return h.choix, "haiku"
    if s.choix == h.choix and s.confiance != "basse":
        return s.choix, "sonnet"
    if o.choix == s.choix:
        return o.choix, "opus"
    return None, "à valider"


def main() -> None:
    charger_env()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY absente : pipeline non lancé.")
    jeu = [j for j in corpus_et_requetes()[0] if j["jeu"] == "test"]
    defs = definitions_haiku()
    cands = candidats(jeu, defs)
    fiches = fiches_sections({j["id"] for j in corpus_et_requetes()[0]})
    cache = asyncio.run(collecter(jeu, defs, cands, fiches))
    r = reponses(cache, jeu, cands)

    rappel = np.array([j["sid"] in cands[j["id"]] for j in jeu], float)
    md = [
        "# Découpage Haiku → Sonnet → Opus — 200 mots de test",
        "",
        "Conditions réelles : définition rédigée par Haiku à partir du mot et de sa traduction ; "
        f"10 sections candidates proposées par TF-IDF. La bonne section figure parmi les 10 dans "
        f"**{pct(rappel.mean())}** des cas : c'est le maximum atteignable.",
        "",
        "## Chaque modèle seul",
        "",
        "| modèle | bonne section [IC 95 %] | jetons entrée | jetons sortie | si l'on ne garde que « confiance haute » |",
        "|---|---|---|---|---|",
    ]
    for nom in MODELES:
        juste = np.array([r[nom][j["id"]].choix == j["sid"] for j in jeu], float)
        bas, haut = bootstrap(juste)
        e = sum(r[nom][j["id"]].jetons_entree for j in jeu)
        s = sum(r[nom][j["id"]].jetons_sortie for j in jeu)
        sur = np.array([r[nom][j["id"]].confiance == "haute" for j in jeu])
        filtre = (
            f"{pct(juste[sur].mean())} sur {pct(sur.mean())} des mots"
            if sur.any()
            else "—"
        )
        md.append(
            f"| {nom} | {pct(juste.mean())} [{pct(bas)} ; {pct(haut)}] | {nb(e)} | {nb(s)} | {filtre} |"
        )

    decisions = [cascade(j, r, cands[j["id"]]) for j in jeu]
    auto = np.array([d[0] is not None for d in decisions])
    juste = np.array([d[0] == j["sid"] for d, j in zip(decisions, jeu)], float)
    bas, haut = bootstrap(juste[auto]) if auto.any() else (float("nan"), float("nan"))
    etages = Counter(d[1] for d in decisions)
    md += [
        "",
        "## Découpage",
        "",
        f"- Rangés seuls : **{pct(auto.mean())}** des mots ; précision **{pct(juste[auto].mean())}** "
        f"[{pct(bas)} ; {pct(haut)}] ; envoyés « À valider » : {pct(1 - auto.mean())}.",
        "- Décidés par : "
        + ", ".join(f"{k} {v}" for k, v in etages.most_common())
        + ".",
        "",
        "| étage | mots décidés | justes |",
        "|---|---|---|",
    ]
    for etage in ("haiku", "sonnet", "opus"):
        sel = [jj for d, jj in zip(decisions, jeu) if d[1] == etage]
        if sel:
            ok = sum(cascade(jj, r, cands[jj["id"]])[0] == jj["sid"] for jj in sel)
            md.append(f"| {etage} | {len(sel)} | {pct(ok / len(sel))} |")
    appels = {
        "haiku": len(jeu),
        "sonnet": len(jeu) - etages["haiku"],
        "opus": etages["opus"] + etages["à valider"],
    }
    md += [
        "",
        "Appels réellement nécessaires en production avec le découpage : "
        + ", ".join(f"{k} {v}" for k, v in appels.items())
        + f" (contre {len(jeu)} par modèle si chacun traitait tout).",
        "",
    ]
    ecrire_md("pipeline.md", md)
    print("\n".join(md))


if __name__ == "__main__":
    main()
