const https = require('https');

// Cache pro Asset+Range mit zeitraum-abhängiger Dauer
const assetCache = {};

const CACHE_BY_RANGE = {
  '1T': 30 * 60 * 1000,       // 30 Minuten
  '1W': 2 * 60 * 60 * 1000,   // 2 Stunden
  '1M': 4 * 60 * 60 * 1000,   // 4 Stunden
  '6M': 8 * 60 * 60 * 1000,   // 8 Stunden
  '1J': 12 * 60 * 60 * 1000,  // 12 Stunden
  '5J': 24 * 60 * 60 * 1000,  // 24 Stunden
};

// ── SENTIMENT ─────────────────────────────────────────────────────────────
const BULLISH = [
  'steigt','gestiegen','zulegen','gewinnt','gewinn','wächst','wachstum','rekord',
  'allzeithoch','stark','positiv','rally','aufschwung','erholung','übertrifft',
  'zuversicht','dividende','boom','upgrade','genehmigung','expansion','zinssenkung',
  'rise','rises','gain','gains','growth','record','high','strong','positive','rally',
  'recovery','surge','beat','beats','exceeded','bullish','upgrade','profit','revenue',
  'breakthrough','approved','outperform','soars','jumps','rate cut','stimulus',
  'buyback','strong results','earnings beat','raised guidance'
];
const BEARISH = [
  'fällt','gefallen','verliert','verlust','sinkt','gesunken','schwach','negativ',
  'krise','einbruch','crash','angst','sorge','warnung','enttäuscht','verfehlt',
  'rezession','inflation','zinserhöhung','rückgang','entlassung','insolvenz',
  'downgrade','gewinnwarnung','handelskrieg','zölle','sanktionen','pleite',
  'fall','falls','drop','loss','losses','decline','weak','negative','crisis','crash',
  'fear','risk','warning','missed','below','recession','inflation','rate hike',
  'fine','lawsuit','ban','sanction','slowdown','layoffs','bankruptcy','downgrade',
  'profit warning','bearish','plunges','tumbles','sell off','correction','default'
];

function getSentiment(text) {
  const l = text.toLowerCase();
  let bull = 0, bear = 0;
  BULLISH.forEach(w => { if(l.includes(w)) bull++; });
  BEARISH.forEach(w => { if(l.includes(w)) bear++; });
  if(bull > bear) return 'bullish';
  if(bear > bull) return 'bearish';
  return 'neutral';
}

// ── TRAGWEITE BEWERTUNG ───────────────────────────────────────────────────
// Wie lange wirkt eine News nach? Bestimmt ob sie bei längeren Zeiträumen angezeigt wird.
const HIGH_IMPACT_KEYWORDS = [
  // Zentralbanken & Makro — wirken Monate
  'federal reserve','fed rate','fed decision','interest rate','rate cut','rate hike',
  'ecb','european central bank','leitzins','zinsentscheidung','zinssenkung','zinserhöhung',
  'inflation','cpi','recession','gdp','quantitative',
  // Regulierung & Struktur — wirken lange
  'etf approved','etf approval','sec','regulation','ban','legal','lawsuit','congress',
  'bitcoin etf','ethereum etf','crypto regulation','verbot','regulierung','genehmigung',
  // Technologie & Disruption — langfristig
  'breakthrough','halving','partnership','acquisition','merger','ipo',
  'künstliche intelligenz','ai chip','semiconductor','restructuring',
  // Krisen & Boom — langfristig
  'bankruptcy','default','crisis','bubble','bull market','bear market','recession',
  'war','conflict','sanction','trade war','tariff'
];

const MEDIUM_IMPACT_KEYWORDS = [
  // Quartals- und Monatsdaten
  'earnings','quarterly','q1','q2','q3','q4','revenue','profit','guidance',
  'quartalszahlen','umsatz','gewinnwarnung','ausblick',
  // Analysten & Ratings
  'upgrade','downgrade','price target','analyst','rating','overweight','underweight',
  // Marktbewegungen Wochen
  'weekly','monthly','support','resistance','rally','correction','oversold','overbought'
];

