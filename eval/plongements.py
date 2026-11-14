"""Local multilingual embeddings: multilingual-e5-small, int8 ONNX export.

The int8 export (118 MB) is used instead of the 470 MB float model because the
disk had under 700 MB free. Vectors are cached in eval/cache/.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer

DEPOT = "Xenova/multilingual-e5-small"
REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78"
CACHE = Path(__file__).resolve().parent / "cache"
LONGUEUR_MAX = 160
LOT = 64


class Encodeur:
    def __init__(self) -> None:
        modele = hf_hub_download(DEPOT, "onnx/model_quantized.onnx", revision=REVISION)
        tok = hf_hub_download(DEPOT, "tokenizer.json", revision=REVISION)
        self.tok = Tokenizer.from_file(tok)
        self.tok.enable_truncation(LONGUEUR_MAX)
        self.tok.enable_padding()
        self.session = ort.InferenceSession(modele, providers=["CPUExecutionProvider"])
        self.entrees = {i.name for i in self.session.get_inputs()}

    def _lot(self, textes: list[str]) -> np.ndarray:
        enc = self.tok.encode_batch(textes)
        ids = np.array([e.ids for e in enc], dtype=np.int64)
        masque = np.array([e.attention_mask for e in enc], dtype=np.int64)
        flux = {"input_ids": ids, "attention_mask": masque}
        if "token_type_ids" in self.entrees:
            flux["token_type_ids"] = np.zeros_like(ids)
        cache = self.session.run(None, flux)[0]  # (n, len, 384)
        m = masque[..., None].astype(np.float32)
        moy = (cache * m).sum(1) / np.clip(m.sum(1), 1e-9, None)
        return moy / np.linalg.norm(moy, axis=1, keepdims=True)

    def encoder(self, textes: list[str], prefixe: str) -> np.ndarray:
        """Encode with the e5 prefix ("query: " or "passage: "), L2-normalised."""
        entree = [f"{prefixe}: {t}" for t in textes]
        cle = hashlib.sha256("\n".join(entree).encode()).hexdigest()[:16]
        chemin = CACHE / f"{prefixe}_{cle}.npy"
        if chemin.exists():
            return np.load(chemin)
        # Sort by length so padding stays small.
        ordre = np.argsort([len(t) for t in entree])
        sortie = np.zeros((len(entree), 384), dtype=np.float32)
        for d in range(0, len(entree), LOT):
            idx = ordre[d : d + LOT]
            sortie[idx] = self._lot([entree[i] for i in idx])
        CACHE.mkdir(exist_ok=True)
        np.save(chemin, sortie)
        return sortie
