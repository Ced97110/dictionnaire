# Dictionnaire de l'Invisible

Dictionnaire bilingue français-anglais en 8 volumes (5 tomes, Verbes, Adjectifs, Descriptions) : 34 385 mots et expressions, 3 714 questions.

## Ce que fait l'application

- **Je connais le sens** (onglet d'ouverture) : on décrit le sens avec ses mots, ou on descend l'arbre une question à la fois (domaine → thème → famille → question → différences) jusqu'au mot.
- **Chercher un mot** : recherche par mot anglais ou français.
- **Thèmes** et **Questions** : parcours du dictionnaire par thème ou par type de question.
- **Fiche d'un mot** : traduction, chemin du genre au mot (arbre de Porphyre), genre et différence, définition, sens propre et figuré, exemples.

## Lancer en local

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start   # version de production
```

## Organisation

| Chemin | Rôle |
|---|---|
| `app/page.tsx` | La structure de la page (barre de recherche, onglets, zone d'affichage). |
| `app/layout.tsx` | L'en-tête HTML, les polices, le titre. |
| `app/globals.css` | Les couleurs (thème clair et sombre) et la mise en page. |
| `public/dictionnaire.js` | Toute la logique : recherche, parcours guidé, thèmes, questions, fiches. |
| `public/data/index.json` | L'index de recherche : mot, traduction, identifiant, thème, chemin. |
| `public/data/front.json` | Les parties, thèmes, types de questions et le mode d'emploi. |
| `public/data/t*.json` | Un fichier par thème : fiches, sections, questions, mots et clés pas à pas. |
| `public/data/defs_*.json` | Les définitions, lues seulement quand on cherche par le sens. |

Les fichiers de thème ne sont chargés qu'à l'ouverture du thème, ce qui garde la page légère au démarrage.

## Base de données (Neon Postgres) — en cours de migration

Le dictionnaire est dans une base Postgres hébergée chez Neon, et le site la lit par des routes API. `public/data` ne sert plus qu'à l'import initial. Le site n'est plus un export statique : il faut un serveur Next.js (Vercel). La page ne télécharge plus l'index complet (5,9 Mo) : au démarrage, elle reçoit environ 96 Ko compressés.

### Mise en route

1. Mettre l'adresse de la base dans `.env.local` (ce fichier n'est jamais envoyé sur Git) :
   ```
   DATABASE_URL=postgresql://…-pooler…/neondb?sslmode=verify-full
   DATABASE_URL_UNPOOLED=postgresql://…/neondb?sslmode=verify-full
   ```
2. Importer, puis contrôler :
   ```bash
   node --env-file=.env.local --import tsx scripts/import.mts
   node --env-file=.env.local --import tsx scripts/controle-import.mts
   ```
   La première fois, l'import calcule les vecteurs de sens des 34 385 mots sur la machine (environ 15 minutes, sans service payant) et les garde dans `scripts/.cache/`. Les fois suivantes, il prend une à deux minutes. On peut le relancer autant qu'on veut : il ne crée pas de doublons.

### Fichiers ajoutés

| Chemin | Rôle |
|---|---|
| `db/schema.sql` | La structure de la base : parties, thèmes, sections, questions (avec leur clé pas à pas), mots, renvois, et les blocs de `front.json`. Active les extensions `vector` (recherche par le sens) et `pg_trgm` (recherche tolérante aux fautes). |
| `lib/normaliser.ts` | Ramène un mot à une forme comparable : minuscules, sans accents, sans trait d'union ni apostrophe. Sert à repérer les doublons. |
| `lib/reconstruire.ts` | Rebâtit depuis la base exactement les fichiers que lit l'interface (`t<clé>.json`, `front.json`). Servira aux routes API, ce qui évite de toucher à l'affichage. |
| `scripts/import.mts` | Lit `public/data`, calcule un vecteur de sens par mot (modèle local multilingual-e5-small) et remplit la base. |
| `lib/db.ts` | La connexion à la base depuis les routes API (pilote Neon, connexion « pooled »), et les en-têtes de cache. |
| `lib/recherche.ts` | La recherche par mot et par le sens, côté serveur. C'est la même logique qu'avant dans le navigateur, recopiée pour donner exactement les mêmes résultats, dans le même ordre. |
| `app/api/demarrage/route.ts` | Ce que la page charge au démarrage : parties, thèmes, mode d'emploi, nombre de mots. Mis en cache un jour. |
| `app/api/theme/[cle]/route.ts` | Un thème entier (sections, questions, clés, mots), dans la forme de l'ancien fichier. Mis en cache une heure. |
| `app/api/mot/[id]/route.ts` | Où se trouve un mot (thème, chemin), pour ouvrir sa fiche. |
| `app/api/recherche/route.ts` | `?q=` : recherche par mot, 20 résultats par page. `?sens=` : recherche par le sens, 15 résultats au plus. |
| `public/ajout.js` | L'onglet « Ajouter » : formulaire, réponse « existe déjà » avec les sens présents, file « À valider ». Séparé de `dictionnaire.js`, qu'il ne modifie pas. |
| `lib/doublons.ts` | Le mot existe-t-il déjà ? Compare la forme normalisée et la table des formes (pluriel, conjugaison, orthographe britannique, traduction). |
| `lib/tfidf.ts` | Recherche par mots communs (TF-IDF), recopiée de scikit-learn : propose les sections candidates. |
| `lib/ranger.ts` | Le rangement retenu après l'évaluation : Haiku définit le mot, TF-IDF propose 10 sections, Haiku choisit. Rangé seul si Haiku est sûr ET d'accord avec la 1re proposition ; sinon « À valider ». |
| `lib/fiche.ts` | Haiku rédige la fiche (définition, genre et différence, sens propre et figuré, exemple ; anglais américain), puis le mot est enregistré dans la question de son plus proche voisin. |
| `lib/modele.ts` | Appels à Claude Haiku, avec un plafond quotidien (`LIMITE_APPELS_JOUR`). |
| `lib/auth.ts` | Les écritures sont réservées à l'administrateur (`ADMIN_PASSWORD`, puis cookie). |
| `app/api/mots/route.ts` | `GET ?mot=` : vérifie si le mot existe. `POST` : ajoute un mot. |
| `app/api/a-valider/…` | La file « À valider », et le choix d'une section d'un clic. |
| `app/api/connexion/route.ts` | Connexion de l'administrateur. |
| `scripts/formes.py`, `scripts/import-formes.mts` | Construisent puis chargent la table des formes (≈ 200 000 formes) depuis LemmInflect (MIT), VarCon (licence libre SCOWL) et Lexique 3.83 (CC BY-SA 4.0). |
| `tests/doublons.test.ts`, `tests/doublons_cas.py` | 50 mots existants écrits autrement (pluriel, majuscules, orthographe britannique) et 50 mots nouveaux tirés de WordNet. |
| `tests/tfidf.test.ts`, `tests/tfidf_reference.py` | Le TF-IDF en TypeScript donne les mêmes 10 sections que scikit-learn sur 60 définitions. |
| `public/glose.js` | Définition au toucher : souligne en pointillé les mots du dictionnaire présents dans le texte affiché (une requête par texte), ouvre la fenêtre (bulle au survol sur ordinateur, panneau en bas d'écran au toucher sur téléphone), « ← » pour revenir au mot précédent. |
| `lib/gloses.ts`, `app/api/gloses/route.ts` | Reçoit les mots et expressions d'un texte, renvoie ceux qui existent avec leur définition courte. Formes fléchies reconnues (« couraient », « ran », pluriels), mots-outils exclus. |
| `tests/glose_cas.py`, `tests/glose.spec.ts` | Contrôle de la définition au toucher sur 100 définitions tirées au hasard, avec spaCy comme juge : couverture, bon mot, mots-outils, vitesse. Rapport dans `tests/resultats/glose-rapport.json`. |
| `tests/juge-sonnet.mts` | Fait juger par Claude Sonnet, sans lui dire d'où viennent les réponses, les cas où spaCy et le site ne sont pas d'accord, plus 10 cas témoins (15 appels). Résultat dans `tests/glose_arbitrage.json`, que `tests/glose.spec.ts` applique (il affiche aussi le chiffre brut de spaCy). |
| `lib/sens.ts`, `app/api/sens-en-contexte/route.ts` | Sens en contexte : sens possibles (dictionnaire, et WordNet pour l'anglais), Haiku explique (sens dit avec ses mots, indices, choix dans la liste ou « aucun », rôle), le code vérifie que les indices sont dans la phrase et relance une fois. Réponse gardée en base (une par texte + position), jamais deux appels en même temps. |
| `lib/visiteur.ts` | Limite par visiteur des nouvelles explications (`LIMITE_SENS_VISITEUR`, 60 par jour) ; seule une empreinte de l'adresse IP est gardée. |
| `scripts/wordnet.py`, `scripts/import-wordnet.mts` | Les 207 075 sens de WordNet 3.0 (Princeton, licence WordNet) dans la table `wn_sens`. |
| `tests/semcor_cas.py` | Tire de SemCor 200 cas de test et 100 cas de mise au point (graines différentes, aucun cas commun). |
| `tests/semcor-eval.mts` | Mesure finale sur les 200 cas de test : sens annoté retrouvé, comparé à « toujours le sens le plus fréquent ». |
| `tests/semcor-variantes.mts` | Compare des réglages sur le jeu de mise au point seulement. |
| `tests/sens-fr-eval.mts` | 50 occurrences tirées des définitions françaises, jugées par un agent Sonnet indépendant. |
| `tests/parite-recherche.test.ts` | Vérifie, sur plus de 600 recherches, que le serveur rend exactement ce que rendait l'ancienne recherche. |
| `tests/non-regression.spec.ts` | Test Playwright en largeur 400 px. Il joue les mêmes parcours sur l'ancien site (`out/`) et sur le nouveau, et compare le texte affiché à chaque étape. |
| `playwright.config.mts`, `vitest.config.mts` | Réglages des deux outils de test. |
| `scripts/controle-import.mts` | Vérifie que la base rend exactement `public/data`. Il compare les nombres de mots, sections, questions et clés, les 66 thèmes entiers, `front.json`, 20 fiches tirées au hasard, `index.json` et `defs_*.json`. Il vérifie aussi que l'index de proximité retrouve bien les voisins d'une recherche exacte. |

### Variables d'environnement (`.env.local`, et sur Vercel)

| Variable | Rôle |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | La base Neon (connexion « pooled » pour le site, directe pour les scripts). |
| `ANTHROPIC_API_KEY` | Claude Haiku (ajout de mots). |
| `ADMIN_PASSWORD` | Mot de passe de l'onglet « Ajouter ». Sans lui, aucune écriture n'est possible. |
| `LIMITE_APPELS_JOUR` | Nombre maximal d'appels à Haiku par jour (500 par défaut). |

### Lancer les tests

```bash
node --env-file=.env.local node_modules/vitest/vitest.mjs run   # parité de la recherche
npx playwright test -c playwright.config.mts                   # non-régression (utilise Chrome)
```

### Résultats d'évaluation

Les scripts d'évaluation écrivent leurs résultats détaillés dans `tests/resultats/` (et non dans `test-results/`, que Playwright vide à chaque lancement) : `semcor.json`, `sens-fr.json`, `glose-rapport.json`, `doublons-controle.json`.

### Seul changement visible

Une recherche à beaucoup de résultats affiche les 20 premiers, puis un bouton « Résultats suivants ». Avant, la page affichait jusqu'à 150 résultats d'un coup.

### Choix à connaître

- **Un sens = un mot + sa définition anglaise.** Le mot seul ne suffit pas : « buck » désigne le mâle de 5 espèces dans la même section.
- **Chaque entrée garde sa forme d'origine complète** (colonne `donnees`), en plus des colonnes utiles aux recherches. C'est ce qui permet de rendre les fiches à l'identique.
- **Correction de données :** dans `t0_5.json`, la fiche « yen » contenait un caractère invisible à la place du caractère japonais 円 (2 phrases). Postgres le refusait ; il a été remplacé par 円.
