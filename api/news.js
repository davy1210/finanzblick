const https = require('https');

let globalCache = null;
let cacheTime = null;
const CACHE_DURATION = 4 * 60 * 60 * 1000;

// ── SENTIMENT ─────────────────────────────────────────────────────────────
const BULLISH = ['rise','rises','rising','gain','gains','grew','growth','record','high','strong',
  'positive','rally','recovery','surge','surges','beat','beats','exceeded','bullish','upgrade',
  'profit','profits','revenue','expansion','breakthrough','approved','approval','outperform',
  'soars','soaring','jumps','jumped','climbs','boosts','boosted','steigt','gestiegen','gewinnt',
  'gewinn','wächst','rekord','allzeithoch','stark','positiv','rally','aufschwung','erholung',
  'übertrifft','zuversicht','dividende','genehmigung'];

const BEARISH = ['fall','falls','falling','drop','drops','loss','losses','decline','weak','negative',
  'crisis','crash','sell','fear','risk','warning','warns','missed','below','recession','inflation',
  'rate hike','fine','lawsuit','ban','sanction','slowdown','layoffs','bankruptcy','downgrade',
  'bearish','underperform','plunges','plunging','tumbles','tumbling','slumps','sinking',
  'fällt','gefallen','verliert','verlust','sinkt','schwach','krise','einbruch','crash',
  'angst','sorge','warnung','enttäuscht','rezession','rückgang','entlassung','insolvenz'];

function getSentiment(text) {
  const l = text.toLowerCase();
  let bull = 0, bear = 0;
  BULLISH.forEach(w => { if(l.includes(w)) bull++; });
  BEARISH.forEach(w => { if(l.includes(w)) bear++; });
  if(bull > bear) return 'bullish';
  if(bear > bull) return 'bearish';
  return 'neutral';
}

// ── ASSET KEYWORDS ────────────────────────────────────────────────────────
const ASSET_KEYS = {
  'bitcoin': ['bitcoin','btc','crypto','cryptocurrency','coinbase','binance','halving'],
  'ethereum': ['ethereum','eth','ether','defi','web3','blockchain'],
  'krypto': ['crypto','bitcoin','ethereum','blockchain','coinbase','binance'],
  'dax': ['dax','germany','german','frankfurt','deutsche','bundesbank','european stocks'],
  'nvidia': ['nvidia','nvda','jensen huang','gpu','ai chips','semiconductors'],
  'apple': ['apple','aapl','iphone','tim cook','app store','ios','mac'],
  'tesla': ['tesla','tsla','elon musk','electric vehicle','ev','cybertruck'],
  'gold': ['gold','xau','precious metal','gold price','bullion','safe haven'],
  'amazon': ['amazon','amzn','aws','andy jassy','prime'],
  'microsoft': ['microsoft','msft','azure','satya nadella','copilot'],
  'volkswagen': ['volkswagen','vw','audi','porsche','german automaker'],
  'siemens': ['siemens','msft','industrial','automation'],
  'meta': ['meta','facebook','zuckerberg','instagram','whatsapp'],
  'alphabet': ['google','alphabet','googl','youtube','search engine'],
  'sp500': ['s&p','sp500','wall street','nasdaq','dow jones','fed','federal reserve'],
  's&p': ['s&p','sp500','wall street','nasdaq','dow jones','fed','federal reserve'],
};

// Allgemeine Finanz-News Keywords — immer relevant
const GENERAL_FINANCE = [
  'stock','market','economy','fed','interest rate','inflation','gdp','earnings',
  'investment','shares','nasdaq','wall street','central bank','ecb','recession',
  'börse','aktien','wirtschaft','zinsen','konjunktur','anleger'
];

function filterAndSort(articles, asset) {
  if(!articles || !articles.length) return [];
  const al = asset ? asset.toLowerCase() : '';

  // Asset-spezifische Keywords
  let assetKeys = [al];
  for(const [key, words] of Object.entries(ASSET_KEYS)) {
    if(al.includes(key) || key.includes(al)) {
      assetKeys = [...new Set([...assetKeys, ...words])];
      break;
    }
  }

  // Jeden Artikel bewerten: 2 = direkt relevant, 1 = Finanz-relevant, 0 = sonstig
  const scored = articles.map(a => {
    const text = (a.title + ' ' + (a.description || '')).toLowerCase();
    const directMatch = assetKeys.some(kw => text.includes(kw));
    const financeMatch = GENERAL_FINANCE.some(kw => text.includes(kw));
    const score = directMatch ? 2 : financeMatch ? 1 : 0;
    return { ...a, score };
  });

  // Nach Score sortieren (direkteste News zuerst)
  scored.sort((a, b) => b.score - a.score);

  // Mindestens 5 News zurückgeben — immer
  return scored.slice(0, 5);
}

// ── FETCH HELPER ──────────────────────────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      let raw = '';
      response.on('data', chunk => raw += chunk);
      response.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

// ── HANDLER ───────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if(req.method !== 'GET') return res.status(405).end();

  const { asset } = req.query;
  const apiKey = process.env.GNEWS_API_KEY;
  const now = Date.now();

  // Cache gültig?
  if(globalCache && cacheTime && (now - cacheTime) < CACHE_DURATION) {
    const filtered = filterAndSort(globalCache, asset);
    const result = filtered.map(a => ({...a, sentiment: getSentiment(a.title+' '+(a.description||''))}));
    return res.status(200).json({articles: result, cachedAt: new Date(cacheTime).toISOString(), fromCache: true});
  }

  // Breite englische Finanzsuche — maximale Trefferchance
  const query = encodeURIComponent('finance economy stock market investment');
  const url = `https://gnews.io/api/v4/search?q=${query}&lang=en&max=10&apikey=${apiKey}`;

  try {
    const data = await fetchUrl(url);
    if(data.errors) return res.status(500).json({error: data.errors.join(', ')});

    const articles = (data.articles || []).map(a => ({
      title: a.title || '',
      source: a.source?.name || '',
      url: a.url || '#',
      publishedAt: a.publishedAt || new Date().toISOString(),
      description: a.description || '',
    }));

    globalCache = articles;
    cacheTime = now;

    const filtered = filterAndSort(articles, asset);
    const result = filtered.map(a => ({...a, sentiment: getSentiment(a.title+' '+(a.description||''))}));

    res.status(200).json({articles: result, cachedAt: new Date(cacheTime).toISOString(), fromCache: false, total: articles.length});

  } catch(e) {
    // Stale cache lieber als nichts
    if(globalCache) {
      const filtered = filterAndSort(globalCache, asset);
      const result = filtered.map(a => ({...a, sentiment: getSentiment(a.title+' '+(a.description||''))}));
      return res.status(200).json({articles: result, cachedAt: new Date(cacheTime).toISOString(), fromCache: true, stale: true});
    }
    res.status(500).json({error: 'News nicht verfügbar', details: e.message});
  }
};
