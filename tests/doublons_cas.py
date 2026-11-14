# /// script
# requires-python = ">=3.11"
# dependencies = ["inflect==7.5.0", "nltk==3.9.2"]
# ///
"""Build the duplicate-detection test cases with tools the detector does NOT use.

- 50 existing words in another form: plural (inflect), UPPER CASE, British spelling
  (VarCon — the detector uses it too, so this third of the test is not independent).
- 50 new words: WordNet nouns whose base form (WordNet morphy) matches no headword.

Writes tests/doublons_cas.json. Usage: uv run tests/doublons_cas.py
"""

from __future__ import annotations

import json
import random
import re
from pathlib import Path

import inflect
import nltk

RACINE = Path(__file__).resolve().parent.parent
GRAINE = 20261113
N = 50

nltk.download("wordnet", quiet=True)
from nltk.corpus import wordnet as wn


def tetes() -> list[tuple[str, str]]:
    out = []
    for f in sorted((RACINE / "public" / "data").glob("t*_*.json")):
        t = json.loads(f.read_text(encoding="utf-8"))
        es = [e for fi in t["fiches"] for e in fi["w"]] + [e for s in t["secs"] for q in s["n"] for e in q["e"] if "i" in e]
        out += [(e["i"], e["t"]) for e in es]
    return out


def britanniques() -> dict[str, str]:
    """American → British, single words, from VarCon lines « A …: us / B: gb »."""
    vc = RACINE / "scripts" / ".cache" / "sources" / "varcon" / "varcon-2020.12.07" / "varcon.txt"
    out = {}
    for ligne in vc.read_text(encoding="latin-1").splitlines():
        parts = dict(re.findall(r"(?:^|/)\s*([A-Z][A-Za-z ]*?):\s*([^/|]+)", ligne))
        us = next((v.strip() for k, v in parts.items() if k.split()[0] == "A"), None)
        gb = next((v.strip() for k, v in parts.items() if k.split()[0] == "B"), None)
        if us and gb and us != gb and " " not in us:
            out[us] = gb
    return out


def main() -> None:
    rng = random.Random(GRAINE)
    p = inflect.engine()
    tous = tetes()
    # Words already ending in -s are left out: inflect invents plurals like « litotess ».
    simples = [(i, t) for i, t in tous if re.fullmatch(r"[a-z]+", t) and not t.endswith("s") and wn.synsets(t, pos=wn.NOUN)]
    gb = britanniques()
    existants = []
    for i, t in rng.sample(simples, 17):
        existants.append({"saisie": p.plural_noun(t), "attendu": i, "forme": "pluriel (inflect)"})
    for i, t in rng.sample(tous, 17):
        existants.append({"saisie": t.upper(), "attendu": i, "forme": "majuscules"})
    candidats = [(i, t) for i, t in tous if t in gb]
    for i, t in rng.sample(candidats, N - len(existants)):
        existants.append({"saisie": gb[t], "attendu": i, "forme": "orthographe britannique (VarCon)"})

    bases = {wn.morphy(t.lower()) or t.lower() for _, t in tous} | {t.lower() for _, t in tous}
    noms = sorted({l.name() for s in wn.all_synsets(wn.NOUN) for l in s.lemmas() if re.fullmatch(r"[a-z]{4,}", l.name())})
    nouveaux = [n for n in noms if n not in bases and (wn.morphy(n) or n) not in bases]
    nouveaux = [{"saisie": n} for n in rng.sample(nouveaux, N)]
    (RACINE / "tests" / "doublons_cas.json").write_text(
        json.dumps({"existants": existants, "nouveaux": nouveaux}, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"{len(existants)} existants, {len(nouveaux)} nouveaux")


if __name__ == "__main__":
    main()
