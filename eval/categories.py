"""Aristotle's ten categories (Categories 4, 1b25), assigned per word.

Source of a word's category, in order:
  1. its genus (first item of `gd`) if the genus is in GENRES (300 most frequent);
  2. otherwise its question type (`qt`) if QT maps it without ambiguity;
  3. otherwise "indéterminé".
These labels are a first pass by the model, to be checked by two human
annotators (see categories_guide.md); `sur` marks the debatable ones.
"""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache

from donnees import DONNEES, charger

CATEGORIES = (
    "substance",
    "quantité",
    "qualité",
    "relation",
    "lieu",
    "temps",
    "position",
    "possession",
    "action",
    "passion",
)
HORS = "hors catégorie (mot sur le langage)"
IND = "indéterminé"

# Question type -> category, only when the type is unambiguous.
QT: dict[int, str] = {
    1: "substance",  # who: people, roles, groups
    2: "substance",  # living things, species
    3: "substance",  # objects, tools
    4: "substance",  # parts of a whole (parts of substances; Cat. 5, reference not verified)
    6: "substance",  # materials, foods
    7: "lieu",
    8: "temps",
    9: "quantité",
    10: "action",
    12: "qualité",  # states, emotions, character, diseases (Cat. 8; reference not verified)
    15: HORS,
    # 5 (kinds), 11 (why), 13 (events), 14 (ideas, rules): ambiguous
}

