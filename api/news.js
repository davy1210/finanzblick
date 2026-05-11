const https = require('https');

// Einfacher In-Memory Cache
const cache = {};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { asset } = req.query;
  if (!asset) return res.status(400).json({ error: 'Kein Asset' });

  const apiKey = process.env.NEWS_API_KEY;
  const cacheKey = asset.toLowerCase();
  const now = Date.now();

  // Cache prüfen — 4 Stunden
  if (cache[cacheKey] && (now - cache[cacheKey].time) < 4 * 60 * 60 * 1000) {
    return res.status(200).json(cache[cacheKey].data);
  }

  const query = encodeURIComponent(asset);
  const url = `https://newsapi.org/v2/everything?q=${query}&language=de&sortBy=publishedAt&pageSize=5&apiKey=${apiKey}`;

  try {
    const data = await new Promise((resolve, reject) => {
      https.get(url, (response) => {
        let raw = '';
        response.on('data', chunk => raw += chunk);
        response.on('end', () => {
          try { resolve(JSON.parse(raw)); }
          catch(e) { reject(e); }
        });
      }).on('error', reject);
    });

    const articles = (data.articles || []).map(a => ({
      title: a.title,
      source: a.source?.name || '',
      url: a.url,
      publishedAt: a.publishedAt,
      description: a.description || ''
    }));

    const result = {
      articles,
      cachedAt: new Date().toISOString()
    };

    cache[cacheKey] = { time: now, data: result };
    res.status(200).json(result);

  } catch(e) {
    res.status(500).json({ error: 'News nicht verfügbar', details: e.message });
  }
};
