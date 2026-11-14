"""Before/after check of the pilot migration with the same classifier as point 1
(TF-IDF, k = 20, each word withdrawn in turn, masked definition).

Only the pilot words are classified; the rest of the dictionary keeps its
sections. Words leaving the theme are excluded from both measures. Merged
sections are reported apart, because merging raises the score by itself.

Usage (from eval/): python3 pilote/mesure.py
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

import numpy as np

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI.parent))

from classement import voisins, voter, vectoriseur_tfidf  # noqa: E402
from donnees import charger, texte_corpus, texte_requete  # noqa: E402
from migration import FUSIONS, HORS_THEME, THEME, migrer  # noqa: E402
from sorties import ecrire_md, pct  # noqa: E402

K = 20


def main() -> None:
    sections, mots = charger()
    lignes = {r["id"]: r for r in migrer() if r["section_apres"] != HORS_THEME}
    pos = {m.id: i for i, m in enumerate(mots)}
    pilote = [m for m in mots if m.id in lignes]

    # Section labels before and after; non-pilot words keep their own section.
    def etiquettes(apres: bool) -> np.ndarray:
        noms: dict[str, int] = {}
        out = []
        for m in mots:
            if m.id in lignes:
                cle = f"{THEME} › {lignes[m.id]['section_apres' if apres else 'section_avant']}"
            else:
                cle = sections[m.sid].libelle + f"#{m.sid}"
            out.append(noms.setdefault(cle, len(noms)))
        return np.array(out)

    vec = vectoriseur_tfidf()
    c = vec.fit_transform([texte_corpus(m) for m in mots])
    q = vec.transform([texte_requete(m) for m in pilote])
    exclure = np.array([pos[m.id] for m in pilote])
    idx, sim = voisins(q, c, K, exclure)
    resultats = {}
    for nom, apres in (("avant", False), ("après", True)):
        lab = etiquettes(apres)
        preds = voter(idx, sim, lab)
        vrai = np.array([lab[pos[m.id]] for m in pilote])
        tete = np.array([p.classement[0] == v for p, v in zip(preds, vrai)])
        fusion = np.array(
            [
                lignes[m.id]["section_avant"] in FUSIONS
                or lignes[m.id]["section_apres"] in FUSIONS.values()
                for m in pilote
            ]
        )
        resultats[nom] = (tete.mean(), tete[~fusion].mean(), int((~fusion).sum()))
    deplaces = np.array(
        [lignes[m.id]["section_apres"] != lignes[m.id]["section_avant"] for m in pilote]
    )
    md = [
        "# Essai de refonte — Propriétés des choses",
        "",
        f"{len(pilote)} mots mesurés (les 74 mots qui quittent le thème sont exclus) ; {int(deplaces.sum())} changent de section.",
        "",
        "| | bonne section en tête | hors sections fusionnées |",
        "|---|---|---|",
    ]
    for nom, (tout, hors, n) in resultats.items():
        md.append(f"| {nom} | {pct(tout)} | {pct(hors)} ({n} mots) |")
    md += [
        "",
        "Classeur : TF-IDF, k = 20, chaque mot retiré à son tour, définition masquée.",
        "",
    ]
    ecrire_md("pilote_mesure.md", md)
    with open(ICI / "mesure.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["mesure", "tete_tout", "tete_hors_fusion", "n_hors_fusion"])
        for nom, (tout, hors, n) in resultats.items():
            w.writerow([nom, round(float(tout), 4), round(float(hors), 4), n])
    print("\n".join(md))


if __name__ == "__main__":
    main()
