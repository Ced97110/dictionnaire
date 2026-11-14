"""Point 3 — Measure A (no API key): classify the 300 withdrawn words from their
existing definition, word and translation masked, with e5 embeddings + k-NN vote.

The 300 words are removed from the corpus. k is chosen on the 100 tuning words.
TF-IDF (k = 20) is run on the same words as a reference.

Usage: python3 eval/mesure_a.py
"""

from __future__ import annotations

import json

import numpy as np

from classement import Prediction, voisins, voter, vectoriseur_tfidf
from donnees import Mot, charger, texte_corpus, texte_requete
from jeu_test import lire
from plongements import Encodeur
from sorties import RESULTATS

GRILLE_K = (5, 10, 20, 30, 50)
K_TFIDF = 20


def ecrire(nom: str, jeu: list[dict], preds: list[Prediction], extra: dict) -> None:
    RESULTATS.mkdir(exist_ok=True)
    with open(RESULTATS / f"predictions_{nom}.jsonl", "w", encoding="utf-8") as f:
        for ligne, p in zip(jeu, preds):
            sortie = {
                **ligne,
                "classement": list(p.classement),
                "confiance": p.confiance,
                **extra,
            }
            f.write(json.dumps(sortie, ensure_ascii=False) + "\n")


def precision(
    jeu: list[dict], preds: list[Prediction], quel: str
) -> tuple[float, float]:
    paires = [(j, p) for j, p in zip(jeu, preds) if j["jeu"] == quel]
    top1 = np.mean([p.classement[0] == j["sid"] for j, p in paires])
    top3 = np.mean([j["sid"] in p.classement[:3] for j, p in paires])
    return float(top1), float(top3)


def corpus_et_requetes() -> tuple[list[dict], list[Mot], list[Mot]]:
    _, mots = charger()
    jeu = lire()
    retires = {j["id"] for j in jeu}
    par_id = {m.id: m for m in mots}
    corpus = [m for m in mots if m.id not in retires]
    return jeu, corpus, [par_id[j["id"]] for j in jeu]


def main() -> None:
    _, mots = charger()
    jeu, corpus, requetes = corpus_et_requetes()
    garder = np.array([m.id not in {j["id"] for j in jeu} for m in mots])
    sid = np.array([m.sid for m in corpus])

    # e5: encode the full dictionary once (cached), then drop the withdrawn rows.
    enc = Encodeur()
    c = enc.encoder([texte_corpus(m) for m in mots], "passage")[garder]
    q = enc.encoder([texte_requete(m) for m in requetes], "query")
    idx, sim = voisins(q, c, max(GRILLE_K))
    grille = {}
    for k in GRILLE_K:
        grille[k] = precision(jeu, voter(idx[:, :k], sim[:, :k], sid), "reglage")
    k_choisi = max(GRILLE_K, key=lambda k: (grille[k][0], grille[k][1], -k))
    preds = voter(idx[:, :k_choisi], sim[:, :k_choisi], sid)
    ecrire("a", jeu, preds, {"k": k_choisi})

    vec = vectoriseur_tfidf()
    ct = vec.fit_transform([texte_corpus(m) for m in corpus])
    qt = vec.transform([texte_requete(m) for m in requetes])
    i2, s2 = voisins(qt, ct, K_TFIDF)
    ecrire("tfidf", jeu, voter(i2, s2, sid), {"k": K_TFIDF})

    reglage = {
        "grille_k_reglage": {
            k: {"top1": v[0], "top3": v[1]} for k, v in grille.items()
        },
        "k_choisi": k_choisi,
        # Measure B lets Haiku pick among the top 3, so it needs the k that
        # maximises top-3 recall rather than top-1.
        "k_top3": max(GRILLE_K, key=lambda k: (grille[k][1], grille[k][0], -k)),
    }
    (RESULTATS / "reglage_a.json").write_text(
        json.dumps(reglage, indent=1), encoding="utf-8"
    )
    print(json.dumps(reglage))


if __name__ == "__main__":
    main()
