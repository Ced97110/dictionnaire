"""Draw the 20 words of the memory test (fixed seed) into mots.csv.

Usage (from eval/): python3 test_memorisation/tirer.py
"""

from __future__ import annotations

import csv
import json
import random
import sys
from collections import defaultdict
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI.parent))

from categories import par_mot  # noqa: E402
from donnees import Mot, charger, texte_requete  # noqa: E402

GRAINE = 20261114
QUOTAS = {
    "substance": 5,
    "qualité": 4,
    "action": 4,
    "quantité": 2,
    "lieu": 2,
    "temps": 2,
    "relation": 2,
}
EXCLU = (
    "surnom", "drogue", "mélange", "ecstasy", "cocaïne", "héroïne", "amphétamine",
    "cannabis", "paraphilie", "rapport sexuel", "insulte",
)  # fmt: skip
GENRES_FLOUS = (
    "action",
    "mesure",
    "partie de piste",
)  # too broad, or unclear without the sport


def eligible(m: Mot, exclus: set[str]) -> bool:
    e = par_mot()[m.id]
    genre = (m.gd[0] if m.gd else "").lower()
    return (
        e.source == "genre"
        and e.sure
        and bool(m.def_fr)
        and m.id not in exclus
        and m.nature == "nom ou expression"
        and len(m.t) <= 20
        and not m.cle.startswith("6_")
        and not any(x in genre for x in EXCLU)
        and genre not in GENRES_FLOUS
    )


def main() -> None:
    sections, mots = charger()
    jeu = {
        j["id"]
        for j in json.loads((ICI.parent / "jeu_test.json").read_text(encoding="utf-8"))
    }
    pool: dict[str, list[Mot]] = defaultdict(list)
    for m in mots:
        if eligible(m, jeu):
            pool[par_mot()[m.id].categorie].append(m)
    rng = random.Random(GRAINE)
    choisis = [
        (c, m)
        for c, q in QUOTAS.items()
        for m in rng.sample(sorted(pool[c], key=lambda m: m.id), q)
    ]
    rng.shuffle(choisis)
    with open(ICI / "mots.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "n",
                "liste",
                "id",
                "mot",
                "traduction",
                "definition_fr",
                "definition_fr_masquee",
                "categorie",
                "genre",
                "section",
            ]
        )
        for i, (c, m) in enumerate(choisis):
            definition = texte_requete(m).split(". ")[0] + "."
            w.writerow(
                [
                    i + 1,
                    f"L{i % 3 + 1}",
                    m.id,
                    m.t,
                    m.r,
                    m.def_fr,
                    definition,
                    c,
                    m.gd[0],
                    sections[m.sid].libelle,
                ]
            )
    print(f"{len(choisis)} mots écrits dans {ICI / 'mots.csv'}")


if __name__ == "__main__":
    main()
