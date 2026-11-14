"""Place new words: the rule chosen on 2026-11-13 from the tiered comparison.

For each new word (English word + French translation):
  1. Haiku writes a short definition from the word and its translation alone;
  2. TF-IDF proposes 10 candidate sections from that definition;
  3. Haiku picks one and states its confidence.
The word is placed automatically only if Haiku says "haute" AND agrees with
TF-IDF's first candidate (measured: ~88-91 % right on 24-34 % of words).
Everything else goes "À valider" with the 3 best proposals.

Usage (from eval/):
  python3 ranger.py nouveaux.csv sortie.csv
Input CSV columns: mot, traduction. Needs ANTHROPIC_API_KEY (or eval/.env).
"""

from __future__ import annotations

import asyncio
import csv
import os
import sys

import numpy as np

from classement import voisins, voter, vectoriseur_tfidf
from donnees import charger, texte_corpus
from mesure_b import CONSIGNE_DEF, JETONS_DEF, charger_env
from pipeline import (
    CONSIGNE,
    JETONS,
    N_CANDIDATS,
    PARALLELE,
    fiches_sections,
    lire,
    presenter,
)

MODELE = "claude-haiku-5-5"
K = 20


def lire_entree(chemin: str) -> list[dict[str, str]]:
    with open(chemin, encoding="utf-8") as f:
        lignes = [
            {
                "t": (r.get("mot") or "").strip(),
                "r": (r.get("traduction") or "").strip(),
            }
            for r in csv.DictReader(f)
        ]
    vides = [i + 2 for i, r in enumerate(lignes) if not r["t"]]
    if vides:
        raise SystemExit(f"Colonne « mot » vide aux lignes {vides}.")
    return lignes


async def demander(client, sem, systeme: str, texte: str, jetons: int) -> str:
    async with sem:
        for _ in range(2):
            r = await client.messages.create(
                model=MODELE,
                max_tokens=jetons,
                system=systeme,
                messages=[{"role": "user", "content": texte}],
            )
            sortie = "".join(b.text for b in r.content if b.type == "text").strip()
            if sortie:
                return sortie
        raise RuntimeError(f"réponse vide deux fois (stop_reason={r.stop_reason})")


async def traiter(mots: list[dict[str, str]]) -> list[dict[str, str]]:
    import anthropic

    sections, dico = charger()
    client = anthropic.AsyncAnthropic(max_retries=6)
    sem = asyncio.Semaphore(PARALLELE)
    defs = await asyncio.gather(
        *(
            demander(client, sem, CONSIGNE_DEF, f"{m['t']} — {m['r']}", JETONS_DEF)
            for m in mots
        )
    )
    vec = vectoriseur_tfidf()
    c = vec.fit_transform([texte_corpus(m) for m in dico])
    idx, sim = voisins(vec.transform(defs), c, K)
    preds = voter(idx, sim, np.array([m.sid for m in dico]))
    cands = [list(p.classement[:N_CANDIDATS]) for p in preds]
    fiches = fiches_sections(set())
    choix = await asyncio.gather(
        *(
            demander(client, sem, CONSIGNE, presenter(m, d, cs, fiches), JETONS)
            for m, d, cs in zip(mots, defs, cands)
        )
    )
    sorties = []
    for m, d, cs, rep in zip(mots, defs, cands, choix):
        section, conf = lire(rep, cs)
        auto = conf == "haute" and section == cs[0]
        trois = [section] + [s for s in cs if s != section] if section >= 0 else cs
        sorties.append(
            {
                "mot": m["t"],
                "traduction": m["r"],
                "decision": "rangé" if auto else "à valider",
                "section": sections[section].libelle if auto else "",
                "proposition_1": sections[trois[0]].libelle,
                "proposition_2": sections[trois[1]].libelle,
                "proposition_3": sections[trois[2]].libelle,
                "confiance_haiku": conf,
                "definition_haiku": d,
            }
        )
    return sorties


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage : python3 ranger.py nouveaux.csv sortie.csv")
    charger_env()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY absente : créez eval/.env.")
    mots = lire_entree(sys.argv[1])
    sorties = asyncio.run(traiter(mots))
    with open(sys.argv[2], "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(sorties[0]))
        w.writeheader()
        w.writerows(sorties)
    n = sum(s["decision"] == "rangé" for s in sorties)
    print(
        f"{len(sorties)} mots : {n} rangés, {len(sorties) - n} à valider → {sys.argv[2]}"
    )


if __name__ == "__main__":
    main()
