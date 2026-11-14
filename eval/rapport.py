"""Point 5 — results on the 200 test words for every measure available
(A, TF-IDF reference, and B if predictions_b.jsonl exists).

The "À valider" thresholds are taken from the 100 tuning words (confidence
quantiles), then applied unchanged to the 200 test words.

Usage: python3 eval/rapport.py
"""

from __future__ import annotations

import csv
import json
from collections import defaultdict

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

from classement import bootstrap  # noqa: E402
from donnees import charger, sections_par_mot, texte_requete  # noqa: E402
from plafond import partages, renvois  # noqa: E402
from sorties import RESULTATS, ecrire_md, pct  # noqa: E402

METHODES = {
    "a": "A — e5, définition existante",
    "tfidf": "TF-IDF k = 20 (référence)",
    "b": "B — Haiku + e5",
}
PARTS = [round(x, 2) for x in np.arange(0.0, 0.95, 0.1)]


def lire(nom: str) -> list[dict] | None:
    chemin = RESULTATS / f"predictions_{nom}.jsonl"
    if not chemin.exists():
        return None
    return [
        json.loads(ln) for ln in chemin.read_text(encoding="utf-8").splitlines() if ln
    ]


def ic(v: np.ndarray) -> str:
    bas, haut = bootstrap(v.astype(float))
    return f"{pct(v.mean())} [{pct(bas)} ; {pct(haut)}]"


def courbe(lignes: list[dict]) -> list[dict]:
    reg = np.array([ln["confiance"] for ln in lignes if ln["jeu"] == "reglage"])
    test = [ln for ln in lignes if ln["jeu"] == "test"]
    conf = np.array([ln["confiance"] for ln in test])
    juste = np.array([ln["classement"][0] == ln["sid"] for ln in test])
    out = []
    for f in PARTS:
        seuil = -np.inf if f == 0 else float(np.quantile(reg, f))
        auto = conf >= seuil
        bas, haut = (
            bootstrap(juste[auto].astype(float)) if auto.any() else (np.nan, np.nan)
        )
        out.append(
            {
                "part_visee": f,
                "seuil_confiance": seuil,
                "part_a_valider_test": float(1 - auto.mean()),
                "n_auto": int(auto.sum()),
                "precision_auto": float(juste[auto].mean())
                if auto.any()
                else float("nan"),
                "ic_bas": bas,
                "ic_haut": haut,
            }
        )
    return out


