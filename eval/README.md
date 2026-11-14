# Évaluation : ranger automatiquement un mot nouveau dans la bonne section

Ce dossier mesure si un mot nouveau peut être rangé automatiquement dans la bonne
**section** (820 cibles : 608 sections non vides et 212 fiches). Il ne modifie ni
l'application ni `public/data/` : il lit seulement les données.

## Lancer

Depuis `eval/` (Python 3.12 ; numpy, scipy, scikit-learn, onnxruntime, tokenizers,
huggingface_hub, matplotlib, anthropic) :

```bash
python3 jeu_test.py      # point 2 : tire les 300 mots (graine fixe)
python3 plafond.py       # point 1 : doublons, confusion TF-IDF et e5, recouvrements (≈ 70 min la première fois)
python3 mesure_a.py      # point 3 : mesure A, sans clé
ANTHROPIC_API_KEY=… python3 mesure_b.py   # point 4 : mesure B, avec Haiku
python3 rapport.py       # point 5 : résultats sur les 200 mots de test
python3 -m pytest -q     # tests unitaires
```

Le premier lancement télécharge `Xenova/multilingual-e5-small` (fichier ONNX quantifié
int8, 118 Mo) dans le cache Hugging Face. Les vecteurs calculés sont gardés dans
`eval/cache/` (ignoré par git).

## Fichiers

