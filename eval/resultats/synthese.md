# Synthèse — peut-on ranger un mot nouveau automatiquement ?

Chiffres détaillés : `plafond.md` (point 1) et `rapport.md` (point 5). La mesure B
n'a pas tourné : `ANTHROPIC_API_KEY` n'était pas définie.

## 1. Plafond : la sémantique n'est pas le problème, le recouvrement l'est

**Le « TF-IDF actuel » n'existait pas dans le dépôt** ; il a été reconstruit
(k = 20, vote par section). Sur les 29 667 mots mono-section, chacun retiré à son tour :

| | TF-IDF | e5 (sémantique) |
|---|---|---|
| Bonne section en tête | 59,6 % | 54,9 % |
| Dans les 3 premières | 78,4 % | 74,7 % |

**L'hypothèse « le TF-IDF échoue faute de sémantique » n'est pas confirmée** : un
modèle de plongements multilingue fait *moins bien*, et ses erreurs tombent sur les
mêmes paires de sections (7 des 10 paires les plus confondues sont communes).

Les erreurs viennent bien de sections qui se recouvrent, mais pas surtout au sens
étroit (mot partagé ou renvoi entre descriptions : 9 % des erreurs, contre 1,2 % au
hasard). Le recouvrement est surtout **thématique et transversal aux volumes** :

