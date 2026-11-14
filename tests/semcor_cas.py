# /// script
# requires-python = ">=3.11"
# dependencies = ["nltk==3.9.2"]
# ///
"""SemCor test cases for « sens en contexte » (an outside, hand-annotated judge).

Draws 200 occurrences (fixed seed) of nouns, verbs and adjectives whose lemma has at
least 3 WordNet senses for that part of speech. For each: the sentence, the previous
and next sentences, the word's character position, the WordNet senses of the lemma
(most frequent first) and the annotated synset.

Writes tests/semcor_cas.json (200 test cases, final measure only) and
tests/semcor_dev.json (100 tuning cases, another seed, no overlap with the test set).
Usage: uv run tests/semcor_cas.py
"""

from __future__ import annotations

import json
import random
from pathlib import Path

import nltk

for corpus in ("semcor", "wordnet"):
    nltk.download(corpus, quiet=True)
from nltk.corpus import semcor
from nltk.corpus import wordnet as wn
from nltk.corpus.reader.wordnet import Lemma
from nltk.tree import Tree

GRAINE = 20261113
N = 200
GRAINE_DEV = 7
N_DEV = 100
POS = {"n", "v", "a", "s"}
ICI = Path(__file__).resolve().parent


def phrase(arbre: list) -> tuple[str, list[tuple[int, int, Lemma]]]:
    """Plain text of a SemCor sentence and the (start, end, lemma) of annotated words."""
    texte, marques = "", []
    for morceau in arbre:
        mots = morceau.leaves() if isinstance(morceau, Tree) else morceau
        bout = " ".join(mots)
        debut = len(texte) + (1 if texte else 0)
        texte = f"{texte} {bout}" if texte else bout
        if isinstance(morceau, Tree) and isinstance(morceau.label(), Lemma):
            marques.append((debut, debut + len(bout), morceau.label()))
    return texte, marques


def main() -> None:
    rng = random.Random(GRAINE)
    phrases = [phrase(a) for a in semcor.tagged_sents(tag="sem")]
    candidats = []
    for i, (texte, marques) in enumerate(phrases):
        for d, f, lem in marques:
            s = lem.synset()
            pos = "a" if s.pos() == "s" else s.pos()
            mot = texte[d:f].lower()
            if pos not in POS or " " in mot:
                continue
            # Named entities are tagged « person », « group », « location »: skip them.
            if lem.name().lower() not in {mot, wn.morphy(mot, pos)}:
                continue
            sens = [x for x in wn.synsets(lem.name(), pos=pos) if any(l.name() == lem.name() for l in x.lemmas())]
            if len(sens) >= 3 and s in sens:
                candidats.append((i, d, f, lem, sens))
    tirage = rng.sample(candidats, N)
    deja = {(i, d) for i, d, *_ in tirage}
    reste = [x for x in candidats if (x[0], x[1]) not in deja]
    dev = random.Random(GRAINE_DEV).sample(reste, N_DEV)
    for nom, choix in (("semcor_cas.json", tirage), ("semcor_dev.json", dev)):
        ecrire(ICI / nom, phrases, choix)
    print(f"{N} cas de test et {N_DEV} cas de mise au point, tirés parmi {len(candidats)}")


def sens_detail(x) -> dict:
    """A WordNet sense with its synonyms and one example: glosses alone are terse."""
    return {"synset": x.name(), "definition": x.definition(),
            "synonymes": [l.name().replace("_", " ") for l in x.lemmas()][:5], "exemple": (x.examples() or [""])[0]}


def ecrire(chemin: Path, phrases: list, choix: list) -> None:
    cas = []
    for i, d, f, lem, sens in choix:
        texte = phrases[i][0]
        cas.append({
            "precedente": phrases[i - 1][0] if i > 0 else "", "phrase": texte,
            "suivante": phrases[i + 1][0] if i + 1 < len(phrases) else "",
            "position": d, "mot": texte[d:f], "lemme": lem.name(), "pos": lem.synset().pos(),
            "sens": [sens_detail(x) for x in sens],
            "attendu": lem.synset().name(),
        })
    chemin.write_text(json.dumps(cas, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
