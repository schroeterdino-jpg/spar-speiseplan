'use strict';
/* Holt Rezepte über die öffentliche Chefkoch-Schnittstelle und schreibt rezepte.json (läuft in GitHub Actions). */
const fs = require('fs'), vm = require('vm');
const ctx = vm.createContext({console});
vm.runInContext(fs.readFileSync('daten.js', 'utf8') + '\n' + fs.readFileSync('import.js', 'utf8') + '\n;this.X = {ING, buildRecipe, norm, chefkochToRec, BAD: CK_BAD};', ctx);
const {buildRecipe, norm, chefkochToRec, BAD: CK_BAD} = ctx.X;

const TARGET = +process.env.TARGET || 4200;
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
const convert = d => chefkochToRec(d, true);
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
        if (CK_BAD.test(r.title || '')) continue;
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
  if (out.length < 3000) { console.log('Zu wenige Rezepte'); process.exit(1); }
  fs.writeFileSync('rezepte.json', JSON.stringify(out));
  console.log('Größe MB', (fs.statSync('rezepte.json').size / 1e6).toFixed(1));
})();
