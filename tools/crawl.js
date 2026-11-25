'use strict';
/* Holt Rezepte über die öffentliche Chefkoch-Schnittstelle und schreibt rezepte.json (läuft in GitHub Actions). */
const fs = require('fs'), vm = require('vm');
const ctx = vm.createContext({console});
vm.runInContext(fs.readFileSync('daten.js', 'utf8') + '\n' + fs.readFileSync('import.js', 'utf8') + '\n;this.X = {ING, buildRecipe, norm};', ctx);
const {buildRecipe, norm} = ctx.X;

const TARGET = +process.env.TARGET || 3600;
const API = 'https://api.chefkoch.de/v2/recipes';
const H = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Accept': 'application/json'};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 4){
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {headers: H});
      if (r.status === 429 || r.status >= 500) { await sleep(1500 * (i + 1)); continue; }
      if (!r.ok) { if (!get.warned || get.warned < 5) { get.warned = (get.warned || 0) + 1; console.log('HTTP', r.status, url, (await r.text()).slice(0, 200)); } return null; }
      return await r.json();
    } catch (e) { await sleep(1000 * (i + 1)); }
  }
  return null;
}
const TERMS = `Hähnchen,Hähnchenbrust,Hähnchenschenkel,Hühnerfrikassee,Putengeschnetzeltes,Putenbrust,Hackfleisch,Hackbällchen,Frikadellen,Hackfleischsoße,Bolognese,Lasagne,Spaghetti,Nudelauflauf,Nudelpfanne,Nudelsalat,Pasta,Tortellini,Gnocchi,Spätzle,Käsespätzle,Kartoffelauflauf,Kartoffelsuppe,Kartoffelpuffer,Bratkartoffeln,Kartoffelgratin,Kartoffelpüree,Kartoffelsalat,Reispfanne,Risotto,Reisauflauf,Milchreis,Linsensuppe,Linseneintopf,Linsencurry,Kichererbsen,Kichererbsencurry,Bohneneintopf,Chili con Carne,Gulasch,Gulaschsuppe,Eintopf,Gemüseeintopf,Erbsensuppe,Gemüsesuppe,Tomatensuppe,Kürbissuppe,Zwiebelsuppe,Hühnersuppe,Brokkoli,Brokkoliauflauf,Blumenkohl,Rosenkohl,Spinat,Spinatlasagne,Zucchini,Zucchinipfanne,Aubergine,Paprika,Gefüllte Paprika,Ofengemüse,Gemüsepfanne,Gemüseauflauf,Gemüsecurry,Curry,Kokosmilch,Thai,Wok,Chinapfanne,Asia Nudeln,Gebratene Nudeln,Gebratener Reis,Sushi,Falafel,Hummus,Shakshuka,Couscous,Bulgur,Quinoa,Tofu,Veganes Curry,Vegane Bolognese,Vegetarisch,Vegan,Low Carb,Schnell und einfach,Einfach günstig,Günstig kochen,Studentenessen,Resteverwertung,Blechgericht,Ofengericht,Auflauf,Überbacken,Gratin,Quiche,Flammkuchen,Pizza,Pizzabrötchen,Calzone,Burger,Wraps,Tortilla,Burritos,Tacos,Enchiladas,Fajitas,Quesadilla,Schnitzel,Cordon bleu,Rouladen,Braten,Schweinebraten,Schweinefilet,Kassler,Sauerbraten,Rinderbraten,Rindergulasch,Steak,Geschnetzeltes,Bratwurst,Currywurst,Würstchen,Leberkäse,Fischstäbchen,Lachs,Lachsfilet,Seelachs,Forelle,Thunfisch,Garnelen,Fischauflauf,Fischpfanne,Kabeljau,Matjes,Eierkuchen,Pfannkuchen,Omelett,Rührei,Spiegelei,Eiersalat,Kartoffeltaschen,Maultaschen,Knödel,Klöße,Semmelknödel,Kartoffelknödel,Rotkohl,Weißkohl,Kohlrouladen,Sauerkraut,Wirsing,Grünkohl,Lauch,Lauchsuppe,Pilze,Champignons,Pilzpfanne,Rahmpilze,Mozzarella,Feta,Schafskäse,Käsesuppe,Halloumi,Ofenkäse,Süßkartoffel,Kürbis,Karotten,Möhren,Rote Bete,Erbsen,Bohnen,Grüne Bohnen,Mais,Salat,Nudelsalat,Wurstsalat,Bauernfrühstück,Frühstück,Rührei,Brotaufstrich,Belegte Brote,Sandwich,Toast,Hotdog,Dips,Suppe,Soße,Hähnchenkeulen,Hähnchen Ofen,Chicken Wings,Hühnchen Curry,Butter Chicken,Tikka Masala,Dal,Pad Thai,Ramen,Bowl,Buddha Bowl,Poke Bowl,Mediterran,Italienisch,Griechisch,Türkisch,Indisch,Mexikanisch,Chinesisch,Deutsche Küche,Hausmannskost,Omas Rezepte,Kinder,Familienessen,Meal Prep,Airfryer,Heißluftfritteuse,Mikrowelle,Slow Cooker,Eintopf schnell,Pfannengericht,One Pot,Ofenkartoffeln,Folienkartoffeln,Kartoffelecken,Pommes,Rösti,Reibekuchen,Schupfnudeln,Krautfleckerl,Nudeln mit Soße,Tomatensoße,Käsesoße,Sahnesoße,Carbonara,Arrabbiata,Aglio e olio,Pesto,Gemüsebolognese,Hackfleisch Auflauf,Hackfleisch Pfanne,Moussaka,Börek,Gözleme,Linsenbratlinge,Gemüsebratlinge,Kartoffelsuppe Würstchen,Nudelsuppe,Reissuppe,Graupensuppe,Brotsuppe,Kohlsuppe,Gyros,Gyrospfanne,Souvlaki,Tzatziki,Köfte,Kebab,Döner,Pide,Lahmacun,Hirtensalat,Bratreis,Nasi Goreng,Bami Goreng,Frühlingsrollen,Teriyaki,Gemüsenudeln,Zoodles,Ofenfeta,Ofenlachs,Ofenhähnchen,Ofenkürbis`.split(',').map(s => s.trim()).filter(Boolean);
const BAD = /kuchen|torte|plätzchen|plaetzchen|gebäck|cookie|muffin|cupcake|likör|liqueur|cocktail|bowle|marmelade|konfitüre|gelee|eis\b|eiscreme|pudding|creme brulee|dessert|nachtisch|keks|brownie|waffel|plunder|strudel süß|glühwein|punsch|smoothie|shake|limonade|sirup|bonbon|schokolade|praline|marzipan|lebkuchen|stollen|hefezopf|brötchen backen|brot backen|sauerteig|torte|tarte|mousse|parfait|kompott|aufstrich süß/i;
const MEAT = /fleisch|hack|schinken|speck|wurst|haehnchen|huhn|huehner|pute|rind|schwein|lamm|salami|gulasch|bacon|kasseler|\bente|gans\b|leber|schnitzel|steak|gyros|kebab|doener|mett|chorizo|pancetta|lyoner|bratwurst|geschnetzelt|keule|brustfilet|filet\b/;
const FISH = /fisch|lachs|thunfisch|forelle|garnele|shrimp|scampi|krabbe|muschel|tintenfisch|calamari|hering|kabeljau|seelachs|matjes|sardelle|anchovi|surimi|dorade|zander|scholle|pangasius|meeresfruechte|lachs/;
const DAIRY = /(?<!kokos)(?<!hafer)(?<!soja)(?<!mandel)milch|sahne|kaese|joghurt|jogurt|quark|butter(?!nuss)|schmand|creme fraiche|mozzarella|parmesan|feta|mascarpone|ricotta|halloumi|gouda|emmentaler|gorgonzola|cheddar|frischkaese|buttermilch|skyr|ghee|raclette|schafskaese|hirtenkaese|cremefine|kefir/;
const EGG = /\beier\b|\bei\b|\beigelb|eiweiss|\beier\)|vollei/;
const GLUTEN = /mehl|nudel|pasta|spaghetti|penne|brot\b|broetchen|toast|weizen|couscous|bulgur|paniermehl|semmel|tortilla|lasagne|gnocchi|blaetterteig|hefeteig|pizzateig|knoedel|panade|dinkel|gerste|roggen|maultasche|sojasauce|sojasosse|fusilli|tagliatelle|makkaroni|rigatoni|farfalle|spaetzle|schupfnudel|baguette|ciabatta|burger|wrap|paniert|semmelbroesel|griess|seitan|flammkuchen|teig/;
const fmtNum = n => (Math.round(n * 100) / 100).toString().replace('.', ',');
function lineOf(i){
  let q = '';
  if (typeof i.amount === 'number' && i.amount > 0) q = fmtNum(i.amount) + ' ';
  return (q + (i.unit ? String(i.unit).replace(/\((?:n|e|s|en)\)/g, '') + ' ' : '') + (i.name || '')).trim();
}
function convert(d){
  if (!d || !d.id || !d.title || BAD.test(d.title)) return null;
  const groups = d.ingredientGroups || [];
  const lines = [];
  groups.forEach(g => (g.ingredients || []).forEach(i => { const l = lineOf(i); if (l) lines.push(l); }));
  if (lines.length < 3 || lines.length > 25) return null;
  const steps = String(d.instructions || '').split(/\n+/).map(s => s.trim()).filter(s => s.length > 3);
  if (!steps.length) return null;
  const tpl = d.previewImageUrlTemplate || '';
  if (!/chefkoch-cdn\.de/.test(tpl)) return null;
  const mins = d.totalTime || ((d.preparationTime || 0) + (d.cookingTime || 0) + (d.restingTime || 0)) || d.preparationTime || 30;
  if (mins > 120) return null;
  const yieldN = Math.max(1, Math.round(d.servings || 4));
  let rec;
  try { rec = buildRecipe({name: d.title, ingredients: lines, steps, minutes: mins, yield: yieldN, image: '', source: 'Chefkoch'}, 'https://www.chefkoch.de/rezepte/' + d.id + '/'); } catch (e) { return null; }
  const txt = norm(lines.join(' | ').replace(/kokos\w*milch|hafermilch|sojamilch|mandelmilch/gi, ' ') + ' ' + d.title);
  const fl = (MEAT.test(txt) ? 'm' : '') + (FISH.test(txt) ? 'f' : '') + (DAIRY.test(txt) ? 'd' : '') + (EGG.test(txt) ? 'e' : '') + (GLUTEN.test(txt) ? 'g' : '');
  rec.z = rec.z.map(([k, a]) => { const u = ctx.X.ING[k] ? ctx.X.ING[k].u : 'Stück'; const cap = (u === 'g' || u === 'ml') ? 600 : 4; return [k, Math.min(cap, a)]; });
  const cn = {};
  for (const k in rec.defs) cn[k] = rec.defs[k].name;
  const t = [], nt = norm(d.title + ' ' + lines.join(' '));
  if (/pasta|nudel|spaghetti|oliven|feta|mozzarella|pesto|risotto|ofengemuese|griech|italien|zucchini|aubergine/.test(nt)) t.push('mediterran');
  if (/curry|wok|kokos|sojasauce|sojasosse|thai|asia|china|ingwer|reisnudel|teriyaki|sushi/.test(nt)) t.push('asiatisch');
  if (!/m|f/.test(fl) || /bohne|linsen|kichererbse|tofu/.test(nt)) { /* vegetarisch ist über die Ernährungsform abgedeckt */ }
  if (/hahn|huhn|pute|lachs|thunfisch|ei\b|eier|linsen|kichererbse|bohne|quark|tofu|haehnchen/.test(nt)) t.push('protein');
  if (/salat|gemuese|suppe|linsen|bohne|brokkoli|spinat|kohl/.test(nt)) t.push('ballast');
  if (mins <= 25) t.push('schnell');
  if ((d.difficulty || 2) <= 1 && mins <= 40) t.push('familie');
  return {i: d.id, n: d.title.slice(0, 80), m: mins, im: tpl.replace(/^.*?\/rezepte\//, ''), y: yieldN, z: rec.z, s: steps, cn, rw: lines, fl, t};
}
async function pool(items, n, fn){
  let k = 0;
  await Promise.all(Array.from({length: n}, async () => { while (k < items.length) { const it = items[k++]; await fn(it); } }));
}
(async () => {
  const cand = new Map();
  const want = TARGET * 2.2;
  outer: for (const page of [0, 1, 2]) {
    await pool(TERMS, 4, async term => {
      if (cand.size >= want) return;
      const j = await get(API + '?query=' + encodeURIComponent(term) + '&limit=100&offset=' + (page * 100) + '&orderBy=3');
      const res = (j && j.results) || [];
      for (const x of res) {
        const r = x.recipe || x;
        if (!r || !r.id || cand.has(r.id)) continue;
        const rt = r.rating || {};
        if (rt.numVotes != null && (rt.numVotes < 8 || rt.rating < 3.8)) continue;
        if (BAD.test(r.title || '')) continue;
        cand.set(r.id, {id: r.id, score: (rt.rating || 4) * Math.log(2 + (rt.numVotes || 1))});
      }
      await sleep(120);
    });
    console.log('Seite', page, 'Kandidaten', cand.size);
    if (cand.size >= want) break outer;
  }
  if (!cand.size) { console.log('Keine Treffer von der Chefkoch-Schnittstelle'); process.exit(1); }
  const ids = [...cand.values()].sort((a, b) => b.score - a.score).map(x => x.id);
  const out = [], seen = new Set();
  let done = 0, skipped = 0;
  await pool(ids, 5, async id => {
    if (out.length >= TARGET) return;
    const d = await get(API + '/' + id);
    done++;
    const rec = convert(d);
    if (!rec) skipped++; else if (!seen.has(rec.n)) { seen.add(rec.n); out.push(rec); }
    if (done % 200 === 0) console.log('geholt', done, 'brauchbar', out.length, 'verworfen', skipped);
    await sleep(80);
  });
  console.log('Fertig:', out.length, 'Rezepte');
  if (out.length < 1500) { console.log('Zu wenige Rezepte'); process.exit(1); }
  fs.writeFileSync('rezepte.json', JSON.stringify(out));
  console.log('Größe MB', (fs.statSync('rezepte.json').size / 1e6).toFixed(1));
})();
