"""Pilot redesign of the theme "Propriétés des choses" (17 sections, 2,305 words).

Every move is an explicit rule on the word's genus (first item of `gd`), so the
whole migration is readable, reversible and reproducible. Nothing in public/data
is touched: the output is a table (migration.csv) and a measurement.

Usage (from eval/): python3 pilote/migration.py
"""

from __future__ import annotations

import csv
import sys
from collections import Counter
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI.parent))

from donnees import Mot, charger, sections_par_mot  # noqa: E402

THEME = "Propriétés des choses"
HORS_THEME = "→ hors du thème (destination à choisir)"

FP = "FORMES PARTICULIÈRES OU RESSEMBLANCES"
VIVANT = "Formes du vivant"
OBJETS = "Formes d'objets et de figures"

# Genera of FORMES PARTICULIÈRES that compare the shape to a living thing or one of its parts.
GENRES_VIVANT = {
    "forme d'organe", "forme de feuille", "forme de fruit", "forme de graine", "forme d'animal",
    "forme de poisson", "forme de fleur", "forme de main", "forme de plume", "forme de coquille",
    "forme de tige", "forme à lobes", "forme de bec", "forme de corne", "forme d'arbre",
    "forme de grappe", "partie de fleur", "relation à une famille de plantes", "forme de champignon",
    "forme de plante", "forme de doigt", "forme d'aile", "forme de dent", "forme de bulbe",
    "forme d'épi", "forme de poil", "forme de racine", "forme de gousse", "forme de bourgeon",
    "forme d'écorce", "forme de roseau", "forme de queue", "groupe de poissons", "forme d'organisme",
    "forme de corps", "forme de tête", "forme de crête", "forme de branchie", "forme d'articulation",
}  # fmt: skip

# (source section, genus) -> destination section. Applied before the split above.
DEPLACEMENTS: dict[tuple[str, str], str] = {
    # Motif = what a flat photo shows; Surface = what the hand feels.
    **{("MOTIFS", g): "Surfaces et textures" for g in (
        "surface rainurée", "surface creusée", "surface plissée", "surface trouée", "surface abîmée",
        "surface travaillée", "surface bosselée", "surface ridée", "structure en couches", "revêtement",
    )},
    **{("Surfaces et textures", g): "MOTIFS" for g in ("surface tachée", "surface colorée", "technique de peinture")},
    ("Bords", "surface abîmée"): "Surfaces et textures",
    ("Bords", "disposition en rangs"): "Ordre et relation",
    **{(FP, g): "Surfaces et textures" for g in ("surface de poils", "surface de fils", "consistance")},
    **{(FP, g): "Bords" for g in ("bord à franges", "bord découpé", "arête")},
    **{(FP, g): "MOTIFS" for g in ("motif de taches",)},
    **{(FP, g): "Ordre et relation" for g in ("disposition en rangées", "disposition croisée", "suite de maillons")},
    # Direction keeps angles and orientation; arrangement goes to Ordre, places to Position.
    **{("Direction et orientation", g): "Ordre et relation" for g in (
        "séparation", "division", "nombre de parties", "continuité", "mode de répartition",
        "multiplication", "partage égal", "interruption", "identité de position", "identité de valeur",
        "identité de forme", "identité de distance", "identité de taille",
    )},
    **{("Direction et orientation", g): "Position" for g in (
        "région du nord", "région du sud", "région de l'est", "région de l'ouest",
    )},
    **{("Ordre et relation", g): "Position" for g in ("position opposée", "position intermédiaire", "position latérale")},
    # Quantities out of Taille; changes of size leave the theme (subject: change).
    **{("Taille et étendue", g): "Quantités imprécises" for g in (
        "petite quantité", "grande quantité", "totalité", "partie d'un tout",
    )},
    **{("Taille et étendue", g): HORS_THEME for g in ("hausse", "baisse", "action d'agrandir")},
    # A colour modifier is still about colour: one section, two headings.
    **{("Modificateurs de couleur", g): "Couleurs" for g in (
        "intensité d'une couleur", "aspect d'une couleur", "désaccord entre couleurs", "excès d'une couleur",
        "luminosité d'une couleur", "affaiblissement d'une couleur", "degré de mélange d'une couleur",
        "éclat d'une couleur", "couleur fluorescente", "défaut d'une couleur",
        "répartition d'une couleur sur une surface", "température d'une couleur",
    )},
}  # fmt: skip

