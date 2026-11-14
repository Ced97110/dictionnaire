# /// script
# requires-python = ">=3.11"
# dependencies = ["nltk==3.9.2"]
# ///
"""Export WordNet 3.0 (via NLTK) senses to scripts/.cache/wordnet.jsonl.

One row per (lemma, synset): lemma, part of speech, synset name, sense rank for
this lemma and part of speech (1 = most frequent), SemCor count, definition, examples (JSON).
WordNet 3.0, Princeton University — WordNet licence (free use, with citation).

Usage: uv run scripts/wordnet.py
"""

from __future__ import annotations

import json
from pathlib import Path

import nltk

nltk.download("wordnet", quiet=True)
from nltk.corpus import wordnet as wn

SORTIE = Path(__file__).resolve().parent / ".cache" / "wordnet.jsonl"


def main() -> None:
    n = 0
    with SORTIE.open("w", encoding="utf-8", newline="") as f:
        for nom in sorted({l.name().lower() for s in wn.all_synsets() for l in s.lemmas()}):
            # Only synsets that contain this exact lemma (wn.synsets also follows morphy).
            propres = [s for s in wn.synsets(nom) if any(l.name().lower() == nom for l in s.lemmas())]
            rangs: dict[str, int] = {}
            for s in propres:
                # Rank within the part of speech: 1 = WordNet's most frequent sense.
                rang = rangs[s.pos()] = rangs.get(s.pos(), 0) + 1
                compte = sum(l.count() for l in s.lemmas() if l.name().lower() == nom)
                ligne = {"lemme": nom.replace("_", " "), "pos": s.pos(), "synset": s.name(), "rang": rang,
                         "compte": compte, "definition": s.definition(), "exemples": s.examples()}
                f.write(json.dumps(ligne, ensure_ascii=False) + "\n")
                n += 1
    print(f"{n} sens → {SORTIE}")


if __name__ == "__main__":
    main()
