'use strict';
/* Spar-Speiseplan: Ablauf in Schritten, Plan mit Kosten, Rezept mit Foto, Einkaufsliste.
   Alles läuft im Browser. Einstellungen, Plan und Preise bleiben auf dem Gerät. */

const $ = (s, r = document) => r.querySelector(s);
const eur = n => n.toLocaleString('de-DE', {style:'currency', currency:'EUR'});
const num = n => (Math.round(n * 10) / 10).toString().replace('.', ',');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const STORES = ['Aldi', 'Penny', 'Edeka', 'Lidl', 'Rewe', 'Netto', 'Kaufland', 'Norma'];
/* Preise der neuen Läden: abgeleitet von Aldi/Penny/Edeka (Laden, Faktor) – grobe Schätzung, im Einkauf anpassbar */
const PBASE = [[0,1],[1,1],[2,1],[0,1],[2,1.03],[1,0.98],[1,1.02],[0,1.02]];
const LOGOS = ['Aldi','Penny','Edeka','Lidl','Netto','Norma'];
const WD = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
const STEPS = 8;
const LS = {
  get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

let S = Object.assign({store:0, budget:50, persons:2, days:3, dset:[0,1,2], meals:1, wishes:[], diet:null, gluten:false, lactose:false,
  dev:{herd:true, ofen:false, heissluft:false, mikrowelle:false}, blocked:[]}, LS.get('sp-settings', {}));
if (!Array.isArray(S.dset) || !S.dset.length) S.dset = [0,1,2];
S.days = S.dset.length;
let P = LS.get('sp-plan', null);
let CP = LS.get('sp-preise', {});
let THUMBS = LS.get('sp-thumbs', {});
let portionsView = null;
let showFresh = false;
let lastRoute = '';
let loadTimer = null;
const save = () => { LS.set('sp-settings', S); LS.set('sp-plan', P); LS.set('sp-preise', CP); };

/* ---------- Preise und Kosten ---------- */
function price(i){ const c = CP[S.store] && CP[S.store][i]; if (c != null) return c; const b = PBASE[S.store] || PBASE[0]; return Math.round(ING[i].p[b[0]] * b[1] * 100) / 100; }
function fmt(a, u){
  if (u === 'g') return a >= 1000 ? num(a / 1000) + ' kg' : Math.round(a) + ' g';
  if (u === 'ml') return a >= 1000 ? num(a / 1000) + ' l' : Math.round(a) + ' ml';
  return num(a) + ' ' + u;
}
const packTxt = g => g.lbl ? g.lbl : fmt(g.pack, g.u);
function shop(rids){
  const tot = {};
  for (const rid of rids) for (const [i, a] of R[rid].z) tot[i] = (tot[i] || 0) + a * S.persons;
  const rows = Object.keys(tot).map(i => {
    const g = ING[i], t = tot[i];
    if (LOOSE.has(i)) { const w = Math.max(50, Math.ceil(t / 50 - 1e-9) * 50); return {i, t, w, loose: true, cost: w / g.pack * price(i)}; }
    const packs = Math.max(1, Math.ceil(t / g.pack - 1e-9));
    return {i, t, packs, cost: packs * price(i)};
  });
  rows.sort((a, b) => ING[a.i].name.localeCompare(ING[b.i].name, 'de'));
  return {rows, total: rows.reduce((s, x) => s + x.cost, 0)};
}
const portionCost = r => r.z.reduce((s, [i, a]) => s + a * S.persons / ING[i].pack * price(i), 0);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- Welche Rezepte passen ---------- */
function allowed(r){
  const ids = r.z.map(x => x[0]);
  if (!r.ok.some(d => S.dev[d])) return false;
  if (ids.some(i => S.blocked.includes(i))) return false;
  const meat = ids.some(i => MEAT.has(i)), fish = ids.some(i => FISH.has(i));
  const dairy = ids.some(i => DAIRY.has(i)), egg = ids.includes('eier'), gl = ids.some(i => GLUTEN.has(i));
  if (S.diet === 'vegan' && (meat || fish || dairy || egg)) return false;
  if (S.diet === 'vegetarisch' && (meat || fish)) return false;
  if (S.diet === 'pescetarisch' && meat) return false;
  if (S.gluten && gl) return false;
  if (S.lactose && dairy) return false;
  return true;
}
const eligible = () => RECIPES.filter(allowed);
const wishScore = r => r.tags.filter(t => S.wishes.includes(t)).length;

/* ---------- Plan erzeugen ---------- */
function generate(resetPins){
  const el = eligible(), N = S.days * S.meals;
  if (!el.length) return false;
  const old = (!resetPins && P && P.slots && P.slots.length === N) ? P.slots : [];
  const fixed = Array.from({length:N}, (_, i) => (old[i] && old[i].pin && R[old[i].r] && allowed(R[old[i].r])) ? old[i].r : null);
  const free = fixed.filter(x => !x).length;
  const pc = {}; el.forEach(r => pc[r.id] = portionCost(r));
  const maxPc = Math.max(...Object.values(pc)) || 1;
  const pinSet = new Set(fixed.filter(Boolean));
  const avail = S.budget;
  const build = order => {
    const ids = fixed.slice(), fill = [];
    for (let n = 0; n < free; n++) fill.push(order[n % order.length].id);
    shuffle(fill);
    let f = 0;
    for (let i = 0; i < N; i++) if (!ids[i]) ids[i] = fill[f++];
    return ids;
  };
  let best = null, bestScore = -1e9, cheap = null, cheapCost = 1e9;
  if (free === 0) {
    best = fixed.slice();
  } else {
    for (let t = 0; t < 1500; t++) {
      const a = Math.random();
      const keyed = el.map(r => {
        const base = Math.random() < 0.4 ? Math.random() : pc[r.id] / maxPc;
        return {r, k: base * (1 - a + 2 * a * Math.random()) - wishScore(r) * 0.15 + (pinSet.has(r.id) ? 10 : 0)};
      });
      keyed.sort((x, y) => x.k - y.k);
      const sorted = keyed.map(x => x.r).slice(0, Math.max(1, Math.min(el.length, free)));
      const ids = build(sorted);
      const cost = shop(ids).total;
      if (cost < cheapCost) { cheapCost = cost; cheap = ids; }
      if (cost <= avail) {
        const distinct = new Set(ids).size;
        const w = ids.reduce((s, i) => s + wishScore(R[i]), 0);
        const sc = distinct * 100 + w * 12 + Math.random() * 30 - cost * 0.5;
        if (sc > bestScore) { bestScore = sc; best = ids; }
      }
    }
    if (!best) {
      const asc = el.slice().sort((x, y) => pc[x.id] - pc[y.id]);
      for (let k = Math.min(Math.max(free, 1), asc.length); k >= 1; k--) {
        const ids = build(asc.slice(0, k));
        if (shop(ids).total <= avail) { best = ids; break; }
      }
    }
    if (!best) {
      const one = build(el.slice().sort((x, y) => pc[x.id] - pc[y.id]).slice(0, 1));
      best = shop(one).total < cheapCost ? one : cheap;
    }
  }
  P = {slots:best.map((r, i) => ({r, pin:!!fixed[i]})), checked:{}, ts:Date.now(), eligible:el.length};
  save();
  return true;
}
function swap(i){
  const el = eligible(), cur = P.slots[i].r;
  const used = new Set(P.slots.map(s => s.r));
  let c = el.filter(r => !used.has(r.id));
  if (!c.length) c = el.filter(r => r.id !== cur);
  if (!c.length) { toast('Es gibt kein anderes passendes Gericht.'); return false; }
  const withCost = c.map(r => { const ids = P.slots.map(s => s.r); ids[i] = r.id; return {r, cost:shop(ids).total}; });
  const fit = withCost.filter(x => x.cost <= S.budget);
  const pick = fit.length ? fit[Math.floor(Math.random() * fit.length)] : withCost.sort((a, b) => a.cost - b.cost)[0];
  P.slots[i] = {r:pick.r.id, pin:false};
  P.checked = {};
  save();
  return true;
}

/* ---------- Fotos (TheMealDB) ---------- */
const CATS = ['Vegetarian', 'Chicken', 'Pasta', 'Beef', 'Seafood', 'Side', 'Miscellaneous'];
let thumbsLoading = null;
function loadThumbs(){
  const want = new Set(RECIPES.map(r => r.mid));
  if ([...want].every(id => THUMBS[id])) return Promise.resolve(false);
  if (thumbsLoading) return thumbsLoading;
  thumbsLoading = Promise.allSettled(CATS.map(c =>
    fetch('https://www.themealdb.com/api/json/v1/1/filter.php?c=' + c).then(r => r.json())
  )).then(rs => {
    let got = false;
    rs.forEach(x => {
      if (x.status === 'fulfilled' && x.value && x.value.meals) x.value.meals.forEach(m => {
        if (want.has(m.idMeal)) { THUMBS[m.idMeal] = m.strMealThumb; got = true; }
      });
    });
    if (got) LS.set('sp-thumbs', THUMBS);
    return got;
  }).catch(() => false).then(got => { thumbsLoading = null; return got; });
  return thumbsLoading;
}
function ph(rid, size, cls){
  const r = R[rid], u = THUMBS[r.mid];
  return '<div class="ph ' + (cls || '') + '" data-e="' + r.emo + '">' +
    (u ? '<img src="' + u + '/' + size + '" data-full="' + u + '" alt="' + esc(r.n) + '" loading="lazy">' : '') + '</div>';
}
document.addEventListener('error', e => {
  const t = e.target;
  if (t && t.tagName === 'IMG') {
    if (t.dataset.full && !t.dataset.tried) { t.dataset.tried = '1'; t.src = t.dataset.full; } else { t.remove(); }
  }
}, true);

/* ---------- Kleinkram ---------- */
let toastTimer = null;
function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
function confetti(){
  const box = document.createElement('div'); box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
  const cols = ['#e8505b', '#f4b942', '#3a86ff', '#2f8f5b', '#8338ec', '#ff7f50'];
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = cols[i % cols.length];
    p.style.animationDelay = Math.random() * 0.6 + 's';
    p.style.animationDuration = 1.6 + Math.random() * 1.2 + 's';
    p.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3200);
}
function dayLabel(d){ return WD[S.dset[d]] || ('Tag ' + (d + 1)); }
const mealLabel = i => S.meals === 1 ? 'Warme Mahlzeit' : (i % 2 === 0 ? 'Mittagessen' : 'Abendessen');
const planTotal = () => shop(P.slots.map(s => s.r)).total;