# Whole sections that leave the theme (D2: subject first): symbols are objects, not properties.
SECTIONS_SORTANTES = {"EMBLÈMES ET SYMBOLES COURANTS"}
FUSIONS = {"Modificateurs de couleur": "Couleurs"}


def destination(section: str, genre: str) -> tuple[str, str]:
    """Return (destination section, rule name)."""
    if section in SECTIONS_SORTANTES:
        return HORS_THEME, "section sortante (objets, pas propriétés)"
    if (section, genre) in DEPLACEMENTS:
        return DEPLACEMENTS[(section, genre)], f"genre « {genre} »"
    if section in FUSIONS:
        return FUSIONS[section], "fusion"
    if section == FP:
        return (
            (VIVANT, "scission : vivant")
            if genre in GENRES_VIVANT
            else (OBJETS, "scission : objets et figures")
        )
    return section, "inchangé"


def migrer() -> list[dict[str, str]]:
    sections, mots = charger()
    places = sections_par_mot(mots)
    nom = {s.sid: s.nom for s in sections}
    lignes = []
    for m in mots:
        if sections[m.sid].theme != THEME:
            continue
        genre = (m.gd[0] if m.gd else "").strip().lower()
        apres, regle = destination(nom[m.sid], genre)
        autres = sorted(sections[s].libelle for s in places[m.cle_mot] if s != m.sid)
        voir = [*autres]
        if apres not in (nom[m.sid], HORS_THEME) and regle.startswith("genre"):
            voir.append(
                f"{THEME} › {nom[m.sid]}"
            )  # keep a link to where readers knew it
        lignes.append({
            "id": m.id, "mot": m.t, "genre": genre, "section_avant": nom[m.sid],
            "section_apres": apres, "regle": regle, "voir_aussi": " | ".join(voir),
        })  # fmt: skip
    return lignes


def integrite(lignes: list[dict[str, str]], mots: tuple[Mot, ...]) -> list[str]:
    """Problems that must be zero before anything is applied."""
    problemes = []
    attendus = {m.id for m in mots if charger()[0][m.sid].theme == THEME}
    ids = Counter(row["id"] for row in lignes)
    problemes += [f"identifiant en double : {i}" for i, k in ids.items() if k > 1]
    problemes += [f"identifiant manquant : {i}" for i in attendus - set(ids)]
    taille = Counter(row["section_apres"] for row in lignes)
    avant = {row["section_avant"] for row in lignes}
    for s in avant - set(taille) - set(FUSIONS) - SECTIONS_SORTANTES - {FP}:
        problemes.append(f"section vidée sans décision : {s}")
    for s, k in taille.items():
        if s != HORS_THEME and k < 10:
            problemes.append(f"section trop petite après migration : {s} ({k} mots)")
    return problemes


def main() -> None:
    _, mots = charger()
    lignes = migrer()
    with open(ICI / "migration.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(lignes[0]))
        w.writeheader()
        w.writerows(lignes)
    print(
        f"{len(lignes)} mots ; déplacés : {sum(r['section_apres'] != r['section_avant'] for r in lignes)}"
    )
    for (a, b), k in Counter(
        (r["section_avant"], r["section_apres"])
        for r in lignes
        if r["section_avant"] != r["section_apres"]
    ).most_common():
        print(f"  {k:4d}  {a}  →  {b}")
    print(
        "tailles après :",
        dict(Counter(r["section_apres"] for r in lignes).most_common()),
    )
    p = integrite(lignes, mots)
    print("intégrité :", "aucun problème" if not p else p)


if __name__ == "__main__":
    main()
