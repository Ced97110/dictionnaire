"""Unit tests for the evaluation helpers. Run: cd eval && python3 -m pytest -q"""

from __future__ import annotations

import numpy as np
import pytest
from scipy import sparse

from classement import bootstrap, voisins, voter
from donnees import (
    Mot,
    charger,
    formes_a_masquer,
    masquer,
    mots_mono_section,
    sections_par_mot,
    texte_requete,
)
from jeu_test import N_REGLAGE, N_TEST, tirer
from mesure_b import lire_choix, presenter


def mot(t: str, r: str, def_fr: str = "", def_en: str = "", sid: int = 0) -> Mot:
    return Mot("x1", t, r, sid, "0_0", def_fr, def_en, (), "nom ou expression", False)


@pytest.mark.parametrize(
    ("t", "r", "texte", "absent"),
    [
        (
            "primary",
            "élection primaire (primaire)",
            "La primaire désigne le candidat. A primary vote.",
            ["primaire", "primary"],
        ),
        (
            "brown dwarf",
            "naine brune",
            "Une naine brune n'est pas une étoile. Brown dwarfs are dim.",
            ["naine", "dwarf"],
        ),
        (
            "emphatic",
            "catégorique (énergique, appuyé)",
            "Ton catégorique et appuyé.",
            ["catégorique", "appuyé"],
        ),
    ],
)
def test_masquer_retire_mot_et_traduction(
    t: str, r: str, texte: str, absent: list[str]
) -> None:
    sortie = masquer(texte, formes_a_masquer(mot(t, r))).lower()
    for a in absent:
        assert a not in sortie


def test_masquer_garde_le_reste() -> None:
    m = mot("keg", "fût", def_fr="Petit tonneau de bière.")
    assert texte_requete(m) == "Petit tonneau de bière."


def test_voter_pondere_par_similarite() -> None:
    idx = np.array([[0, 1, 2]])
    sim = np.array([[0.9, 0.5, 0.45]], dtype=np.float32)
    sid = np.array([7, 3, 3])
    p = voter(idx, sim, sid)[0]
    assert p.classement[0] == 3  # 0.95 > 0.9
    assert 0.5 < p.confiance < 0.52


def test_voisins_exclut_soi_meme() -> None:
    c = np.eye(4, dtype=np.float32)
    idx, _ = voisins(c[:2], c, 1, exclure=np.array([0, -1]))
    assert idx[0, 0] != 0
    assert idx[1, 0] == 1


def test_voisins_accepte_creux() -> None:
    c = sparse.csr_matrix(np.eye(3))
    idx, sim = voisins(c, c, 1)
    assert idx[:, 0].tolist() == [0, 1, 2]
    assert np.allclose(sim[:, 0], 1)


def test_bootstrap_encadre_la_moyenne() -> None:
    v = np.array([1.0] * 70 + [0.0] * 30)
    bas, haut = bootstrap(v)
    assert bas < 0.7 < haut
    assert haut - bas < 0.25


def test_lire_choix() -> None:
    assert lire_choix("2") == 1
    assert lire_choix("Section 3.") == 2
    assert lire_choix("je ne sais pas") == 0


def test_presenter_numerote_les_candidats() -> None:
    sections, _ = charger()
    texte = presenter("keg", "fût", "petit tonneau", list(sections[:3]))
    assert "1. " in texte and "3. " in texte and "keg" in texte


def test_donnees_820_sections() -> None:
    sections, mots = charger()
    assert len(sections) == 820
    assert len(mots) == 34385


def test_pool_mono_section() -> None:
    _, mots = charger()
    places = sections_par_mot(mots)
    pool = mots_mono_section(mots)
    assert all(len(places[m.cle_mot]) == 1 and not m.a_alias for m in pool)


def test_tirage_reproductible_et_disjoint() -> None:
    _, mots = charger()
    a, b = tirer(mots), tirer(mots)
    assert a == b
    assert len({x["id"] for x in a}) == N_REGLAGE + N_TEST
    assert sum(x["jeu"] == "test" for x in a) == N_TEST


def test_categorie_par_genre_avant_type_de_question() -> None:
    from categories import etiqueter

    assert etiqueter("Phobie", 3).categorie == "qualité"
    assert etiqueter("phobie", 3).source == "genre"


def test_categorie_repli_sur_type_de_question() -> None:
    from categories import IND, etiqueter

    assert etiqueter("genre inconnu", 7).categorie == "lieu"
    assert etiqueter("adjectif", 9).categorie == "quantité"  # useless genus -> fallback
    assert etiqueter("genre inconnu", 14).categorie == IND  # ambiguous question type


def test_jensen_shannon_bornes() -> None:
    from collections import Counter

    from categories_mesure import js

    a = Counter(substance=5)
    assert js(a, a) == 0
    assert abs(js(a, Counter(qualité=5)) - 1) < 1e-9
