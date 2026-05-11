const https = require('https');

// Server-Cache — eine globale News-Sammlung für alle Assets
let globalCache = null;
let cacheTime = null;
const CACHE_DURATION = 4 * 60 * 60 * 1000; // 4 Stunden

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { asset } = req.query;
  const apiKey = process.env.GNEWS_API_KEY;
  const now = Date.now();

  // Cache noch gültig? Direkt filtern und zurückgeben
  if (globalCache && cacheTime && (now - cacheTime) < CACHE_DURATION) {
    const filtered = filterNews(globalCache, asset);
    return res.status(200).json({
      articles: filtered,
      cachedAt: new Date(cacheTime).toISOString(),
      fromCache: true
    });
  }

  // Neue Anfrage — maximale News auf einmal holen
  const query = encodeURIComponent('Börse Aktien Finanzen Krypto Wirtschaft');
  const url = `https://gnews.io/api/v4/search?q=${query}&lang=de&max=10&apikey=${apiKey}`;

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

    if (data.errors) {
      return res.status(500).json({ error: data.errors.join(', ') });
    }

    const articles = (data.articles || []).map(a => ({
      title: a.title,
      source: a.source?.name || '',
      url: a.url,
      publishedAt: a.publishedAt,
      description: a.description || '',
      keywords: (a.title + ' ' + (a.description || '')).toLowerCase()
    }));

    // Global cachen
    globalCache = articles;
    cacheTime = now;

    const filtered = filterNews(articles, asset);
    res.status(200).json({
      articles: filtered,
      cachedAt: new Date(cacheTime).toISOString(),
      fromCache: false,
      total: articles.length
    });

  } catch(e) {
    // Falls Cache vorhanden aber abgelaufen — lieber alte News als Fehler
    if (globalCache) {
      const filtered = filterNews(globalCache, asset);
      return res.status(200).json({
        articles: filtered,
        cachedAt: new Date(cacheTime).toISOString(),
        fromCache: true,
        stale: true
      });
    }
    res.status(500).json({ error: 'News nicht verfügbar', details: e.message });
  }
};

// Intelligentes Filtern — findet relevante News für jedes Asset
function filterNews(articles, asset) {
  if (!asset || !articles) return articles || [];

  const assetLower = asset.toLowerCase();

  // Keywords für bekannte Assets
  const keywordMap = {
    'bitcoin': ['bitcoin', 'btc', 'krypto', 'crypto'],
    'ethereum': ['ethereum', 'eth', 'krypto', 'crypto'],
    'dax': ['dax', 'deutschland', 'german', 'frankfurt', 'dax40'],
    'nvidia': ['nvidia', 'nvda', 'ki-chips', 'gpu', 'künstliche intelligenz'],
    'apple': ['apple', 'iphone', 'aapl', 'ios', 'tim cook'],
    'tesla': ['tesla', 'elon musk', 'elektroauto', 'tsla'],
    'gold': ['gold', 'edelmetall', 'xau'],
    's&p': ['s&p', 'sp500', 'wall street', 'us-börse', 'nasdaq'],
  };

  // Passende Keywords finden
  let keywords = [assetLower];
  for (const [key, words] of Object.entries(keywordMap)) {
    if (assetLower.includes(key) || key.includes(assetLower)) {
      keywords = [...keywords, ...words];
      break;
    }
  }

  // Filtern
  const relevant = articles.filter(a =>
    keywords.some(kw => a.keywords.includes(kw))
  );

  // Falls keine spezifischen News — allgemeine Finanz-News zurückgeben
  return relevant.length > 0 ? relevant.slice(0, 5) : articles.slice(0, 3);
}