def courbe_fine(lignes: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """Test words sorted by confidence: precision of the top (1 - x) share."""
    test = sorted(
        (ln for ln in lignes if ln["jeu"] == "test"), key=lambda ln: -ln["confiance"]
    )
    juste = np.array([ln["classement"][0] == ln["sid"] for ln in test], dtype=float)
    n = np.arange(1, len(juste) + 1)
    return 1 - n / len(juste), np.cumsum(juste) / n


def par_groupe(lignes: list[dict], cle) -> list[tuple[str, int, int]]:
    acc: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for ln in lignes:
        g = cle(ln)
        acc[g][0] += 1
        acc[g][1] += ln["classement"][0] != ln["sid"]
    return sorted(
        ((g, n, e) for g, (n, e) in acc.items()), key=lambda x: (-x[2], -x[1])
    )


def section_md(nom: str, lignes: list[dict], ctx: dict) -> list[str]:
    sections, par_id, partage, renv = (
        ctx["sections"],
        ctx["par_id"],
        ctx["partage"],
        ctx["renv"],
    )
    test = [ln for ln in lignes if ln["jeu"] == "test"]
    top1 = np.array([ln["classement"][0] == ln["sid"] for ln in test])
    top3 = np.array([ln["sid"] in ln["classement"][:3] for ln in test])
    k = test[0].get("k")
    l_md = [
        f"## {METHODES[nom]}",
        "",
        f"k = {k} ; {len(test)} mots de test.",
        "",
        f"- Bonne section en tête : **{ic(top1)}**",
        f"- Bonne section dans les 3 premières : **{ic(top3)}**",
        "",
        "### Courbe « À valider » (seuils fixés sur les 100 mots de réglage)",
        "",
        "| part visée | seuil de confiance | part envoyée « À valider » (test) | mots rangés seuls | précision des mots rangés seuls [IC 95 %] |",
        "|---|---|---|---|---|",
    ]
    c = courbe(lignes)
    for p in c:
        l_md.append(
            f"| {pct(p['part_visee'], 0)} | {p['seuil_confiance']:.3f} | {pct(p['part_a_valider_test'])} | "
            f"{p['n_auto']} | {pct(p['precision_auto'])} [{pct(p['ic_bas'])} ; {pct(p['ic_haut'])}] |"
        )
    with open(RESULTATS / f"courbe_{nom}.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(c[0]))
        w.writeheader()
        w.writerows(c)

    l_md += [
        "",
        "### Erreurs par nature de mot",
        "",
        "| nature | mots | erreurs | taux d'erreur |",
        "|---|---|---|---|",
    ]
    for g, n, e in par_groupe(test, lambda ln: par_id[ln["id"]].nature):
        l_md.append(f"| {g} | {n} | {e} | {pct(e / n, 0)} |")
    l_md += ["", "| forme | mots | erreurs | taux d'erreur |", "|---|---|---|---|"]
    for g, n, e in par_groupe(
        test,
        lambda ln: (
            "expression (plusieurs mots)" if " " in ln["t"].strip() else "mot simple"
        ),
    ):
        l_md.append(f"| {g} | {n} | {e} | {pct(e / n, 0)} |")
    l_md += [
        "",
        "### Erreurs par thème (thèmes avec au moins une erreur)",
        "",
        "| thème | mots | erreurs |",
        "|---|---|---|",
    ]
    for g, n, e in par_groupe(test, lambda ln: sections[ln["sid"]].theme):
        if e:
            l_md.append(f"| {g} | {n} | {e} |")

    echecs = sorted(
        (ln for ln in test if ln["classement"][0] != ln["sid"]),
        key=lambda ln: -ln["confiance"],
    )[:10]
    l_md += [
        "",
        "### 10 échecs (les plus confiants d'abord)",
        "",
        "| mot | vraie section | section prédite | rang de la vraie | confiance | même thème | recouvrement |",
        "|---|---|---|---|---|---|---|",
    ]
    for ln in echecs:
        a, b = ln["sid"], ln["classement"][0]
        p = (min(a, b), max(a, b))
        rec = []
        if partage[p]:
            rec.append(f"{partage[p]} mot(s) partagé(s)")
        if p in renv:
            rec.append("renvoi")
        rang = ln["classement"].index(a) + 1 if a in ln["classement"] else ">10"
        l_md.append(
            f"| **{ln['t']}** ({ln['r']}) | {sections[a].libelle} | {sections[b].libelle} | {rang} | "
            f"{ln['confiance']:.2f} | {'oui' if sections[a].cle == sections[b].cle else 'non'} | {', '.join(rec) or '—'} |"
        )
    with open(RESULTATS / f"echecs_{nom}.jsonl", "w", encoding="utf-8") as f:
        for ln in echecs:
            extra = {
                "requete": texte_requete(par_id[ln["id"]]),
                "predite": sections[ln["classement"][0]].libelle,
            }
            f.write(json.dumps({**ln, **extra}, ensure_ascii=False) + "\n")
    return l_md + [""]


def tracer(series: dict[str, list[dict]]) -> None:
    fig, ax = plt.subplots(figsize=(7, 4.5))
    for nom, lignes in series.items():
        x, y = courbe_fine(lignes)
        (ligne,) = ax.plot(
            x, y, label=f"{METHODES[nom]} (test, ordre de confiance)", alpha=0.5
        )
        c = courbe(lignes)
        ax.plot(
            [p["part_a_valider_test"] for p in c],
            [p["precision_auto"] for p in c],
            "o",
            color=ligne.get_color(),
            ms=4,
        )
    ax.set_xlabel(
        "part des mots envoyée « À valider » (points : seuils fixés sur le réglage)"
    )
    ax.set_ylabel("précision des mots rangés automatiquement")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1.02)
    ax.grid(alpha=0.3)
    ax.legend(fontsize=8, loc="lower right")
    ax.set_title("Précision du rangement automatique (200 mots de test)")
    fig.tight_layout()
    fig.savefig(RESULTATS / "courbe.png", dpi=130)


def main() -> None:
    sections, mots = charger()
    ctx = {
        "sections": sections,
        "par_id": {m.id: m for m in mots},
        "partage": partages(sections_par_mot(mots)),
        "renv": renvois(sections),
    }
    series = {n: ln for n in METHODES if (ln := lire(n))}
    lignes = ["# Point 5 — Résultats sur les 200 mots de test", ""]
    if "b" not in series:
        lignes += ["> Mesure B absente : `ANTHROPIC_API_KEY` n'était pas définie.", ""]
    for nom, ln in series.items():
        lignes += section_md(nom, ln, ctx)
    lignes += ["![courbe](courbe.png)", ""]
    tracer(series)
    ecrire_md("rapport.md", lignes)


if __name__ == "__main__":
    main()
