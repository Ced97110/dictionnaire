"""Small output helpers shared by the scripts."""

from __future__ import annotations

from pathlib import Path

RESULTATS = Path(__file__).resolve().parent / "resultats"


def pct(x: float, decimales: int = 1) -> str:
    return f"{100 * x:.{decimales}f} %".replace(".", ",")


def ecrire_md(nom: str, lignes: list[str]) -> Path:
    RESULTATS.mkdir(exist_ok=True)
    chemin = RESULTATS / nom
    chemin.write_text("\n".join(lignes) + "\n", encoding="utf-8")
    return chemin


def nb(n: int) -> str:
    """Integer with a space as thousands separator (French style)."""
    return f"{n:,}".replace(",", "\u202f")