S, Q, QL, R, L, T, POS, A, P = (
    "substance",
    "quantité",
    "qualité",
    "relation",
    "lieu",
    "temps",
    "position",
    "action",
    "passion",
)
# genus -> (category, sure?)  False = debatable, to be decided by annotators.
GENRES: dict[str, tuple[str, bool]] = {
    "adjectif": (IND, True), "verbe": (IND, True), "pays": (S, False), "personne": (S, True),
    "opération": (A, True), "action": (A, True), "artère": (S, True), "mesure": (A, False),
    "état": (IND, True), "relation à un animal": (R, False), "processus": (A, False),
    "expression": (HORS, False), "phobie": (QL, True), "robe": (S, True), "divination": (A, True),
    "garniture « à la … »": (S, False), "science": (QL, False), "abréviation": (HORS, True),
    "propriété css": (QL, False), "qualité": (QL, True), "doctrine": (QL, False), "cocktail": (S, True),
    "relation à un mammifère": (R, False), "message radio": (HORS, True), "outil": (S, True),
    "principe": (IND, True), "substance": (S, True), "constellation australe": (S, True),
    "médicament": (S, True), "indication de caractère": (QL, True), "pratique": (A, False),
    "coiffure": (QL, False), "mouvement": (IND, True), "abréviation de messagerie": (HORS, True),
    "spécialité médicale": (QL, False), "nerf": (S, True), "soupe": (S, True), "technique": (A, False),
    "groupe": (S, False), "manteau": (S, True), "petit": (S, True), "liqueur": (S, True),
    "style de mode": (QL, True), "ornement": (S, False), "instrument": (S, True),
    "phénomène": (IND, True), "infraction": (A, False), "femelle": (S, True), "modèle": (IND, True),
    "expression du visage": (QL, True), "courant": (QL, False), "programme": (IND, True),
    "méthode": (A, False), "obligation": (R, False), "appareil": (S, True), "manie": (QL, True),
    "barbe": (QL, False), "faute": (A, False), "veine": (S, True), "lieu": (L, True), "vent": (S, False),
    "désignation de missile": (S, True), "document": (S, True), "plan": (IND, True),
    "situation": (IND, True), "ressemblance avec un animal": (QL, True), "structure de données": (S, False),
    "mâle": (S, True), "groupe d'animaux": (Q, False), "jeu de mots": (HORS, True),
    "inflammation": (P, False), "art": (QL, False), "trouble": (QL, True), "stratégie": (A, False),
    "arme": (S, True), "test": (A, True), "biscuit": (S, True), "forme d'organe": (QL, True),
    "défaut": (QL, False), "ordre": (IND, True), "texte": (S, False), "ablation chirurgicale": (A, True),
    "passe": (A, True), "style de maison": (QL, True), "col": (S, True), "gâteau": (S, True),
    "nuance de rouge": (QL, True), "marbre": (S, True), "discipline": (QL, False), "période": (T, True),
    "ensemble": (Q, False), "pain": (S, True), "partie d'église": (S, True), "règle": (IND, True),
    "système": (IND, True), "organisation": (S, False), "logiciel": (S, False), "plante": (S, True),
    "muscle": (S, True), "chapeau": (S, True), "boisson de café": (S, True), "pinceau": (S, True),
    "qualificatif": (IND, True), "acte": (A, True), "véhicule": (S, True),
    "constellation boréale": (S, True), "traitement": (A, True), "surnom d'ecstasy": (S, True),
    "algorithme": (A, False), "bière": (S, True), "vin": (S, True), "avion de chasse": (S, True),
    "matériau": (S, True), "propriété": (QL, True), "insulte": (HORS, False), "attitude": (QL, True),
    "attaque": (A, True), "jupe": (S, True), "effet": (P, False), "motif": (IND, True),
    "maladie": (QL, False), "colère": (QL, True), "peur": (QL, True), "accord": (R, False),
    "capacité": (QL, True), "valeur": (QL, False), "nuage": (S, True), "paraphilie": (QL, True),
    "bijou": (S, True), "split": (POS, False), "robe traditionnelle": (S, True),
    "taille de pierre": (QL, True), "plat de viande": (S, True), "monnaie": (S, False),
    "droit": (R, False), "milieu de vie": (L, True), "liste": (S, False), "dispositif": (S, True),
    "marché": (L, False), "métal de transition": (S, True), "cheval": (S, True), "hormone": (S, True),
    "unité de longueur": (Q, True), "arbre": (S, False), "mot": (HORS, True), "tissu": (S, True),
    "pièce de moteur": (S, True), "lancer de baseball": (A, True), "moustache": (QL, False),
    "regard": (QL, False), "position": (POS, False), "nom": (HORS, True), "baisse": (P, False),
    "théorie": (QL, False), "contrat": (R, False), "femme": (S, True), "méthode de datation": (A, True),
    "émission de lumière": (A, False), "groupe d'oiseaux": (Q, False), "dinosaure": (S, True),
    "fenêtre": (S, True), "livre": (S, True), "trouble du sommeil": (QL, True), "transition": (IND, True),
    "chaîne": (S, False), "tissu léger": (S, True), "projecteur": (S, True),
    "mouvement artistique": (QL, False), "image": (S, False), "point": (L, False),
    "forme du visage": (QL, True), "forme du nez": (QL, True), "désordre": (QL, False),
    "comportement": (A, False), "quantité": (Q, True), "masse": (Q, True), "fonction": (IND, True),
    "rapport sexuel": (A, True), "partie du corps": (S, True), "en-tête http": (S, False),
    "clé": (S, False), "tir": (A, True), "partie de piste": (L, True), "porte": (S, True),
    "tissu épais": (S, True), "machine agricole": (S, True), "forme de récipient": (QL, True),
    "forme": (QL, True), "douleur": (P, False), "officier": (S, True), "lien": (R, True),
    "vêtement": (S, True), "réseau": (S, False), "café": (S, False), "pâtisserie": (S, True),
    "surnom de cocaïne": (S, True), "accessoire": (S, True), "pince": (S, True),
    "examen d'imagerie": (A, True), "coup de tennis": (A, True), "botte": (S, True),
    "lunettes": (S, True), "gemme": (S, True), "dessert": (S, True), "missile": (S, True),
    "arme d'hast": (S, True), "forme de croissant": (QL, True), "lien entre choses": (R, True),
    "défaut de peinture": (QL, False), "calme": (QL, True), "mauvaise odeur": (QL, True),
    "tristesse": (QL, True), "protection": (A, False), "agent": (S, True), "surnom": (HORS, False),
    "gain": (Q, False), "entreprise": (S, False), "nombre": (Q, True), "navire": (S, True),
    "code d'état http": (HORS, False), "ordinateur": (S, True), "mélange de drogues": (S, True),
    "surnom d'amphétamine": (S, True), "figure de style": (HORS, True), "titre de presse": (S, False),
    "action défensive": (A, True), "balle frappée": (A, False), "état de piste": (IND, True),
    "rotation": (A, True), "coup de racquetball": (A, True), "pièce de maison romaine": (L, False),
    "coiffe": (S, True), "minéral": (S, True), "forme de feuille": (QL, True),
    "indication de tempo": (QL, False), "voiture à cheval": (S, True), "partie de coque": (S, True),
    "support": (S, True), "indicateur": (Q, False), "conflit": (A, False), "zone": (L, True),
    "séparation": (A, False), "activité": (A, True), "culture": (IND, True),
    "ressemblance avec un mammifère": (QL, True), "régime végétal": (QL, False), "partie": (R, False),
    "service": (S, False), "manœuvre": (A, True), "chaussure": (S, True), "durée": (T, True),
    "lanthanide": (S, True), "actinide": (S, True), "race bovine à viande britannique": (S, True),
    "drogue": (S, True), "surnom d'héroïne": (S, True), "abréviation de renvoi": (HORS, True),
    "pull": (S, True), "balise html": (HORS, False), "plat de volaille": (S, True), "thé": (S, True),
    "navire de guerre": (S, True), "épée": (S, True), "saut de ballet": (A, True), "cuivre": (S, True),
    "quadrilatère": (QL, True), "représentation": (S, False), "dessin": (S, False), "fracture": (P, False),
    "excès": (QL, False), "réserve": (QL, True), "pouvoir": (R, False), "organe": (S, True),
    "droits": (R, False), "sentiment": (QL, True), "qualité d'un paysage": (QL, True),
    "régime carné": (QL, False), "locution latine": (HORS, False), "arme à feu": (S, True),
    "sigle": (HORS, True), "message": (HORS, False), "signal": (IND, True), "mélange": (S, True),
    "praticien de magie": (S, True), "objet de rituel": (S, True), "surnom de cannabis": (S, True),
    "expression de louange": (HORS, True), "son": (QL, False), "terrain": (L, False), "coupe": (QL, False),
    "mécanisme de défense": (A, False), "direction": (L, False),
    "opération de gestion d'erreur": (A, True), "commande git": (A, True),
    "principe de design": (IND, True), "avion": (S, True), "taux": (Q, True), "dague": (S, True),
    "scie à main": (S, True), "attaque par injection": (A, True),
}  # fmt: skip