/* ---------- Ansichten: Einrichtung ---------- */
const setSvg = '<svg viewBox="0 0 70 80" width="64" height="74" aria-hidden="true"><rect x="1" y="1" width="68" height="78" rx="12" fill="#a8743f"/><circle cx="35" cy="40" r="20" fill="#f4f1ed" stroke="#d9d3cb" stroke-width="2"/><circle cx="35" cy="40" r="12" fill="none" stroke="#e5e0d8"/><rect x="9" y="22" width="2.4" height="36" rx="1.2" fill="#c9ccd1"/><path d="M60 22c3 4 3 14 0 18v18" stroke="#c9ccd1" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>';

function shell(n, title, sub, body, label){
  return '<div class="scr"><header class="top"><button class="ib" data-act="back" aria-label="Zurück">‹</button>' +
    '<div class="prog" role="progressbar" aria-valuemin="1" aria-valuemax="' + STEPS + '" aria-valuenow="' + (n + 1) + '"><i style="width:' + ((n + 1) / STEPS * 100) + '%"></i></div></header>' +
    '<main class="main"><h1 class="h1">' + title + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + body + '</main>' +
    '<div class="bar"><button class="btn" data-act="next">' + (label || 'Weiter') + '</button></div></div>';
}
function stepView(n){
  if (n === 0) {
    return shell(0, 'Wo kaufst du ein?', 'Die Preise passen wir an den Laden an.',
      '<div class="tiles3">' + STORES.map((s, i) =>
        '<button class="tile store s' + i + (S.store === i ? ' on' : '') + '" data-act="store" data-v="' + i + '" aria-pressed="' + (S.store === i) + '">' + (LOGOS.includes(s) ? '<img src="logos/' + s.toLowerCase() + '.png" alt="' + s + '"><span class="sn">' + s + '</span>' : '<span>' + s + '</span>') + '</button>').join('') + '</div>' +
      '<p class="note">Die Preise sind Schätzungen und lassen sich im Einkauf anpassen.</p>');
  }
  if (n === 1) {
    return shell(1, 'Wie hoch ist dein Budget?', 'Stelle den Betrag ein, den du gerne ausgeben möchtest.',
      '<div class="budget"><div class="bigrow"><input id="bud" type="number" inputmode="numeric" min="10" max="500" value="' + S.budget + '" aria-label="Budget in Euro"><span class="eu">€</span></div>' +
      '<div class="cap">für deinen ganzen Plan</div>' +
      '<input id="rng" class="rng" type="range" min="10" max="200" step="1" value="' + Math.min(200, Math.max(10, S.budget)) + '" aria-label="Budget einstellen">' +
      '<div class="rl"><span>10 €</span><span>200 €</span></div></div>');
  }
  if (n === 2) {
    return shell(2, 'Für wie viele Personen kochst du?', 'Wir passen deinen Plan und dein Budget entsprechend an.',
      '<div class="plates">' + Array.from({length:S.persons}, () => setSvg).join('') + '</div>' +
      '<div class="stepper"><button data-act="stp" data-k="persons" data-d="-1" aria-label="Eine Person weniger">−</button><output>' + S.persons + '</output><button data-act="stp" data-k="persons" data-d="1" aria-label="Eine Person mehr">+</button></div>');
  }
  if (n === 3) {
    return shell(3, 'Für wie viele Tage planst du?', 'Tippe die Tage an, an denen du kochst. Und wie viele warme Mahlzeiten gibt es pro Tag?',
      '<div class="qk">' + [['Mo–Fr','0,1,2,3,4'],['Ganze Woche','0,1,2,3,4,5,6'],['Wochenende','5,6']].map(q => '<button data-act="dquick" data-v="' + q[1] + '">' + q[0] + '</button>').join('') + '</div>' +
      '<div class="wdays">' + WD.map((n, k) => '<button data-act="dtog" data-v="' + k + '" aria-pressed="' + S.dset.includes(k) + '"><span>' + n.slice(0, 2) + '</span><small>' + n + '</small></button>').join('') + '</div>' +
      '<div class="cap c2">' + S.days + (S.days === 1 ? ' Tag' : ' Tage') + ' gewählt</div>' +
      '<div class="seg" role="group" aria-label="Warme Mahlzeiten pro Tag">' +
      [1, 2].map(m => '<button data-act="meals" data-v="' + m + '" aria-pressed="' + (S.meals === m) + '">' + m + (m === 1 ? ' warme Mahlzeit' : ' warme Mahlzeiten') + '</button>').join('') + '</div>');
  }
  if (n === 4) {
    return shell(4, 'Worauf hast du Lust?', 'Wähle bis zu 3 aus. Du kannst auch direkt weiter.',
      '<div class="cards2">' + WISHES.map(w => {
        const on = S.wishes.includes(w.id);
        return '<button class="card2' + (on ? ' on' : '') + '" data-act="wish" data-id="' + w.id + '" aria-pressed="' + on + '"><span class="em">' + w.e + '</span><span>' + w.n + '</span></button>';
      }).join('') + '</div>');
  }
  if (n === 5) {
    const isOn = d => d.grp === 'art' ? S.diet === d.id : S[d.id];
    return shell(5, 'Ernährungswünsche?', 'Optional. Du kannst direkt weiter.',
      '<div class="cards2">' + DIETS.map(d =>
        '<button class="card2' + (isOn(d) ? ' on' : '') + '" data-act="diet" data-id="' + d.id + '" aria-pressed="' + isOn(d) + '"><span class="em">' + d.e + '</span><span>' + d.n + '</span></button>').join('') + '</div>');
  }
  if (n === 6) {
    return shell(6, 'Was hast du in der Küche?', 'Wähle alle Geräte aus, die du hast.',
      '<div class="cards2">' + DEVS.map(d =>
        '<button class="card2' + (S.dev[d.id] ? ' on' : '') + '" data-act="dev" data-id="' + d.id + '" aria-pressed="' + !!S.dev[d.id] + '"><span class="em">' + d.e + '</span><span>' + d.n + '</span></button>').join('') + '</div>');
  }
  return shell(7, 'Blockierte Zutaten', 'Suche nach Zutaten, die du nicht essen möchtest. Rezepte mit diesen Zutaten schlagen wir nicht vor.',
    '<label class="search"><span aria-hidden="true">🔍</span><input id="q" type="search" placeholder="Zutaten suchen…" autocomplete="off"></label>' +
    '<div id="blk">' + blkGrid('') + '</div>', 'Plan erstellen');
}
function blkGrid(q){
  q = q.trim().toLowerCase();
  const ids = q ? Object.keys(ING).filter(i => ING[i].name.toLowerCase().includes(q)) : POPULAR;
  if (!ids.length) return '<p class="note">Nichts gefunden. Probiere einen anderen Begriff.</p>';
  return (q ? '' : '<h2 class="h2">Beliebt</h2>') + '<div class="ingrid">' + ids.map(i => {
    const on = S.blocked.includes(i);
    return '<button class="ing' + (on ? ' on' : '') + '" data-act="blk" data-id="' + i + '" aria-pressed="' + on + '"><span class="ie">' + ING[i].e + '</span><span>' + esc(ING[i].name.replace(/ \(.*\)/, '')) + '</span></button>';
  }).join('') + '</div>';
}

