'use strict';
/* Rezept-Import: macht aus den Zutaten-Zeilen einer Rezeptseite Zutaten, die die App rechnen kann. */
const norm = s => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
const FR = {'½':'.5','¼':'.25','¾':'.75','⅓':'.33','⅔':'.67'};
const SKIP = /salz|pfeffer|wasser|zucker|mehl|staerke|essig|senf|ketchup|gewuerz|paprikapulver|curry|zimt|muskat|oregano|thymian|rosmarin|basilikum|petersilie|schnittlauch|dill\b|lorbeer|kreuzkuemmel|kurkuma|chili|vanille|backpulver|sojasosse|sojasauce|worcester|tabasco|honig|sirup|zitronensaft|mayonnaise|knoblauchpulver|zwiebelpulver|koriander|minze|salbei|majoran|estragon|petersilie|kraeuter|garnier|deko|nach belieben|ca\.? ?\d+ ?cm/;
const KEYMAP = [
  ['seelachs', /seelachs|kabeljau|fischfilet|alaska/], ['lachs', /lachs/], ['fischst', /fischstaebchen/],
  ['hack', /hackfleisch|\bhack\b|gehacktes|\bmett\b/],
  ['haehnchen', /(haehnchen|huehner|huhn|pute|puten)[a-z]*(brust|filet)|brustfilet|haehnchenbrust/], ['keulen', /keule|schenkel|haehnchen|huhn|pute/],
  ['wurst', /wuerstchen|bratwurst|wiener|bockwurst|wurst/], ['speck', /speck|bacon|schinken/],
  ['spinat', /spinat/], ['gemtk', /gemuesemischung|buntes gemuese|tk.?gemuese|tiefkuehl.?gemuese/], ['thunfisch', /thunfisch/],
  ['kidney', /kidney|rote bohnen/], ['kichererbsen', /kichererbsen/], ['kokos', /kokosmilch|kokosnussmilch|kokoscreme/], ['mais', /\bmais\b/], ['tomaten', /tomate/],
  ['zwiebeln', /zwiebel/], ['knoblauch', /knoblauch/], ['paprika', /paprika/], ['zucchini', /zucchini/], ['karotten', /karotte|moehre/], ['brokkoli', /brokkoli|broccoli/],
  ['kohl', /weisskohl|spitzkohl|wirsing|\bkohl\b/], ['lauch', /lauch|porree/], ['pilze', /champignon|pilz/], ['suessk', /suesskartoffel|batate/], ['kartoffeln', /kartoffel/],
  ['linsen', /linsen/], ['couscous', /couscous/], ['lasagne', /lasagne/],
  ['nudeln', /nudel|spaghetti|penne|fusilli|tagliatelle|pasta|makkaroni|rigatoni|farfalle|spirelli/], ['reis', /\breis\b|basmati|jasmin/],
  ['oel', /\boel\b|[a-z]oel\b|olivenoel|rapsoel|bratoel/], ['bruehe', /bruehe|bouillon|fond\b/],
  ['eier', /\beier\b|\bei\b|\beier\)|vollei/], ['milch', /\bmilch\b|vollmilch/], ['sahne', /sahne|schlagobers|cremefine|kochcreme|creme fraiche|schmand/],
  ['mozzarella', /mozzarella/], ['feta', /feta|hirtenkaese|schafskaese/], ['kaese', /kaese|gouda|emmentaler|parmesan|cheddar|gruyere|raclette/], ['joghurt', /joghurt|jogurt|skyr/],
  ['tortilla', /tortilla|wrap/], ['pizzateig', /pizzateig/], ['broetchen', /broetchen|brioche/], ['brot', /toast|\bbrot\b|baguette|ciabatta/]
];
const PIECE = {zwiebeln:80, karotten:80, kartoffeln:100, paprika:150, zucchini:250, brokkoli:400, kohl:1000, lauch:200, pilze:25, suessk:300, haehnchen:150, keulen:200, lachs:125, seelachs:150, hack:250, wurst:80, speck:30, tomaten:100, feta:200, kaese:50, joghurt:150};
const CAN = {tomaten:400, kichererbsen:240, kidney:240, kokos:400, mais:285, thunfisch:150};
const UNITS = {g:'g', gr:'g', gramm:'g', kg:'kg', ml:'ml', l:'l', liter:'l', el:'el', tl:'tl', prise:'prise', prisen:'prise', bund:'bund', pck:'pck', pkt:'pck', pk:'pck', paeckchen:'pck', packung:'pck', dose:'dose', dosen:'dose', glas:'glas', becher:'becher', scheibe:'stk', scheiben:'stk', stueck:'stk', stk:'stk', zehe:'zehe', zehen:'zehe', knolle:'knolle', kopf:'stk', handvoll:'bund', tasse:'tasse', kugel:'stk', kugeln:'stk', wuerfel:'stk', msp:'prise', cl:'cl', stange:'stk', stangen:'stk', zweig:'bund', zweige:'bund'};

