/* Onglet « Ajouter » : ajout d'un mot (vérification des doublons, rangement par
   Haiku), et file « À valider ». Séparé de dictionnaire.js, qu'il ne modifie pas :
   il écrit dans #out et laisse dictionnaire.js ouvrir les fiches (liens data-id). */
(function () {
  const $ = (s) => document.querySelector(s);
  const out = $('#out');
  const btn = $('#tAdd');
  if (!out || !btn) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const st = (t) => `<p class="st">${t}</p>`;
  let actif = false;

  async function api(url, corps) {
    const r = await fetch(url, corps === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erreur || 'Erreur ' + r.status);
    return d;
  }

  // Les autres onglets (gérés par dictionnaire.js) désactivent celui-ci.
  document.querySelectorAll('.tabs button').forEach((b) => {
    if (b !== btn) b.addEventListener('click', () => { actif = false; btn.setAttribute('aria-pressed', 'false'); });
  });
  btn.addEventListener('click', ouvrir);

  async function ouvrir() {
    actif = true;
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    out.innerHTML = st('Chargement…');
    let admin = false;
    try { admin = (await api('/api/connexion')).admin; } catch { /* traité comme non connecté */ }
    if (!actif) return;
    if (!admin) return connexion();
    out.innerHTML = `<div class="msearch"><label for="amot">Ajouter un mot au dictionnaire</label>
      <p class="en" lang="en">Add a word to the dictionary</p>
      <div class="mrow"><input id="amot" type="search" placeholder="Mot anglais (ex. : kombucha)" autocomplete="off"></div>
      <div class="mrow"><input id="atrad" type="search" placeholder="Traduction française (facultatif)" autocomplete="off"><button id="ago">Ajouter</button></div>
      <div id="ares"></div></div><div id="aval"></div>`;
    $('#ago').onclick = () => ajouter(false);
    for (const id of ['#amot', '#atrad']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') ajouter(false); });
    $('#amot').focus();
    file();
  }

  function connexion() {
    out.innerHTML = `<div class="msearch"><label for="amdp">Ajouter des mots est réservé à l'administrateur.</label>
      <p class="en" lang="en">Adding words is restricted to the administrator.</p>
      <div class="mrow"><input id="amdp" type="password" placeholder="Mot de passe" autocomplete="current-password"><button id="acnx">Se connecter</button></div><div id="ares"></div></div>`;
    const go = async () => {
      try { await api('/api/connexion', { mot_de_passe: $('#amdp').value }); ouvrir(); }
      catch (e) { $('#ares').innerHTML = st(esc(e.message)); }
    };
    $('#acnx').onclick = go;
    $('#amdp').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  const ficheLien = (id, t) => `<span class="lk" tabindex="0" data-id="${esc(id)}">${esc(t)}</span>`;

  async function ajouter(nouveauSens) {
    const mot = $('#amot').value.trim(), traduction = $('#atrad').value.trim();
    const res = $('#ares');
    if (!mot) { res.innerHTML = st('Écrivez d\'abord le mot anglais.'); return; }
    res.innerHTML = st(nouveauSens ? 'Haiku range le mot et rédige sa fiche… (une dizaine de secondes)' : 'Vérification, puis rangement par Haiku… (une dizaine de secondes)');
    $('#ago').disabled = true;
    try {
      const d = await api('/api/mots', { mot, traduction, nouveau_sens: nouveauSens });
      if (!actif) return;
      if (d.statut === 'existe') {
        res.innerHTML = st(`« ${esc(mot)} » est déjà dans le dictionnaire${d.sens.length > 1 ? ` (${d.sens.length} sens)` : ''} :`) +
          '<ul class="res">' + d.sens.map((s) => `<li tabindex="0" data-id="${esc(s.id)}"><b>${esc(s.t)}</b><span class="t">${esc(s.r)}</span><span class="p">${esc(s.chemin)}<br>${esc(s.def_fr)}</span></li>`).join('') + '</ul>' +
          st('S\'agit-il d\'un autre sens ?') + '<button class="back" id="anouv">Oui, ajouter ce nouveau sens</button>';
        $('#anouv').onclick = () => ajouter(true);
      } else if (d.statut === 'ajouté') {
        res.innerHTML = st(`Ajouté dans <b>${esc(d.section.libelle)}</b>. Fiche : ${ficheLien(d.id, mot)}`);
        $('#amot').value = ''; $('#atrad').value = '';
      } else {
        res.innerHTML = st(`Haiku hésite (confiance ${esc(d.confiance)}). Le mot attend dans « À valider » ci-dessous : choisissez sa section d'un clic.`);
        $('#amot').value = ''; $('#atrad').value = '';
        file();
      }
    } catch (e) {
      res.innerHTML = st(esc(e.message));
    } finally {
      const b = $('#ago'); if (b) b.disabled = false;
    }
  }

  async function file() {
    const zone = $('#aval');
    if (!zone) return;
    let mots;
    try { mots = (await api('/api/a-valider')).mots; } catch (e) { zone.innerHTML = st(esc(e.message)); return; }
    if (!actif || !$('#aval')) return;
    zone.innerHTML = mots.length ? `<h3 class="sec">À valider (${mots.length})</h3><p class="en" lang="en">To review</p>` + mots.map((m) =>
      `<div class="card" data-av="${esc(m.id)}"><p class="q"><b>${esc(m.t)}</b> — ${esc(m.r)}</p><p class="sd">${esc(m.definition).replace(/\n/g, '<br>')}</p>
       <div class="wz-opts">${m.propositions.map((p) => `<button data-sec="${esc(p.section_id)}">${esc(p.libelle)}</button>`).join('')}</div>
       <button class="back" data-ecarter="1">Écarter ce mot</button><div class="avres"></div></div>`).join('') : '';
    zone.querySelectorAll('[data-av]').forEach((carte) => {
      carte.addEventListener('click', async (ev) => {
        const b = ev.target.closest('button');
        if (!b) return;
        const r = carte.querySelector('.avres');
        carte.querySelectorAll('button').forEach((x) => { x.disabled = true; });
        r.innerHTML = st(b.dataset.ecarter ? 'Suppression…' : 'Haiku rédige la fiche… (une dizaine de secondes)');
        try {
          const d = await api('/api/a-valider/' + carte.dataset.av, b.dataset.ecarter ? { ecarter: true } : { section_id: b.dataset.sec });
          r.innerHTML = d.statut === 'écarté' ? st('Écarté.') : st(`Ajouté dans <b>${esc(d.section.libelle)}</b>. Fiche : ${ficheLien(d.id, carte.querySelector('b').textContent)}`);
          carte.querySelectorAll('.wz-opts, [data-ecarter]').forEach((x) => x.remove());
        } catch (e) {
          r.innerHTML = st(esc(e.message));
          carte.querySelectorAll('button').forEach((x) => { x.disabled = false; });
        }
      });
    });
  }
})();
