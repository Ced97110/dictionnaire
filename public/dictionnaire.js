/* Logique de la page : recherche, parcours guidé, thèmes, questions, fiches. */
(function(){
const $=s=>document.querySelector(s),out=$('#out');let NB=0,FRONT=null,QT={};const TH={},BYID={},VOLOF={},THNAME={};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
async function getTh(k){if(!TH[k]){const r=await fetch('/api/theme/'+k);TH[k]=await r.json();idx(TH[k],k)}return TH[k]}
function idx(t,k){t.fiches.forEach(f=>f.w.forEach(w=>BYID[w.i]={e:w,f,t,k}));t.secs.forEach(s=>s.n.forEach(n=>n.e.forEach(e=>{if(e.i)BYID[e.i]={e,n,s,t,k}})))}
const pair=(fr,en,cls='')=>(fr?`<p class="${cls}">${esc(fr)}</p>`:'')+(en?`<p class="en" lang="en">${esc(en)}</p>`:'');
const chip=t=>{const q=QT[t];return q?`<span class="chip" style="--qc:${q[4]}">${esc(q[0])}</span>`:''};
const qhead=(x,id)=>x.q?`<p class="q qh" ${id?`id="${id}"`:''} style="--qc:${QT[x.qt]?.[4]||'var(--line)'}">${chip(x.qt)}${esc(x.q[0])}</p><p class="en" lang="en">${esc(x.q[1])}</p><div class="box"><p>${esc(x.d[0])}</p><p class="en" lang="en">${esc(x.d[1])}</p></div>`:'';
const wlink=(id,t,r)=>`<p class="wl"><span class="lk" tabindex="0" data-id="${id}">${esc(t)}</span>${r?' — '+esc(r):''}</p>`;
function entryHTML(e,mid=''){let h=`<h2 class="hd" lang="en">${esc(e.h||e.t)}</h2>`+(e.r?`<p class="tr">${esc(e.r)}</p>`:'');
 if(e.gl)h+=pair(e.gl[0],e.gl[1]);
 if(e.def_fr||e.def_en)h+=`<div class="lab">Définition · Definition</div>`+pair(e.def_fr,e.def_en);
 h+=mid;
 if(e.gd)h+=`<div class="gd"><p><b>GENRE</b> ${esc(e.gd[0])} <b>· DIFFÉRENCE</b> ${esc(e.gd[1])}</p><p class="en" lang="en">Genus: ${esc(e.gd[2])} · Difference: ${esc(e.gd[3])}</p></div>`;
 if(e.propre_en)h+=`<div class="lab">Sens propre · Literal use</div><p>${esc(e.propre_fr)}</p><p class="en" lang="en"><i>${esc(e.propre_en)}</i></p>`;
 if(e.fig_en)h+=`<div class="lab">Sens figuré · Figurative use</div><p>${esc(e.fig_fr)}</p><p class="en" lang="en"><i>${esc(e.fig_en)}</i></p>`;
 if(e.ex_en)h+=`<div class="lab">Exemple · Example</div><p>${esc(e.ex_fr)}</p><p class="en" lang="en"><i>${esc(e.ex_en)}</i></p>`;
 if(e.f)h+=`<div class="lab">À retenir · Key fact</div>`+pair(e.f[0],e.f[1]);
 if(e.c)h+=`<div class="lab">Contraste · Contrast</div>`+pair(e.c[0],e.c[1],'ctr');
 for(const b of e.b||[])h+=`<div class="lab">${esc(b[0])}${b[1]&&b[1]!==b[0]?' · '+esc(b[1]):''}</div>`+pair(b[2],b[3]);
 for(const a of e.al||[]){h+=`<div class="lab">Autre emploi — ${esc(a.ctx)}</div><p><b>${esc(a.t)}</b>${a.r?' — '+esc(a.r):''}</p>`;if(a.ex_en)h+=`<p>${esc(a.ex_fr||'')}</p><p class="en" lang="en"><i>${esc(a.ex_en)}</i></p>`;if(a.f)h+=pair(a.f[0],a.f[1]);if(a.c)h+=pair(a.c[0],a.c[1],'ctr')}
 return h}
const KW={},PGEN={};
function kNode(w){let n=w.root;for(const b of w.stack)n=n.br[b][2];return n}
function kWords(n,acc=[]){if(Array.isArray(n))acc.push(...n);else n.br.forEach(b=>kWords(b[2],acc));return acc}
function kRender(id){const w=KW[id],el=document.getElementById('key-'+id);if(!el)return;const n=kNode(w);
 const name=i=>{const e=w.ents[i];return e?`<span class="lk" tabindex="0" data-id="${i}">${esc(e.t)}</span>${e.r?' — '+esc(e.r):''}`:''};
 let h='';if(w.stack.length){let m=w.root;h+='<p class="kans">'+w.stack.map(b=>{const t=m.br[b][0];m=m.br[b][2];return esc(t)}).join(' › ')+'</p>'}
 if(Array.isArray(n)){h+=`<div class="lab">Le mot · The word</div>`+n.map(i=>`<p class="kfound">${name(i)}</p>`).join('');
  if(w.stack.length){let p=w.root;for(const b of w.stack.slice(0,-1))p=p.br[b][2];const near=kWords(p).filter(i=>!n.includes(i));if(near.length)h+=`<div class="lab">Proches · Close words</div><p>${near.map(name).join(' · ')}</p>`}}
 else h+=`<p class="kq">${esc(n.q[0])}</p><p class="en" lang="en">${esc(n.q[1])}</p><div class="kopts">`+n.br.map((b,j)=>`<button data-kid="${id}" data-kb="${j}">${esc(b[0])}<br><span class="en" lang="en">${esc(b[1])}</span> <span class="vol">${kWords(b[2]).length}</span></button>`).join('')+'</div>';
 h+=`<div class="ktools">${w.stack.length?`<span class="lk" tabindex="0" data-kid="${id}" data-kback="1">← Question précédente</span><span class="lk" tabindex="0" data-kid="${id}" data-kreset="1">Recommencer</span>`:''}</div>`;
 el.innerHTML=h}
function keyBlock(n,id){if(!n.k)return'';KW[id]={root:n.k,stack:[],ents:Object.fromEntries(n.e.filter(e=>e.i).map(e=>[e.i,e]))};
 return `<button class="kbtn" data-kopen="${id}">Trouver le mot pas à pas · Find the word step by step</button><div class="key" id="key-${id}" hidden></div>`}
function kPath(n,id,acc=[]){if(Array.isArray(n))return n.includes(id)?acc:null;for(const b of n.br){const r=kPath(b[2],id,acc.concat([[n.q[0],b[0]]]));if(r)return r}return null}
function porHTML(x,k){const L=[],pg=PGEN[k];
 L.push(['Genre de départ',THNAME[k][1],pg?.[0]]);
 L.push(['Thème',x.t.fr,x.t.d?.[0]]);
 if(x.s)L.push(['Section',x.s.fr,x.s.d?.[0]]);
 const g=x.n||x.f;if(g&&g.q)L.push(['Question',g.q[0],g.d?.[0]]);
 if(x.n&&x.n.k)for(const [q,a] of kPath(x.n.k,x.e.i)||[])L.push(['Différence',a,q]);
 return `<div class="lab">Le chemin du mot · From genus to word</div><p class="porline">`+L.map(([b,t])=>`<span>${esc(t)}</span>`).join(' › ')+` › <b>${esc(x.e.t)}</b></p><details class="pordet"><summary>Voir ce qui distingue chaque étape</summary><ol class="por">`+L.map(([b,t,d])=>`<li><b>${esc(b)}</b>${esc(t)}${d?`<br><span class="sd">${esc(d)}</span>`:''}</li>`).join('')+`<li><b>Le mot</b>${esc(x.e.t)}</li></ol></details>`}
let MQ='',MSN=0;
const STOP=new Set('les des une un le la de du et en au aux qui que quoi pour par sur dans avec sans ou est sont son sa ses ce cette ces the of and a an to in on for with by or is are that which who what from as at be it its into not ne pas'.split(' '));
const toks=s=>norm(s).replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!STOP.has(w)).map(w=>w.slice(0,5));
async function msearch(){const q=$('#wzq').value.trim();MQ=q;const r=$('#mres');if(!q){r.innerHTML='';return}
 if(!toks(q).length){r.innerHTML='';return}
 const n=++MSN;let top;try{const d=await fetch('/api/recherche?sens='+encodeURIComponent(q)).then(x=>{if(!x.ok)throw new Error(x.status);return x.json()});top=d.resultats.map(x=>[0,x])}catch{if(n===MSN)r.innerHTML='<p class="st">La recherche a échoué. Réessayez.</p>';return}
 if(n!==MSN||!document.contains(r))return;
 r.innerHTML=top.length?`<p class="st">${top.length} mots proches de ce sens :</p>`+top.map(([sc,d])=>`<button class="wz-word" data-id="${d[0]}">${esc(d[2])}<small>${esc(d[3])}</small><small>${esc(d[4]||d[5])}</small></button>`).join(''):'<p class="st">Aucun mot trouvé. Essayez d\'autres mots, ou descendez l\'arbre ci-dessous.</p>'}
let WP=[];const WAUTO=new Set();
function wzCut(c){let n=c-1;while(n>0&&WAUTO.has(n))n--;return Math.max(n,0)}
function wzAuto(p){return WAUTO.has(p.length-1)}
const wzBtn=(i,title,sub,n,en)=>`<button data-wz="${i}">${n!=null?`<span class="n">${n} mots</span>`:''}${esc(title)}${en?`<br><span class="en" lang="en">${esc(en)}</span>`:''}${sub?`<span class="sd">${esc(sub)}</span>`:''}</button>`;
const nW=n=>Array.isArray(n)?n.length:n.br.reduce((a,b)=>a+nW(b[2]),0);
async function wiz(){last=wiz;const P=WP,crumbs=[];let h='',pre='',opts='',step='',q='',qen='',box='',words=null,near=null;
 const pr=P.length>0?FRONT.parts[P[0]]:null;
 if(!pr){step='Le genre le plus large';q='De quel domaine parle le mot que vous cherchez ?';qen='What area does the word you are looking for belong to?';
  opts=FRONT.parts.map((p,i)=>wzBtn(i,p.fr,p.gen?.[0],null,p.en)).join('');pre=`<div class="msearch"><label for="wzq">Le plus rapide : décrivez le sens avec vos mots</label><p class="en" lang="en">Fastest: describe the meaning in your own words</p><div class="mrow"><input id="wzq" type="search" placeholder="ex. : peur de la technologie, not said out loud…" value="${esc(MQ)}"><button id="wzgo">Chercher</button></div><div id="mres"></div></div><p class="wz-step">Ou descendez l'arbre, du plus général au mot</p>`}
 else{crumbs.push(['Domaine',pr.fr]);const th=P.length>1?pr.themes[P[1]]:null;
  if(!th){step='Le thème';q='Quel thème correspond le mieux ?';qen='Which theme fits best?';
   opts=pr.themes.map((t,i)=>wzBtn(i,t[0],t[5]?.[0],null,t[1])).join('')}
  else{crumbs.push(['Thème',th[0]]);out.innerHTML='<p class="st">Chargement…</p>';const t=await getTh(th[2]);
   const items=[...t.fiches.map((f,i)=>({k:'f'+i,fr:f.fr,en:f.en,d:f.d?.[0],n:f.wl.length,f})),...t.secs.map((s,i)=>({k:'s'+i,fr:s.fr,en:s.en,d:s.d?.[0],n:s.n.reduce((a,x)=>a+x.e.length,0),ex:s.n.map(x=>x.e[0]&&x.e[0].t).filter(Boolean).slice(0,4),s}))];
   if(P.length===2&&items.length===1){P.push(items[0].k);WAUTO.add(2)}
   const it=P.length>2?items.find(x=>x.k===P[2]):null;
   if(!it){step='La famille de mots';q='Dans quelle famille se trouve le mot ?';qen='Which family is the word in?';
    opts=items.map(x=>wzBtn(x.k,x.fr,(x.ex&&x.ex.length?'ex. : '+x.ex.join(', ')+'. ':'')+(x.d||''),x.n,x.en!==x.fr?x.en:'')).join('')}
   else{crumbs.push(['Famille',it.fr]);
    if(it.f){step='Les mots';q=it.f.q?it.f.q[0]:it.fr;words=it.f.wl.map(w=>[w[0],w[1],w[2]])}
    else{const ns=it.s.n;if(P.length===3&&ns.length===1){P.push(0);WAUTO.add(3)}
     const n=P.length>3?ns[P[3]]:null;
     if(!n){step='La question';q='Quelle question décrit le mieux ce que vous cherchez ?';qen='Which question best describes what you are looking for?';
      opts=ns.map((x,i)=>wzBtn(i,(QT[x.qt]?QT[x.qt][0]+' — ':'')+(x.q?x.q[0]:'Mots'),x.d?.[0],x.e.length,x.q?.[1])).join('')}
     else{crumbs.push(['Question',n.q?n.q[0]:'Mots']);const ents=Object.fromEntries(n.e.map(e=>[e.i||e.ref,e]));
      if(!n.k){step='Les mots';q=n.q?.[0]||'';box=n.d;words=n.e.map(e=>[e.i||e.ref,e.t,e.r])}
      else{let node=n.k,parent=null,k=4;
       for(;k<P.length;k++){crumbs.push(['Différence',node.br[P[k]][0]]);parent=node;node=node.br[P[k]][2]}
       if(Array.isArray(node)){step='Le mot';q=n.q[0];words=node.map(i=>[i,ents[i]?.t,ents[i]?.r]);
        if(parent)near=kWords(parent).filter(i=>!node.includes(i)).map(i=>[i,ents[i]?.t])}
       else{step='Différence';q=node.q[0];qen=node.q[1];
        opts=node.br.map((b,j)=>wzBtn(j,b[0],'',nW(b[2]),b[1])).join('')}}}}}}}
 h+=`<div class="wz-crumbs">`+(crumbs.length?`<button data-wzc="0"><b>↺</b>Début</button>`:'')+crumbs.map((c,i)=>`<button data-wzc="${i+1}"><b>${esc(c[0])}</b>${esc(c[1])}</button>`).join('')+`</div>`;
 h+=pre+`<p class="wz-step">${esc(step)}</p><p class="wz-q">${esc(q)}</p>${qen?`<p class="en" lang="en">${esc(qen)}</p>`:''}`;
 if(box&&box[0])h+=`<div class="box"><p>${esc(box[0])}</p><p class="en" lang="en">${esc(box[1])}</p></div>`;
 if(opts)h+=`<div class="wz-opts">${opts}</div>`;
 if(words)h+=words.map(w=>`<button class="wz-word" data-id="${w[0]}">${esc(w[1])}<small>${esc(w[2]||'')}</small></button>`).join('')+(near&&near.length&&near.length<=10?`<div class="lab">Proches · Close words</div><div class="wz-near">${near.map(w=>`<button data-id="${w[0]}">${esc(w[1])}</button>`).join('')}</div>`:'');
 if(P.length)h+=`<div class="ktools"><span class="lk" tabindex="0" data-wzback="1">← Étape précédente</span></div>`;
 out.innerHTML=h;window.scrollTo(0,0);const qi=$('#wzq');if(qi){$('#wzgo').onclick=msearch;qi.addEventListener('keydown',e=>{if(e.key==='Enter')msearch()});if(MQ)msearch()}}
let last=null,timer;
function backBtn(){return `<button class="back" id="bk">← Retour</button>`}
function wireBack(prev){const b=$('#bk');if(b)b.onclick=()=>(prev||search)()}
async function show(id){const prev=last;out.innerHTML='<p class="st">Ouverture…</p>';const r=await fetch('/api/mot/'+encodeURIComponent(id)).then(x=>x.ok?x.json():null).catch(()=>null);if(!r){out.innerHTML='<p class="st">Entrée introuvable.</p>';return}
 out.innerHTML='<p class="st">Ouverture…</p>';await getTh(r[3]);const x=BYID[id];
 let ctx=`<p class="path">${esc(THNAME[r[3]]?.[1]||'')} › ${esc(x.t.fr)}${x.s?' › '+esc(x.s.fr):' › '+esc(x.f.fr)} <span class="vol">${esc(VOLOF[r[3]])}</span></p>`;
 const grp=x.n||x.f;ctx+=qhead(grp)+(x.n?keyBlock(x.n,'w-'+id):'');
 const sib=(x.n?x.n.e:x.f.w).filter(e=>e!==x.e).map(e=>`<span class="lk" tabindex="0" data-id="${e.i||e.ref}">${esc(e.t)}</span>`).join(' · ');if(sib)ctx+=`<p class="path">Mots voisins : ${sib}</p>`;
 out.innerHTML=backBtn()+`<div class="card">${entryHTML(x.e,porHTML(x,r[3]))}${ctx}</div><p class="st"><span class="lk" tabindex="0" data-th="${r[3]}">Voir tout le thème « ${esc(x.t.fr)} »</span></p>`;
 const me=()=>show(id);wireBack(prev);last=me;window.scrollTo(0,0)}
let SN=0;
const resLi=r=>`<li tabindex="0" data-id="${r[2]}"><b>${esc(r[0])}</b><span class="t">${esc(r[1])}</span><span class="p">${esc(r[4])}</span><span class="vol">${esc(VOLOF[r[3]])}</span></li>`;
const moreBtn=(shown,tot)=>shown<tot?`<button class="back" id="more">Résultats suivants (${shown} sur ${tot})</button>`:'';
async function search(page=0){last=search;const raw=$('#q').value.trim(),v=norm(raw);if(!v){out.innerHTML=`<p class="st">${NB.toLocaleString('fr')} mots et expressions dans les 8 volumes (5 tomes, Verbes, Adjectifs, Descriptions). Tapez un mot anglais (ex. <i>jenny</i>) ou français (ex. <i>ânesse</i>).</p>`;return}
 const n=++SN;let d;try{d=await fetch('/api/recherche?q='+encodeURIComponent(raw)+'&page='+page).then(x=>{if(!x.ok)throw new Error(x.status);return x.json()})}catch{if(n===SN)out.innerHTML='<p class="st">La recherche a échoué. Réessayez.</p>';return}
 if(n!==SN||last!==search)return;const res=d.resultats,tot=d.total,shown=page*20+res.length;
 if(page>0){const ul=out.querySelector('ul.res');if(ul)ul.insertAdjacentHTML('beforeend',res.map(resLi).join(''));$('#more')?.remove()}
 else out.innerHTML=(tot?`<p class="st">${tot} résultat${tot>1?'s':''}</p>`:`<p class="st">Aucun mot ne porte ce nom. Si vous cherchez par le sens, utilisez l'onglet « Je connais le sens ».</p>`)+`<ul class="res">`+res.map(resLi).join('')+'</ul>';
 out.insertAdjacentHTML('beforeend',moreBtn(shown,tot));const m=$('#more');if(m)m.onclick=()=>search(page+1)}
function browse(){last=browse;out.innerHTML=FRONT.parts.map(p=>`<details class="pt"><summary><span class="pn">${esc(p.fr)}</span> <span class="vol">${esc(p.vol)}</span><span class="en" lang="en">${esc(p.en)}</span></summary>`+p.themes.map(t=>`<span class="thl lk" tabindex="0" data-th="${t[2]}">${esc(t[0])}<small>${esc(t[1])} · ${t[3]?t[3]+' fiches · ':''}${t[4]} questions</small></span>`).join('')+`</details>`).join('')}
async function theme(k,anchor){const prev=last;out.innerHTML='<p class="st">Chargement du thème…</p>';const t=await getTh(k);
 let h=backBtn()+`<p class="path">${esc(THNAME[k][1])} <span class="vol">${esc(VOLOF[k])}</span></p><h2 class="hd">${esc(t.fr)}</h2><p class="en" lang="en">${esc(t.en)}</p>`+(t.d?`<div class="box"><p>${esc(t.d[0])}</p><p class="en" lang="en">${esc(t.d[1])}</p></div>`:'');
 t.fiches.forEach((f,fi)=>{h+=`<h3 class="sec">${esc(f.fr)}</h3><p class="en" lang="en">${esc(f.en)}</p>`+qhead(f,'f'+fi)+f.b.map(b=>`<div class="lab">${esc(b[0])}</div>`+pair(b[2],b[3])).join('')+`<div class="lab">Mots</div>`+f.wl.map(w=>wlink(w[0],w[1],w[2])).join('')});
 let g=null;t.secs.forEach((s,si)=>{if(s.g&&s.g!==g){g=s.g;h+=`<p class="grp">${esc(g)}</p>`}h+=`<h3 class="sec">${esc(s.fr)}</h3>`+(s.en&&s.en!==s.fr?`<p class="en" lang="en">${esc(s.en)}</p>`:'')+(s.d?`<p class="sd">${esc(s.d[0])}</p><p class="sd en" lang="en">${esc(s.d[1])}</p>`:'')+s.n.map((n,k2)=>qhead(n,`s${si}_${k2}`)+keyBlock(n,`${k}-${si}-${k2}`)+n.e.map(e=>wlink(e.i||e.ref,e.t,e.r)).join('')).join('')});
 out.innerHTML=h;wireBack(prev);last=()=>theme(k);const el=anchor&&document.getElementById(anchor);if(el)el.scrollIntoView();else window.scrollTo(0,0)}
function quest(){last=quest;let h=`<p class="st">Vous ne savez pas quelle question poser ? Partez du type de question. Chaque type réunit les questions qui demandent la même sorte de chose, rangées par thème.</p>`;
 for(const [n,q] of Object.entries(QT)){const items=FRONT.qrep.filter(r=>r[0]==n);if(!items.length)continue;
  h+=`<details><summary><span class="sw" style="--qc:${q[4]}"></span>${esc(q[0])} <span class="en" lang="en">· ${esc(q[1])}</span> <span class="vol">${items.length}</span><br><span class="path">${esc(q[2])}</span></summary>`;let cur=null;
  for(const r of items){if(r[1]!==cur){cur=r[1];h+=`<p class="qth">${esc(cur)}</p>`}h+=`<span class="qi lk" tabindex="0" style="--qc:${q[4]}" data-th="${r[3]}" data-a="${r[4]}">${esc(r[2])}</span>`}h+='</details>'}
 out.innerHTML=h}
function guide(){last=guide;const it=x=>x.type==='heading'?`<p class="q">${esc(x.fr)}</p><p class="en" lang="en">${esc(x.en)}</p>`:pair(x.fr,x.en);
 const o=FRONT.origin;out.innerHTML=`<div class="card">${FRONT.mode.map(it).join('')}</div><div class="card"><h2 class="hd">${esc(o.title_fr)}</h2>`+o.sections.map(s=>`<p class="q">${esc(s.title_fr.replace(/^Section\s*\d+\s*:\s*/,''))}</p>`+s.entries.map(e=>e.blocks.map(b=>`<div class="lab">${esc(b.label_fr||b.label)}</div>`+pair(b.fr,b.en)).join('')).join('<hr>')).join('')+(FRONT.gold||[]).map(it).join('')+'</div>'}
function tab(n){for(const [k,f] of [['tWiz',wiz],['tSearch',search],['tBrowse',browse],['tQuest',quest],['tGuide',guide]]){$('#'+k).setAttribute('aria-pressed',k===n);if(k===n)f()}}
$('#tWiz').onclick=()=>{WP=[];tab('tWiz')};$('#tSearch').onclick=()=>tab('tSearch');$('#tBrowse').onclick=()=>tab('tBrowse');$('#tQuest').onclick=()=>tab('tQuest');$('#tGuide').onclick=()=>tab('tGuide');
$('#q').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>tab('tSearch'),150)});
out.addEventListener('click',ev=>{const wz=ev.target.closest('[data-wz],[data-wzc],[data-wzback]');
 if(wz){const d=wz.dataset;if(d.wz!==undefined){WAUTO.delete(WP.length);WP.push(isNaN(d.wz)?d.wz:+d.wz)}else if(d.wzc!==undefined){WP=WP.slice(0,wzCut(+d.wzc))}else{let idx;do{idx=WP.length-1;WP.pop()}while(WP.length&&WAUTO.has(idx))}wiz();return}
 const kb=ev.target.closest('[data-kopen],[data-kb],[data-kback],[data-kreset]');
 if(kb){const id=kb.dataset.kopen||kb.dataset.kid,w=KW[id];if(!w)return;
  if(kb.dataset.kopen){const el=document.getElementById('key-'+id);el.hidden=!el.hidden;if(!el.hidden)kRender(id);return}
  if(kb.dataset.kb!==undefined)w.stack.push(+kb.dataset.kb);else if(kb.dataset.kback)w.stack.pop();else w.stack=[];kRender(id);return}
 const t=ev.target.closest('[data-id],[data-th]');if(!t)return;if(t.dataset.th)theme(t.dataset.th,t.dataset.a);else show(t.dataset.id)});
out.addEventListener('keydown',ev=>{const d=ev.target.dataset;if(ev.key==='Enter'&&(d.id||d.th||d.kback||d.kreset||d.wzback))ev.target.click()});
fetch('/api/demarrage').then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}).then(({front:f,nb})=>{NB=nb;FRONT=f;QT=f.qtypes;
 f.parts.forEach(p=>p.themes.forEach(t=>{VOLOF[t[2]]=p.vol;THNAME[t[2]]=[p.num,p.fr];PGEN[t[2]]=p.gen}));tab('tWiz')}).catch(()=>{out.innerHTML='<p class="st">Le chargement des données a échoué. Rechargez la page.</p>'});
window.dicoShow=show;
})();
