"""Point 1 — ceiling: duplicates, TF-IDF confusion, and the overlap hypothesis.

Every single-section word is classified leave-one-out against the rest of the
dictionary from its masked definition (TF-IDF, k = 20), and the same with
e5 embeddings (k = 20) to compare. Errors are then checked against two
classifier-independent signs of overlap between sections:
  - shared words: the two sections already hold the same headword;
  - cross-reference: one section's description names the other.

Usage: python3 eval/plafond.py
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from itertools import combinations

import numpy as np

from classement import Prediction, voisins, voter, vectoriseur_tfidf
from donnees import (
    DONNEES,
    Mot,
    Section,
    charger,
    mots_mono_section,
    sections_par_mot,
    texte_corpus,
    texte_requete,
)
from plongements import Encodeur
from sorties import RESULTATS, ecrire_md, nb, pct

K = 20


def doublons() -> dict:
    index = json.loads((DONNEES / "index.json").read_text(encoding="utf-8"))
    chemins: dict[str, set[str]] = defaultdict(set)
    for mot, _tr, _id, cle, chemin in index:
        chemins[mot.strip().lower()].add(f"{cle}|{chemin}")
    sections, mots = charger()
    places = sections_par_mot(mots)
    multi = {k: v for k, v in places.items() if len(v) > 1}
    return {
        "mots_distincts": len(places),
        "multi_chemins_index": sum(len(v) > 1 for v in chemins.values()),
        "multi_sections": len(multi),
        "repartition": Counter(len(v) for v in multi.values()),
        "entrees_avec_alias": sum(m.a_alias for m in mots),
        "places": places,
    }


def partages(places: dict[str, frozenset[int]]) -> Counter:
    """Number of headwords shared by each unordered section pair."""
    c: Counter = Counter()
    for sids in places.values():
        for a, b in combinations(sorted(sids), 2):
            c[(a, b)] += 1
    return c


def renvois(sections: tuple[Section, ...]) -> set[tuple[int, int]]:
    """Unordered pairs where one description names the other (same theme)."""
    par_nom = {(s.cle, s.nom): s.sid for s in sections}
    out: set[tuple[int, int]] = set()
    for s in sections:
        for nom in re.findall(r"«\s*([^»]+?)\s*»", s.desc):
            autre = par_nom.get((s.cle, nom))
            if autre is not None and autre != s.sid:
                out.add((min(s.sid, autre), max(s.sid, autre)))
    return out


def classer_loo(
    mots: tuple[Mot, ...], requetes: list[Mot], methode: str
) -> list[Prediction]:
    pos = {m.id: i for i, m in enumerate(mots)}
    exclure = np.array([pos[m.id] for m in requetes])
    sid = np.array([m.sid for m in mots])
    if methode == "tfidf":
        vec = vectoriseur_tfidf()
        c = vec.fit_transform([texte_corpus(m) for m in mots])
        q = vec.transform([texte_requete(m) for m in requetes])
    else:
        enc = Encodeur()
        c = enc.encoder([texte_corpus(m) for m in mots], "passage")
        q = enc.encoder([texte_requete(m) for m in requetes], "query")
    idx, sim = voisins(q, c, K, exclure)
    return voter(idx, sim, sid)


def analyse(
    nom: str,
    requetes: list[Mot],
    preds: list[Prediction],
    sections: tuple[Section, ...],
    partage: Counter,
    renv: set[tuple[int, int]],
) -> tuple[dict, Counter]:
    vrai = np.array([m.sid for m in requetes])
    tete = np.array([p.classement[0] for p in preds])
    top3 = np.array([m.sid in p.classement[:3] for m, p in zip(requetes, preds)])
    conf: Counter = Counter((int(a), int(b)) for a, b in zip(vrai, tete) if a != b)
    erreurs = [(int(a), int(b)) for a, b in zip(vrai, tete) if a != b]

    def recouvre(a: int, b: int) -> bool:
        p = (min(a, b), max(a, b))
        return partage[p] > 0 or p in renv

    def meme_theme(a: int, b: int) -> bool:
        return sections[a].cle == sections[b].cle

    # Baselines: what share would overlap if the wrong section were drawn at random
    # (a) among all other sections, (b) among other sections of the same theme.
    par_theme: dict[str, list[int]] = defaultdict(list)
    for s in sections:
        par_theme[s.cle].append(s.sid)
    voisins_rec: dict[int, set[int]] = defaultdict(set)
    for (a, b), n in partage.items():
        if n:
            voisins_rec[a].add(b)
            voisins_rec[b].add(a)
    for a, b in renv:
        voisins_rec[a].add(b)
        voisins_rec[b].add(a)
    taux_tout = {
        a: len(voisins_rec[a]) / (len(sections) - 1) for a in range(len(sections))
    }
    taux_theme = {}
    for a in range(len(sections)):
        meme = [s for s in par_theme[sections[a].cle] if s != a]
        taux_theme[a] = len(voisins_rec[a] & set(meme)) / len(meme) if meme else 0.0
    attendu_tout = [taux_tout[a] for a, _ in erreurs]
    attendu_theme = [taux_theme[a] for a, _ in erreurs]

    err_meme_theme = [(a, b) for a, b in erreurs if meme_theme(a, b)]
    paires = Counter()
    for (a, b), n in conf.items():
        paires[(min(a, b), max(a, b))] += n
    n_err = len(erreurs)
    stats = {
        "methode": nom,
        "n": len(requetes),
        "top1": float((vrai == tete).mean()),
        "top3": float(top3.mean()),
        "erreurs": n_err,
        "err_meme_theme": len(err_meme_theme) / n_err,
        "err_recouvrement": np.mean([recouvre(a, b) for a, b in erreurs]),
        "attendu_hasard_tout": float(np.mean(attendu_tout)),
        "attendu_hasard_theme": float(np.mean(attendu_theme)),
        "err_recouvrement_dans_theme": np.mean(
            [recouvre(a, b) for a, b in err_meme_theme]
        ),
        "err_en_top3": float(top3[vrai != tete].mean()),
        "part_err_10_paires": sum(n for _, n in paires.most_common(10)) / n_err,
        "part_err_1pc_paires": sum(
            n for _, n in paires.most_common(max(1, len(paires) // 100))
        )
        / n_err,
        "paires_distinctes": len(paires),
    }
    return stats, conf


def ecrire_confusion(
    nom: str, conf: Counter, requetes: list[Mot], preds: list[Prediction], sections
) -> None:
    taille = Counter(m.sid for m in requetes)
    with open(RESULTATS / f"confusion_{nom}_sections.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "vraie_sid",
                "vraie_section",
                "predite_sid",
                "predite_section",
                "n",
                "part_de_la_vraie",
            ]
        )
        for (a, b), n in sorted(conf.items(), key=lambda x: -x[1]):
            w.writerow(
                [
                    a,
                    sections[a].libelle,
                    b,
                    sections[b].libelle,
                    n,
                    round(n / taille[a], 4),
                ]
            )
    # Dense theme-level matrix (66 x 66), diagonal included.
    cles = sorted(
        {s.cle for s in sections}, key=lambda c: tuple(map(int, c.split("_")))
    )
    pos = {c: i for i, c in enumerate(cles)}
    mat = np.zeros((len(cles), len(cles)), dtype=int)
    for m, p in zip(requetes, preds):
        mat[pos[m.cle], pos[sections[p.classement[0]].cle]] += 1
    noms = {s.cle: s.theme for s in sections}
    with open(RESULTATS / f"confusion_{nom}_themes.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["vrai \\ prédit"] + [noms[c] for c in cles])
        for c in cles:
            w.writerow([noms[c]] + mat[pos[c]].tolist())


def top_paires(
    conf: Counter, requetes: list[Mot], sections, partage, renv
) -> list[dict]:
    taille = Counter(m.sid for m in requetes)
    paires: Counter = Counter()
    for (a, b), n in conf.items():
        paires[(min(a, b), max(a, b))] += n
    out = []
    for (a, b), n in paires.most_common(10):
        out.append(
            {
                "a": sections[a].libelle,
                "b": sections[b].libelle,
                "n": n,
                "a_vers_b": conf[(a, b)],
                "b_vers_a": conf[(b, a)],
                "taille_a": taille[a],
                "taille_b": taille[b],
                "mots_partages": partage[(a, b)],
                "renvoi": (a, b) in renv,
            }
        )
    return out


def main() -> None:
    RESULTATS.mkdir(exist_ok=True)
    sections, mots = charger()
    d = doublons()
    partage = partages(d["places"])
    renv = renvois(sections)
    requetes = mots_mono_section(mots)
    resultats = {}
    for methode in ("tfidf", "e5"):
        preds = classer_loo(mots, requetes, methode)
        stats, conf = analyse(methode, requetes, preds, sections, partage, renv)
        ecrire_confusion(methode, conf, requetes, preds, sections)
        resultats[methode] = (
            stats,
            top_paires(conf, requetes, sections, partage, renv),
        )
        print(json.dumps(stats, default=float, ensure_ascii=False))
    n_paires_recouvrantes = len({p for p, n in partage.items() if n > 0} | renv)
    rapport(d, partage, renv, n_paires_recouvrantes, resultats, len(sections))


def rapport(d, partage, renv, n_rec, resultats, n_sections) -> None:
    rep = ", ".join(f"{k} sections : {v}" for k, v in sorted(d["repartition"].items()))
    md = [
        "# Point 1 — Plafond",
        "",
        "## Mots placés sous plusieurs sections",
        "",
        f"- Mots distincts (minuscules) : {nb(d['mots_distincts'])}",
        f"- Sous plusieurs **chemins** dans `index.json` : **{nb(d['multi_chemins_index'])}**",
        f"- Sous plusieurs **sections** (la cible) : **{nb(d['multi_sections'])}** "
        f"({pct(d['multi_sections'] / d['mots_distincts'])} des mots) — {rep}",
        f"- Entrées portant un alias (`al`, autre sens rangé ailleurs, non compté dans l'index) : {nb(d['entrees_avec_alias'])}",
        f"- Paires de sections qui partagent au moins un mot : {nb(sum(1 for n in partage.values() if n))} ; "
        f"paires reliées par un renvoi dans leur description : {len(renv)} ; "
        f"total des paires « qui se recouvrent » : {nb(n_rec)} sur {nb(n_sections * (n_sections - 1) // 2)} possibles.",
        "",
        "## Classement par plus proches voisins (k = 20), un mot retiré à la fois",
        "",
        "Requête : définition FR + EN + genre/différence, mot et traduction masqués. "
        "Corpus : tous les autres mots (mot, traduction, définition). "
        f"Évalué sur les {nb(resultats['tfidf'][0]['n'])} mots présents dans une seule section.",
        "",
        "| | TF-IDF | e5 (plongements) |",
        "|---|---|---|",
    ]
    t, e = resultats["tfidf"][0], resultats["e5"][0]
    lignes = [
        ("Bonne section en tête", "top1"),
        ("Bonne section dans les 3 premières", "top3"),
        ("Erreurs dont la bonne section est dans le top 3", "err_en_top3"),
        ("Erreurs restées dans le même thème", "err_meme_theme"),
        ("Erreurs tombant sur une paire qui se recouvre", "err_recouvrement"),
        (
            "… attendu si la section fautive était tirée au hasard",
            "attendu_hasard_tout",
        ),
        (
            "… attendu au hasard parmi les sections du même thème",
            "attendu_hasard_theme",
        ),
        (
            "Erreurs intra-thème tombant sur une paire qui se recouvre",
            "err_recouvrement_dans_theme",
        ),
        (
            "Part des erreurs dans les 10 paires les plus confondues",
            "part_err_10_paires",
        ),
        (
            "Part des erreurs dans le 1 % des paires les plus confondues",
            "part_err_1pc_paires",
        ),
    ]
    md += [f"| {lib} | {pct(t[c])} | {pct(e[c])} |" for lib, c in lignes]
    md += [
        f"| Nombre de paires confondues distinctes | {t['paires_distinctes']} | {e['paires_distinctes']} |",
        "",
    ]
    for methode in ("tfidf", "e5"):
        md += [
            f"## Les 10 paires les plus confondues — {methode}",
            "",
            "| # | Section A | Section B | erreurs (A→B / B→A) | taille A / B | mots partagés | renvoi |",
            "|---|---|---|---|---|---|---|",
        ]
        for i, p in enumerate(resultats[methode][1], 1):
            md.append(
                f"| {i} | {p['a']} | {p['b']} | {p['n']} ({p['a_vers_b']} / {p['b_vers_a']}) | "
                f"{p['taille_a']} / {p['taille_b']} | {p['mots_partages']} | {'oui' if p['renvoi'] else 'non'} |"
            )
        md.append("")
    md += [
        "Matrices complètes : `confusion_<méthode>_sections.csv` (format long, 820 × 820 creux) "
        "et `confusion_<méthode>_themes.csv` (66 × 66, diagonale comprise).",
        "",
    ]
    ecrire_md("plafond.md", md)
    with open(RESULTATS / "plafond.json", "w") as f:
        json.dump({m: r[0] for m, r in resultats.items()}, f, default=float, indent=1)


if __name__ == "__main__":
    main()