/* ---------- Ansichten: Laden, Plan, Rezept, Einkauf ---------- */
function loadingView(){
  const ids = shuffle(RECIPES.slice()).map(r => r.id);
  const row = list => '<div class="marq"><div class="track">' + list.concat(list).map(id => ph(id, 'medium', 'sq')).join('') + '</div></div>';
  return '<div class="scr center"><div class="collage">' + row(ids.slice(0, 10)) + row(ids.slice(10, 20).reverse()) + '</div>' +
    '<h1 class="h1 ctr">Wir finden Rezepte, die du lieben wirst…</h1><p class="sub ctr">Wir suchen passende Gerichte für dein Budget.</p></div>';
}
function mealCard(s, i){
  const r = R[s.r];
  const wt = r.tags.find(t => S.wishes.includes(t)) || r.tags[0];
  const wn = wt ? WISHES.find(w => w.id === wt).n : '';
  return '<article class="meal" data-act="open" data-i="' + i + '" tabindex="0">' + ph(r.id, 'medium', 'sm') +
    '<div class="mi"><h3>' + esc(r.n) + '</h3><div class="chips"><span class="chip">' + mealLabel(i) + '</span>' + (wn ? '<span class="chip alt">' + esc(wn) + '</span>' : '') + '</div>' +
    '<div class="mm"><span>👤 ' + S.persons + '</span><span>' + eur(portionCost(r)) + '</span></div></div>' +
    '<button class="pin' + (s.pin ? ' on' : '') + '" data-act="pin" data-i="' + i + '" aria-pressed="' + !!s.pin + '" aria-label="' + (s.pin ? 'Gericht lösen' : 'Gericht anheften') + '">' + (s.pin ? '🔒' : '🔓') + '</button></article>';
}
function planView(){
  const sh = shop(P.slots.map(s => s.r)), total = sh.total;
  const over = total > S.budget + 1e-9, pct = Math.min(100, total / S.budget * 100);
  const done = sh.rows.filter(x => P.checked[x.i]).length;
  let days = '';
  for (let d = 0; d < S.days; d++) {
    days += '<section class="day"><h2 class="dh">' + dayLabel(d) + '</h2>' +
      Array.from({length:S.meals}, (_, m) => mealCard(P.slots[d * S.meals + m], d * S.meals + m)).join('') + '</section>';
  }
  const few = P.eligible < S.days * S.meals
    ? '<p class="note warn">Mit deinen Wünschen passen nur ' + P.eligible + ' Gerichte. Deshalb wiederholen sich einige.</p>' : '';
  return '<div class="scr plan"><header class="top"><button class="ib" data-act="restart" aria-label="Neu starten">⚙︎</button><div class="pill">Geplant für ' + STORES[S.store] + '</div><span class="ib ghost"></span></header>' +
    '<main class="main"><h1 class="h1 ctr">' + (showFresh ? 'Dein Essensplan ist fertig' : 'Dein Essensplan') + '</h1>' +
    '<div class="two"><div class="stat"><div class="k">GESCHÄTZTE KOSTEN</div><div class="v' + (over ? ' bad' : '') + '">' + eur(total) + ' <small>/ ' + eur(S.budget) + '</small></div><div class="line"><i class="' + (over ? 'bad' : '') + '" style="width:' + pct + '%"></i></div></div>' +
    '<button class="stat link" data-act="shop"><div class="k">ZUM ANZEIGEN TIPPEN ↗</div><div class="v2">Einkauf</div><div class="s">' + done + '/' + sh.rows.length + ' Artikel gekauft</div></button></div>' +
    (over ? '<p class="note warn">Dieser Plan ist ' + eur(total - S.budget) + ' zu teuer. Probiere weniger Tage, weniger Mahlzeiten oder ein höheres Budget.</p>' : '') +
    few +
    '<p class="note ctr">Hefte Mahlzeiten an, die du liebst, und generiere den Rest neu.</p>' + days +
    '<p class="credit">Preise sind Schätzungen für ganze Packungen. Fotos sind Symbolfotos von <a href="https://www.themealdb.com" target="_blank" rel="noopener">TheMealDB</a>.</p></main>' +
    '<div class="bar two"><button class="btn ghost" data-act="regen">↻ Alle neu generieren</button><button class="btn" data-act="saveplan">Plan speichern</button></div></div>';
}
function recipeView(i){
  const s = P.slots[i]; if (!s) return planView();
  const r = R[s.r]; const pn = portionsView || S.persons;
  const devs = r.ok.map(d => DEVS.find(x => x.id === d).n).join(' oder ');
  return '<div class="scr rec"><div class="hero">' + ph(r.id, 'large', 'big') +
    '<button class="ib float" data-act="back" aria-label="Zurück">‹</button><button class="ib float r" data-act="pin" data-i="' + i + '" aria-pressed="' + !!s.pin + '" aria-label="Anheften">' + (s.pin ? '🔒' : '🔓') + '</button></div>' +
    '<main class="main"><h1 class="h1">' + esc(r.n) + '</h1>' +
    '<div class="chips"><span class="chip">' + mealLabel(i) + '</span>' + r.tags.slice(0, 3).map(t => '<span class="chip alt">' + WISHES.find(w => w.id === t).n + '</span>').join('') + '</div>' +
    '<div class="meta"><div><b>⏱ ' + r.min + ' Min.</b><span>Zeit</span></div><div><b>' + eur(portionCost(r) / S.persons) + '</b><span>pro Portion</span></div><div><b>' + devs + '</b><span>Gerät</span></div></div>' +
    '<div class="acts"><button class="btn" data-act="cook" data-i="' + i + '">Kochen</button><button class="btn ghost" data-act="swap" data-i="' + i + '">Tauschen</button></div>' +
    '<div class="zh"><h2 class="h2">Zutaten</h2><div class="stepper sm"><button data-act="portion" data-d="-1" aria-label="Eine Portion weniger">−</button><output>' + pn + '</output><button data-act="portion" data-d="1" aria-label="Eine Portion mehr">+</button><span class="pl">Portionen</span></div></div>' +
    '<ul class="zl">' + r.z.map(([id, a]) => '<li><span class="ie">' + ING[id].e + '</span><span class="zn">' + esc(ING[id].name) + '</span><span class="za">' + fmt(a * pn, ING[id].u) + '</span></li>').join('') + '</ul>' +
    '<p class="note">Salz, Pfeffer und Gewürze hast du hoffentlich zu Hause.</p>' +
    '<h2 class="h2">Zubereitung</h2><ol class="steps">' + r.s.map(t => '<li>' + esc(t) + '</li>').join('') + '</ol>' +
    '<p class="credit">Symbolfoto von <a href="https://www.themealdb.com" target="_blank" rel="noopener">TheMealDB</a>. Das Gericht kann anders aussehen.</p></main></div>';
}
function cookView(i, st){
  const s = P.slots[i]; if (!s) return planView();
  const r = R[s.r], n = r.s.length; st = Math.min(Math.max(st, 0), n - 1);
  return '<div class="scr cook"><header class="top"><button class="ib" data-act="back" aria-label="Zurück">‹</button><div class="prog"><i style="width:' + ((st + 1) / n * 100) + '%"></i></div></header>' +
    '<main class="main"><div class="cap left">' + esc(r.n) + '</div><div class="stepno">Schritt ' + (st + 1) + ' von ' + n + '</div><p class="bigtext">' + esc(r.s[st]) + '</p></main>' +
    '<div class="bar two"><button class="btn ghost" data-act="cprev" data-i="' + i + '" data-s="' + st + '"' + (st === 0 ? ' disabled' : '') + '>Zurück</button>' +
    (st === n - 1 ? '<button class="btn" data-act="cdone" data-i="' + i + '">Fertig</button>' : '<button class="btn" data-act="cnext" data-i="' + i + '" data-s="' + st + '">Weiter</button>') + '</div></div>';
}
function shopView(){
  const sh = shop(P.slots.map(s => s.r)), done = sh.rows.filter(x => P.checked[x.i]).length;
  const groups = AREAS.map(a => {
    const rows = sh.rows.filter(x => ING[x.i].area === a); if (!rows.length) return '';
    return '<section class="grp"><h2 class="h2">' + a + '</h2>' + rows.map(x => {
      const g = ING[x.i];
      return '<label class="row"><input type="checkbox" data-chk="' + x.i + '"' + (P.checked[x.i] ? ' checked' : '') + '><span class="ie">' + g.e + '</span><span class="rt"><b>' + esc(g.name) + '</b><span>Du brauchst ' + fmt(x.t, g.u) + ' · ' + x.packs + ' × ' + packTxt(g) + '</span></span><span class="rp">' + eur(x.cost) + '</span></label>';
    }).join('') + '</section>';
  }).join('');
  const fold = '<details class="fold"><summary>Preise anpassen (' + STORES[S.store] + ')</summary><p class="note">Trage den Preis pro Packung ein, den du im Markt siehst.</p>' +
    sh.rows.map(x => { const g = ING[x.i]; return '<div class="pr"><span>' + esc(g.name) + '<small>pro ' + packTxt(g) + (LOOSE.has(x.i) ? ' (lose)' : '') + '</small></span><input type="number" step="0.01" min="0" inputmode="decimal" data-price="' + x.i + '" value="' + price(x.i).toFixed(2) + '" aria-label="Preis ' + esc(g.name) + '"></div>'; }).join('') +
    '<button class="btn ghost" data-act="resetprice">Meine Preise zurücksetzen</button></details>';
  return '<div class="scr"><header class="top"><button class="ib" data-act="back" aria-label="Zurück">‹</button><div class="pill">Einkauf bei ' + STORES[S.store] + '</div><span class="ib ghost"></span></header>' +
    '<main class="main"><h1 class="h1">Einkaufsliste</h1><p class="sub">' + done + ' von ' + sh.rows.length + ' Artikeln gekauft</p>' + groups + fold + '</main>' +
    '<div class="bar tot"><span>Einkauf gesamt</span><b>' + eur(sh.total) + '</b></div></div>';
}

