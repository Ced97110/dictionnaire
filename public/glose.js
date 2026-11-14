/* Définition au toucher : chaque mot du dictionnaire présent dans un texte affiché
   devient consultable (soulignement pointillé léger). Survol sur ordinateur, toucher
   sur téléphone (panneau en bas d'écran). Les mots de la définition sont eux-mêmes
   consultables ; « ← » revient au mot précédent sans quitter la page.
   Une seule requête /api/gloses par texte ; les réponses restent en mémoire. */
(function () {
  const out = document.querySelector('#out');
  if (!out) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Même mise en forme que minuscules() dans lib/normaliser.ts (accents gardés).
  const norm = (s) => s.normalize('NFC').toLowerCase()
    .replace(/[-‐‑–—_'’/]+/g, ' ').replace(/[^\p{L}\p{M}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const MAXN = 5; // expressions de 5 mots au plus ; la plus longue d'abord
  const NE_PAS_TOUCHER = '.lab,.por b,.gd b,.hd,.grp,button,a,input,textarea,select,label,summary,h1,h2,h3,.res,[data-id],[data-th],[data-wz],[data-wzc],[data-wzback],.lk,.wz-crumbs,.vol,.path,.gl,.glhead,.glautres,.glctx,script,style';
  const ELISION = /^(l|d|j|m|n|s|t|c|qu|jusqu|lorsqu|puisqu|quoiqu)['’]/i;
  const CACHE = { fr: new Map(), en: new Map() }; // forme → [gloses] ou null
  const survol = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const langue = (el) => (el.closest('[lang]')?.lang?.startsWith('en') || el.closest('.en') ? 'en' : 'fr');

  function jetons(texte, lg) {
    const res = [];
    for (const m of texte.matchAll(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)) {
      let debut = m.index, mot = m[0];
      const el = lg === 'fr' ? mot.match(ELISION) : null;
      if (el && el[0].length < mot.length) { debut += el[0].length; mot = mot.slice(el[0].length); }
      res.push({ d: debut, f: debut + mot.length, n: norm(mot) });
    }
    return res;
  }
  const forme = (toks, i, n) => toks.slice(i, i + n).map((t) => t.n).join(' ');

  // --- repérage et requête -----------------------------------------------------
  function textes(racine) {
    const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.trim() && !n.parentElement.closest(NE_PAS_TOUCHER) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const liste = [];
    for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
      const lg = langue(n.parentElement);
      liste.push({ noeud: n, lg, toks: jetons(n.nodeValue, lg) });
    }
    return liste;
  }

  async function completer(liste) {
    const manque = { fr: new Set(), en: new Set() };
    for (const { lg, toks } of liste) {
      for (let i = 0; i < toks.length; i++) {
        for (let n = 1; n <= MAXN && i + n <= toks.length; n++) {
          const f = forme(toks, i, n);
          if (!CACHE[lg].has(f)) manque[lg].add(f);
        }
      }
    }
    if (!manque.fr.size && !manque.en.size) return;
    const corps = { fr: [...manque.fr], en: [...manque.en] };
    const r = await fetch('/api/gloses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) });
    if (!r.ok) throw new Error('gloses ' + r.status);
    const d = await r.json();
    for (const lg of ['fr', 'en']) for (const f of corps[lg]) CACHE[lg].set(f, d[lg]?.[f] || null);
  }

  function envelopper({ noeud, lg, toks }) {
    if (!noeud.isConnected) return;
    const texte = noeud.nodeValue, frag = document.createDocumentFragment();
    let pos = 0, trouve = false;
    for (let i = 0; i < toks.length;) {
      let n = Math.min(MAXN, toks.length - i);
      for (; n > 0; n--) if (CACHE[lg].get(forme(toks, i, n))) break;
      if (!n) { i++; continue; }
      const debut = toks[i].d, fin = toks[i + n - 1].f;
      frag.append(texte.slice(pos, debut));
      const s = document.createElement('span');
      s.className = 'gl'; s.dataset.f = forme(toks, i, n); s.dataset.l = lg; s.textContent = texte.slice(debut, fin);
      frag.append(s);
      pos = fin; i += n; trouve = true;
    }
    if (!trouve) return;
    frag.append(texte.slice(pos));
    noeud.replaceWith(frag);
  }

  // --- fenêtre -----------------------------------------------------------------
  const pop = document.createElement('div');
  pop.id = 'glpop'; pop.className = 'glpop' + (survol ? '' : ' glsheet');
  pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Définition'); pop.hidden = true;
  document.body.append(pop);
  let pile = [], ancre = null, fermeture = null;

  let enCours = null;
  async function traiter(racine) {
    const liste = textes(racine);
    if (!liste.length) return;
    try { await completer(liste); } catch { return; } // sans réseau, le texte reste simple
    observateur.disconnect();
    liste.forEach(envelopper);
    observer();
  }
  const observateur = new MutationObserver(() => {
    // Changement de page : la fenêtre ouverte sur un mot qui a disparu se ferme.
    if (!pop.hidden && ancre && !ancre.isConnected) fermer();
    clearTimeout(enCours); enCours = setTimeout(() => traiter(out), 30);
  });
  const observer = () => observateur.observe(out, { childList: true, subtree: true, characterData: true });
  observer();
  traiter(out);



  function rendre() {
    const { f, l, k } = pile[pile.length - 1];
    const sens = CACHE[l].get(f) || [];
    const g = sens[k];
    if (!g) { fermer(); return; }
    pop.innerHTML = `<div class="glhead">${pile.length > 1 ? '<button class="glback" aria-label="Mot précédent">←</button>' : ''}
      <b class="glmot">${esc(g.mot)}</b><span class="glt">${esc(g.traduction)}</span>
      <button class="glx" aria-label="Fermer">×</button></div>
      <p class="gldef">${esc(g.def_fr)}</p><p class="gldef en" lang="en">${esc(g.def_en)}</p>
      <p class="gldom">${esc(g.domaine)}</p><div class="glctx"></div>
      ${sens.length > 1 ? `<p class="glautres">Autres sens : ${sens.map((s, i) => i === k ? '' : `<button data-k="${i}">${esc(s.domaine.split(' › ').pop())}</button>`).join('')}</p>` : ''}
      <button class="glopen" data-ouvrir="${esc(g.id)}">Ouvrir la fiche</button>`;
    pop.hidden = false;
    placer();
    traiter(pop);
    contexte(pile[pile.length - 1]);
  }

  // --- sens dans ce contexte ------------------------------------------------------
  const SENS = new Map(); // texte + position → réponse (ou promesse)
  function occurrence(el) {
    const bloc = el.parentElement.closest('p,li,dd,blockquote,td,div') || el.parentElement;
    const brut = bloc.textContent;
    const r = document.createRange(); r.setStart(bloc, 0); r.setEnd(el, 0);
    const avant = r.toString();
    const texte = brut.replace(/\s+/g, ' ');
    const position = avant.replace(/\s+/g, ' ').length;
    return { texte, position: Math.min(position, texte.length - 1), longueur: el.textContent.replace(/\s+/g, ' ').length };
  }
  function surligner(phrase, mot, indices) {
    let h = esc(phrase);
    const marquer = (m, cls) => { const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[^\\p{L}\\p{N}])`, 'iu'); h = h.replace(re, `$1<mark class="${cls}">$2</mark>`); };
    indices.forEach((i) => marquer(esc(i.mot), 'glind'));
    marquer(esc(mot), 'glcible');
    return h;
  }
  function afficherSens(zone, d) {
    const parId = Object.fromEntries(d.sens.map((x) => [x.id, x]));
    const txt = (x) => esc(x.texte_fr || x.texte_en) + (x.domaine ? ` <span class="gldom">(${esc(x.domaine.split(' › ').pop())})</span>` : x.source === 'WordNet' ? ' <span class="gldom">(WordNet)</span>' : '');
    const montre = d.sens.filter((x, i) => i < 6 || x.id === d.sens_retenu || d.sens_alternatifs.includes(x.id));
    zone.innerHTML = `<p class="glctxt">Sens dans ce contexte <span class="en" lang="en">Meaning in this context</span></p>
      <p class="glphrase">${surligner(d.contexte.phrase, d.contexte.mot, d.indices)}</p>
      <p class="gletape">a) Les sens possibles</p><ol class="glsens">${montre.map((x) => `<li class="${x.id === d.sens_retenu ? 'glretenu' : ''}">${txt(x)}</li>`).join('')}</ol>
      <p class="gletape">b) Les indices dans la phrase</p><ul class="glind-l">${d.indices.map((i) => `<li><mark class="glind">${esc(i.mot)}</mark> : ${esc(i.apport_fr)}<br><span class="en" lang="en">${esc(i.apport_en)}</span></li>`).join('')}</ul>
      ${d.tranche && d.sens_retenu === 'AUCUN' ? `<p class="gletape">c) Aucun de ces sens ne convient ici</p><p>${esc(d.reformulation_fr)}</p><p class="en" lang="en">${esc(d.reformulation_en)}</p><p class="gldom">Ce sens n'est pas encore dans le dictionnaire.</p>`
        : d.tranche ? `<p class="gletape">c) Le sens retenu ici</p><p>${esc(d.reformulation_fr)}</p><p class="en" lang="en">${esc(d.reformulation_en)}</p>`
        : `<p class="gletape">c) Les indices ne suffisent pas à trancher</p><p>Deux sens restent possibles : ${d.sens_alternatifs.map((id) => parId[id] ? `« ${txt(parId[id])} »` : '').join(' ou ')}.</p><p class="en" lang="en">The clues are not enough to decide between these two meanings.</p>`}
      <p class="gletape">d) Son rôle dans la phrase</p><p>${esc(d.role_fr)}${d.rattache_a ? ` — se rattache à « ${esc(d.rattache_a)} »` : ''}</p><p class="en" lang="en">${esc(d.role_en)}</p>`;
    placer();
  }
  async function contexte(entree) {
    const zone = pop.querySelector('.glctx');
    if (!zone || !entree?.el?.isConnected) return;
    const { texte, position, longueur } = occurrence(entree.el);
    const cle = `${entree.l}|${position}|${texte}`;
    let d = SENS.get(cle);
    if (!(d && !d.then)) zone.innerHTML = '<p class="glctxt">Sens dans ce contexte</p><p class="glcharge">Lecture de la phrase…</p>';
    if (!d) {
      d = fetch('/api/sens-en-contexte', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texte, position, longueur, langue: entree.l }) })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null);
      SENS.set(cle, d);
    }
    const rep = await d;
    if (rep) SENS.set(cle, rep); else SENS.delete(cle);
    if (pile[pile.length - 1] !== entree) return; // l'utilisateur est passé à un autre mot
    if (rep) afficherSens(zone, rep); else zone.innerHTML = '';
  }

  function placer() {
    if (!survol || !ancre?.isConnected) return;
    const r = ancre.getBoundingClientRect(), largeur = Math.min(360, innerWidth - 16);
    pop.style.width = largeur + 'px';
    pop.style.left = Math.max(8, Math.min(r.left + scrollX, scrollX + innerWidth - largeur - 8)) + 'px';
    const h = pop.offsetHeight;
    const dessous = r.bottom + 6 + h < innerHeight;
    pop.style.top = (dessous ? r.bottom + scrollY + 6 : r.top + scrollY - h - 6) + 'px';
  }

  function ouvrir(span) {
    const t0 = performance.now();
    ancre = span;
    pile = [{ f: span.dataset.f, l: span.dataset.l, k: 0, el: span }];
    rendre();
    pop.dataset.ouvertEn = String(Math.round(performance.now() - t0)); // pour les tests de vitesse
  }
  function fermer() { pop.hidden = true; pile = []; ancre = null; }

  out.addEventListener('click', (ev) => {
    const s = ev.target.closest('.gl');
    if (!s) return;
    ev.stopPropagation();
    ouvrir(s);
  }, true);
  if (survol) {
    // mousemove et non mouseover : une page qui s'affiche sous une souris immobile
    // ne doit pas ouvrir de bulle par-dessus ce qu'on va cliquer.
    let vise = null;
    out.addEventListener('mousemove', (ev) => {
      const s = ev.target.closest('.gl');
      if (s === vise) return;
      vise = s;
      if (!s || s === ancre) return;
      clearTimeout(fermeture);
      fermeture = setTimeout(() => { if (vise === s) ouvrir(s); }, 250);
    });
    const partir = () => { clearTimeout(fermeture); fermeture = setTimeout(fermer, 400); };
    out.addEventListener('mouseout', (ev) => { if (ev.target.closest('.gl')) { vise = null; partir(); } });
    pop.addEventListener('mouseenter', () => clearTimeout(fermeture));
    pop.addEventListener('mouseleave', partir);
  }
  pop.addEventListener('click', (ev) => {
    const s = ev.target.closest('.gl');
    if (s) { pile.push({ f: s.dataset.f, l: s.dataset.l, k: 0, el: s }); rendre(); return; }
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.classList.contains('glx')) fermer();
    else if (b.classList.contains('glback')) { pile.pop(); rendre(); }
    else if (b.dataset.k) { pile[pile.length - 1].k = Number(b.dataset.k); rendre(); }
    else if (b.dataset.ouvrir) { const id = b.dataset.ouvrir; fermer(); window.dicoShow?.(id); }
  });
  document.addEventListener('click', (ev) => { if (!pop.hidden && !pop.contains(ev.target) && !ev.target.closest('.gl')) fermer(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !pop.hidden) fermer(); });
})();
