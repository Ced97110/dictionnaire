"""Draw the verification sample for Aristotle's categories.

200 section words, stratified by the model's label source (sure genus,
debatable genus, question type, none) and by proposed category, fixed seed.
Writes two files:
  - echantillon.csv          the sample WITH the model's labels (keep it hidden)
  - feuille_annotateur.csv   the blind sheet each annotator fills in
Usage (from eval/): python3 categories_verification/tirer.py
"""

from __future__ import annotations

import csv
import random
import sys
from collections import defaultdict
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI.parent))

from categories import par_mot  # noqa: E402
from donnees import Mot, charger  # noqa: E402

GRAINE = 20261115
TAILLE = 200
# Share of the sample per label source: the uncertain sources get more items,
# because they decide what the site can show.
PARTS = {
    "genre sûr": 0.30,
    "genre discutable": 0.25,
    "type de question": 0.30,
    "aucune": 0.15,
}


def source(m: Mot) -> str:
    e = par_mot()[m.id]
    if e.source == "genre":
        return "genre sûr" if e.sure else "genre discutable"
    return e.source


def tirer() -> list[tuple[str, Mot]]:
    _, mots = charger()
    strates: dict[str, dict[str, list[Mot]]] = defaultdict(lambda: defaultdict(list))
    for m in mots:
        if m.def_fr:
            strates[source(m)][par_mot()[m.id].categorie].append(m)
    rng = random.Random(GRAINE)
    choix: list[tuple[str, Mot]] = []
    for src, part in PARTS.items():
        quota = round(TAILLE * part)
        cats = sorted(strates[src])
        # Round-robin over categories so rare categories are represented.
        pools = {
            c: rng.sample(
                sorted(strates[src][c], key=lambda m: m.id), len(strates[src][c])
            )
            for c in cats
        }
        while quota and any(pools.values()):
            for c in cats:
                if quota and pools[c]:
                    choix.append((src, pools[c].pop()))
                    quota -= 1
    rng.shuffle(choix)
    return choix


def main() -> None:
    sections, _ = charger()
    choix = tirer()
    with open(ICI / "echantillon.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "n",
                "id",
                "mot",
                "traduction",
                "categorie_modele",
                "source",
                "genre",
                "section",
            ]
        )
        for i, (src, m) in enumerate(choix, 1):
            e = par_mot()[m.id]
            w.writerow(
                [
                    i,
                    m.id,
                    m.t,
                    m.r,
                    e.categorie,
                    src,
                    m.gd[0] if m.gd else "",
                    sections[m.sid].libelle,
                ]
            )
    with open(ICI / "feuille_annotateur.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "n",
                "mot",
                "traduction",
                "definition",
                "categorie",
                "discutable",
                "remarque",
            ]
        )
        for i, (_, m) in enumerate(choix, 1):
            w.writerow([i, m.t, m.r, m.def_fr, "", "", ""])
    print(
        f"{len(choix)} mots : echantillon.csv et feuille_annotateur.csv écrits dans {ICI}"
    )


if __name__ == "__main__":
    main()
