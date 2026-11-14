# /// script
# requires-python = ">=3.11"
# dependencies = ["lemminflect==0.2.3"]
# ///
"""Build the inflected-form table: every surface form that points to a word entry.

Sources (all cited in the README):
  - English inflections: LemmInflect 0.2.3 (MIT).
  - British/American spelling: VarCon 2020.12.07 (SCOWL, permissive licence).
  - French inflections: Lexique 3.83 (CC BY-SA 4.0).

Output: scripts/.cache/formes.tsv with columns forme, mot_id, langue, source.
Forms are raw; scripts/import-formes.mts normalises them with lib/normaliser.ts
so the database and the API share one normalisation.

Usage: uv run scripts/formes.py
"""

from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from pathlib import Path

from lemminflect import getAllInflections

RACINE = Path(__file__).resolve().parent.parent
DONNEES = RACINE / "public" / "data"
SOURCES = RACINE / "scripts" / ".cache" / "sources"
SORTIE = RACINE / "scripts" / ".cache" / "formes.tsv"
VARCON = SOURCES / "varcon" / "varcon-2020.12.07" / "varcon.txt"
LEXIQUE = SOURCES / "Lexique383.tsv"


def mots() -> list[tuple[str, str, str]]:
    """(id, English headword, French translation) for every entry."""
    out = []
    for f in sorted(DONNEES.glob("t*_*.json")):
        t = json.loads(f.read_text(encoding="utf-8"))
        entrees = [e for fi in t["fiches"] for e in fi["w"]]
        entrees += [e for s in t["secs"] for q in s["n"] for e in q["e"] if "i" in e]
        out += [(e["i"], e["t"], e.get("r", "")) for e in entrees]
    return out


def variantes_orthographe() -> dict[str, set[str]]:
    """Each spelling → all spellings of the same word (American, British, …)."""
    groupes: dict[str, set[str]] = defaultdict(set)
    for ligne in VARCON.read_text(encoding="latin-1").splitlines():
        if not ligne.strip() or ligne.startswith("#"):
            continue
        ligne = ligne.split("|")[0]
        formes = {m.strip().lower() for m in re.findall(r":\s*([^/]+)", ligne)}
        formes = {f for f in formes if f and " " not in f}
        for f in formes:
            groupes[f] |= formes
    return groupes


def inflexions_en(mot: str) -> set[str]:
    """Inflections of a (possibly multi-word) headword; the last word inflects."""
    tete, _, dernier = mot.rpartition(" ")
    # Only the word's own inflections (holding → holdings), never its family
    # (holding ↛ hold, holds): a form must point to the right base word.
    formes = {dernier}
    for infl in getAllInflections(dernier).values():
        formes.update(infl)
    if dernier.isalpha() and not any(f != dernier and f.startswith(dernier[:-1]) and f.endswith("s") for f in formes):
        formes.add(pluriel_regulier(dernier))  # uncountable or unknown to LemmInflect
    return {f"{tete} {f}".strip() for f in formes}


def pluriel_regulier(nom: str) -> str:
    if re.search(r"(s|x|z|ch|sh)$", nom):
        return nom + "es"
    if re.search(r"[^aeiou]y$", nom):
        return nom[:-1] + "ies"
    return nom + "s"


def avec_variantes(forme: str, var: dict[str, set[str]]) -> set[str]:
    mots_ = forme.split(" ")
    sorties = {forme}
    for i, m in enumerate(mots_):
        for v in var.get(m.lower(), ()):
            sorties.add(" ".join(mots_[:i] + [v] + mots_[i + 1 :]))
    return sorties


Lexique = tuple[dict[str, set[str]], dict[tuple[str, str], set[str]], dict[str, str]]


def lexique() -> Lexique:
    """French: form → lemmas; (lemma, cgram) → all forms; singular → plural."""
    vers_lemme: dict[str, set[str]] = defaultdict(set)
    formes: dict[tuple[str, str], set[str]] = defaultdict(set)
    rangs: dict[tuple[str, str, str], dict[str, str]] = defaultdict(dict)
    with LEXIQUE.open(encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            vers_lemme[r["ortho"]].add(r["lemme"])
            formes[(r["lemme"], r["cgram"])].add(r["ortho"])
            if r["cgram"] in ("NOM", "ADJ") and r["nombre"] in ("s", "p"):
                rangs[(r["lemme"], r["cgram"], r["genre"])].setdefault(r["nombre"], r["ortho"])
    pluriel = {d["s"]: d["p"] for d in rangs.values() if "s" in d and "p" in d}
    return vers_lemme, formes, pluriel


def inflexions_fr(r: str, lex: Lexique) -> set[str]:
    """Single word: its own inflections. Phrase: as is, and with each word in the plural."""
    _, par_lemme, pluriel = lex
    principal = re.sub(r"\s+", " ", r.replace("≈", " ").split("(")[0]).strip().lower()
    if not principal:
        return set()
    mots_ = principal.split(" ")
    if len(mots_) == 1:
        # Forms of the word as its own lemma only (tourné → tournée, tournés),
        # not of another lemma it belongs to (tourné ↛ tourner, tournait).
        sorties = {principal}
        for cg in ("NOM", "ADJ", "VER"):
            sorties |= par_lemme.get((principal, cg), set())
        return sorties
    return {principal, " ".join(pluriel.get(m, m) for m in mots_)}


def main() -> None:
    var = variantes_orthographe()
    lex = lexique()
    lignes: set[tuple[str, str, str, str]] = set()
    for mid, t, r in mots():
        for f in inflexions_en(t):
            for v in avec_variantes(f, var):
                source = "VarCon" if v != f else ("mot" if f == t else "LemmInflect")
                lignes.add((v, mid, "en", source))
        lignes.add((t, mid, "en", "mot"))
        for f in inflexions_fr(r, lex):
            lignes.add((f, mid, "fr", "Lexique 3"))
    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    with SORTIE.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(["forme", "mot_id", "langue", "source"])
        w.writerows(sorted(lignes))
    print(f"{len(lignes)} formes → {SORTIE}")


if __name__ == "__main__":
    main()
