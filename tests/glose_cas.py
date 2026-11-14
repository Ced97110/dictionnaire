# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = [
#   "spacy==3.8.18",
#   "fr_core_news_sm @ https://github.com/explosion/spacy-models/releases/download/fr_core_news_sm-3.8.0/fr_core_news_sm-3.8.0-py3-none-any.whl",
#   "en_core_web_sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl",
# ]
# ///
"""Test cases for « définition au toucher », judged by spaCy (an outside tool).

Draws 100 definitions (50 French, 50 English) from public/data with a fixed seed.
For every noun, verb and adjective, spaCy gives its lemma; the word is « present »
when that lemma is a headword (English) or a main translation (French) of the
dictionary, read straight from public/data (not from the forms table under test).
Function words (determiners, prepositions, pronouns, conjunctions, auxiliaries,
particles) are listed separately: none may be consultable.

Writes tests/glose_cas.json. Usage: uv run tests/glose_cas.py
"""

from __future__ import annotations

import json
import random
import re
from pathlib import Path

import spacy

RACINE = Path(__file__).resolve().parent.parent
GRAINE = 20261113
N_PAR_LANGUE = 50
CONTENU = {"NOUN", "VERB", "ADJ"}
OUTILS = {"DET", "ADP", "PRON", "CCONJ", "SCONJ", "AUX", "PART"}


def entrees() -> list[dict]:
    out = []
    for f in sorted((RACINE / "public" / "data").glob("t*_*.json")):
        t = json.loads(f.read_text(encoding="utf-8"))
        out += [e for fi in t["fiches"] for e in fi["w"]]
        out += [e for s in t["secs"] for q in s["n"] for e in q["e"] if "i" in e]
    return out


def principal(r: str) -> str:
    return re.sub(r"\s+", " ", r.replace("≈", " ").split("(")[0]).strip().lower()


def main() -> None:
    es = entrees()
    tetes = {"en": {e["t"].strip().lower() for e in es}, "fr": {principal(e["r"]) for e in es}}
    rng = random.Random(GRAINE)
    nlp = {"fr": spacy.load("fr_core_news_sm"), "en": spacy.load("en_core_web_sm")}
    cas = []
    for lg, champ in (("fr", "def_fr"), ("en", "def_en")):
        for e in rng.sample([e for e in es if e.get(champ)], N_PAR_LANGUE):
            doc = nlp[lg](e[champ])
            mots = []
            for tok in doc:
                if tok.pos_ in CONTENU or tok.pos_ in OUTILS:
                    lemme = tok.lemma_.lower()
                    mots.append({
                        "d": tok.idx, "f": tok.idx + len(tok.text), "texte": tok.text, "lemme": lemme,
                        "nature": tok.pos_, "outil": tok.pos_ in OUTILS,
                        "present": tok.pos_ in CONTENU and (lemme in tetes[lg] or tok.text.lower() in tetes[lg]),
                    })
            cas.append({"id": e["i"], "langue": lg, "texte": e[champ], "mots": mots})
    (RACINE / "tests" / "glose_cas.json").write_text(json.dumps(cas, ensure_ascii=False, indent=1), encoding="utf-8")
    n_present = sum(m["present"] for c in cas for m in c["mots"])
    print(f"{len(cas)} définitions, {n_present} noms/verbes/adjectifs présents dans le dictionnaire")


if __name__ == "__main__":
    main()
