'use strict';
/* Liest eine Rezeptseite (schema.org/Recipe) aus und gibt Name, Foto, Zutaten und Schritte zurück.
   Nur für den eigenen Gebrauch gedacht: der Nutzer fügt selbst einen Link ein. */
const dns = require('dns').promises;
const net = require('net');

function privateIp(ip){
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const s = ip.toLowerCase();
  return s === '::1' || s === '::' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80') || s.startsWith('::ffff:');
}
async function safeUrl(u){
  const url = new URL(u);
  if (!/^https?:$/.test(url.protocol)) throw new Error('Nur http/https');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Port nicht erlaubt');
  const addrs = await dns.lookup(url.hostname, {all: true});
  if (!addrs.length || addrs.some(a => privateIp(a.address))) throw new Error('Adresse nicht erlaubt');
  return url;
}
async function getPage(u){
  let url = u;
  for (let i = 0; i < 4; i++) {
    const safe = await safeUrl(url);
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch(safe.href, {redirect: 'manual', signal: ctl.signal, headers: {'User-Agent': 'Mozilla/5.0 (compatible; SparSpeiseplan/1.0; privater Rezeptimport)', 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'de-DE,de;q=0.9'}}).finally(() => clearTimeout(t));
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = new URL(r.headers.get('location'), safe.href).href; continue; }
    if (!r.ok) throw new Error('Seite antwortet mit ' + r.status);
    return (await r.text()).slice(0, 3000000);
  }
  throw new Error('Zu viele Weiterleitungen');
}
function findRecipe(node){
  if (!node) return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findRecipe(n); if (r) return r; } return null; }
  if (typeof node !== 'object') return null;
  const t = node['@type'];
  if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return node;
  return findRecipe(node['@graph']) || null;
}
const txt = v => String(v == null ? '' : v).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
function steps(v){
  const out = [];
  (function walk(x){
    if (!x) return;
    if (typeof x === 'string') { out.push(txt(x)); return; }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x.itemListElement) { walk(x.itemListElement); return; }
    if (x.text) out.push(txt(x.text)); else if (x.name) out.push(txt(x.name));
  })(v);
  return out.filter(Boolean);
}
function minutes(d){
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(String(d || ''));
  return m ? (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}
function image(v){
  if (!v) return '';
  if (Array.isArray(v)) return image(v[0]);
  if (typeof v === 'object') return v.url || '';
  return String(v);
}
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  try {
    const u = String((req.query && req.query.url) || '');
    if (!u) throw new Error('Link fehlt');
    const html = await getPage(u);
    const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    let rec = null;
    for (const b of blocks) { try { rec = findRecipe(JSON.parse(b[1].trim())); } catch (e) {} if (rec) break; }
    if (!rec) throw new Error('Auf dieser Seite wurde kein Rezept gefunden');
    const y = String(Array.isArray(rec.recipeYield) ? rec.recipeYield[0] : (rec.recipeYield || ''));
    res.setHeader('Cache-Control', 's-maxage=3600');
    res.status(200).json({
      name: txt(rec.name), image: image(rec.image), yield: parseInt((y.match(/\d+/) || ['4'])[0], 10) || 4,
      minutes: minutes(rec.totalTime) || (minutes(rec.prepTime) + minutes(rec.cookTime)) || 30,
      ingredients: (rec.recipeIngredient || []).map(txt).filter(Boolean), steps: steps(rec.recipeInstructions), source: new URL(u).hostname
    });
  } catch (e) {
    res.status(400).json({error: String(e.message || e)});
  }
};
