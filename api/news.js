const https = require('https');

let globalCache = null;
let cacheTime = null;
const CACHE_DURATION = 4 * 60 * 60 * 1000;

// ── SENTIMENT ENGINE ──────────────────────────────────────────────────────
const BULLISH_WORDS = [
  // Deutsch
  'steigt','gestiegen','zulegen','zulegte','gewinnt','gewinn','gewinne','wächst','wachstum',
  'rekord','allzeithoch','hoch','stark','stärker','positiv','optimismus','optimistisch',
  'rally','aufschwung','erholung','erholt','kaufen','nachfrage','boom','übertrifft',
  'besser als erwartet','übertroffen','zuversicht','zuversichtlich','profitiert',
  'investition','expansion','durchbruch','innovation','partnerschaft','kooperation',
  'genehmigung','zulassung','dividende','aktienrückkauf','upgrade',
  // Englisch
  'rise','rises','rising','gain','gains','grew','growth','record','high','strong',
  'positive','rally','recovery','buy','surge','surges','beat','beats','exceeded',
  'bullish','upgrade','profit','profits','revenue','expansion','breakthrough',
  'approved','approval','partnership','investment','outperform'
];

const BEARISH_WORDS = [
  // Deutsch
  'fällt','gefallen','verliert','verlust','verluste','sinkt','gesunken','schwach','schwächer',
  'negativ','pessimismus','pessimistisch','krise','einbruch','absturz','crash','verkaufen',
  'angst','sorge','sorgen','risiko','warnung','warnt','enttäuscht','verfehlt','unter erwartet',
  'rezession','inflation','zinserhöhung','strafe','klage','regulierung','verbot','sanktion',
  'rückgang','rückgänge','minus','verlangsamung','entlassung','stellenabbau','insolvenz',
  'pleite','schuldenkrise','downgrade','abstufung','gewinnwarnung',
  // Englisch
  'fall','falls','falling','drop','drops','loss','losses','decline','weak','weaker',
  'negative','crisis','crash','sell','fear','risk','warning','warns','missed','below',
  'recession','inflation','rate hike','fine','lawsuit','regulation','ban','sanction',
  'slowdown','layoffs','bankruptcy','downgrade','profit warning','bearish','underperform'
];

function getSentiment(text) {
  const lower = text.toLowerCase();
  let bullScore = 0;
  let bearScore = 0;

  BULLISH_WORDS.forEach(w => { if (lower.includes(w)) bullScore++; });
  BEARISH_WORDS.forEach(w => { if (lower.includes(w)) bearScore++; });

  if (bullScore > bearScore) return 'bullish';
  if (bearScore > bullScore) return 'bearish';
  return 'neutral';
}

// ── ASSET KEYWORDS ────────────────────────────────────────────────────────
const ASSET_KEYWORDS = {
  'bitcoin': ['bitcoin', 'btc', 'krypto', 'crypto', 'satoshi', 'halving'],
  'ethereum': ['ethereum', 'eth', 'ether', 'defi', 'smart contract'],
  'dax': ['dax', 'frankfurt', 'deutsche börse', 'dax40', 'mdax'],
  'nvidia': ['nvidia', 'nvda', 'jensen huang', 'gpu', 'cuda', 'geforce'],
  'apple': ['apple', 'aapl', 'iphone', 'ipad', 'mac', 'tim cook', 'app store', 'ios'],
  'tesla': ['tesla', 'tsla', 'elon musk', 'elektroauto', 'model 3', 'model y', 'cybertruck'],
  'gold': ['gold', 'xau', 'edelmetall', 'goldpreis', 'goldreserven'],
  's&p': ['s&p', 'sp500', 'wall street', 'nasdaq', 'dow jones', 'us-börse', 'us börse'],
  'amazon': ['amazon', 'amzn', 'aws', 'jeff bezos', 'andy jassy', 'prime'],
  'microsoft': ['microsoft', 'msft', 'windows', 'azure', 'satya nadella', 'office'],
  'volkswagen': ['volkswagen', 'vw', 'audi', 'porsche', 'oliver blume'],
  'siemens': ['siemens', 'sie', 'industrial'],
};

function filterNews(articles, asset) {
  if (!asset || !articles) return articles || [];
  const assetLower = asset.toLowerCase();

  // Passende Keywords finden
  let keywords = [assetLower];
  for (const [key, words] of Object.entries(ASSET_KEYWORDS)) {
    if (assetLower.includes(key) || key.includes(assetLower)) {
      keywords = [...new Set([...keywords, ...words])];
      break;
    }
  }

  const relevant = articles.filter(a =>
    keywords.some(kw => (a.title + ' ' + (a.description || '')).toLowerCase().includes(kw))
  );

  return relevant.length > 0 ? relevant.slice(0, 5) : articles.slice(0, 5);
}

// ── HANDLER ───────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { asset } = req.query;
  const apiKey = process.env.GNEWS_API_KEY;
  const now = Date.now();

  // Cache gültig?
  if (globalCache && cacheTime && (now - cacheTime) < CACHE_DURATION) {
    const filtered = filterNews(globalCache, asset);
    const withSentiment = filtered.map(a => ({ ...a, sentiment: getSentiment(a.title + ' ' + (a.description || '')) }));
    return res.status(200).json({ articles: withSentiment, cachedAt: new Date(cacheTime).toISOString(), fromCache: true });
  }

  // Neue Anfrage
  const query = encodeURIComponent('Börse Aktien Finanzen Krypto Wirtschaft');
  const url = `https://gnews.io/api/v4/search?q=${query}&lang=de&max=10&apikey=${apiKey}`;

  try {
    const data = await new Promise((resolve, reject) => {
      https.get(url, (response) => {
        let raw = '';
        response.on('data', chunk => raw += chunk);
        response.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { reject(e); } });
      }).on('error', reject);
    });

    if (data.errors) return res.status(500).json({ error: data.errors.join(', ') });

    const articles = (data.articles || []).map(a => ({
      title: a.title,
      source: a.source?.name || '',
      url: a.url,
      publishedAt: a.publishedAt,
      description: a.description || '',
    }));

    globalCache = articles;
    cacheTime = now;

    const filtered = filterNews(articles, asset);
    const withSentiment = filtered.map(a => ({ ...a, sentiment: getSentiment(a.title + ' ' + (a.description || '')) }));

    res.status(200).json({ articles: withSentiment, cachedAt: new Date(cacheTime).toISOString(), fromCache: false });

  } catch(e) {
    if (globalCache) {
      const filtered = filterNews(globalCache, asset);
      const withSentiment = filtered.map(a => ({ ...a, sentiment: getSentiment(a.title + ' ' + (a.description || '')) }));
      return res.status(200).json({ articles: withSentiment, cachedAt: new Date(cacheTime).toISOString(), fromCache: true, stale: true });
    }
    res.status(500).json({ error: 'News nicht verfügbar', details: e.message });
  }
};