function parseQty(s){
  s = s.replace(/[½¼¾⅓⅔]/g, m => ' ' + FR[m]).replace(',', '.').trim();
  const m = /^(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?(?:\s+(\d+)\/(\d+))?|^(\d+)\/(\d+)/.exec(s);
  if (!m) return null;
  let q;
  if (m[5]) q = +m[5] / +m[6];
  else { q = +m[1]; if (m[2]) q = (q + +m[2]) / 2; if (m[3]) q += +m[3] / +m[4]; }
  return {q, len: m[0].length};
}
function parseLine(line){
  let s = String(line).replace(/\s+/g, ' ').trim();
  const p = parseQty(s);
  let q = null, rest = s;
  if (p) { q = p.q; rest = s.slice(p.len).trim(); }
  let unit = null;
  const m = /^([a-zA-ZäöüÄÖÜß.]+)\s*(.*)$/.exec(rest);
  if (m) { const u = UNITS[norm(m[1]).replace(/\.$/, '')]; if (u) { unit = u; rest = m[2]; } }
  rest = rest.replace(/^(von|vom|an|der|die|das)\s+/i, '');
  return {q, unit, name: rest.replace(/\(.*?\)/g, ' ').replace(/,.*$/, '').replace(/\s+/g, ' ').trim(), full: s};
}
function toAmount(key, q, unit){
  const g = ING[key];
  if (q == null) q = 1;
  if (g.u === 'g') {
    if (unit === 'g') return q; if (unit === 'kg') return q * 1000; if (unit === 'ml') return q; if (unit === 'l') return q * 1000; if (unit === 'el') return q * 15; if (unit === 'tl') return q * 5;
    if (unit === 'pck') return q * Math.min(g.pack, 500);
    if (unit === 'dose') return q * (CAN[key] || 400);
    return q * (PIECE[key] || 150);
  }
  if (g.u === 'ml') {
    if (unit === 'g') return q; if (unit === 'kg') return q * 1000; if (unit === 'ml') return q; if (unit === 'l') return q * 1000; if (unit === 'cl') return q * 10; if (unit === 'el') return q * 15; if (unit === 'tl') return q * 5;
    if (unit === 'becher') return q * 200; if (unit === 'tasse') return q * 250; if (unit === 'pck') return q * 200;
    return q * 100;
  }
  if (g.u === 'Dosen') {
    if (unit === 'g') return q / (CAN[key] || 400); if (unit === 'ml') return q / (CAN[key] || 400); if (unit === 'kg') return q * 1000 / (CAN[key] || 400);
    return q;
  }
  if (g.u === 'Zehen') return unit === 'knolle' ? q * 10 : q;
  if (key === 'mozzarella' || g.u === 'Kugeln') return unit === 'g' ? q / 125 : q;
  if (key === 'bruehe' || g.u === 'Würfel') return unit === 'el' ? q : (unit === 'tl' ? q / 2 : q);
  if (key === 'tortilla' || key === 'pizzateig' || key === 'broetchen') return q;
  return q;
}
function slug(s){ return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30); }
function cleanName(s){ const t = s.replace(/^[\d.,/\s]+/, '').trim(); return t.charAt(0).toUpperCase() + t.slice(1, 40); }

/* data: Antwort von /api/import. Ergebnis: Rezept für die App */
function buildRecipe(data, url){
  const yieldN = Math.max(1, data.yield || 4), z = {}, defs = {}, raw = [];
  for (const line of data.ingredients) {
    const it = parseLine(line); raw.push(it.full);
    const n = norm(it.name);
    if (!n || SKIP.test(n)) continue;
    let key = null;
    for (const [k, re] of KEYMAP) if (re.test(n)) { key = k; break; }
    if (key) { z[key] = (z[key] || 0) + toAmount(key, it.q, it.unit) / yieldN; continue; }
    const ck = 'x_' + slug(it.name);
    if (!defs[ck]) defs[ck] = {name:cleanName(it.name), u:'Stück', pack:1, lbl:'nach Bedarf', area:'Sonstiges', e:'🛒', p:[1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2], custom:true};
    z[ck] = 1 / yieldN;
  }
  const zl = Object.keys(z).map(k => [k, Math.round(z[k] * 100) / 100]);
  if (!zl.length) throw new Error('Keine Zutaten erkannt');
  return {id:'own_' + slug(url).slice(-24) + '_' + (Date.now() % 100000), n:data.name || 'Eigenes Rezept', ok:['herd', 'ofen', 'heissluft', 'mikrowelle'], min:data.minutes || 30,
    img:data.image || '', tags:[], z:zl, s:data.steps.length ? data.steps : ['Zubereitung auf der Originalseite ansehen.'], defs, raw, yield:yieldN, url, source:data.source || '', own:true};
}
