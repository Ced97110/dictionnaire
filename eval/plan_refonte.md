# Plan de refonte des sections et de la navigation

Statut : **proposition à valider ensemble.** Rien n'est exécuté ; `public/data` et
l'application n'ont pas changé. Chiffres : `resultats/inventaire_sections.csv`
(produit par `inventaire.py`), `resultats/plafond.md`, `resultats/synthese.md`.

## 0. Ce que montrent les données (et qui change le plan)

1. **Les 212 fiches ne sont pas des sections de classement.** Elles contiennent 7 mots
   chacune, et dans la fiche médiane aucun mot n'est retrouvé (taux d'erreur médian
   100 %, contre 44 % pour les 608 sections). Ce sont des leçons qui
   puisent leurs mots dans les thèmes. **La refonte porte sur 608 sections, pas 820.**
2. **Ressembler n'est pas être en double.** Le critère automatique « jumelles » (voisines
   mutuelles, cosinus ≥ 0,99, confusion dans les deux sens) retient 34 sections, dont
   *Football* / *Football américain*, *XVIe* / *XVIIe siècle*, *Tennis* / *Racquetball* :
   proches, mais distinctes. Aucune fusion ne peut donc être décidée par calcul.
3. **Le croisement « par sujet » / « par nature de mot » n'explique qu'une partie des
   jumelles.** Sur les 46 paires de jumelles mutuelles entre thèmes, 21 opposent deux
   natures (ex. 9 paires *Le corps et le monde physique* / *Les mots pour décrire*) ;
   25 sont de même nature, dont 9 à l'intérieur du volume logiciel et 8 dans les verbes.
4. **Trois sections aimantent les erreurs** : *Mots et expressions à connaître*
   (826 mots, 547 erreurs reçues), *Tempérament et comportement* (701, 740),
   *Formes particulières ou ressemblances* (405, 222).
5. **13,6 % des entrées ont déjà une seconde place légitime** (doublons + alias `al`).
   Un arbre à place unique contredit le dictionnaire tel qu'il est écrit.
6. **109 sections n'ont pas de note de portée** (description `d` vide).

## 1. Décisions de principe (à prendre avant toute réorganisation)

| # | Question | Options | Ma recommandation |
|---|---|---|---|
| D1 | Une place ou plusieurs ? | (a) place unique ; (b) **une section canonique + des renvois « voir aussi »** (polyhiérarchie, ISO 25964) | (b) : respecte les 13,6 % d'entrées à double place sans dupliquer les mots |
| D2 | Principe de découpage | (a) tout par sujet ; (b) tout par nature ; (c) **sujet d'abord, nature en filtre** | (c), à vérifier sur le pilote (constat 3 : ne règle que ~la moitié des jumelles) |
| D3 | Statut des fiches | (a) sections ; (b) **leçons séparées qui renvoient aux mots** | (b) : elles ne sont pas des cibles de rangement (constat 1) |
| D4 | Niveau `g` existant (ex. « Vêtements et mode ») | ignorer / **en faire le niveau de regroupement visible** | à décider après le pilote |

## 2. Triage des 608 sections (proposé par calcul, tranché à la lecture)

Verdicts de `inventaire.py` (règles en tête du script) :

| Verdict proposé | Sections | Ce qu'il faudra faire |
|---|---|---|
| garder | 326 | rien, sauf note de portée manquante |
| clarifier (frontière) | 201 | ≥ 50 % d'erreurs, dont ≥ 40 % vers *une* section : écrire la règle de partage |
| revoir (erreurs dispersées) | 256 | ≥ 50 % d'erreurs sans voisine dominante : souvent la note de portée, parfois le classeur |
| fusionner ? (jumelle) | 34 | lecture de 20 mots de chaque côté ; fusion seulement si aucune règle ne les sépare |
| scinder (fourre-tout) | 3 | redécouper par sens, pas par ordre alphabétique |

Ces nombres incluent les fiches dans la colonne « revoir/clarifier » ; après D3, ils
se recalculent sur les 608 sections seules.

**Règle pour chaque section gardée : une note de portée testable** — « Va ici : … /
Ne va pas ici : … → voir *Section X* », avec 2 contre-exemples tirés des mots réels.

## 3. Pilote sur un thème avant tout le reste

