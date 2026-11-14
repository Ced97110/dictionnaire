# Test de mémorisation : relire, deviner la catégorie, ou retrouver le mot ?

Conçu d'après la lecture intégrale des sources (`../categories_sources.md`).

## Questions

1. **Deviner la catégorie d'Aristote** fait-il mieux retenir un mot que le relire ?
   (Appui seulement indirect, en rappel immédiat : Tresselt et Mayzner, Mandler.)
2. **Retrouver le mot à partir de sa définition** fait-il mieux retenir que relire ?
   (Appui fort : effet de test, génération de la cible.)
3. L'une des deux tâches bat-elle l'autre ? **C'est la question qui décide** de ce qu'on
   met dans le dictionnaire.

Critère de décision : la différence **à J7**. Un avantage seulement à J1, ou mesuré juste
après l'étude, ne compte pas (à 5 minutes, relire gagne : Roediger et Karpicke).

## Matériel

`mots.csv` : 21 noms (graine fixe, `tirer.py`), étiquette de catégorie jugée sûre, trois
listes de 7 (`L1`, `L2`, `L3`) : 5 substances, 4 qualités, 4 actions, 2 quantités, 2 lieux,
2 temps, 2 relations. Mélange voulu de mots transparents (*camaraderie*) et rares
(*haruspicy*) : l'effet est attendu presque nul sur les mots inconnus (non-mots : +1 point
dans les données McCurdy).

## Plan : intra-sujet, carré latin

| Groupe | Relire | Deviner la catégorie | Retrouver le mot |
|---|---|---|---|
| A | L1 | L2 | L3 |
| B | L2 | L3 | L1 |
| C | L3 | L1 | L2 |

## Déroulé

**Jour 0, séance unique (environ 25 min)**

1. *Étude* (21 mots, ordre aléatoire, 15 s chacun) : mot anglais, traduction, définition.
   Le lecteur coche **« je connaissais ce mot »** oui / non. Ne pas annoncer de test de
   mémoire : l'effet est plus net en apprentissage incident (Bertsch : d = 0,65 contre 0,32).
2. *Tâche intermédiaire* : 3 minutes de calcul mental (comme dans Roediger et Karpicke).
3. *Pratique* (mêmes 21 mots, conditions mélangées, **même durée, 20 s par mot**) :
   - **relire** : mot, traduction et définition affichés à nouveau ;
   - **deviner la catégorie** : mot et définition affichés ; le lecteur choisit parmi les 10
     catégories (fiche d'une page), puis voit la bonne réponse et son explication ;
   - **retrouver le mot** : définition seule ; le lecteur écrit le mot anglais, puis voit la
     bonne réponse.
   Noter les réponses : taux de réussite à la catégorie et au mot retrouvé.

**Jour 1 et jour 7 (environ 5 min chacun, sans prévenir du contenu)**

Rappel indicé, ordre aléatoire : définition masquée (`definition_fr_masquee`) → écrire le
mot anglais, puis sa traduction. Une lettre d'écart tolérée.

## Analyse

- Score par lecteur et par condition (sur 7), à J1 et à J7.
- Comparaisons appariées : catégorie contre relire, retrouver contre relire, catégorie
  contre retrouver ; taille d'effet d avec intervalle bootstrap.
- **Séparer mots connus et inconnus** (case cochée au jour 0) : c'est là que les sources
  prévoient la plus grande différence.
- Vérifier les taux de réussite pendant la pratique : Roediger et Karpicke supposent un
  effet fort quand la réussite initiale est élevée (≈ 70 % chez eux). Si moins de 40 % des
  catégories sont justes, la tâche est trop difficile, quel que soit son effet.
- **Ne pas** utiliser la satisfaction ou le sentiment de maîtrise des lecteurs : le groupe
  « relecture » de Roediger et Karpicke se croyait le mieux préparé et a eu le pire score.

## Taille d'échantillon

Comparaison appariée, 5 % bilatéral, 80 % de puissance : environ **35 lecteurs** pour
d = 0,5 ; **50** pour d = 0,4 ; **15** pour d = 0,8. Prévoir des multiples de 3 (carré
latin) et 10 à 15 % d'abandons entre J0 et J7. Avec 7 mots par condition, le score est
grossier : un effet modeste demandera le haut de la fourchette.

## Ce que ce test ne dira pas

- L'effet dans l'application réelle, où tous les mots seraient traités de la même façon
  (situation inter-sujets, environ deux fois plus faible : +6,4 contre +14,7 points dans
  les données McCurdy) et dans une très longue liste (+4,8 points au-delà de 50 éléments).
- L'effet de révisions espacées sur plusieurs semaines.

## Ce qu'il faut de votre part

Recruter les lecteurs, choisir le support (papier ou formulaire en ligne), faire passer
les trois séances, puis m'envoyer les réponses brutes : je calcule les scores et l'analyse.