@dataclass(frozen=True)
class Etiquette:
    categorie: str
    source: str  # "genre", "type de question" or "aucune"
    sure: bool


def etiqueter(genre: str, qt: int | None) -> Etiquette:
    g = genre.strip().lower()
    if g in GENRES and GENRES[g][0] != IND:
        cat, sur = GENRES[g]
        return Etiquette(cat, "genre", sur)
    if qt in QT:
        return Etiquette(QT[qt], "type de question", False)
    return Etiquette(IND, "aucune", False)


@lru_cache(maxsize=1)
def par_mot() -> dict[str, Etiquette]:
    """Category of every section word, keyed by word id (fiche words: genus only)."""
    out: dict[str, Etiquette] = {}
    for cle in sorted({s.cle for s in charger()[0]}):
        d = json.loads((DONNEES / f"t{cle}.json").read_text(encoding="utf-8"))
        for s in d["secs"]:
            for n in s["n"]:
                for e in n["e"]:
                    if e.get("i"):
                        out[e["i"]] = etiqueter((e.get("gd") or [""])[0], n.get("qt"))
        for f in d["fiches"]:
            for e in f["w"]:
                out[e["i"]] = etiqueter((e.get("gd") or [""])[0], None)
    return out


def repartition() -> Counter:
    return Counter(e.categorie for e in par_mot().values())
