-- Schéma de la base du dictionnaire (Neon Postgres).
-- Idempotent : peut être rejoué sans erreur ni doublon.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Blocs de front.json qui ne sont pas des lignes (mode d'emploi, texte d'origine,
-- règle d'or, types de questions, représentants de questions).
CREATE TABLE IF NOT EXISTS front (
  cle    text PRIMARY KEY,
  valeur jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS parties (
  num   text PRIMARY KEY,
  ordre int  NOT NULL,
  fr    text NOT NULL,
  en    text NOT NULL,
  vol   text NOT NULL,
  gen   jsonb NOT NULL
);

-- `liste` garde la ligne du thème telle qu'elle est dans front.json
-- (fr, en, clé, compteurs, phrase de différence…).
CREATE TABLE IF NOT EXISTS themes (
  cle        text PRIMARY KEY,
  partie_num text NOT NULL REFERENCES parties(num),
  ordre      int  NOT NULL,
  fr         text NOT NULL,
  en         text NOT NULL,
  d          jsonb NOT NULL,
  liste      jsonb NOT NULL
);

-- Une section est soit une entrée de `secs` (genre 'sec'), soit une fiche de verbes
-- (genre 'fiche'). `extra` garde les champs propres aux fiches (b, wl, q, qt).
CREATE TABLE IF NOT EXISTS sections (
  id        text PRIMARY KEY,          -- ex. '0_0:sec:3'
  theme_cle text NOT NULL REFERENCES themes(cle),
  genre     text NOT NULL CHECK (genre IN ('sec', 'fiche')),
  ordre     int  NOT NULL,
  fr        text NOT NULL,
  en        text NOT NULL,
  g         text,
  d         jsonb,
  extra     jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (theme_cle, genre, ordre)
);

-- Questions d'une section ; `k` est la clé pas à pas (arbre JSON).
CREATE TABLE IF NOT EXISTS questions (
  id         text PRIMARY KEY,         -- ex. '0_0:sec:3:2'
  section_id text NOT NULL REFERENCES sections(id),
  ordre      int  NOT NULL,
  q          jsonb,
  d          jsonb,
  qt         int,
  k          jsonb,
  UNIQUE (section_id, ordre)
);

-- Un mot = un sens. Les champs fréquents sont des colonnes ; `donnees` garde
-- l'entrée d'origine complète, pour la rendre à l'identique.
CREATE TABLE IF NOT EXISTS mots (
  id          text PRIMARY KEY,        -- champ `i` d'origine, ou identifiant d'un mot ajouté
  section_id  text NOT NULL REFERENCES sections(id),
  question_id text REFERENCES questions(id),
  ordre       int  NOT NULL,
  t           text NOT NULL,           -- mot anglais
  r           text NOT NULL,           -- traduction française
  def_fr      text NOT NULL,
  def_en      text NOT NULL,
  gd          jsonb,
  forme_norm  text NOT NULL,           -- forme normalisée de t (détection des doublons)
  forme_norm_fr text NOT NULL,         -- forme normalisée de r
  donnees     jsonb NOT NULL,
  vecteur     vector(384),
  origine     text NOT NULL DEFAULT 'import' CHECK (origine IN ('import', 'ajout')),
  cree_le     timestamptz NOT NULL DEFAULT now()
);
-- Rang du mot dans index.json et dans defs_*.json : la recherche parcourt les mots
-- dans cet ordre, comme l'ancienne version, pour rendre les mêmes résultats.
ALTER TABLE mots ADD COLUMN IF NOT EXISTS rang_index int;
ALTER TABLE mots ADD COLUMN IF NOT EXISTS rang_defs int;

-- Un sens = une forme normalisée + sa définition anglaise. La forme seule ne suffit
-- pas : « buck » désigne le mâle de 5 espèces dans la même section.
CREATE UNIQUE INDEX IF NOT EXISTS mots_sens_unique ON mots (forme_norm, md5(lower(btrim(def_en))));
CREATE INDEX IF NOT EXISTS mots_forme ON mots (forme_norm);
CREATE INDEX IF NOT EXISTS mots_forme_fr ON mots (forme_norm_fr);
CREATE INDEX IF NOT EXISTS mots_section ON mots (section_id, question_id, ordre);
CREATE INDEX IF NOT EXISTS mots_t_trgm ON mots USING gin (forme_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS mots_r_trgm ON mots USING gin (forme_norm_fr gin_trgm_ops);
CREATE INDEX IF NOT EXISTS mots_vecteur ON mots USING hnsw (vecteur vector_cosine_ops);

-- Renvois (`ref`) : une place dans une question qui pointe vers un mot rangé ailleurs.
CREATE TABLE IF NOT EXISTS renvois (
  id          text PRIMARY KEY,        -- ex. '0_0:sec:3:2:5'
  section_id  text NOT NULL REFERENCES sections(id),
  question_id text NOT NULL REFERENCES questions(id),
  ordre       int  NOT NULL,
  ref         text NOT NULL,
  donnees     jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS renvois_question ON renvois (question_id, ordre);

-- Formes fléchies : chaque forme normalisée (pluriel, conjugaison, orthographe
-- britannique, forme de la traduction française) → le mot du dictionnaire.
-- Remplie par scripts/formes.py (LemmInflect, VarCon, Lexique 3) puis import-formes.mts.
CREATE TABLE IF NOT EXISTS formes (
  forme   text NOT NULL,                 -- normalisée (sans accents) : détection des doublons
  brute   text NOT NULL,                 -- avec accents : définition au toucher
  mot_id  text NOT NULL REFERENCES mots(id) ON DELETE CASCADE,
  langue  text NOT NULL CHECK (langue IN ('en', 'fr')),
  source  text NOT NULL,
  PRIMARY KEY (brute, mot_id, langue)
);
CREATE INDEX IF NOT EXISTS formes_forme ON formes (forme, langue);
CREATE INDEX IF NOT EXISTS formes_mot ON formes (mot_id);

-- Nombre d'appels au modèle par jour (plafond : variable LIMITE_APPELS_JOUR).
CREATE TABLE IF NOT EXISTS appels_modele (
  jour  date PRIMARY KEY,
  n     int  NOT NULL DEFAULT 0
);

-- Mots que le rangement automatique n'a pas su placer avec assurance.
-- L'utilisateur choisit une des propositions d'un clic.
CREATE TABLE IF NOT EXISTS a_valider (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  t            text NOT NULL,
  r            text NOT NULL,
  definition   text NOT NULL,            -- définition rédigée par Haiku (FR puis EN)
  propositions jsonb NOT NULL,           -- [{section_id, libelle}] dans l'ordre, 3 au plus
  confiance    text NOT NULL,
  statut       text NOT NULL DEFAULT 'en attente' CHECK (statut IN ('en attente', 'rangé', 'écarté')),
  mot_id       text REFERENCES mots(id),
  cree_le      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS a_valider_statut ON a_valider (statut, cree_le);

-- WordNet 3.0 (Princeton) : sens anglais, pour le sens en contexte et les relations.
CREATE TABLE IF NOT EXISTS wn_sens (
  lemme      text NOT NULL,
  pos        text NOT NULL,      -- n, v, a, s (adjectif satellite), r
  synset     text NOT NULL,      -- ex. bank.n.01
  rang       int  NOT NULL,      -- 1 = sens le plus fréquent pour ce lemme et cette nature
  compte     int  NOT NULL,      -- occurrences dans SemCor
  definition text NOT NULL,
  exemples   jsonb NOT NULL,
  PRIMARY KEY (lemme, synset)
);

-- Sens d'un mot dans une phrase précise, expliqué par Haiku puis gardé pour tous les lecteurs.
CREATE TABLE IF NOT EXISTS sens_en_contexte (
  empreinte text NOT NULL,       -- SHA-256 du texte
  position  int  NOT NULL,       -- position du mot dans ce texte (en caractères)
  mot       text NOT NULL,
  statut    text NOT NULL DEFAULT 'en cours' CHECK (statut IN ('en cours', 'prêt', 'échec')),
  reponse   jsonb,
  cree_le   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empreinte, position)
);

-- Nouvelles explications demandées par visiteur et par jour (empreinte de l'adresse IP,
-- jamais l'adresse elle-même). Limite : LIMITE_SENS_VISITEUR (60 par défaut).
CREATE TABLE IF NOT EXISTS appels_visiteur (
  visiteur text NOT NULL,
  jour     date NOT NULL DEFAULT current_date,
  n        int  NOT NULL DEFAULT 0,
  PRIMARY KEY (visiteur, jour)
);
