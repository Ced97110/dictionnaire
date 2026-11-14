"""Point 4 — Measure B (real conditions, needs ANTHROPIC_API_KEY).

For each of the 300 words, Haiku receives only the word and its translation:
  1. it writes a short FR + EN definition;
  2. that definition is embedded (e5) and the k-NN vote proposes 3 sections;
  3. Haiku chooses one of the 3.
top1 = Haiku's choice, top3 = true section among the 3 candidates.
Confidence = vote share of the chosen section (same scale as measure A).

Haiku answers are cached in eval/cache/haiku.jsonl, so a rerun is free.

Usage: ANTHROPIC_API_KEY=... python3 eval/mesure_b.py
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Protocol

import numpy as np

from classement import Prediction, voisins, voter
from donnees import Section, charger, texte_corpus
from mesure_a import corpus_et_requetes
from plongements import CACHE, Encodeur
from sorties import RESULTATS

MODELE = os.environ.get("HAIKU_MODELE", "claude-haiku-5-5")
CACHE_HAIKU = CACHE / "haiku.jsonl"
# Generous budgets: the model thinks before answering, and thinking counts against max_tokens.
JETONS_DEF = 4000
JETONS_CHOIX = 2000

CONSIGNE_DEF = (
    "Tu rédiges des définitions de dictionnaire bilingue anglais-français. "
    "On te donne un mot anglais et sa traduction. Écris une définition courte en "
    "français, puis la même en anglais, sans répéter le mot ni sa traduction. "
    "Format exact :\nFR: <définition>\nEN: <definition>"
)
CONSIGNE_CHOIX = (
    "Tu ranges des mots dans un dictionnaire thématique. On te donne un mot, sa "
    "définition et trois sections candidates. Réponds uniquement par le numéro "
    "(1, 2 ou 3) de la section où un lecteur chercherait ce mot."
)


class Client(Protocol):
    def demander(self, consigne: str, texte: str, max_tokens: int) -> str: ...


class ClientAnthropic:
    def __init__(self) -> None:
        import anthropic

        self.api = anthropic.Anthropic(max_retries=6)

    def demander(self, consigne: str, texte: str, max_tokens: int) -> str:
        r = self.api.messages.create(
            model=MODELE,
            max_tokens=max_tokens,
            system=consigne,
            messages=[{"role": "user", "content": texte}],
        )
        texte = "".join(b.text for b in r.content if b.type == "text").strip()
        if not texte:
            # The model may spend the whole budget thinking; never cache an empty answer.
            raise RuntimeError(f"réponse vide (stop_reason={r.stop_reason})")
        return texte


def lire_cache() -> dict[str, str]:
    if not CACHE_HAIKU.exists():
        return {}
    lignes = (
        json.loads(ln)
        for ln in CACHE_HAIKU.read_text(encoding="utf-8").splitlines()
        if ln
    )
    return {d["cle"]: d["reponse"] for d in lignes}


def demander_cache(
    client: Client, cache: dict[str, str], cle: str, consigne: str, texte: str, n: int
) -> str:
    if cle not in cache:
        cache[cle] = client.demander(consigne, texte, n)
        CACHE.mkdir(exist_ok=True)
        with open(CACHE_HAIKU, "a", encoding="utf-8") as f:
            f.write(
                json.dumps({"cle": cle, "reponse": cache[cle]}, ensure_ascii=False)
                + "\n"
            )
    return cache[cle]


def lire_choix(reponse: str) -> int:
    """Index 0..2 of the chosen candidate; 0 if the answer is unreadable."""
    m = re.search(r"[123]", reponse)
    return int(m.group()) - 1 if m else 0


def presenter(t: str, r: str, definition: str, candidats: list[Section]) -> str:
    lignes = [f"Mot : {t} ({r})", f"Définition : {definition}", "", "Sections :"]
    for i, s in enumerate(candidats, 1):
        lignes.append(f"{i}. {s.libelle} — {s.desc}".rstrip(" —"))
    return "\n".join(lignes)


def classer(client: Client, k: int) -> list[tuple[Prediction, dict]]:
    sections, mots = charger()
    jeu, corpus, _ = corpus_et_requetes()
    retires = {j["id"] for j in jeu}
    garder = np.array([m.id not in retires for m in mots])
    sid = np.array([m.sid for m in corpus])
    enc = Encodeur()
    c = enc.encoder([texte_corpus(m) for m in mots], "passage")[garder]
    cache = lire_cache()

    definitions = [
        demander_cache(
            client,
            cache,
            f"def|{MODELE}|{j['id']}",
            CONSIGNE_DEF,
            f"{j['t']} — {j['r']}",
            JETONS_DEF,
        )
        for j in jeu
    ]
    q = enc.encoder(definitions, "query")
    idx, sim = voisins(q, c, k)
    votes = voter(idx, sim, sid)
    sorties = []
    for i, (j, d, v) in enumerate(zip(jeu, definitions, votes)):
        candidats = list(v.classement[:3])
        texte = presenter(j["t"], j["r"], d, [sections[s] for s in candidats])
        rep = demander_cache(
            client,
            cache,
            f"choix|{MODELE}|{j['id']}",
            CONSIGNE_CHOIX,
            texte,
            JETONS_CHOIX,
        )
        choix = candidats[min(lire_choix(rep), len(candidats) - 1)]
        ordre = [choix] + [s for s in candidats if s != choix]
        part = _part_vote(idx, sim, sid, i, choix)
        sorties.append(
            (
                Prediction(tuple(ordre), part),
                {"definition_haiku": d, "reponse_choix": rep},
            )
        )
    return sorties


def _part_vote(
    idx: np.ndarray, sim: np.ndarray, sid: np.ndarray, i: int, s: int
) -> float:
    poids = np.clip(sim[i], 0.0, None) + 1e-6
    return float(poids[sid[idx[i]] == s].sum() / poids.sum())


def charger_env(chemin: Path = Path(__file__).resolve().parent / ".env") -> None:
    """Read KEY=value lines from eval/.env into the environment (never printed)."""
    if not chemin.exists():
        return
    for ligne in chemin.read_text(encoding="utf-8").splitlines():
        cle, sep, val = ligne.strip().partition("=")
        if sep and cle and not cle.startswith("#"):
            os.environ.setdefault(cle.strip(), val.strip().strip("'\""))


def main() -> None:
    charger_env()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY absente : mesure B non lancée.", file=sys.stderr)
        sys.exit(2)
    reglage = json.loads((RESULTATS / "reglage_a.json").read_text())
    k = int(reglage["k_top3"])
    jeu = corpus_et_requetes()[0]
    res = classer(ClientAnthropic(), k)
    RESULTATS.mkdir(exist_ok=True)
    with open(RESULTATS / "predictions_b.jsonl", "w", encoding="utf-8") as f:
        for ligne, (p, extra) in zip(jeu, res):
            sortie = {
                **ligne,
                "classement": list(p.classement),
                "confiance": p.confiance,
                "k": k,
                "modele": MODELE,
                **extra,
            }
            f.write(json.dumps(sortie, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