function getImpactLevel(text) {
  const l = text.toLowerCase();
  if(HIGH_IMPACT_KEYWORDS.some(k => l.includes(k))) return 'high';    // alle Zeiträume
  if(MEDIUM_IMPACT_KEYWORDS.some(k => l.includes(k))) return 'medium'; // bis 6M
  return 'low'; // nur 1T/1W
}

// Bestimmt ob eine News für einen bestimmten Zeitraum relevant ist
function isRelevantForRange(article, range) {
  const impact = article.impactLevel || getImpactLevel(article.title + ' ' + (article.description || ''));
  switch(range) {
    case '1T': case '1W': return true; // alle News zeigen
    case '1M': case '6M': return impact === 'high' || impact === 'medium';
    case '1J': case '5J': return impact === 'high'; // nur wirklich wichtige News
    default: return true;
  }
}

// ── ASSET KEYWORDS ────────────────────────────────────────────────────────
const ASSET_SEARCH = {
  '^GDAXI': ['DAX','German stocks','Deutsche Börse','Germany economy','Frankfurt'],
  'BTC-USD': ['Bitcoin','BTC','crypto','cryptocurrency','blockchain','bitcoin etf'],
  'ETH-USD': ['Ethereum','ETH','crypto','DeFi','blockchain','ethereum etf'],
  'NVDA':    ['Nvidia','NVDA','GPU','AI chips','Jensen Huang','semiconductors'],
  'AAPL':    ['Apple','AAPL','iPhone','Tim Cook','Apple earnings','iOS'],
  'TSLA':    ['Tesla','TSLA','Elon Musk','electric vehicle','EV'],
  'GC=F':    ['Gold price','gold market','precious metals','XAU','safe haven gold'],
  '^GSPC':   ['S&P 500','US stocks','Wall Street','stock market','federal reserve'],
  'AMZN':    ['Amazon','AMZN','AWS','Andy Jassy','cloud computing'],
  'MSFT':    ['Microsoft','MSFT','Azure','Satya Nadella','OpenAI','Copilot'],
  'META':    ['Meta','Facebook','Zuckerberg','Instagram','WhatsApp'],
  'GOOGL':   ['Google','Alphabet','GOOGL','YouTube','AI Google'],
  'VOW3.DE': ['Volkswagen','VW','Audi','Porsche','Oliver Blume','German auto'],
  'SIE.DE':  ['Siemens','SIE','industrial automation'],
};

function getSearchTerms(symbol, asset) {
  if(ASSET_SEARCH[symbol]) return ASSET_SEARCH[symbol];
  return [asset || symbol];
}

// ── FETCH HELPERS ─────────────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      timeout: 6000
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { reject(e); } });
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

function fetchRSS(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 6000
    }, res => {
      if(res.statusCode !== 200) { resolve([]); return; }
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(parseRSS(raw)); } catch(e) { resolve([]); } });
    }).on('error', () => resolve([])).on('timeout', function() { this.destroy(); resolve([]); });
  });
}

function parseRSS(xml) {
  const items = [];
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  matches.slice(0, 10).forEach(item => {
    const title = stripHTML(extractTag(item, 'title'));
    const link = extractTag(item, 'link') || extractAttr(item, 'link', 'href');
    const description = stripHTML(extractTag(item, 'description') || '');
    const pubDate = extractTag(item, 'pubDate') || new Date().toISOString();
    if(title && title.length > 10 && link && link.startsWith('http')) {
      items.push({
        title: title.slice(0, 160),
        source: 'Yahoo Finance',
        url: link,
        publishedAt: new Date(pubDate).toISOString(),
        description: description.slice(0, 300),
      });
    }
  });
  return items;
}

function extractTag(xml, tag) {
  const p1 = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const p2 = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  let m = xml.match(p1); if(m && m[1]) return m[1].trim();
  m = xml.match(p2); if(m && m[1]) return m[1].trim();
  return '';
}
function extractAttr(xml, tag, attr) {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, 'i'));
  return m ? m[1] : '';
}
function stripHTML(str) {
  return str.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}

