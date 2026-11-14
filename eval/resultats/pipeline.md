# Découpage Haiku → Sonnet → Opus — 200 mots de test

Conditions réelles : définition rédigée par Haiku à partir du mot et de sa traduction ; 10 sections candidates proposées par TF-IDF. La bonne section figure parmi les 10 dans **73,0 %** des cas : c'est le maximum atteignable.

## Chaque modèle seul

| modèle | bonne section [IC 95 %] | jetons entrée | jetons sortie | si l'on ne garde que « confiance haute » |
|---|---|---|---|---|
| haiku | 48,5 % [41,5 % ; 55,5 %] | 277 738 | 41 477 | 71,3 % sur 47,0 % des mots |
| sonnet | 51,5 % [45,0 % ; 58,5 %] | 277 738 | 15 707 | 79,1 % sur 45,5 % des mots |
| opus | 53,0 % [46,0 % ; 60,0 %] | 277 738 | 17 985 | 78,1 % sur 48,0 % des mots |

## Découpage

- Rangés seuls : **94,0 %** des mots ; précision **54,3 %** [47,3 % ; 61,2 %] ; envoyés « À valider » : 6,0 %.
- Décidés par : sonnet 115, haiku 48, opus 25, à valider 12.

| étage | mots décidés | justes |
|---|---|---|
| haiku | 48 | 87,5 % |
| sonnet | 115 | 45,2 % |
| opus | 25 | 32,0 % |

Appels réellement nécessaires en production avec le découpage : haiku 200, sonnet 152, opus 37 (contre 200 par modèle si chacun traitait tout).

