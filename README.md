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
npm run build    # site statique dans out/
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
