"""Reference for the TF-IDF port: top-10 sections from eval/classement.py (scikit-learn).

Queries: the 60 first definitions Haiku wrote during the eval (eval/cache/haiku.jsonl).
Section ids use the database form « <theme>:<sec|fiche>:<index> ».
Usage (system Python with scikit-learn): python3 tests/tfidf_reference.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "eval"))

import numpy as np
from classement import vectoriseur_tfidf, voisins, voter
from donnees import DONNEES, _cles_theme, charger, texte_corpus

N = 60


def ids_base() -> list[str]:
    """Database id of each eval section, in eval order (non-empty secs, then fiches)."""
    out = []
    for cle in _cles_theme():
        d = json.loads((DONNEES / f"t{cle}.json").read_text(encoding="utf-8"))
        for genre, blocs, cle_mots in (("sec", d["secs"], "n"), ("fiche", d["fiches"], "w")):
            for i, b in enumerate(blocs):
                es = [e for n in b["n"] for e in n["e"]] if genre == "sec" else b["w"]
                if any("ref" not in e and e.get("i") for e in es):
                    out.append(f"{cle}:{genre}:{i}")
    return out


def main() -> None:
    sections, mots = charger()
    ids = ids_base()
    assert len(ids) == len(sections)
    lignes = [json.loads(x) for x in (RACINE / "eval" / "cache" / "haiku.jsonl").read_text(encoding="utf-8").splitlines() if x]
    requetes = [l["reponse"] for l in lignes if l["cle"].startswith("def|")][:N]
    vec = vectoriseur_tfidf()
    c = vec.fit_transform([texte_corpus(m) for m in mots])
    idx, sim = voisins(vec.transform(requetes), c, 20)
    preds = voter(idx, sim, np.array([m.sid for m in mots]))
    sortie = [{"requete": q, "sections": [ids[s] for s in p.classement]} for q, p in zip(requetes, preds)]
    (RACINE / "tests" / "tfidf_reference.json").write_text(json.dumps(sortie, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(sortie)} requêtes de référence")


if __name__ == "__main__":
    main()
