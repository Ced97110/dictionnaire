"""Nearest-neighbour section classifier shared by every measure.

A query is compared with every word already in the dictionary; the k closest
words vote for their section, each vote weighted by its similarity.
Confidence = share of the k votes won by the top section (0..1).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import sparse
from sklearn.feature_extraction.text import TfidfVectorizer

BLOC = 1000


@dataclass(frozen=True)
class Prediction:
    classement: tuple[int, ...]  # section ids, best first (at most 10)
    confiance: float


def vectoriseur_tfidf() -> TfidfVectorizer:
    return TfidfVectorizer(
        strip_accents="unicode", lowercase=True, sublinear_tf=True, min_df=1
    )


def voisins(
    q: np.ndarray | sparse.spmatrix,
    c: np.ndarray | sparse.spmatrix,
    k: int,
    exclure: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Top-k cosine neighbours (rows must be L2-normalised).

    `exclure[i]` is a corpus index removed from query i's candidates (-1: none).
    """
    n = q.shape[0]
    idx = np.zeros((n, k), dtype=np.int64)
    sim = np.zeros((n, k), dtype=np.float32)
    for d in range(0, n, BLOC):
        s = q[d : d + BLOC] @ c.T
        s = s.toarray() if sparse.issparse(s) else np.asarray(s)
        s = s.astype(np.float32, copy=False)
        if exclure is not None:
            lignes = np.arange(s.shape[0])
            ex = exclure[d : d + BLOC]
            ok = ex >= 0
            s[lignes[ok], ex[ok]] = -np.inf
        part = np.argpartition(-s, k, axis=1)[:, :k]
        ps = np.take_along_axis(s, part, 1)
        ordre = np.argsort(-ps, axis=1)
        idx[d : d + BLOC] = np.take_along_axis(part, ordre, 1)
        sim[d : d + BLOC] = np.take_along_axis(ps, ordre, 1)
    return idx, sim


def voter(idx: np.ndarray, sim: np.ndarray, sid_corpus: np.ndarray) -> list[Prediction]:
    sorties: list[Prediction] = []
    for ligne_i, ligne_s in zip(idx, sim):
        poids = np.clip(ligne_s, 0.0, None) + 1e-6
        scores: dict[int, float] = {}
        for j, p in zip(ligne_i, poids):
            s = int(sid_corpus[j])
            scores[s] = scores.get(s, 0.0) + float(p)
        rang = sorted(scores, key=lambda s: -scores[s])
        total = sum(scores.values())
        sorties.append(Prediction(tuple(rang[:10]), scores[rang[0]] / total))
    return sorties


def bootstrap(
    valeurs: np.ndarray, n: int = 5000, graine: int = 0
) -> tuple[float, float]:
    """95 % percentile interval of the mean."""
    if len(valeurs) == 0:
        return (float("nan"), float("nan"))
    rng = np.random.default_rng(graine)
    tirages = rng.integers(0, len(valeurs), size=(n, len(valeurs)))
    moyennes = valeurs[tirages].mean(axis=1)
    return float(np.percentile(moyennes, 2.5)), float(np.percentile(moyennes, 97.5))
