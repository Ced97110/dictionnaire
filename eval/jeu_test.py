"""Point 2 — draw 300 single-section words: 100 for tuning, 200 for the final test.

Usage: python3 eval/jeu_test.py   (writes eval/jeu_test.json)
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from donnees import Mot, charger, mots_mono_section

GRAINE = 20261113
N_REGLAGE = 100
N_TEST = 200
CHEMIN = Path(__file__).resolve().parent / "jeu_test.json"


def tirer(mots: tuple[Mot, ...]) -> list[dict]:
    sections, _ = charger()
    pool = sorted(mots_mono_section(mots), key=lambda m: m.id)
    tirage = random.Random(GRAINE).sample(pool, N_REGLAGE + N_TEST)
    return [
        {
            "id": m.id,
            "t": m.t,
            "r": m.r,
            "sid": m.sid,
            "section": sections[m.sid].libelle,
            "jeu": "reglage" if i < N_REGLAGE else "test",
        }
        for i, m in enumerate(tirage)
    ]


def lire() -> list[dict]:
    return json.loads(CHEMIN.read_text(encoding="utf-8"))


def main() -> None:
    _, mots = charger()
    jeu = tirer(mots)
    CHEMIN.write_text(json.dumps(jeu, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jeu)} mots écrits dans {CHEMIN.name} (graine {GRAINE})")


if __name__ == "__main__":
    main()
