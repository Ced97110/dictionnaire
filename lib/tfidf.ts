// TF-IDF identique à celui de eval/classement.py (scikit-learn TfidfVectorizer avec
// strip_accents="unicode", lowercase, sublinear_tf, min_df=1, norme L2), puis vote
// des 20 plus proches voisins par section, pondéré par la similarité.

export type VecteurCreux = Map<number, number>;

export function jetons(texte: string): string[] {
  const t = texte.normalize("NFKD").replace(/\p{Mn}/gu, "").toLowerCase();
  return (t.match(/[\p{L}\p{N}_]+/gu) ?? []).filter((x) => x.length >= 2);
}

export class Tfidf {
  private vocab = new Map<string, number>();
  private idf: number[] = [];
  readonly docs: VecteurCreux[];

  constructor(corpus: string[]) {
    const df: number[] = [];
    const comptes = corpus.map((d) => {
      const c = new Map<number, number>();
      for (const j of jetons(d)) {
        let i = this.vocab.get(j);
        if (i === undefined) { i = this.vocab.size; this.vocab.set(j, i); df.push(0); }
        c.set(i, (c.get(i) ?? 0) + 1);
      }
      for (const i of c.keys()) df[i]++;
      return c;
    });
    const n = corpus.length;
    this.idf = df.map((d) => Math.log((1 + n) / (1 + d)) + 1);
    this.docs = comptes.map((c) => this.ponderer(c));
  }

  private ponderer(c: Map<number, number>): VecteurCreux {
    const v: VecteurCreux = new Map();
    let norme = 0;
    for (const [i, tf] of c) { const w = (1 + Math.log(tf)) * this.idf[i]; v.set(i, w); norme += w * w; }
    norme = Math.sqrt(norme) || 1;
    for (const [i, w] of v) v.set(i, w / norme);
    return v;
  }

  // Mots inconnus du corpus ignorés, comme scikit-learn.
  vecteur(texte: string): VecteurCreux {
    const c = new Map<number, number>();
    for (const j of jetons(texte)) { const i = this.vocab.get(j); if (i !== undefined) c.set(i, (c.get(i) ?? 0) + 1); }
    return this.ponderer(c);
  }
}

function cosinus(a: VecteurCreux, b: VecteurCreux): number {
  const [petit, grand] = a.size < b.size ? [a, b] : [b, a];
  let s = 0;
  for (const [i, w] of petit) { const x = grand.get(i); if (x !== undefined) s += w * x; }
  return s;
}

// Sections classées (10 au plus), comme voisins() + voter() en Python.
export function classer(t: Tfidf, sectionDe: string[], requete: string, k = 20): string[] {
  const q = t.vecteur(requete);
  const sims = t.docs.map((d, i) => [cosinus(q, d), i] as const).sort((a, b) => b[0] - a[0]).slice(0, k);
  const scores = new Map<string, number>();
  for (const [s, i] of sims) scores.set(sectionDe[i], (scores.get(sectionDe[i]) ?? 0) + Math.max(s, 0) + 1e-6);
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s]) => s);
}
