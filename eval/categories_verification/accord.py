"""Agreement on Aristotle's categories, once two annotators have filled the sheet.

Usage (from eval/):
  python3 categories_verification/accord.py annotateur1.csv annotateur2.csv
Writes resultats/categories_accord.md:
  - Cohen's kappa between the two annotators (overall and per category);
  - on the words where they agree, the model's accuracy per label source,
    which decides which labels the site may show.
"""

from __future__ import annotations

import csv
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from sklearn.metrics import cohen_kappa_score

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI.parent))

from categories import CATEGORIES, HORS, IND  # noqa: E402
from sorties import ecrire_md, pct  # noqa: E402

VALIDES = {*CATEGORIES, HORS, IND}
ALIAS = {
    "hors": HORS,
    "hors categorie": HORS,
    "langage": HORS,
    "?": IND,
    "indetermine": IND,
}
SEUIL_KAPPA = 0.7


def canon(s: str) -> str:
    t = unicodedata.normalize("NFD", s.strip().lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    for v in VALIDES:
        if t == "".join(
            c
            for c in unicodedata.normalize("NFD", v)
            if unicodedata.category(c) != "Mn"
        ):
            return v
    return ALIAS.get(t, "")


def lire_feuille(chemin: str) -> dict[int, str]:
    with open(chemin, encoding="utf-8") as f:
        return {int(r["n"]): canon(r["categorie"]) for r in csv.DictReader(f)}


def lire_echantillon() -> dict[int, dict[str, str]]:
    with open(ICI / "echantillon.csv", encoding="utf-8") as f:
        return {int(r["n"]): r for r in csv.DictReader(f)}


def main(a: str, b: str) -> None:
    ech = lire_echantillon()
    x, y = lire_feuille(a), lire_feuille(b)
    communs = sorted(n for n in ech if x.get(n) and y.get(n))
    vides = len(ech) - len(communs)
    ka = cohen_kappa_score([x[n] for n in communs], [y[n] for n in communs])
    accord = [n for n in communs if x[n] == y[n]]
    lignes = [
        "# Catégories d'Aristote — accord des annotateurs",
        "",
        f"- Mots annotés par les deux : {len(communs)} sur {len(ech)} ({vides} vides ou illisibles).",
        f"- Accord brut : {pct(len(accord) / len(communs))} ; **κ de Cohen : {ka:.2f}** "
        f"({'atteint' if ka >= SEUIL_KAPPA else 'sous'} le seuil de {SEUIL_KAPPA}).",
        "",
        "## Désaccords les plus fréquents",
        "",
        "| annotateur 1 | annotateur 2 | mots |",
        "|---|---|---|",
    ]
    for (c1, c2), k in Counter(
        (x[n], y[n]) for n in communs if x[n] != y[n]
    ).most_common(10):
        lignes.append(f"| {c1} | {c2} | {k} |")
    par_source: dict[str, list[bool]] = defaultdict(list)
    for n in accord:
        par_source[ech[n]["source"]].append(ech[n]["categorie_modele"] == x[n])
    lignes += [
        "",
        "## Mes étiquettes face au consensus des annotateurs",
        "",
        "| source de l'étiquette | mots (consensus) | étiquette juste |",
        "|---|---|---|",
    ]
    for src, v in sorted(par_source.items()):
        lignes.append(f"| {src} | {len(v)} | {pct(sum(v) / len(v))} |")
    lignes += [
        "",
        "Règle proposée, à décider : n'afficher sur le site que les étiquettes d'une source "
        "juste à au moins 90 %, et seulement si κ ≥ 0,7.",
        "",
    ]
    ecrire_md("categories_accord.md", lignes)
    print("\n".join(lignes))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
