'use strict';
/* Holt aktuelle Rewe-Preise (Abholmarkt Dassendorf) und passt die Preise in daten.js an. Läuft in GitHub Actions. */
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('daten.js', 'utf8');
const ctx = vm.createContext({console});
vm.runInContext(src + '\n;this.X = {RAW};', ctx);
const RAW = ctx.X.RAW;
const MARKET = '565120';
const H = {'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36', 'Accept': 'application/json'};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const QUERY = {}; /* Suchbegriff abweichend vom Namen */
async function search(q){
  const url = 'https://www.rewe.de/shop/api/products?serviceTypes=PICKUP&market=' + MARKET + '&objectsPerPage=40&page=1&search=' + encodeURIComponent(q);
  for (let t = 0; t < 3; t++) {
    try { const r = await fetch(url, {headers: H}); if (r.ok) return ((await r.json())._embedded || {}).products || []; } catch (e) {}
    await sleep(1500);
  }
  return [];
}
const BADNAME = /\bbio\b|premium|vegan|veggie|plant|fertig|menü|menu|mix\b|snack|baby|kinder|light|laktosefrei|demeter|regional|marken|gourmet|delikatess/i;
const q25 = a => { a = a.slice().sort((x, y) => x - y); return a[Math.floor((a.length - 1) * 0.5)]; }; /* Mittelwert (Median) der normalen Produkte */
function cands(products, key, name){
  const w = name.toLowerCase().replace(/[^a-zäöüß ]/g, '').split(' ')[0];
  const out = [];
  for (const p of products) {
    const pr = p._embedded && p._embedded.articles && p._embedded.articles[0] && p._embedded.articles[0]._embedded.listing && p._embedded.articles[0]._embedded.listing.pricing;
    if (!pr || !pr.currentRetailPrice) continue;
    const n = (p.productName || '');
    if (!n.toLowerCase().includes(w.slice(0, 5)) || BADNAME.test(n)) continue;
    out.push({n, cents: pr.currentRetailPrice, base: pr.basePrice, unit: pr.baseUnit && Object.keys(pr.baseUnit)[0], gram: pr.grammage || ''});
  }
  return out;
}
function newPrice(a, c){ /* Euro pro Packung (Rewe) oder null */
  const [name, u, pack] = a;
  if (u === 'g' || u === 'ml') {
    const want = u === 'g' ? 'KG' : 'L';
    const list = c.filter(x => x.unit === want && x.base).map(x => x.base / 100);
    if (list.length < 2) return null;
    return q25(list) * pack / 1000;
  }
  if (u === 'Stück') {
    const list = c.map(x => { const m = /(\d+)\s*(?:Stück|St\b)/i.exec(x.gram); return m ? x.cents / 100 / +m[1] : null; }).filter(Boolean);
    if (list.length < 2) return null;
    return q25(list) * pack;
  }
  const list = c.map(x => x.cents / 100);
  if (list.length < 3) return null;
  return q25(list) * pack;
}
(async () => {
  const report = [], upd = {};
  for (const k of Object.keys(RAW)) {
    const a = RAW[k], q = QUERY[k] || a[0];
    const c = cands(await search(q), k, a[0]);
    const np = newPrice(a, c);
    const oldRewe = a[6][2] * 1.03;
    if (np == null || !(np > 0)) { report.push(k + ': kein Treffer'); await sleep(250); continue; }
    if (np < oldRewe * 0.7 || np > oldRewe * 1.7) { report.push(k + ': unplausibel ' + np.toFixed(2) + ' (alt ' + oldRewe.toFixed(2) + ') uebersprungen'); await sleep(250); continue; }
    const f = np / 1.03 / a[6][2];
    upd[k] = a[6].map(x => Math.round(x * f * 100) / 100);
    report.push(k + ': ' + oldRewe.toFixed(2) + ' -> ' + np.toFixed(2) + ' (' + c.length + ' Treffer)');
    await sleep(250);
  }
  let out = src, n = 0;
  for (const k in upd) {
    const re = new RegExp('(^\\s*' + k + ':\\[[^\\n]*?,)\\[[\\d.,]+\\](\\],?\\s*$)', 'm');
    if (re.test(out)) { out = out.replace(re, '$1[' + upd[k].join(',') + ']$2'); n++; }
  }
  fs.writeFileSync('daten.js', out);
  console.log(report.join('\n'));
  console.log('Angepasst:', n, 'von', Object.keys(RAW).length);
  if (n < 20) { console.error('Zu wenige Treffer, Abbruch'); process.exit(1); }
})();