- 70 % des erreurs sortent du thème de la bonne section ;
- **418 des 820 sections ont leur plus proche voisine dans un autre thème**
  (*Plages et littoraux* ↔ *Terres et eaux*, *Navigation à voile* ↔ *Planche à voile*,
  *Termes d'architecture* ↔ *Parties des bâtiments*, *Coiffures* ↔ *Cheveux et coiffures*) ;
- 36 % (TF-IDF) à 41 % (e5) des erreurs tombent dans l'une des 5 sections les plus
  proches de la bonne, alors que le hasard donnerait 0,6 % ;
- deux sections fourre-tout aspirent les erreurs : *Mots et expressions à connaître*
  (707 mots) et *Tempérament et comportement* (699 mots) forment la première paire
  confondue avec les deux méthodes.

**Estimation du plafond.** Le dictionnaire place lui-même 1 279 intitulés sous
plusieurs sections et 2 049 entrées portent un autre sens rangé ailleurs : **13,6 %
des entrées ont déjà une seconde place légitime**. Mesurée contre une seule
section « vraie », une précision en tête au-delà d'environ 85–90 % n'est donc pas
attendue, quel que soit le classeur. Pour la mesure B, une autre borne est plus
dure : Haiku ne choisit qu'entre 3 candidates, donc sa précision en tête ne peut
dépasser le rappel du top 3 de la recherche (75 % avec e5 k = 30 au réglage,
78 % avec TF-IDF).

## 2–3. Mesure A sur les 200 mots de test

| | en tête [IC 95 %] | top 3 [IC 95 %] |
|---|---|---|
| A — e5 (k = 5, réglé) | 52,0 % [45,0 ; 59,0] | 67,5 % [61,0 ; 74,0] |
| TF-IDF k = 20 | 55,0 % [48,0 ; 62,0] | 77,0 % [71,0 ; 83,0] |

Les intervalles se chevauchent : sur 200 mots, A et TF-IDF ne se distinguent pas en
tête. Le top 3 de TF-IDF est meilleur. Verbes (6/6) et adjectifs (5/5 pour A)
échouent tous, mais sur trop peu de mots pour conclure.

## 10 échecs commentés (mesure A, puis référence TF-IDF)

1. **resectable** → *Interventions chirurgicales* au lieu de *Cancer et tumeurs*.
   La définition (« qui peut être retiré par chirurgie ») ne parle pas de tumeur. La
   prédiction est défendable ; la section est un choix éditorial.
2. **border-radius** → *termes CSS : mise en page* au lieu de *formes, typographie…*.
   Deux sections CSS sœurs ; la bonne arrive 2ᵉ. Frontière fine.
3. **MEMS** → *Ordinateurs* au lieu de *Termes d'électronique*. Même thème ; la bonne
   section n'est pas dans les 10 premières. Vrai échec du classeur.
4. **imbriqué** → *Propriétés des choses › Ordre et relation* au lieu de
   *La vie sociale › Liens et interactions*. La définition (« choses étroitement
   liées ») va plutôt vers la section prédite. Ici, c'est le rangement qui surprend.
5. **scours** → *Groupes d'animaux* au lieu de *Bétail*. **Défaut du masquage** : la
   traduction « diarrhée » est masquée et emporte le mot-clé de la définition.
6. **revocation** (A et TF-IDF) → *Sécurité applicative › cookies, sessions et jetons*
   au lieu de *Backend › authentification*. Deux volumes logiciels couvrent le même
   sujet ; recouvrement entre thèmes.
7. **coronal mass ejection** (A et TF-IDF) → *Sciences et technologies › Soleil* au
   lieu de *Le système solaire*. Section quasi homonyme dans un autre volume ; les
   deux classeurs se trompent pareil.
8. **daith / tragus piercing** → *Corps › Oreilles* au lieu de *Mode › Bijoux*. La
   définition décrit l'emplacement, pas le bijou. La bonne section est 2ᵉ.
9. **tom** (TF-IDF) → *Groupes d'animaux* au lieu de *Chats*. Les deux sections
   partagent déjà un mot ; la bonne est 3ᵉ.
10. **jibe** (TF-IDF) → *Planche à voile* au lieu de *Navigation à voile*. Les sections
    partagent 2 mots ; la manœuvre appartient légitimement aux deux.

Bilan : sur ces 10 cas, 1 vient du masquage (5), 1 ou 2 sont de vrais échecs du
classeur (3, peut-être 1), et les autres tombent sur des sections qui se recouvrent
ou sur un choix éditorial discutable. Aucun ne serait réglé par « plus de
sémantique ».

## Mesure B — conditions réelles (Haiku rédige la définition, puis choisit parmi 3 sections)

| sur les 200 mots de test | en tête [IC 95 %] | dans les 3 premières [IC 95 %] |
|---|---|---|
| A — définition existante | 52,0 % [45,0 ; 59,0] | 67,5 % [61,0 ; 74,0] |
| B — Haiku + e5 (k = 30) | 48,0 % [41,0 ; 55,0] | 61,0 % [54,5 ; 68,0] |

- B ne fait pas mieux que A : rédiger une définition sans connaître le dictionnaire perd
  un peu d'information, et Haiku ne peut choisir que parmi 3 candidates. Quand la bonne
  section est parmi les 3, Haiku la choisit environ 4 fois sur 5 (48 / 61).
- Courbe « À valider » de B (seuils du réglage appliqués au test) : 30 % en validation →
  59 % de justes ; 70 % → 80 % ; 84 % → 91 % ; 90 % → 95 % (21 mots seulement).
- **Objectif « ≥ 95 % avec au plus 20 % en validation » : hors d'atteinte**, avec A comme
  avec B ; 95 % n'apparaît qu'en envoyant environ 90 % des mots en validation. La cause
  principale est le plafond (sections qui se recouvrent, 13,6 % d'entrées déjà à deux places).
- Note technique : un premier passage de B a donné 6,5 % parce que Haiku 5.5 réfléchit avant
  de répondre et épuisait la limite de jetons (276 réponses vides). Corrigé : limites relevées,
  et une réponse vide fait désormais échouer la mesure au lieu d'être comptée.

## Seuil proposé (à décider)

Courbe : `courbe.png` ; seuils fixés sur les 100 mots de réglage, appliqués au test.

| Classeur | Seuil de confiance | Part « À valider » (test) | Précision des mots rangés seuls [IC 95 %] |
|---|---|---|---|
| A (e5, k = 5) | ≥ 0,60 (3 voisins sur 5 d'accord) | 67 % | 81,8 % [72,7 ; 90,9] |
| A (e5, k = 5) | ≥ 0,603 | 76 % | 87,5 % [77,1 ; 95,8] |
| TF-IDF k = 20 | ≥ 0,41 | 64,5 % | 83,1 % [74,6 ; 91,5] |
| TF-IDF k = 20 | ≥ 0,56 | 81 % | 89,5 % [78,9 ; 97,4] |

**Proposition** : viser une précision autour de 85 %, juste sous le plafond estimé.
Avec A, cela donne le seuil **confiance ≥ 0,60** : environ **deux mots sur trois
partent « À valider »**. Le tiers rangé seul l'est à environ 82 %, avec un intervalle
large (seulement 66 mots).

Tout gain de précision au-delà demande d'envoyer plus de 75 % des mots en
validation. Avec la mesure A, le rangement automatique ne soulage donc qu'un tiers
du travail. La mesure B et une fusion des sections jumelles entre volumes (voir
le point 1) sont les deux leviers à évaluer ensuite. C'est à toi de décider.

## Décision retenue (13 novembre 2026)

Après le comparatif Haiku / Sonnet / Opus (`pipeline.md`) : les modèles plus puissants gagnent
peu (48,5 %, 51,5 %, 53 %), car la bonne section n'est parmi les 10 candidates que 73 fois sur 100.

- **Haiku seul, avec filtre** : rangé automatiquement si Haiku est « très sûr » et d'accord avec le
  premier choix de TF-IDF. Mesuré : 24 % des mots à 87,5 % de justes (test), 34 % à 91,2 %
  [82,4 ; 100] sur les 100 mots de réglage, où la règle n'avait pas été choisie.
- **Tout le reste « À valider »**, avec 3 propositions ; la bonne section y figure environ 6 fois
  sur 10 (57,5 % test, 63 % réglage) : la personne qui valide devra parfois chercher ailleurs.
- Outil : `ranger.py`.
