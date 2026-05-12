import https from 'https';
import http from 'http';

const assetCache = {};
const CACHE_DURATION = 4 * 60 * 60 * 1000;

// ── SENTIMENT ─────────────────────────────────────────────────────────────
const BULLISH = [
  'steigt','gestiegen','zulegen','gewinnt','gewinn','wächst','wachstum','rekord',
  'allzeithoch','stark','positiv','rally','aufschwung','erholung','übertrifft',
  'zuversicht','dividende','boom','upgrade','genehmigung','expansion','kursgewinn',
  'kaufsignal','zinssenkung','konjunkturpaket','wachstumsprognose',
  'rise','rises','gain','gains','growth','record','high','strong','positive',
  'rally','recovery','surge','beat','beats','exceeded','bullish','upgrade',
  'profit','revenue','breakthrough','approved','outperform','soars','jumps',
  'rate cut','stimulus','buyback','dividend','earnings beat','strong results'
];
const BEARISH = [
  'fällt','gefallen','verliert','verlust','sinkt','gesunken','schwach','negativ',
  'krise','einbruch','crash','angst','sorge','warnung','enttäuscht','verfehlt',
  'rezession','inflation','zinserhöhung','rückgang','entlassung','insolvenz',
  'downgrade','gewinnwarnung','handelskrieg','zölle','sanktionen','pleite',
  'kursverlust','verkaufsdruck','bärisch',
  'fall','falls','drop','loss','losses','decline','weak','negative','crisis',
  'crash','fear','risk','warning','missed','below','recession','inflation',
  'rate hike','fine','lawsuit','ban','slowdown','layoffs','bankruptcy',
  'downgrade','profit warning','bearish','plunges','tumbles','trade war',
  'tariff','sanctions','sell off','correction','default'
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

// ── ASSET KEYWORDS ────────────────────────────────────────────────────────
const ASSET_KEYS = {
  'bitcoin': ['bitcoin','btc','crypto','cryptocurrency','coinbase','binance','halving','satoshi','blockchain'],
  'ethereum': ['ethereum','eth','ether','defi','web3','smart contract','blockchain'],
  'dax': ['dax','germany','german','deutsche','frankfurt','bundesbank','dax40','mdax','european stocks','eurozone'],
  'nvidia': ['nvidia','nvda','jensen huang','gpu','ai chip','semiconductor','geforce','cuda','h100','blackwell'],
  'apple': ['apple','aapl','iphone','tim cook','app store','ios','mac','vision pro','apple intelligence'],
  'tesla': ['tesla','tsla','elon musk','electric vehicle','ev','cybertruck','model 3','model y','gigafactory'],
  'gold': ['gold','xau','precious metal','gold price','bullion','safe haven','edelmetall','goldpreis'],
  'amazon': ['amazon','amzn','aws','andy jassy','prime','alexa','cloud computing'],
  'microsoft': ['microsoft','msft','azure','satya nadella','copilot','windows','openai','bing'],
  'meta': ['meta','facebook','zuckerberg','instagram','whatsapp','threads','metaverse','vr'],
  'alphabet': ['google','alphabet','googl','youtube','gemini','waymo','search','android'],
  'volkswagen': ['volkswagen','vw','audi','porsche','oliver blume','wolfsburg','elektroauto','e-auto'],
  'siemens': ['siemens','sie','automation','digitalization','industrial'],
  'sp500': ['s&p','sp500','wall street','nasdaq','dow jones','federal reserve','fed','us stocks','us market'],
  'xau': ['gold','precious','bullion','safe haven','xau'],
};

// Globale Finanz-Keywords — immer relevant
const FINANCE_KEYS = [
  'fed','federal reserve','ezb','ecb','central bank','zentralbank','leitzins','interest rate',
  'inflation','gdp','bruttoinlandsprodukt','recession','rezession','earnings','quartalszahlen',
  'stock market','börse','aktien','dax','nasdaq','s&p','wall street','oil','crude',
  'wirtschaft','economy','trade','handel','tariff','zoll','sanction'
];

function scoreArticle(article, assetKeys) {
  const text = (article.title + ' ' + (article.description || '')).toLowerCase();
  let score = 0;

  // Direkter Asset-Treffer = höchste Priorität
  assetKeys.forEach(kw => {
    if(text.includes(kw)) score += 3;
  });

  // Allgemeine Finanz-Relevanz
  FINANCE_KEYS.forEach(kw => {
    if(text.includes(kw)) score += 1;
  });

  // Sentiment-Boost: Bullisch/Bärisch bevorzugen
  const sentiment = getSentiment(text);
  if(sentiment !== 'neutral') score += 1;

  return { ...article, score, sentiment };
}

function getAssetKeys(asset, symbol) {
  const al = (asset || '').toLowerCase();
  const sl = (symbol || '').toLowerCase();

  // Direktes Symbol-Matching
  for(const [key, words] of Object.entries(ASSET_KEYS)) {
    if(al.includes(key) || key.includes(al) || sl.includes(key)) {
      return [...new Set([al, sl, ...words])].filter(Boolean);
    }
  }
  return [al, sl].filter(Boolean);
}

// ── RSS FETCH ─────────────────────────────────────────────────────────────
function fetchRSS(feedUrl, sourceName) {
  return new Promise((resolve) => {
    const client = feedUrl.startsWith('https') ? https : http;
    const req = client.get(feedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Finanzblick/2.0)' },
      timeout: 5000
    }, res => {
      if(res.statusCode === 301 || res.statusCode === 302) {
        return fetchRSS(res.headers.location, sourceName).then(resolve).catch(() => resolve([]));
      }
      if(res.statusCode !== 200) { resolve([]); return; }
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(parseRSS(raw, sourceName)); }
        catch(e) { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
  });
}

function parseRSS(xml, sourceName) {
  const items = [];
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  matches.slice(0, 10).forEach(item => {
    const title = stripHTML(extractTag(item, 'title'));
    const link = extractTag(item, 'link') || extractAttr(item, 'link', 'href');
    const description = stripHTML(extractTag(item, 'description') || extractTag(item, 'summary') || '');
    const pubDate = extractTag(item, 'pubDate') || extractTag(item, 'published') || new Date().toISOString();
    if(title && title.length > 10) {
      items.push({
        title: title.slice(0, 160),
        source: sourceName,
        url: link || '#',
        publishedAt: new Date(pubDate).toISOString(),
        description: description.slice(0, 300),
      });
    }
  });
  return items;
}

function extractTag(xml, tag) {
  const patterns = [
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'),
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),
  ];
  for(const p of patterns) { const m = xml.match(p); if(m && m[1]) return m[1].trim(); }
  return '';
}
function extractAttr(xml, tag, attr) {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, 'i'));
  return m ? m[1] : '';
}
function stripHTML(str) {
  return str.replace(/<[^>]*>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}

// ── RSS QUELLEN ───────────────────────────────────────────────────────────
const FEEDS = [
  // Asset-spezifisch via Yahoo Finance (dynamisch)
  // Deutsche Qualitätsquellen
  { url: 'https://feeds.cms.handelsblatt.com/schlagzeilen', source: 'Handelsblatt' },
  { url: 'https://www.faz.net/rss/aktuell/wirtschaft/', source: 'FAZ' },
  { url: 'https://rss.sueddeutsche.de/rss/Wirtschaft', source: 'Süddeutsche' },
  // Internationale Top-Quellen
  { url: 'https://feeds.reuters.com/reuters/businessNews', source: 'Reuters' },
  { url: 'https://feeds.reuters.com/reuters/technologyNews', source: 'Reuters Tech' },
  // Zentralbanken direkt
  { url: 'https://www.ecb.europa.eu/rss/press.html', source: 'EZB' },
  { url: 'https://www.federalreserve.gov/feeds/press_all.xml', source: 'Federal Reserve' },
];

// ── HANDLER ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if(req.method !== 'GET') return res.status(405).end();

  const { asset, symbol, range } = req.query;
  const now = Date.now();
  const cacheKey = (symbol || asset || 'general') + '_' + (range || '1T');

  // Cache prüfen
  if(assetCache[cacheKey] && (now - assetCache[cacheKey].time) < CACHE_DURATION) {
    return res.status(200).json({
      articles: assetCache[cacheKey].articles,
      cachedAt: new Date(assetCache[cacheKey].time).toISOString(),
      fromCache: true
    });
  }

  const assetKeys = getAssetKeys(asset, symbol);

  try {
    // 1. Asset-spezifische Yahoo Finance News
    let yahooArticles = [];
    if(symbol) {
      yahooArticles = await fetchRSS(
        `https://finance.yahoo.com/rss/headline?s=${encodeURIComponent(symbol)}`,
        'Yahoo Finance'
      );
    }

    // 2. Alle RSS Feeds parallel laden
    const feedResults = await Promise.all(
      FEEDS.map(f => fetchRSS(f.url, f.source))
    );
    const feedArticles = feedResults.flat();

    // 3. Alle kombinieren, Duplikate entfernen
    const seen = new Set();
    const all = [...yahooArticles, ...feedArticles].filter(a => {
      if(seen.has(a.title) || !a.title) return false;
      seen.add(a.title);
      return true;
    });

    // 4. Scoring — direkte Asset-Treffer priorisieren
    const scored = all.map(a => scoreArticle(a, assetKeys));

    // 5. Sortieren: Score absteigend, dann Datum
    scored.sort((a, b) => {
      if(b.score !== a.score) return b.score - a.score;
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    });

    // 6. Nur relevante News — Score > 0, Neutral minimieren
    let relevant = scored.filter(a => a.score > 0);

    // Neutral-News stark begrenzen — max 1 von 5
    const nonNeutral = relevant.filter(a => a.sentiment !== 'neutral');
    const neutral = relevant.filter(a => a.sentiment === 'neutral').slice(0, 1);
    relevant = [...nonNeutral, ...neutral].sort((a, b) => b.score - a.score);

    // Falls zu wenig — allgemeine Finanz-News auffüllen
    if(relevant.length < 3) {
      const filler = scored.filter(a => !relevant.includes(a)).slice(0, 3 - relevant.length);
      relevant = [...relevant, ...filler];
    }

    const result = relevant.slice(0, 6).map(a => ({
      title: a.title,
      source: a.source,
      url: a.url,
      publishedAt: a.publishedAt,
      description: a.description,
      sentiment: a.sentiment,
      score: a.score,
    }));

    assetCache[cacheKey] = { articles: result, time: now };

    res.status(200).json({
      articles: result,
      cachedAt: new Date(now).toISOString(),
      fromCache: false,
      total: all.length,
    });

  } catch(e) {
    if(assetCache[cacheKey]) {
      return res.status(200).json({
        articles: assetCache[cacheKey].articles,
        cachedAt: new Date(assetCache[cacheKey].time).toISOString(),
        fromCache: true, stale: true
      });
    }
    res.status(500).json({ error: e.message });
  }
}
