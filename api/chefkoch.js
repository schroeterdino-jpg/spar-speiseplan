'use strict';
/* Vermittler zur Chefkoch-Schnittstelle (damit die App Chefkoch live abfragen kann). */
const H = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Accept': 'application/json'};
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
  try {
    const q = req.query || {};
    if (q.id) {
      if (!/^\d{5,20}$/.test(String(q.id))) return res.status(400).json({error: 'Ungültige Nummer'});
      const r = await fetch('https://api.chefkoch.de/v2/recipes/' + q.id, {headers: H});
      if (!r.ok) return res.status(502).json({error: 'Chefkoch antwortet nicht (' + r.status + ')'});
      const d = await r.json();
      return res.status(200).json({id: d.id, title: d.title, servings: d.servings, totalTime: d.totalTime, preparationTime: d.preparationTime, cookingTime: d.cookingTime, restingTime: d.restingTime,
        difficulty: d.difficulty, instructions: d.instructions, ingredientGroups: d.ingredientGroups, previewImageUrlTemplate: d.previewImageUrlTemplate});
    }
    const text = String(q.q || '').trim().slice(0, 80);
    if (!text) return res.status(400).json({error: 'Suchbegriff fehlt'});
    const off = Math.max(0, Math.min(500, parseInt(q.offset, 10) || 0));
    const r = await fetch('https://api.chefkoch.de/v2/recipes?query=' + encodeURIComponent(text) + '&limit=30&offset=' + off + '&orderBy=3', {headers: H});
    if (!r.ok) return res.status(502).json({error: 'Chefkoch antwortet nicht (' + r.status + ')'});
    const j = await r.json();
    const list = (j.results || []).map(x => x.recipe || x).filter(x => x && x.id).map(x => ({
      id: x.id, title: x.title, img: x.previewImageUrlTemplate || '', min: x.totalTime || x.preparationTime || 0,
      rating: x.rating && x.rating.rating || 0, votes: x.rating && x.rating.numVotes || 0}));
    return res.status(200).json({count: j.count || list.length, results: list});
  } catch (e) {
    return res.status(500).json({error: 'Fehler: ' + e.message});
  }
};