/* ---------- Routen ---------- */
function route(){ return (location.hash || '').replace(/^#\/?/, '').split('/'); }
function go(h, replace){ if (replace) location.replace(h); else location.hash = h; }
function render(keepScroll){
  const [a, b, c] = route(), app = $('#app');
  clearTimeout(loadTimer);
  let html;
  if (a === 'start') {
    html = stepView(Math.min(Math.max(parseInt(b || '0', 10) || 0, 0), STEPS - 1));
  } else if (a === 'laden') {
    html = loadingView();
    loadTimer = setTimeout(() => { showFresh = true; go('#/plan', true); }, 3200);
  } else if (P && a === 'einkauf') {
    html = shopView();
  } else if (P && a === 'rezept') {
    if (lastRoute !== location.hash && !/^rezept/.test(lastRoute)) portionsView = null;
    html = recipeView(parseInt(b, 10));
  } else if (P && a === 'kochen') {
    html = cookView(parseInt(b, 10), parseInt(c || '0', 10) || 0);
  } else if (P && (a === 'plan' || a === '')) {
    html = planView();
  } else {
    html = stepView(0);
  }
  app.innerHTML = html;
  if (!keepScroll) window.scrollTo(0, 0);
  lastRoute = location.hash.replace(/^#\/?/, '');
  if (a === 'plan' && showFresh) { confetti(); showFresh = false; }
}
window.addEventListener('hashchange', () => render(false));

/* ---------- Eingaben ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, step = parseInt(route()[1] || '0', 10) || 0;
  const i = el.dataset.i !== undefined ? parseInt(el.dataset.i, 10) : null;
  if (act === 'back') { if (history.length > 1) history.back(); else go(P ? '#/plan' : '#/start/0'); return; }
  if (act === 'next') {
    if (step < STEPS - 1) { go('#/start/' + (step + 1)); return; }
    const ok = generate(true);
    if (!ok) { toast('Mit diesen Wünschen finden wir kein Gericht. Ändere Geräte, Ernährung oder blockierte Zutaten.'); return; }
    go('#/laden'); return;
  }
  if (act === 'store') { S.store = parseInt(el.dataset.v, 10); save(); render(true); return; }
  if (act === 'stp') {
    const k = el.dataset.k, lim = {persons:[1, 10], days:[1, 7]}[k];
    S[k] = Math.min(lim[1], Math.max(lim[0], S[k] + parseInt(el.dataset.d, 10))); save(); render(true); return;
  }
  if (act === 'dtog') {
    const k = parseInt(el.dataset.v, 10), x = S.dset.indexOf(k);
    if (x >= 0) { if (S.dset.length > 1) S.dset.splice(x, 1); else toast('Mindestens ein Tag.'); } else S.dset.push(k);
    S.dset.sort((a, b) => a - b); S.days = S.dset.length; save(); render(true); return;
  }
  if (act === 'dquick') { S.dset = el.dataset.v.split(',').map(Number); S.days = S.dset.length; save(); render(true); return; }
  if (act === 'meals') { S.meals = parseInt(el.dataset.v, 10); save(); render(true); return; }
  if (act === 'wish') {
    const id = el.dataset.id, k = S.wishes.indexOf(id);
    if (k >= 0) S.wishes.splice(k, 1); else if (S.wishes.length < 3) S.wishes.push(id); else toast('Du kannst bis zu 3 auswählen.');
    save(); render(true); return;
  }
  if (act === 'diet') {
    const id = el.dataset.id;
    if (id === 'gluten' || id === 'lactose') S[id] = !S[id]; else S.diet = (S.diet === id) ? null : id;
    save(); render(true); return;
  }
  if (act === 'dev') { S.dev[el.dataset.id] = !S.dev[el.dataset.id]; save(); render(true); return; }
  if (act === 'blk') {
    const id = el.dataset.id, k = S.blocked.indexOf(id);
    if (k >= 0) S.blocked.splice(k, 1); else S.blocked.push(id);
    save(); el.classList.toggle('on'); el.setAttribute('aria-pressed', String(k < 0)); return;
  }
  if (act === 'restart') { go('#/start/0'); return; }
  if (act === 'shop') { go('#/einkauf'); return; }
  if (act === 'open') { go('#/rezept/' + i); return; }
  if (act === 'pin') { P.slots[i].pin = !P.slots[i].pin; save(); render(true); toast(P.slots[i].pin ? 'Gericht angeheftet' : 'Gericht gelöst'); return; }
  if (act === 'regen') {
    if (P.slots.every(s => s.pin)) { toast('Alle Gerichte sind angeheftet.'); return; }
    generate(); render(true); toast('Neuer Vorschlag'); return;
  }
  if (act === 'saveplan') { save(); toast('Plan gespeichert'); return; }
  if (act === 'swap') { if (swap(i)) { toast('Gericht getauscht'); render(true); } return; }
  if (act === 'portion') { portionsView = Math.min(12, Math.max(1, (portionsView || S.persons) + parseInt(el.dataset.d, 10))); render(true); return; }
  if (act === 'cook') { go('#/kochen/' + i + '/0'); return; }
  if (act === 'cnext') { go('#/kochen/' + i + '/' + (parseInt(el.dataset.s, 10) + 1)); return; }
  if (act === 'cprev') { go('#/kochen/' + i + '/' + (parseInt(el.dataset.s, 10) - 1)); return; }
  if (act === 'cdone') { toast('Guten Appetit!'); go('#/plan'); return; }
  if (act === 'resetprice') { delete CP[S.store]; save(); render(true); return; }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'bud' || t.id === 'rng') {
    const v = Math.max(0, parseFloat(String(t.value).replace(',', '.')) || 0);
    S.budget = v;
    if (t.id === 'bud') { const r = $('#rng'); if (r) r.value = Math.min(200, Math.max(10, v)); } else { const b = $('#bud'); if (b) b.value = v; }
    save();
  } else if (t.id === 'q') {
    $('#blk').innerHTML = blkGrid(t.value);
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.chk) { P.checked[t.dataset.chk] = t.checked; save(); render(true); return; }
  if (t.dataset.price) {
    const v = parseFloat(String(t.value).replace(',', '.'));
    if (!(v >= 0)) return;
    (CP[S.store] = CP[S.store] || {})[t.dataset.price] = v; save();
    const open = $('.fold'); const was = open && open.open;
    render(true);
    if (was) { const f = $('.fold'); if (f) f.open = true; }
  }
  if (t.id === 'bud' && S.budget < 5) { S.budget = 5; t.value = 5; save(); }
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('meal')) {
    e.preventDefault(); go('#/rezept/' + e.target.dataset.i);
  }
});

/* ---------- Start ---------- */
render(false);
loadThumbs().then(got => { if (got) render(true); });
