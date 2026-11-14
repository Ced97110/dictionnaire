"""Load the dictionary into flat, immutable records: sections and words.

A "section" is one entry of `secs` or `fiches` in a theme file that holds at
least one word. Sections are identified by position (theme key + kind + index),
not by name, because some fiche and section names collide inside a theme.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DONNEES = RACINE / "public" / "data"

NATURE_PAR_VOLUME = {
    "Verbes": "verbe",
    "Adjectifs": "adjectif",
    "Descriptions": "description",
}


@dataclass(frozen=True)
class Section:
    sid: int
    cle: str  # theme key, e.g. "0_0"
    theme: str
    nom: str
    genre: str  # "sec" or "fiche"
    desc: str  # French description of the section (may be empty)

    @property
    def libelle(self) -> str:
        return f"{self.theme} › {self.nom}"


@dataclass(frozen=True)
class Mot:
    id: str
    t: str  # English headword
    r: str  # French translation
    sid: int
    cle: str
    def_fr: str
    def_en: str
    gd: tuple[str, ...]
    nature: str
    a_alias: bool  # the entry lists other senses placed elsewhere ("al")

    @property
    def cle_mot(self) -> str:
        return normaliser_mot(self.t)


def normaliser_mot(t: str) -> str:
    return re.sub(r"\s+", " ", t.strip().lower())


def _cles_theme() -> list[str]:
    def ordre(p: Path) -> tuple[int, int]:
        a, b = p.stem[1:].split("_")
        return int(a), int(b)

    return [p.stem[1:] for p in sorted(DONNEES.glob("t*_*.json"), key=ordre)]


def _nature_par_cle() -> dict[str, str]:
    front = json.loads((DONNEES / "front.json").read_text(encoding="utf-8"))
    out: dict[str, str] = {}
    for partie in front["parts"]:
        nature = NATURE_PAR_VOLUME.get(partie["vol"], "nom ou expression")
        for theme in partie["themes"]:
            out[theme[2]] = nature
    return out


def _mot(e: dict, sid: int, cle: str, nature: str) -> Mot:
    return Mot(
        id=e["i"],
        t=e["t"],
        r=e.get("r", ""),
        sid=sid,
        cle=cle,
        def_fr=e.get("def_fr", ""),
        def_en=e.get("def_en", ""),
        gd=tuple(e.get("gd") or ()),
        nature=nature,
        a_alias=bool(e.get("al")),
    )


@lru_cache(maxsize=1)
def charger() -> tuple[tuple[Section, ...], tuple[Mot, ...]]:
    """Return all non-empty sections and every word entry (pointers excluded)."""
    natures = _nature_par_cle()
    sections: list[Section] = []
    mots: list[Mot] = []
    for cle in _cles_theme():
        d = json.loads((DONNEES / f"t{cle}.json").read_text(encoding="utf-8"))
        blocs = [("sec", s, [e for n in s["n"] for e in n["e"]]) for s in d["secs"]]
        blocs += [("fiche", f, list(f["w"])) for f in d["fiches"]]
        for genre, bloc, entrees in blocs:
            vrais = [e for e in entrees if "ref" not in e and e.get("i")]
            if not vrais:
                continue
            sid = len(sections)
            desc = (bloc.get("d") or [""])[0]
            sections.append(Section(sid, cle, d["fr"], bloc["fr"], genre, desc))
            mots.extend(_mot(e, sid, cle, natures.get(cle, "?")) for e in vrais)
    return tuple(sections), tuple(mots)


def sections_par_mot(mots: tuple[Mot, ...]) -> dict[str, frozenset[int]]:
    """Map each normalised headword to the set of sections it appears in."""
    acc: dict[str, set[int]] = defaultdict(set)
    for m in mots:
        acc[m.cle_mot].add(m.sid)
    return {k: frozenset(v) for k, v in acc.items()}


def mots_mono_section(mots: tuple[Mot, ...]) -> list[Mot]:
    """Words whose headword lives in exactly one section and has no alias elsewhere."""
    places = sections_par_mot(mots)
    n_par_cle = Counter(m.cle_mot for m in mots)
    return [
        m
        for m in mots
        if len(places[m.cle_mot]) == 1 and n_par_cle[m.cle_mot] == 1 and not m.a_alias
    ]


# --- texts -----------------------------------------------------------------

_PAREN = re.compile(r"[()]")


def formes_a_masquer(m: Mot) -> list[str]:
    """Headword, translation and its variants, plus long tokens of the headword."""
    formes = {m.t}
    r = m.r.replace("≈", " ")
    formes.add(_PAREN.split(r)[0])
    for morceau in re.findall(r"\(([^)]*)\)", r):
        formes.update(morceau.split(","))
    formes.update(tok for tok in re.split(r"[\s\-/]+", m.t) if len(tok) >= 4)
    formes.update(tok for tok in re.split(r"[\s\-/,()’']+", r) if len(tok) >= 5)
    propres = {f.strip(" .,;:") for f in formes}
    return sorted((f for f in propres if len(f) >= 3), key=len, reverse=True)


def masquer(texte: str, formes: list[str]) -> str:
    out = texte
    for f in formes:
        motif = r"(?<!\w)" + re.escape(f) + r"\w{0,3}(?!\w)"
        out = re.sub(motif, "…", out, flags=re.IGNORECASE)
    return out


def texte_definition(m: Mot) -> str:
    gd = " ; ".join(x for x in m.gd if x)
    return " ".join(x for x in (m.def_fr, m.def_en, gd) if x)


def texte_requete(m: Mot) -> str:
    """Definition with the word and its translation masked: what a classifier may see."""
    return masquer(texte_definition(m), formes_a_masquer(m))


def texte_corpus(m: Mot) -> str:
    """Representation of a word already placed in the dictionary."""
    return f"{m.t} — {m.r}. {texte_definition(m)}"