| Fichier | Rôle |
|---|---|
| `donnees.py` | Charge les fichiers de thème en deux listes : les 820 sections (identifiées par thème + position, car certains noms de fiche et de section se répètent dans un thème) et les 34 385 mots. Construit aussi les textes : la *requête* (définition FR + EN + genre/différence, avec le mot et sa traduction masqués par « … ») et le *corpus* (mot, traduction, définition). |
| `plongements.py` | Encodeur local `multilingual-e5-small` (ONNX int8, préfixes `query:` / `passage:`, moyenne des jetons, vecteurs normalisés), avec cache disque. |
| `classement.py` | Le classeur commun : les k plus proches voisins par cosinus, puis vote par section pondéré par la similarité. La **confiance** est la part du vote obtenue par la section gagnante. Contient aussi le bootstrap (intervalle à 95 %, percentiles, 5 000 tirages). |
| `plafond.py` | Point 1. Compte les mots placés sous plusieurs chemins et sous plusieurs sections, classe chacun des 29 667 mots mono-section en le retirant du corpus (TF-IDF k = 20, puis e5 k = 20), écrit les matrices de confusion et les 10 paires les plus confondues, et teste si les erreurs tombent sur des sections qui se recouvrent. |
| `jeu_test.py` | Point 2. Tire 300 mots mono-section (graine 20261113) : 100 de réglage, 200 de test. Écrit `jeu_test.json`. |
| `jeu_test.json` | Les 300 mots tirés : identifiant, mot, traduction, section cible, jeu (`reglage` ou `test`). |
| `mesure_a.py` | Point 3. Retire les 300 mots du corpus, les classe à partir de leur définition masquée (e5, k choisi sur les 100 mots de réglage parmi 5, 10, 20, 30 et 50). Lance aussi TF-IDF k = 20 sur les mêmes mots, pour comparer. |
| `mesure_b.py` | Point 4. Haiku reçoit le mot et sa traduction, rédige une définition ; e5 propose les 3 meilleures sections (k réglé pour le top 3, `k_top3`) ; Haiku choisit. S'arrête avec un message si `ANTHROPIC_API_KEY` manque. Les réponses sont gardées dans `cache/haiku.jsonl`. Modèle réglable par `HAIKU_MODELE` (par défaut `claude-haiku-5-5`). |
| `rapport.py` | Point 5. Sur les 200 mots de test : bonne section en tête et dans le top 3 avec intervalle bootstrap ; courbe « À valider » (seuils de confiance fixés sur le réglage puis appliqués au test) ; erreurs par nature de mot, par forme et par thème ; les 10 échecs les plus confiants. |
| `inventaire.py` | Une ligne par section : taille, plus proche voisine, taux d'erreur, principale fuite, erreurs reçues et un verdict *proposé* (garder, clarifier, revoir, fusionner ?, scinder). Écrit `resultats/inventaire_sections.csv`. |
| `plan_refonte.md` | Plan de refonte des sections et de la navigation, à valider : constats, décisions de principe, pilote, migration, juges. |
| `categories.py` | Les 10 catégories d'Aristote : correspondance avec les 15 types de question, étiquette des 300 genres les plus fréquents (avec « sûr » ou « discutable »), étiquette de chaque mot (genre d'abord, type de question en repli). Premier passage du modèle, à faire vérifier. |
| `categories_mesure.py` | Couverture et répartition des catégories, information apportée par rapport aux sections, séparation des sections jumelles, effet d'un filtre par catégorie sur le rangement. Écrit `resultats/categories.md`. |
| `categories_guide.md` | Guide d'annotation : texte de *Catégories* 4 (1b25, trad. Ackrill), arbre de décision, correspondance avec les types de question. |
| `categories_sources.md` | Ce que les études sur la mémoire permettent d'affirmer, ou non, après lecture intégrale de trois articles et réanalyse des données brutes de McCurdy et al. (2020). |
| `sources_mccurdy.py` | Réanalyse des données brutes de McCurdy et al. (2020) : écart de rappel « générer » contre « lire » par modérateur, bootstrap par article. |
| `test_memorisation/` | Protocole du test de mémorisation à trois conditions — relire, deviner la catégorie, retrouver le mot (`protocole.md`) —, les 21 mots (`mots.csv`) le script qui les tire (`tirer.py`, graine fixe) et la page web du test (`page.html`, publiée sur claude.ai ; les réponses arrivent dans la collection `reponses`). |
| `categories_verification/` | Vérification des catégories avant tout affichage sur le site : `tirer.py` tire 200 mots (graine fixe, répartis par source d'étiquette et par catégorie) ; `feuille_annotateur.csv` est la feuille à l'aveugle que remplissent deux annotateurs ; `echantillon.csv` garde mes étiquettes, à ne pas leur montrer ; `accord.py` calcule le κ entre annotateurs et la justesse de mes étiquettes par source. |
| `pilote/` | Essai de refonte sur le thème *Propriétés des choses* : `migration.py` applique des règles explicites par genre (déplacements, scission de *Formes particulières*, fusion des *Modificateurs de couleur*, sorties du thème) et contrôle l'intégrité ; `migration.csv` est la table mot par mot (avant, après, règle, voir aussi) ; `mesure.py` compare le rangement automatique avant/après (`resultats/pilote_mesure.md`). Rien n'est appliqué à `public/data`. |
| `pipeline.py` | Comparatif Haiku / Sonnet / Opus sur les 200 mots de test (10 sections candidates par TF-IDF, définition rédigée par Haiku), et rejeu d'un découpage par difficulté à partir des réponses en cache. Résultats : `resultats/pipeline.md`. |
| `ranger.py` | **Outil retenu** pour ranger des mots nouveaux : `python3 ranger.py nouveaux.csv sortie.csv` (colonnes `mot`, `traduction`). Haiku rédige la définition, TF-IDF propose 10 sections, Haiku choisit. Le mot est rangé seul si Haiku est « très sûr » et d'accord avec le premier choix de TF-IDF ; sinon « à valider » avec 3 propositions. |
| `sorties.py` | Petites fonctions d'écriture (pourcentages, fichiers Markdown). |
| `test_eval.py` | Tests unitaires : masquage, vote, voisins, bootstrap, comptes des données, tirage reproductible, lecture de la réponse de Haiku. |
| `resultats/` | Sorties générées, décrites ci-dessous. |

### `resultats/`

| Fichier | Contenu |
|---|---|
| `plafond.md`, `plafond.json` | Point 1 : comptes des doublons, précision des deux méthodes en « un mot retiré à la fois », analyse des recouvrements, 10 paires les plus confondues. |
| `confusion_tfidf_sections.csv`, `confusion_e5_sections.csv` | Matrice de confusion 820 × 820 en format long (seules les cases non nulles hors diagonale) : vraie section, section prédite, nombre, part de la vraie section. |
| `confusion_tfidf_themes.csv`, `confusion_e5_themes.csv` | La même agrégée par thème, 66 × 66, diagonale comprise. |
| `reglage_a.json` | Précision de la mesure A sur les 100 mots de réglage pour chaque k, et le k retenu. |
| `predictions_a.jsonl`, `predictions_tfidf.jsonl`, `predictions_b.jsonl` | Une ligne par mot tiré : les 10 premières sections proposées et la confiance. |
| `rapport.md` | Point 5 pour chaque mesure disponible. |
| `courbe.png`, `courbe_<mesure>.csv` | Précision des mots rangés automatiquement selon la part envoyée « À valider ». |
| `echecs_<mesure>.jsonl` | Les 10 échecs listés dans le rapport, avec la requête masquée vue par le classeur. |
| `inventaire_sections.csv` | Inventaire des 820 sections (voir `inventaire.py`). |
| `categories.md` | Résultats de `categories_mesure.py`. |
| `synthese.md` | Lecture des résultats, échecs commentés et seuil proposé. |

## Choix et limites

- **Le classement « TF-IDF actuel » n'existe pas dans ce dépôt.** La recherche par le sens de l'application (`msearch` dans `public/dictionnaire.js`) compte des préfixes de 5 lettres communs ; elle ne classe pas par section. `plafond.py` en reconstruit donc un : TF-IDF (`sublinear_tf`, accents retirés), 20 plus proches voisins, vote par section.
- **Modèle quantifié.** Le disque avait moins de 700 Mo libres ; la version int8 (118 Mo) a été préférée à la version complète (470 Mo). Elle peut perdre un peu de précision.
- **Mots exclus du tirage.** Un mot n'est « mono-section » que si son intitulé (en minuscules) n'apparaît que dans une seule section et que son entrée n'a pas d'alias (`al`, autre sens rangé ailleurs).
- **Nature de mot.** Les données n'ont pas de catégorie grammaticale. La nature est déduite du volume : Verbes → verbe, Adjectifs → adjectif, Descriptions → description, Tomes 1 à 5 → nom ou expression. Le rapport distingue aussi mot simple et expression de plusieurs mots.
- **Masquage.** Sont remplacés par « … » : le mot, sa traduction, les variantes entre parenthèses, les mots d'au moins 4 lettres du mot et d'au moins 5 lettres de la traduction, avec jusqu'à 3 lettres de suffixe (pluriels, accords). Des dérivés plus éloignés peuvent subsister (ex. « rastafaris » pour *Rastafarian dreadlocks*).
- **Seuils.** Avec 100 mots de réglage, les seuils de confiance sont grossiers ; les intervalles du rapport le montrent.
