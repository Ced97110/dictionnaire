"""Step 5 — do Aristotle's categories carry information the dictionary lacks,
and do they separate twin sections?

Usage: python3 eval/categories_mesure.py  ->  resultats/categories.md
Needs resultats/inventaire_sections.csv and resultats/predictions_*.jsonl.
"""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict

import numpy as np

from categories import CATEGORIES, HORS, IND, par_mot
from donnees import charger
from sorties import RESULTATS, ecrire_md, nb, pct


def entropie(c: Counter) -> float:
    p = np.array([v for v in c.values() if v], dtype=float)
    p /= p.sum()
    return float(-(p * np.log2(p)).sum())


def js(a: Counter, b: Counter) -> float:
    """Jensen-Shannon divergence (bits, 0 = same distribution, 1 = disjoint)."""
    cles = sorted(set(a) | set(b))
    p = np.array([a[k] for k in cles], float) / max(sum(a.values()), 1)
    q = np.array([b[k] for k in cles], float) / max(sum(b.values()), 1)
    m = (p + q) / 2

    def kl(x: np.ndarray) -> float:
        ok = x > 0
        return float((x[ok] * np.log2(x[ok] / m[ok])).sum())

    return (kl(p) + kl(q)) / 2


def profils() -> dict[int, Counter]:
    """Category distribution of each section (known categories only)."""
    etiq = par_mot()
    out: dict[int, Counter] = defaultdict(Counter)
    for m in charger()[1]:
        c = etiq[m.id].categorie
        if c in CATEGORIES:
            out[m.sid][c] += 1
    return out


def paires_jumelles(sections) -> list[tuple[int, int, str]]:
    sid = {s.libelle: s.sid for s in sections}
    out = set()
    with open(RESULTATS / "inventaire_sections.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            v = r["verdict_propose"]
            if v.startswith("fusionner"):
                a, b = int(r["sid"]), sid[r["jumelle"]]
            elif v.startswith("clarifier"):
                a, b = int(r["sid"]), sid[r["principale_fuite"]]
            else:
                continue
            out.add((min(a, b), max(a, b), v.split(" ")[0]))
    return sorted(out)


def reclassement(nom: str, prof: dict[int, Counter]) -> dict | None:
    """Oracle: keep only candidate sections whose dominant category is the word's."""
    chemin = RESULTATS / f"predictions_{nom}.jsonl"
    if not chemin.exists():
        return None
    etiq = par_mot()
    dominante = {s: c.most_common(1)[0][0] for s, c in prof.items() if c}
    avant = apres = n = touches = 0
    for ligne in chemin.read_text(encoding="utf-8").splitlines():
        d = json.loads(ligne)
        if d["jeu"] != "test":
            continue
        n += 1
        cat = etiq[d["id"]].categorie
        cands = d["classement"]
        filtres = (
            [s for s in cands if dominante.get(s) == cat] if cat in CATEGORIES else []
        )
        nouveau = filtres or cands
        touches += nouveau[0] != cands[0]
        avant += cands[0] == d["sid"]
        apres += nouveau[0] == d["sid"]
    return {"n": n, "avant": avant / n, "apres": apres / n, "changes": touches}


def main() -> None:
    sections, mots = charger()
    etiq = par_mot()
    rep = Counter(etiq[m.id].categorie for m in mots)
    src = Counter(etiq[m.id].source for m in mots)
    sures = sum(etiq[m.id].sure for m in mots)
    connues = Counter({c: rep[c] for c in CATEGORIES})
    h = entropie(connues)
    prof = profils()
    # Mutual information between section and category, over words with a known category.
    total = sum(connues.values())
    h_cond = sum(sum(c.values()) / total * entropie(c) for c in prof.values() if c)
    paires = paires_jumelles(sections)
    dist = [
        (a, b, v, js(prof[a], prof[b])) for a, b, v in paires if prof[a] and prof[b]
    ]
    md = [
        "# Catégories d'Aristote — mesure",
        "",
        "Étiquettes de premier passage (modèle), à faire vérifier : voir `categories_guide.md`.",
        "",
        "## Couverture",
        "",
        f"- Mots : {nb(len(mots))} ; étiquetés par le genre : {nb(src['genre'])} ; "
        f"par le type de question : {nb(src['type de question'])} ; sans source : {nb(src['aucune'])}.",
        f"- Étiquettes jugées sûres : {nb(sures)} ({pct(sures / len(mots))}).",
        "",
        "| catégorie | mots | part |",
        "|---|---|---|",
    ]
    for c in (*CATEGORIES, HORS, IND):
        md.append(f"| {c} | {nb(rep[c])} | {pct(rep[c] / len(mots))} |")
    md += [
        "",
        "## Information apportée",
        "",
        f"- Entropie des 10 catégories (mots de catégorie connue) : {h:.2f} bits, "
        f"sur un maximum de {np.log2(10):.2f}.",
        f"- Entropie restante quand on connaît la section : {h_cond:.2f} bits. "
        f"La section détermine donc déjà {pct(1 - h_cond / h)} de la catégorie.",
        "",
        "## Les catégories séparent-elles les sections jumelles ?",
        "",
        "Divergence de Jensen-Shannon entre les profils de catégories des deux sections "
        "(0 = même profil, 1 = profils disjoints).",
        "",
        "| paires | nombre | divergence médiane | part des paires avec la même catégorie dominante |",
        "|---|---|---|---|",
    ]
    for v in ("fusionner", "clarifier"):
        x = [(a, b, d) for a, b, vv, d in dist if vv == v]
        if not x:
            continue
        meme = np.mean(
            [
                prof[a].most_common(1)[0][0] == prof[b].most_common(1)[0][0]
                for a, b, _ in x
            ]
        )
        md.append(
            f"| {v} | {len(x)} | {np.median([d for *_, d in x]):.2f} | {pct(meme)} |"
        )
    md += ["", "## Effet sur le rangement (oracle, 200 mots de test)", ""]
    md += [
        "Si l'on connaissait la catégorie exacte du mot et qu'on écartait les sections candidates "
        "dont la catégorie dominante diffère :",
        "",
        "| mesure | bonne section en tête avant | après | réponses modifiées |",
        "|---|---|---|---|",
    ]
    for nom in ("a", "tfidf", "b"):
        r = reclassement(nom, prof)
        if r:
            md.append(
                f"| {nom} | {pct(r['avant'])} | {pct(r['apres'])} | {r['changes']} / {r['n']} |"
            )
    ecrire_md("categories.md", md + [""])
    print("\n".join(md))


if __name__ == "__main__":
    main()