**Thème proposé : *Propriétés des choses*** (*Les mots pour décrire*). Il concentre les
trois problèmes : un fourre-tout (*Formes particulières*), des jumelles internes
(*Motifs* / *Surfaces et textures*, *Ordre et relation* / *Direction et orientation*) et
5 sections dont la plus proche voisine est dans un autre volume (*Taille et étendue* ↔
*Taille et quantité*, *Lumière* ↔ *Sensoriel et visuel*…) — il teste donc aussi D2.
17 sections, 2 305 mots.

Étapes du pilote :
1. figer la référence actuelle (taux d'erreur du thème, test d'arborescence avant) ;
2. lire les mots, écrire les notes de portée, proposer fusions/scissions ;
3. produire la table de migration du thème ; passer le script d'intégrité ;
4. mesurer : accord de deux annotateurs, test d'arborescence après, `eval/` rejoué ;
5. décider si la méthode s'étend aux 65 autres thèmes.

## 4. Ce que la refonte casse dans l'application

Lu dans `public/dictionnaire.js` (18,9 ko) :

| Élément | Usage | Impact d'une fusion / scission |
|---|---|---|
| `secs[].n[].e[]` et `fiches[].w[]` | index `BYID` de chaque mot | à reconstruire pour chaque thème modifié |
| **clés pas à pas `n.k`** | arbre de questions qui mène au mot (3 513 questions) | **le coût principal** : toute fusion ou scission de section invalide ses clés, à réécrire |
| `index.json` (chemin `thème › section › question`) | recherche | à régénérer depuis les fichiers de thème |
| `front.json` (`parts`, `qrep` : 3 714 lignes) | parcours guidé, onglet Questions | à régénérer |
| `defs_*.json` | recherche par le sens | inchangé si les identifiants de mot sont gardés |
| `e.ref`, `e.al` | renvois et autres emplois | deviennent les « voir aussi » de D1 |

Aucun lien profond ni `localStorage` : pas de lien externe ni de préférence utilisateur
à préserver. **Contrainte absolue : garder les identifiants de mot (`i`).**

## 5. Table de migration et script d'intégrité

- `migration.csv` : `id_mot, section_avant, section_apres, renvois_voir_aussi, decision, justification`.
- `integrite.py` (à écrire) échoue si : un des 34 385 identifiants manque ou apparaît
  deux fois comme canonique ; une section d'arrivée est vide ou sans note de portée ;
  un renvoi pointe vers une section inexistante ; un `ref` ou une clé `k` désigne un
  mot absent de sa section.
- Retour arrière : la table inverse doit reconstruire les fichiers actuels à l'octet près.

## 6. Interface (minimale, découle des décisions)

- Fiche d'un mot : section canonique + ligne « Voir aussi » (D1).
- Parcours guidé et onglet Thèmes : niveau `g` visible si D4 le retient.
- Fiches : entrée « Leçons » distincte (D3).
- Pas de nouvel écran tant que le pilote n'est pas validé.

## 7. Juges extérieurs (qui peuvent nous contredire)

| Juge | Réussi si |
|---|---|
| `integrite.py` | zéro erreur sur la table de migration |
| Test d'arborescence : 5 lecteurs, 20 mots, arbre nu, avant / après | réussite directe nettement supérieure après (à mesurer, pas à supposer) |
| Deux annotateurs, 100 mots, notes de portée | κ de Cohen ≥ 0,8 |
| `eval/` rejoué sur les mêmes 200 mots | la précision monte **sur les sections non fusionnées** (une fusion fait monter le score mécaniquement) |
| 50 mots nouveaux rangés par deux personnes | accord ≥ 80 % sur la section canonique |

Les trois derniers juges demandent des personnes autres que nous : je peux préparer
les fichiers, pas fournir les lecteurs.

## 8. Étapes et décisions

| Étape | Livrable | Réversible ? | Décision attendue de vous |
|---|---|---|---|
| 1 | Décisions D1–D4 | oui | les quatre choix du §1 |
| 2 | Pilote *Propriétés des choses* : notes de portée, migration, mesures | oui (table inverse) | valider ou corriger fusions/scissions du thème |
| 3 | Bilan du pilote | — | étendre, ajuster la méthode, ou arrêter |
| 4 | Extension thème par thème, fourre-tout en premier | oui, thème par thème | valider chaque lot |
| 5 | Régénération `index.json`, `front.json`, clés `k` ; adaptation de l'interface | oui (git) | relecture avant fusion de branche |

**Inconnues à lever** : le PDF source (*Le Dictionnaire Élargi de l'Invisible*)
n'a pas été consulté ; il peut contenir la logique de découpage d'origine. Le coût
réel de réécriture des clés `k` n'est pas estimé.
