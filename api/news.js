import https from 'https';

const assetCache = {};
const CACHE_DURATION = 4 * 60 * 60 * 1000;

// ── SENTIMENT ─────────────────────────────────────────────────────────────
const BULLISH = [
  'steigt','gestiegen','zulegen','gewinnt','gewinn','gewinne','wächst','wachstum',
  'rekord','allzeithoch','stark','positiv','optimismus','rally','aufschwung','erholung',
  'übertrifft','besser als erwartet','zuversicht','dividende','boom','upgrade','genehmigung',
  'zinssenkung','konjunkturpaket','kaufsignal','kursgewinn','expansion','durchbruch',
  'rise','rises','rising','gain','gains','grew','growth','record','high','strong','positive',
  'rally','recovery','surge','surges','beat','beats','exceeded','bullish','upgrade','profit',
  'profits','revenue','expansion','breakthrough','approved','approval','outperform',
  'soars','soaring','jumps','jumped','climbs','boosts','boosted','rate cut','stimulus',
  'buyback','dividend','strong results','earnings beat','raised guidance','buy rating'
];

const BEARISH = [
  'fällt','gefallen','verliert','verlust','verluste','sinkt','gesunken','schwach','schwächer',
  'negativ','pessimismus','krise','einbruch','absturz','crash','verkaufen','angst','sorge',
  'risiko','warnung','warnt','enttäuscht','verfehlt','unter erwartet','rezession','inflation',
  'zinserhöhung','strafe','klage','regulierung','verbot','sanktion','rückgang','minus',
  'entlassung','stellenabbau','insolvenz','pleite','downgrade','gewinnwarnung','handelskrieg',
  'zölle','kursverlust','verkaufsdruck',
  'fall','falls','falling','drop','drops','loss','losses','decline','weak','weaker','negative',
  'crisis','crash','sell','fear','risk','warning','warns','missed','below','recession',
  'inflation','rate hike','fine','lawsuit','ban','sanction','slowdown','layoffs','bankruptcy',
  'downgrade','profit warning','bearish','underperform','plunges','plunging','tumbles',
  'tumbling','slumps','sinking','trade war','tariff','sell off','correction','default',
  'debt','cut guidance','miss estimates','lowered'
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

// ── ASSET SEARCH TERMS ────────────────────────────────────────────────────
// Für jeden Asset: Haupt-Symbol + Suchbegriffe für Yahoo Finance News-Suche
const ASSET_SEARCH = {
  '^GDAXI': { terms: ['DAX', 'German stocks', 'Deutsche Börse', 'Frankfurt', 'Germany economy'] },
  'BTC-USD': { terms: ['Bitcoin', 'BTC', 'crypto', 'cryptocurrency', 'blockchain'] },
  'ETH-USD': { terms: ['Ethereum', 'ETH', 'crypto', 'DeFi', 'blockchain'] },
  'NVDA':    { terms: ['Nvidia', 'NVDA', 'GPU', 'AI chips', 'Jensen Huang'] },
  'AAPL':    { terms: ['Apple', 'AAPL', 'iPhone', 'Tim Cook', 'Apple earnings'] },
  'TSLA':    { terms: ['Tesla', 'TSLA', 'Elon Musk', 'electric vehicle', 'EV'] },
  'GC=F':    { terms: ['Gold price', 'gold market', 'precious metals', 'XAU'] },
  '^GSPC':   { terms: ['S&P 500', 'US stocks', 'Wall Street', 'stock market'] },
  'AMZN':    { terms: ['Amazon', 'AMZN', 'AWS', 'Andy Jassy'] },
  'MSFT':    { terms: ['Microsoft', 'MSFT', 'Azure', 'Satya Nadella'] },
  'META':    { terms: ['Meta', 'Facebook', 'Zuckerberg', 'Instagram'] },
  'GOOGL':   { terms: ['Google', 'Alphabet', 'GOOGL', 'YouTube'] },
  'VOW3.DE': { terms: ['Volkswagen', 'VW', 'Audi', 'Porsche', 'Oliver Blume'] },
  'SIE.DE':  { terms: ['Siemens', 'SIE', 'industrial automation'] },
};

function getSearchTerms(symbol, asset) {
  // Direktes Symbol-Matching
  if(ASSET_SEARCH[symbol]) return ASSET_SEARCH[symbol].terms;
  // Fallback: Asset-Name verwenden
  return [asset || symbol];
}

// ── FETCH HELPER ──────────────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      timeout: 6000
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(e); }
      });
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
    }).on('error', () => resolve()).on('timeout', function() { this.destroy(); resolve([]); });
  });
}

