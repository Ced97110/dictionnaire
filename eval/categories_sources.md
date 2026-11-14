# Mémorisation : ce que disent les sources, lues en entier

Mise à jour du 13 novembre 2026. État de lecture :

| Source | Lu | Comment |
|---|---|---|
| Roediger et Karpicke (2006), *Psychological Science* 17, 249–255 | **intégral** | PDF |
| Bertsch, Pesta, Wiscott et McDaniel (2007), *Memory & Cognition* 35, 201–210 | **intégral** | PDF |
| Craik et Lockhart (1972), *J. Verbal Learning and Verbal Behavior* 11, 671–684 | **intégral** | PDF (copie wixtedlab.ucsd.edu) |
| McCurdy et al. (2020), *Psychonomic Bulletin & Review* 27, 1139–1165 | **article non lu** (payant) ; **données brutes analysées** | `dat.mccurdy2020`, paquet R *metadat* : 126 articles, 849 comparaisons générer/lire |
| Bower, Clark, Lesgold et Winzenz (1969), *JVLVB* 8, 323–343 | **non lu** | toutes les copies refusées (404, 403, paywall) ; seul le résumé est connu |

## Les petits détails qui changent tout

### 1. Ce qui fait retenir, c'est de retrouver **le mot lui-même**, pas une information sur lui

- **Bertsch 2007** : dans les 86 études, on génère toujours la *cible* (ou une partie).
  La règle « catégorie » de la méta-analyse consiste à produire un mot à partir de sa
  catégorie, jamais à deviner la catégorie d'un mot. **Aucune étude ne couvre
  « deviner la catégorie ».** Générer la cible entière : d = 0,55 ; une partie : d = 0,32 (p. 204).
- **Roediger et Karpicke 2006** : leur explication principale est le *transfer-appropriate
  processing* : « The ability to remember a prose passage on a free-recall test a week after
  learning it is enhanced by practicing exactly this skill during learning » (p. 254).
  Pour retenir un mot, il faut s'entraîner à **retrouver ce mot**.
- **Données McCurdy** : générer le mot **à partir de sa définition** donne l'écart le plus
  grand de toutes les relations codées, **+21 points** de rappel [IC 95 % : +10 ; +28].
  Mais 4 articles seulement, tous intra-sujet, listes de 8 à 12 mots, presque tous en test immédiat.

### 2. Juger l'appartenance à une catégorie aide, mais pas toujours

- **Craik et Lockhart 1972, p. 677** : juger « à quel point le mot est un exemple du concept
  *économique* » donne un rappel **4 fois supérieur** à barrer les voyelles, 2 fois supérieur
  à recopier (Tresselt et Mayzner 1960). Classer des mots sans intention d'apprendre donne
  le **même rappel** que vouloir les apprendre (Mandler 1967). C'est l'appui le plus direct
  pour « deviner la catégorie ».
- **Même page et p. 678** : des tâches toutes sémantiques n'ont pas aidé autant
  (Wicker et Bernstein 1969) ; une tâche sémantique peut **empêcher** l'élaboration utile
  au rappel (Eagle et Leiter 1964). « Identical orienting tasks do not seem to have equivalent
  effects across different paradigms. » L'utile dépend du test final.
- Ces études mesurent un rappel **immédiat** ou presque ; aucune à plusieurs jours.

### 3. Le mot doit déjà avoir un sens pour le lecteur

- **Bertsch** : non-mots, d = 0,05 (p. 204). **Données McCurdy** : non-mots, **+1 point**
  [−2 ; +3], contre +13 pour des mots.
- **Craik et Lockhart, p. 680** : « using unfamiliar words, inhibits or prevents processing
  to those levels necessary to support long-term retention ».
- Pour le dictionnaire : *haruspicy*, *haptephobia* sont, pour beaucoup de lecteurs, proches
  de non-mots. **Le gain attendu est le plus faible précisément sur les mots rares.**

### 4. L'effet réel est environ deux fois plus petit que dans les expériences

- **Intra-sujet contre inter-sujets** : Bertsch d = 0,50 contre 0,28 ; données McCurdy
  **+14,7 contre +6,4 points**. Dans une application, *tous* les mots sont traités de la même
  façon : c'est la situation inter-sujets, la plus faible.
- **Listes mélangées contre pures** : McCurdy +15,0 contre +9,4 points.
- **Longueur de la liste** : Bertsch, plus de 50 éléments, d = 0,09 (contre 0,60 pour 25 ou
  moins) ; McCurdy **+4,8 contre +14,4 points**. Un dictionnaire est une très longue liste.
- **Apprentissage voulu** : Bertsch, intentionnel d = 0,32 contre incident 0,65 ; McCurdy
  +11,4 contre +14,8. Un lecteur qui *veut* apprendre en tire moins.

### 5. En différé, l'avantage tient — et seulement en différé

- **Roediger et Karpicke** : à 5 minutes, relire bat le test (81 % contre 75 %) ; à 2 jours,
  le test gagne (68 % contre 54 %, d = 0,95) ; à 1 semaine, 56 % contre 42 % (exp. 1) et
  61 % contre 40 % (exp. 2), **sans aucun retour sur les réponses**. Le groupe testé à
  1 semaine se souvient autant que le groupe « relecture » à 2 jours.
- **Bertsch** : délai de plus d'un jour, d = 0,64, mais 30 effets seulement (p. 205).
  **McCurdy** : délai « long », +16,8 points [+11 ; +22], 17 articles.
  *(La définition exacte de « long » est dans l'article non lu.)*
- **Piège à éviter** : les lecteurs du groupe « relecture » se croyaient **mieux** préparés
  (4,8 sur 7 contre 4,0) et ont fait le **pire** score (Roediger et Karpicke, tableau 2).
  **La satisfaction des lecteurs n'est pas une mesure de mémorisation.**
- Roediger et Karpicke supposent que l'effet est fort quand le test vient tôt après
  l'apprentissage et que **le taux de réussite initial est élevé** (environ 70 % dans leurs
  expériences).

## Conséquences pour le dictionnaire

1. **Afficher la catégorie** : aucun appui.
2. **Faire deviner la catégorie** : appui indirect (Tresselt et Mayzner, Mandler), en
   rappel immédiat seulement ; non couvert par les méta-analyses.
3. **Faire retrouver le mot à partir de sa définition** : l'appui le plus fort
   (génération de la cible, effet de test, correspondance avec le rappel réel), et
   l'avantage tient à plusieurs jours.
4. **Ordre de grandeur réaliste** dans une application : quelques points de rappel
   (inter-sujets, longues listes), pas les +15 à +20 des expériences de laboratoire, et
   presque rien sur les mots que le lecteur ne connaît pas du tout.

## Liens

- [Roediger et Karpicke 2006 (PDF)](https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf)
- [Bertsch et al. 2007 (PDF)](https://mcdaniel97.github.io/Publications/Bertsch%20et%20al.%202007.pdf)
- [Craik et Lockhart 1972 (PDF)](https://wixtedlab.ucsd.edu/publications/Psych%20218/Craik_Lockhart_1972.pdf)
- [McCurdy et al. 2020](https://link.springer.com/10.3758/s13423-020-01762-3) · [données `dat.mccurdy2020`](https://wviechtb.github.io/metadat/reference/dat.mccurdy2020.html)
- [Bower et al. 1969 (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S0022537169801246)
