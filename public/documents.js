/* Onglet « Mes documents » : téléversement (PDF, Word, texte), historique, mots d'un
   document (filtres, occurrences, phrase), ajout des nouveaux mots en lot ; et, sur la fiche
   d'un mot, les documents d'où il vient. N'altère pas dictionnaire.js : écrit dans #out et
   laisse dictionnaire.js ouvrir les fiches (liens data-id). */
(function () {
  const $ = (s) => document.querySelector(s);
  const out = $('#out');
  const btn = $('#tDocs');
  if (!out || !btn) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const st = (t) => `<p class="st">${t}</p>`;
  const date = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const LOT = 5;
  const NATURES = [['', 'Toutes'], ['nom', 'Noms'], ['verbe', 'Verbes'], ['adjectif', 'Adjectifs']];
  const STATUTS = [['', 'Tous'], ['présent', 'Déjà présents'], ['nouveau', 'Nouveaux'], ['ajouté', 'Ajoutés'], ['à valider', 'À valider']];
  let actif = false;
  let vue = null; // { id, nature, statut, page }

  async function api(url, options) {
    const r = await fetch(url, options);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erreur || 'Erreur ' + r.status);
    return d;
  }
  const postJson = (url, corps) => api(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) });

  document.querySelectorAll('.tabs button').forEach((b) => {
    if (b !== btn) b.addEventListener('click', () => { actif = false; btn.setAttribute('aria-pressed', 'false'); });
  });
  btn.addEventListener('click', () => { vue = null; ouvrir(); });

  function activer() {
    actif = true;
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  }

  // --- liste des documents --------------------------------------------------------
  async function ouvrir() {
    activer();
    if (vue) return document_(vue.id);
    out.innerHTML = `<div class="msearch"><label for="dfich">Analyser un document</label>
      <p class="en" lang="en">Analyze a document</p>
      <p class="sd">PDF, Word (.docx) ou texte, 4 Mo au plus. Les noms, verbes et adjectifs sont ramenés à leur forme de base et comparés au dictionnaire.</p>
      <div class="mrow"><input id="dfich" type="file" accept=".pdf,.docx,.txt,.md"><button id="dgo">Analyser</button></div>
      <div id="dres"></div></div><div id="dliste">${st('Chargement…')}</div>`;
    $('#dgo').onclick = televerser;
    liste();
  }

  async function liste() {
    let docs;
    try { docs = (await api('/api/documents')).documents; } catch (e) { $('#dliste').innerHTML = st(esc(e.message)); return; }
    if (!actif || !$('#dliste')) return;
    $('#dliste').innerHTML = docs.length ? `<h3 class="sec">Mes documents (${docs.length})</h3><p class="en" lang="en">My documents</p><ul class="res docs">` +
      docs.map((d) => `<li tabindex="0" data-doc="${esc(d.id)}"><b>${esc(d.nom)}</b><span class="t">${date(d.cree_le)}${d.langue ? ' · ' + (d.langue === 'fr' ? 'français' : 'anglais') : ''}</span>
        <span class="p">${d.etat === 'prêt' ? `${d.noms} noms, ${d.verbes} verbes, ${d.adjectifs} adjectifs — ${d.presents} déjà présents, ${d.nouveaux} nouveaux, ${d.ajoutes} ajoutés, ${d.a_valider} à valider`
          : d.etat === 'échec' ? `Analyse échouée : ${esc(d.erreur)}` : 'Analyse en cours…'}</span></li>`).join('') + '</ul>'
      : st('Aucun document pour l\'instant.');
    $('#dliste').querySelectorAll('[data-doc]').forEach((li) => {
      const go = () => { vue = { id: li.dataset.doc, nature: '', statut: '', page: 0 }; document_(li.dataset.doc); };
      li.onclick = go; li.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    });
  }

  async function televerser() {
    const f = $('#dfich').files[0], res = $('#dres');
    if (!f) { res.innerHTML = st('Choisissez d\'abord un fichier.'); return; }
    res.innerHTML = st(`Analyse de « ${esc(f.name)} »…`);
    $('#dgo').disabled = true;
    const corps = new FormData(); corps.append('fichier', f);
    try {
      const d = await api('/api/document', { method: 'POST', body: corps });
      if (!actif) return;
      if (d.statut === 'existe') res.innerHTML = st('Ce fichier a déjà été analysé : ouverture de l\'analyse existante.');
      vue = { id: d.id, nature: '', statut: '', page: 0 };
      setTimeout(() => actif && document_(d.id), d.statut === 'existe' ? 1200 : 0);
    } catch (e) {
      res.innerHTML = st(esc(e.message));
      liste();
    } finally {
      const b = $('#dgo'); if (b) b.disabled = false;
    }
  }

  // --- un document ----------------------------------------------------------------
  const puce = (groupe, val, lib, actuel) => `<button class="dpuce" data-${groupe}="${esc(val)}" aria-pressed="${val === actuel}">${lib}</button>`;

  async function document_(id, ajoutPage = false) {
    activer();
    const v = vue;
    const params = new URLSearchParams({ page: String(v.page) });
    if (v.nature) params.set('nature', v.nature);
    if (v.statut) params.set('statut', v.statut);
    if (!ajoutPage) out.innerHTML = st('Chargement…');
    let d;
    try { d = await api(`/api/documents/${id}/mots?${params}`); } catch (e) { out.innerHTML = st(esc(e.message)); return; }
    if (!actif || vue !== v) return;
    const lg = d.document.langue === 'en' ? 'en' : 'fr';
    const lignes = d.mots.map((m) => ligne(m, lg)).join('');
    if (ajoutPage) {
      $('#dmots').insertAdjacentHTML('beforeend', lignes);
    } else {
      out.innerHTML = `<button class="back" id="dretour">← Mes documents</button>
        <h3 class="sec">${esc(d.document.nom)}</h3>
        <p class="sd">${date(d.document.cree_le)} · ${lg === 'fr' ? 'français' : 'anglais'} · ${d.document.n_mots ?? '?'} mots dans le texte</p>
        <div class="dfiltres">${NATURES.map(([v2, l]) => puce('nat', v2, l, v.nature)).join('')}</div>
        <div class="dfiltres">${STATUTS.map(([v2, l]) => puce('stat', v2, l, v.statut)).join('')}</div>
        ${st(`${d.total} mot${d.total > 1 ? 's' : ''}`)}
        <div class="dactions"><button id="dajout" disabled>Ajouter les mots cochés</button><button class="back" id="drelance">Relancer l'analyse</button></div>
        <div id="dprog"></div><ul class="dmots" id="dmots">${lignes}</ul>`;
      $('#dretour').onclick = () => { vue = null; ouvrir(); };
      $('#drelance').onclick = () => relancer(id);
      $('#dajout').onclick = () => ajouter(id);
      out.querySelectorAll('[data-nat]').forEach((b) => { b.onclick = () => { vue = { ...v, nature: b.dataset.nat, page: 0 }; document_(id); }; });
      out.querySelectorAll('[data-stat]').forEach((b) => { b.onclick = () => { vue = { ...v, statut: b.dataset.stat, page: 0 }; document_(id); }; });
      $('#dmots').addEventListener('change', compter);
    }
    $('#dsuite')?.remove();
    const vus = (v.page + 1) * d.par_page;
    if (vus < d.total) {
      $('#dmots').insertAdjacentHTML('afterend', `<button class="back" id="dsuite">Mots suivants (${vus} sur ${d.total})</button>`);
      $('#dsuite').onclick = () => { vue = { ...vue, page: vue.page + 1 }; document_(id, true); };
    }
    compter();
  }

  const NOM_STATUT = { 'présent': 'déjà présent', 'nouveau': 'nouveau', 'ajouté': 'ajouté', 'à valider': 'à valider' };
  // La forme du mot telle qu'elle apparaît dans la phrase, en gras.
  function enGras(phrase, forme) {
    const h = esc(phrase), f = esc(forme);
    const i = h.toLowerCase().indexOf(f.toLowerCase());
    return i < 0 || !f ? h : `${h.slice(0, i)}<b>${h.slice(i, i + f.length)}</b>${h.slice(i + f.length)}`;
  }
  function ligne(m, lg) {
    const cle = esc(`${m.lemme}|${m.nature}`);
    const lien = m.mot_id ? ` → <span class="lk" tabindex="0" data-id="${esc(m.mot_id)}">${esc(m.t)}</span>${m.section ? ` <span class="sd">(${esc(m.section)})</span>` : ''}` : '';
    return `<li class="dmot" data-cle="${cle}">
      <div class="dtete">${m.statut === 'nouveau' ? `<input type="checkbox" class="dcoche" aria-label="Ajouter ${esc(m.lemme)}">` : ''}
        <b>${esc(m.lemme)}</b><span class="t">${esc(m.nature)} · ${m.occurrences} fois</span>
        <span class="dstat" data-s="${esc(m.statut)}">${esc(NOM_STATUT[m.statut] || m.statut)}</span>${lien}</div>
      <p class="dphrase" lang="${lg}">${enGras(m.phrase, m.forme)}</p><div class="dres"></div></li>`;
  }

  function compter() {
    const n = out.querySelectorAll('.dcoche:checked').length, b = $('#dajout');
    if (b) { b.disabled = !n; b.textContent = n ? `Ajouter les mots cochés (${n})` : 'Ajouter les mots cochés'; }
  }

  async function relancer(id) {
    $('#dprog').innerHTML = st('Nouvelle analyse du fichier d\'origine…');
    try { await postJson(`/api/documents/${id}/relancer`, {}); document_(id); } catch (e) { $('#dprog').innerHTML = st(esc(e.message)); }
  }

  async function ajouter(id, choix) {
    const items = choix || [...out.querySelectorAll('.dcoche:checked')].map((c) => { const [lemme, nature] = c.closest('[data-cle]').dataset.cle.split('|'); return { lemme, nature }; });
    if (!items.length) return;
    const prog = $('#dprog'), b = $('#dajout');
    if (b) b.disabled = true;
    let fait = 0;
    for (let i = 0; i < items.length; i += LOT) {
      prog.innerHTML = st(`Ajout en cours : ${fait} sur ${items.length}… (Haiku range chaque mot et rédige sa fiche)`);
      let d;
      try { d = await postJson(`/api/documents/${id}/ajouter`, { mots: items.slice(i, i + LOT) }); } catch (e) { prog.innerHTML = st(esc(e.message)); return; }
      for (const r of d.resultats) resultat(id, r);
      fait += d.resultats.length;
      if (d.erreur) { prog.innerHTML = st(esc(d.erreur)); return; }
    }
    prog.innerHTML = st(`${fait} mot${fait > 1 ? 's' : ''} traité${fait > 1 ? 's' : ''}.`);
    compter();
  }

  function resultat(id, r) {
    const li = out.querySelector(`[data-cle="${CSS.escape(`${r.lemme}|${r.nature}`)}"]`);
    if (!li) return;
    const zone = li.querySelector('.dres'), statut = li.querySelector('.dstat');
    if (r.statut === 'autre sens ?') {
      li.querySelector('.dcoche').checked = false;
      zone.innerHTML = st(`« ${esc(r.t)} » existe déjà dans le dictionnaire, peut-être dans un autre sens :`) +
        '<ul class="res">' + r.sens.map((s) => `<li tabindex="0" data-id="${esc(s.id)}"><b>${esc(s.t)}</b><span class="t">${esc(s.r)}</span><span class="p">${esc(s.chemin)}<br>${esc(s.def_fr)}</span></li>`).join('') + '</ul>' +
        `<button class="back dnouv">C'est un autre sens : l'ajouter</button>`;
      zone.querySelector('.dnouv').onclick = () => { zone.innerHTML = ''; ajouter(id, [{ lemme: r.lemme, nature: r.nature, nouveau_sens: true }]); };
      return;
    }
    li.querySelector('.dcoche')?.remove();
    statut.dataset.s = r.statut; statut.textContent = NOM_STATUT[r.statut] || r.statut;
    if (r.statut === 'ajouté') zone.innerHTML = st(`Ajouté dans <b>${esc(r.section.libelle)}</b> : <span class="lk" tabindex="0" data-id="${esc(r.id)}">${esc(r.t)}</span>`);
    else if (r.statut === 'à valider') zone.innerHTML = st('Haiku hésite : le mot attend dans « À valider » (onglet Ajouter).');
    else if (r.statut === 'échec') zone.innerHTML = st('L\'ajout a échoué ; réessayez plus tard.');
  }

  // --- sur la fiche d'un mot : les documents d'où il vient ----------------------------
  let ficheVue = null;
  new MutationObserver(async () => {
    const id = out.dataset.fiche;
    if (!id || !$('#bk') || out.querySelector('.docsrc') || ficheVue === id + out.childElementCount) return;
    ficheVue = id + out.childElementCount;
    let docs;
    try { docs = (await api(`/api/mot/${encodeURIComponent(id)}/documents`)).documents; } catch { return; }
    if (!docs.length || out.dataset.fiche !== id || out.querySelector('.docsrc')) return;
    out.insertAdjacentHTML('beforeend', `<p class="path docsrc">Vu dans vos documents : ${docs.map((d) =>
      `<span class="lk" tabindex="0" data-doc-src="${esc(d.id)}">${esc(d.nom)}</span>`).join(' · ')}</p>`);
  }).observe(out, { childList: true });
  out.addEventListener('click', (ev) => {
    const s = ev.target.closest('[data-doc-src]');
    if (!s) return;
    ev.stopPropagation();
    vue = { id: s.dataset.docSrc, nature: '', statut: '', page: 0 };
    document_(s.dataset.docSrc);
  });
})();
