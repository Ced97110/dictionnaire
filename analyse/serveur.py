# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = [
#   "fastapi==0.162.0",
#   "uvicorn==0.54.0",
#   "pypdf==6.21.4",
#   "python-docx==1.2.0",
#   "spacy==3.8.18",
#   "fr_core_news_sm @ https://github.com/explosion/spacy-models/releases/download/fr_core_news_sm-3.8.0/fr_core_news_sm-3.8.0-py3-none-any.whl",
#   "en_core_web_sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl",
# ]
# ///
"""Document analysis service (spaCy): text → nouns, verbs and adjectives in base form.

POST /analyse with the raw file as body and its name in the `x-nom` header
(.pdf, .docx, .txt, .md). Returns the language, the word count and, for each
distinct (lemma, nature): occurrences and one sentence where it appears.
If ANALYSE_SECRET is set, the `x-secret` header must match.

Run locally: uv run analyse/serveur.py   (listens on 127.0.0.1:8001)
"""

from __future__ import annotations

import io
import os
import re
import secrets
from collections import Counter
from dataclasses import dataclass, field

import spacy
import uvicorn
from fastapi import FastAPI, HTTPException, Request

NATURES = {"NOUN": "nom", "VERB": "verbe", "ADJ": "adjectif"}
TAILLE_MAX = 20 * 1024 * 1024
LONGUEUR_PHRASE = 300
MOTS_FR = {"le", "la", "les", "des", "et", "est", "une", "dans", "que", "pour", "qui", "sur", "pas", "avec", "du", "au"}
MOTS_EN = {"the", "and", "is", "of", "to", "in", "that", "it", "for", "with", "on", "as", "was", "are", "this", "by"}

app = FastAPI()
modeles = {"fr": spacy.load("fr_core_news_sm"), "en": spacy.load("en_core_web_sm")}
for m in modeles.values():
    m.max_length = 3_000_000


def extraire(nom: str, contenu: bytes) -> str:
    ext = nom.lower().rsplit(".", 1)[-1] if "." in nom else ""
    if ext == "pdf":
        from pypdf import PdfReader

        return "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(contenu)).pages)
    if ext == "docx":
        from docx import Document

        return "\n".join(p.text for p in Document(io.BytesIO(contenu)).paragraphs)
    if ext in {"txt", "md", ""}:
        for codage in ("utf-8", "latin-1"):
            try:
                return contenu.decode(codage)
            except UnicodeDecodeError:
                continue
    raise HTTPException(415, f"Format non pris en charge : .{ext} (PDF, Word .docx ou texte)")


def langue(texte: str) -> str:
    mots = re.findall(r"[a-zàâçéèêëîïôûùüÿœ]+", texte[:20000].lower())
    fr, en = sum(m in MOTS_FR for m in mots), sum(m in MOTS_EN for m in mots)
    return "fr" if fr >= en else "en"


@dataclass
class Lemme:
    occurrences: int = 0
    phrase: str = ""
    formes: Counter = field(default_factory=Counter)


@app.post("/analyse")
async def analyser(req: Request) -> dict:
    attendu = os.environ.get("ANALYSE_SECRET")
    if attendu and not secrets.compare_digest(req.headers.get("x-secret", ""), attendu):
        raise HTTPException(401, "Secret incorrect")
    contenu = await req.body()
    if not contenu or len(contenu) > TAILLE_MAX:
        raise HTTPException(413, "Fichier vide ou trop grand (20 Mo au plus)")
    texte = re.sub(r"[ \t]+", " ", extraire(req.headers.get("x-nom", ""), contenu)).strip()
    if not texte:
        raise HTTPException(422, "Aucun texte trouvé dans ce fichier")
    lg = langue(texte)
    doc = modeles[lg](texte)
    lemmes: dict[tuple[str, str], Lemme] = {}
    n_mots = 0
    for tok in doc:
        if tok.is_alpha:
            n_mots += 1
        nature = NATURES.get(tok.pos_)
        # No stop-word filter: spaCy's lists drop real words (make, give, part, faire, dire).
        if not nature or not tok.is_alpha or len(tok.text) < 2:
            continue
        cle = (tok.lemma_.lower(), nature)
        x = lemmes.setdefault(cle, Lemme())
        x.occurrences += 1
        x.formes[tok.text.lower()] += 1
        if not x.phrase:
            x.phrase = tok.sent.text.strip().replace("\n", " ")[:LONGUEUR_PHRASE]
    return {
        "langue": lg,
        "n_mots": n_mots,
        "lemmes": [
            {"lemme": l, "nature": n, "occurrences": x.occurrences, "phrase": x.phrase, "forme": x.formes.most_common(1)[0][0]}
            for (l, n), x in sorted(lemmes.items(), key=lambda kv: -kv[1].occurrences)
        ],
    }


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8001")))
