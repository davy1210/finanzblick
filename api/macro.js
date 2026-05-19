const https = require('https');

let macroCache = null;
let cacheTime = null;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 Stunden

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Finanzblick/1.0' },
      timeout: 8000
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(e); }
      });
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

// FRED API - kostenlos, kein Key nötig für public data
async function fetchFredSeries(seriesId) {
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=1c6432b0b2c18f046fd6ed93eb3d8abb&file_type=json&sort_order=desc&limit=1`;
    const data = await fetchJSON(url);
    const obs = data?.observations?.[0];
    return obs ? parseFloat(obs.value) : null;
  } catch(e) { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const now = Date.now();
  if (macroCache && cacheTime && (now - cacheTime) < CACHE_DURATION) {
    return res.status(200).json({ ...macroCache, fromCache: true });
  }

  try {
    // Parallel laden
    const [fedRate, cpi, unemployment, gdp, ecbRate] = await Promise.all([
      fetchFredSeries('FEDFUNDS'),      // Fed Leitzins
      fetchFredSeries('CPIAUCSL'),      // US CPI
      fetchFredSeries('UNRATE'),        // US Arbeitslosenquote
      fetchFredSeries('A191RL1Q225SBEA'), // US BIP Wachstum
      fetchFredSeries('ECBDFR'),        // EZB Einlagenzins
    ]);

    // CPI YoY berechnen (braucht 2 Datenpunkte)
    let cpiYoy = null;
    try {
      const cpiUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&api_key=1c6432b0b2c18f046fd6ed93eb3d8abb&file_type=json&sort_order=desc&limit=13`;
      const cpiData = await fetchJSON(cpiUrl);
      const obs = cpiData?.observations || [];
      if (obs.length >= 13) {
        const latest = parseFloat(obs[0].value);
        const yearAgo = parseFloat(obs[12].value);
        cpiYoy = Math.round(((latest - yearAgo) / yearAgo) * 100 * 10) / 10;
      }
    } catch(e) {}

    const macro = {
      fedRate: fedRate ? Math.round(fedRate * 100) / 100 : null,
      cpiYoy,
      unemployment: unemployment ? Math.round(unemployment * 10) / 10 : null,
      gdpGrowth: gdp ? Math.round(gdp * 10) / 10 : null,
      ecbRate: ecbRate ? Math.round(ecbRate * 100) / 100 : null,
      updatedAt: new Date().toISOString(),
    };

    macroCache = macro;
    cacheTime = now;

    return res.status(200).json({ ...macro, fromCache: false });

  } catch(e) {
    if (macroCache) return res.status(200).json({ ...macroCache, fromCache: true, stale: true });
    return res.status(500).json({ error: e.message });
  }
};
