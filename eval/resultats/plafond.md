# Point 1 — Plafond

## Mots placés sous plusieurs sections

- Mots distincts (minuscules) : 32 661
- Sous plusieurs **chemins** dans `index.json` : **1 291**
- Sous plusieurs **sections** (la cible) : **1 279** (3,9 % des mots) — 2 sections : 1 006, 3 sections : 192, 4 sections : 54, 5 sections : 22, 6 sections : 3, 7 sections : 1, 8 sections : 1
- Entrées portant un alias (`al`, autre sens rangé ailleurs, non compté dans l'index) : 2 049
- Paires de sections qui partagent au moins un mot : 1 926 ; paires reliées par un renvoi dans leur description : 144 ; total des paires « qui se recouvrent » : 2 064 sur 335 790 possibles.

## Classement par plus proches voisins (k = 20), un mot retiré à la fois

Requête : définition FR + EN + genre/différence, mot et traduction masqués. Corpus : tous les autres mots (mot, traduction, définition). Évalué sur les 29 667 mots présents dans une seule section.

| | TF-IDF | e5 (plongements) |
|---|---|---|
| Bonne section en tête | 59,6 % | 54,9 % |
| Bonne section dans les 3 premières | 78,4 % | 74,7 % |
| Erreurs dont la bonne section est dans le top 3 | 46,6 % | 43,9 % |
| Erreurs restées dans le même thème | 29,8 % | 29,0 % |
| Erreurs tombant sur une paire qui se recouvre | 8,9 % | 9,6 % |
| … attendu si la section fautive était tirée au hasard | 1,2 % | 1,3 % |
| … attendu au hasard parmi les sections du même thème | 6,7 % | 7,0 % |
| Erreurs intra-thème tombant sur une paire qui se recouvre | 19,5 % | 20,9 % |
| Part des erreurs dans les 10 paires les plus confondues | 3,8 % | 4,8 % |
| Part des erreurs dans le 1 % des paires les plus confondues | 11,1 % | 12,8 % |
| Nombre de paires confondues distinctes | 6477 | 6265 |

## Les 10 paires les plus confondues — tfidf

| # | Section A | Section B | erreurs (A→B / B→A) | taille A / B | mots partagés | renvoi |
|---|---|---|---|---|---|---|
| 1 | Parole, langue et écriture › Mots et expressions à connaître | Les personnes › Tempérament et comportement | 127 (85 / 42) | 707 / 699 | 0 | non |
| 2 | Corps, santé et médecine › Psychologie et psychiatrie | Les personnes › Tempérament et comportement | 50 (46 / 4) | 369 / 699 | 0 | non |
| 3 | Propriétés des choses › FORMES GÉNÉRALES | Propriétés des choses › FORMES PARTICULIÈRES OU RESSEMBLANCES | 48 (30 / 18) | 339 / 405 | 0 | non |
| 4 | Spectacle, cinéma et médias › Cinéma | Spectacle, cinéma et médias › Télévision | 39 (15 / 24) | 110 / 169 | 4 | non |
| 5 | Architecture, maison et mobilier › Termes d'architecture | Structures et espaces › Parties ou éléments des bâtiments et habitations | 36 (14 / 22) | 105 / 111 | 0 | non |
| 6 | Spectacle, cinéma et médias › Effets spéciaux et techniques de prise de vue | Spectacle, cinéma et médias › Télévision | 35 (18 / 17) | 60 / 169 | 0 | non |
| 7 | Loi, crime et sanction › Droit pénal et responsabilité délictuelle | Parole, langue et écriture › Mots et expressions à connaître | 32 (20 / 12) | 235 / 707 | 1 | non |
| 8 | Les personnes › États physiques et symptômes | Les personnes › Tempérament et comportement | 30 (22 / 8) | 180 / 699 | 0 | non |
| 9 | Fêtes, nourriture et boissons › Termes de cuisine française | Fêtes, nourriture et boissons › Plats du dîner | 29 (12 / 17) | 157 / 88 | 0 | non |
| 10 | Nature, terre et climat › Plages et littoraux | Terre, ciel et animaux › Terres et eaux | 27 (9 / 18) | 44 / 120 | 0 | non |

## Les 10 paires les plus confondues — e5

| # | Section A | Section B | erreurs (A→B / B→A) | taille A / B | mots partagés | renvoi |
|---|---|---|---|---|---|---|
| 1 | Parole, langue et écriture › Mots et expressions à connaître | Les personnes › Tempérament et comportement | 214 (193 / 21) | 707 / 699 | 0 | non |
| 2 | Corps, santé et médecine › Psychologie et psychiatrie | Les personnes › Tempérament et comportement | 107 (106 / 1) | 369 / 699 | 0 | non |
| 3 | Propriétés des choses › FORMES GÉNÉRALES | Propriétés des choses › FORMES PARTICULIÈRES OU RESSEMBLANCES | 54 (23 / 31) | 339 / 405 | 0 | non |
| 4 | Les personnes › États physiques et symptômes | Les personnes › Tempérament et comportement | 47 (38 / 9) | 180 / 699 | 0 | non |
| 5 | Parole, langue et écriture › Mots à propos des mots | Les personnes › Tempérament et comportement | 38 (37 / 1) | 178 / 699 | 0 | non |
| 6 | Spectacle, cinéma et médias › Cinéma | Spectacle, cinéma et médias › Télévision | 38 (8 / 30) | 110 / 169 | 4 | non |
| 7 | Voyages et transports › Navigation à voile | Voyages et transports › Navires et bateaux | 36 (3 / 33) | 125 / 50 | 1 | non |
| 8 | Loi, crime et sanction › Droit pénal et responsabilité délictuelle | Parole, langue et écriture › Mots et expressions à connaître | 35 (11 / 24) | 235 / 707 | 1 | non |
| 9 | Fêtes, nourriture et boissons › Termes de cuisine française | Fêtes, nourriture et boissons › Plats du dîner | 35 (5 / 30) | 157 / 88 | 0 | non |
| 10 | Corps, santé et médecine › Coiffures | Les personnes › Cheveux et coiffures | 33 (31 / 2) | 40 / 115 | 0 | non |

Matrices complètes : `confusion_<méthode>_sections.csv` (format long, 820 × 820 creux) et `confusion_<méthode>_themes.csv` (66 × 66, diagonale comprise).

