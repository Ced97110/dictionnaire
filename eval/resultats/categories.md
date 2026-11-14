# Catégories d'Aristote — mesure

Étiquettes de premier passage (modèle), à faire vérifier : voir `categories_guide.md`.

## Couverture

- Mots : 34 385 ; étiquetés par le genre : 7 012 ; par le type de question : 18 352 ; sans source : 9 021.
- Étiquettes jugées sûres : 4 508 (13,1 %).

| catégorie | mots | part |
|---|---|---|
| substance | 12 544 | 36,5 % |
| quantité | 794 | 2,3 % |
| qualité | 3 449 | 10,0 % |
| relation | 286 | 0,8 % |
| lieu | 1 649 | 4,8 % |
| temps | 372 | 1,1 % |
| position | 40 | 0,1 % |
| possession | 0 | 0,0 % |
| action | 5 013 | 14,6 % |
| passion | 99 | 0,3 % |
| hors catégorie (mot sur le langage) | 1 118 | 3,3 % |
| indéterminé | 9 021 | 26,2 % |

## Information apportée

- Entropie des 10 catégories (mots de catégorie connue) : 2.00 bits, sur un maximum de 3.32.
- Entropie restante quand on connaît la section : 0.95 bits. La section détermine donc déjà 52,6 % de la catégorie.

## Les catégories séparent-elles les sections jumelles ?

Divergence de Jensen-Shannon entre les profils de catégories des deux sections (0 = même profil, 1 = profils disjoints).

| paires | nombre | divergence médiane | part des paires avec la même catégorie dominante |
|---|---|---|---|
| fusionner | 16 | 0.06 | 93,8 % |
| clarifier | 112 | 0.40 | 56,2 % |

## Effet sur le rangement (oracle, 200 mots de test)

Si l'on connaissait la catégorie exacte du mot et qu'on écartait les sections candidates dont la catégorie dominante diffère :

| mesure | bonne section en tête avant | après | réponses modifiées |
|---|---|---|---|
| a | 52,0 % | 49,0 % | 28 / 200 |
| tfidf | 55,0 % | 52,0 % | 43 / 200 |