async function fetchYahooSearch(query) {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=8&quotesCount=0&lang=en-US`;
    const data = await fetchJSON(url);
    return (data?.news || [])
      .filter(n => n.title && n.link && n.link.startsWith('http'))
      .map(n => ({
        title: n.title.trim(),
        source: n.publisher || 'Yahoo Finance',
        url: n.link,
        publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : new Date().toISOString(),
        description: n.summary || '',
      }));
  } catch(e) { return []; }
}

// ── HANDLER ───────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if(req.method !== 'GET') return res.status(405).end();

  const { asset, symbol, range } = req.query;
  const now = Date.now();
  const cacheKey = (symbol || asset || 'general') + '_' + (range || '1T');
  const cacheDuration = CACHE_BY_RANGE[range] || CACHE_BY_RANGE['1T'];

  // Cache prüfen
  if(assetCache[cacheKey] && (now - assetCache[cacheKey].time) < cacheDuration) {
    return res.status(200).json({
      articles: assetCache[cacheKey].articles,
      cachedAt: new Date(assetCache[cacheKey].time).toISOString(),
      fromCache: true,
      range: range || '1T'
    });
  }

  const searchTerms = getSearchTerms(symbol, asset);

  try {
    // 1. Asset-spezifischer RSS Feed
    let rssArticles = [];
    if(symbol) {
      rssArticles = await fetchRSS(`https://finance.yahoo.com/rss/headline?s=${encodeURIComponent(symbol)}`);
    }

    // 2. News-Suche parallel
    const searchResults = await Promise.all(
      searchTerms.slice(0, 3).map(term => fetchYahooSearch(term))
    );
    const searchArticles = searchResults.flat();

    // 3. Kombinieren + Duplikate entfernen
    const seen = new Set();
    const all = [...rssArticles, ...searchArticles].filter(a => {
      if(!a.title || a.title.length < 10 || !a.url) return false;
      const key = a.title.slice(0, 50).toLowerCase();
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 4. Impact Level bestimmen und Sentiment bewerten
    const withMeta = all.map(a => {
      const text = a.title + ' ' + (a.description || '');
      const impactLevel = getImpactLevel(text);
      const sentiment = getSentiment(text);
      return { ...a, sentiment, impactLevel };
    });

    // 5. Nach Zeitraum filtern — wichtige News bleiben immer
    const filtered = withMeta.filter(a => isRelevantForRange(a, range || '1T'));

    // 6. Sortieren: zuerst nach Impact, dann nach Datum
    filtered.sort((a, b) => {
      const impOrder = { high: 0, medium: 1, low: 2 };
      const impDiff = (impOrder[a.impactLevel] || 2) - (impOrder[b.impactLevel] || 2);
      if(impDiff !== 0) return impDiff;
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    });

    // 7. Neutral minimieren — Bullisch/Bärisch bevorzugen
    const nonNeutral = filtered.filter(a => a.sentiment !== 'neutral');
    const neutral = filtered.filter(a => a.sentiment === 'neutral');
    const result = [...nonNeutral, ...neutral.slice(0, 1)].slice(0, 6);

    // 8. Fallback wenn zu wenig
    const final = result.length >= 2 ? result : filtered.slice(0, 5);

    const articles = final.map(a => ({
      title: a.title,
      source: a.source,
      url: a.url,
      publishedAt: a.publishedAt,
      description: a.description,
      sentiment: a.sentiment,
      impactLevel: a.impactLevel,
    }));

    assetCache[cacheKey] = { articles, time: now };

    return res.status(200).json({
      articles,
      cachedAt: new Date(now).toISOString(),
      fromCache: false,
      range: range || '1T',
      total: all.length,
      filtered: filtered.length,
    });

  } catch(e) {
    if(assetCache[cacheKey]) {
      return res.status(200).json({
        articles: assetCache[cacheKey].articles,
        cachedAt: new Date(assetCache[cacheKey].time).toISOString(),
        fromCache: true, stale: true
      });
    }
    return res.status(500).json({ error: e.message });
  }
};