function parseRSS(xml) {
  const items = [];
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  matches.slice(0, 15).forEach(item => {
    const title = stripHTML(extractTag(item, 'title'));
    const link = extractTag(item, 'link') || extractAttr(item, 'link', 'href');
    const description = stripHTML(extractTag(item, 'description') || '');
    const pubDate = extractTag(item, 'pubDate') || new Date().toISOString();
    if(title && title.length > 10) {
      items.push({
        title: title.slice(0, 160),
        source: 'Yahoo Finance',
        url: link || '#',
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

// ── YAHOO FINANCE NEWS SUCHE ──────────────────────────────────────────────
async function fetchYahooSearch(query) {
  try {
    // Yahoo Finance News Suche
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=10&quotesCount=0&lang=en-US`;
    const data = await fetchJSON(url);
    const news = data?.news || [];
    return news.map(n => ({
      title: n.title || '',
      source: n.publisher || 'Yahoo Finance',
      url: n.link || '#',
      publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : new Date().toISOString(),
      description: n.summary || '',
    }));
  } catch(e) {
    return [];
  }
}

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

  const searchTerms = getSearchTerms(symbol, asset);

  try {
    // 1. Asset-spezifischer Yahoo Finance RSS Feed
    const rssUrl = `https://finance.yahoo.com/rss/headline?s=${encodeURIComponent(symbol || asset || '')}`;
    const rssArticles = await fetchRSS(rssUrl);

    // 2. Yahoo Finance News-Suche für jeden Suchbegriff (parallel)
    // Maximal 3 Begriffe um Ladezeit zu begrenzen
    const searchResults = await Promise.all(
      searchTerms.slice(0, 3).map(term => fetchYahooSearch(term))
    );
    const searchArticles = searchResults.flat();

    // 3. Alle kombinieren, Duplikate entfernen
    const seen = new Set();
    const all = [...rssArticles, ...searchArticles].filter(a => {
      if(!a.title || a.title.length < 10) return false;
      const key = a.title.slice(0, 60).toLowerCase();
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 4. Sentiment bewerten
    const withSentiment = all.map(a => ({
      ...a,
      sentiment: getSentiment(a.title + ' ' + (a.description || '')),
    }));

    // 5. HART filtern — NUR Bullisch und Bärisch
    const relevant = withSentiment.filter(a => a.sentiment !== 'neutral');

    // 6. Nach Datum sortieren (neueste zuerst)
    relevant.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    // 7. Falls zu wenig Bullisch/Bärisch — nur dann Neutral als Notfall
    let result = relevant.slice(0, 6);
    if(result.length < 3) {
      const neutral = withSentiment
        .filter(a => a.sentiment === 'neutral')
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
        .slice(0, 3 - result.length);
      result = [...result, ...neutral];
    }

    const final = result.slice(0, 6).map(a => ({
      title: a.title,
      source: a.source,
      url: a.url,
      publishedAt: a.publishedAt,
      description: a.description,
      sentiment: a.sentiment,
    }));

    assetCache[cacheKey] = { articles: final, time: now };

    return res.status(200).json({
      articles: final,
      cachedAt: new Date(now).toISOString(),
      fromCache: false,
      total: all.length,
      relevant: relevant.length,
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
}
