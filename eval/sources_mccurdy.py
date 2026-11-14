"""Reanalysis of the raw data behind McCurdy et al. (2020): recall gap between
"generate" and "read" conditions, by moderator, with an article-level bootstrap.

The data come from the R package metadat (dat.mccurdy2020). Convert once to CSV:
  curl -sSL -o dat.rda https://github.com/wviechtb/metadat/raw/master/data/dat.mccurdy2020.rda
  uvx --with pyreadr --with pandas python -c "import pyreadr; \
    list(pyreadr.read_r('dat.rda').values())[0].to_csv('mccurdy.csv', index=False)"
Then: uvx --with pandas --with numpy python eval/sources_mccurdy.py mccurdy.csv

Note: this is an n-weighted mean of raw recall differences, not the authors'
multilevel model; the paper itself (paywalled) was not read.
"""

from __future__ import annotations

import sys

import numpy as np
import pandas as pd

CLE = ["article", "experiment", "pairing"]
MODERATEURS = [
    "retention_delay",
    "stimuli_relation",
    "manip_type",
    "present_style",
    "memory_test",
    "word_status",
    "gen_constraint",
    "learning_type",
]


def paires(df: pd.DataFrame) -> pd.DataFrame:
    gen = df[df.condition == "generate"]
    lec = df[df.condition == "read"]
    m = gen.merge(lec[CLE + ["yi", "ni"]], on=CLE, suffixes=("_g", "_r"))
    w = m.ni_g + m.ni_r
    return m.assign(w=w, wd=(m.yi_g - m.yi_r) * w, wr=m.yi_r * w)


def ecart(sub: pd.DataFrame, rng: np.random.Generator) -> str:
    if sub.empty:
        return "—"
    a = sub.groupby("article")[["wd", "w", "wr"]].sum().to_numpy()
    d = a[:, 0].sum() / a[:, 1].sum()
    tir = a[rng.integers(0, len(a), (2000, len(a)))].sum(1)
    bas, haut = np.percentile(tir[:, 0] / tir[:, 1], [2.5, 97.5])
    lecture = a[:, 2].sum() / a[:, 1].sum()
    return (
        f"{d * 100:+5.1f} pts [{bas * 100:+.1f} ; {haut * 100:+.1f}]  "
        f"paires {len(sub):4d}  articles {len(a):3d}  lecture {lecture * 100:.0f} %"
    )


def main(chemin: str) -> None:
    rng = np.random.default_rng(0)
    m = paires(pd.read_csv(chemin))
    items = m[m.memory_type == "item"]
    print("toutes mémoires ", ecart(m, rng))
    print("mémoire des items", ecart(items, rng))
    for col in MODERATEURS:
        print(f"== {col}")
        for v, sub in items.groupby(col, dropna=False):
            print(f"   {str(v):15}", ecart(sub, rng))
    mots = items[items.word_status == "words"]
    print("== mots : plus de 50 éléments", ecart(mots[mots.stimuli > 50], rng))
    print("== mots : 25 ou moins       ", ecart(mots[mots.stimuli <= 25], rng))


if __name__ == "__main__":
    main(sys.argv[1])
