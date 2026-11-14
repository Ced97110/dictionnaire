"""Section inventory for the redesign plan: one row per section, with its
nearest twin, confusion figures and a *proposed* verdict (triage only).

Needs resultats/confusion_tfidf_sections.csv (from plafond.py).
Usage: python3 eval/inventaire.py  ->  resultats/inventaire_sections.csv
"""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict

import numpy as np

from donnees import DONNEES, charger, mots_mono_section, sections_par_mot, texte_corpus
from plafond import partages, renvois
from plongements import Encodeur
from sorties import RESULTATS

COS_JUMELLES = 0.99  # centroid cosine above which two sections read as one
TAILLE_AIMANT = 350  # a catch-all is large ...
RATIO_AIMANT = 2.0  # ... and receives at least twice the errors it makes
TAUX_CLARIFIER = 0.5  # half of its words go elsewhere ...
PART_FRONTIERE = 0.4  # ... and 40 % of those go to one single section


def centroides(mots, n_sections: int) -> np.ndarray:
    e = Encodeur().encoder([texte_corpus(m) for m in mots], "passage")
    c = np.zeros((n_sections, e.shape[1]))
    np.add.at(c, np.array([m.sid for m in mots]), e)
    return c / np.linalg.norm(c, axis=1, keepdims=True)


def confusions() -> tuple[Counter, Counter, dict[int, Counter]]:
    faites, recues, cible = Counter(), Counter(), defaultdict(Counter)
    with open(RESULTATS / "confusion_tfidf_sections.csv") as f:
        for r in csv.DictReader(f):
            a, b, n = int(r["vraie_sid"]), int(r["predite_sid"]), int(r["n"])
            faites[a] += n
            recues[b] += n
            cible[a][b] += n
    return faites, recues, cible


def verdict(
    taille: int, faites: int, recues: int, taux: float, frontiere: float, jumeaux: bool
) -> str:
    if taille >= TAILLE_AIMANT and recues >= RATIO_AIMANT * max(faites, 1):
        return "scinder (fourre-tout)"
    if jumeaux:
        return "fusionner ? (jumelle)"
    if taux >= TAUX_CLARIFIER and frontiere >= PART_FRONTIERE:
        return "clarifier (frontière)"
    if taux >= TAUX_CLARIFIER:
        return "revoir (erreurs dispersées)"
    return "garder"


def main() -> None:
    sections, mots = charger()
    c = centroides(mots, len(sections))
    sim = c @ c.T
    np.fill_diagonal(sim, -1)
    proche = sim.argmax(1)
    part = partages(sections_par_mot(mots))
    renv = renvois(sections)
    faites, recues, cible = confusions()
    taille = Counter(m.sid for m in mots)
    mono = Counter(m.sid for m in mots_mono_section(mots))
    alias = Counter(m.sid for m in mots if m.a_alias)
    nature = {m.sid: m.nature for m in mots}
    front = json.loads((DONNEES / "front.json").read_text(encoding="utf-8"))
    partie = {t[2]: p["fr"] for p in front["parts"] for t in p["themes"]}
    lignes = []
    for s in sections:
        a, b = s.sid, int(proche[s.sid])
        p = (min(a, b), max(a, b))
        taux = faites[a] / mono[a] if mono[a] else 0.0
        top = cible[a].most_common(1)
        frontiere = top[0][1] / faites[a] if top else 0.0
        jumeaux = (
            int(proche[b]) == a
            and sim[a, b] >= COS_JUMELLES
            and cible[a][b] > 0
            and cible[b][a] > 0
        )
        lignes.append(
            {
                "sid": a,
                "partie": partie[s.cle],
                "section": s.libelle,
                "genre": s.genre,
                "nature": nature[a],
                "taille": taille[a],
                "note_de_portee": bool(s.desc),
                "jumelle": sections[b].libelle,
                "cos_jumelle": round(float(sim[a, b]), 4),
                "jumelle_autre_theme": sections[b].cle != s.cle,
                "jumelle_mutuelle": int(proche[b]) == a,
                "taux_erreur": round(taux, 3),
                "principale_fuite": sections[top[0][0]].libelle if top else "",
                "part_principale_fuite": round(frontiere, 3),
                "erreurs_recues": recues[a],
                "mots_partages_jumelle": part[p],
                "renvoi_jumelle": p in renv,
                "entrees_avec_alias": alias[a],
                "verdict_propose": verdict(
                    taille[a], faites[a], recues[a], taux, frontiere, jumeaux
                ),
            }
        )
    with open(
        RESULTATS / "inventaire_sections.csv", "w", newline="", encoding="utf-8"
    ) as f:
        w = csv.DictWriter(f, fieldnames=list(lignes[0]))
        w.writeheader()
        w.writerows(lignes)
    print(Counter(r["verdict_propose"] for r in lignes))


if __name__ == "__main__":
    main()
