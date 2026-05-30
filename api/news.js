const https = require('https');

const assetCache = {};

const CACHE_BY_RANGE = {
  '1T': 20 * 60 * 1000,
  '1W': 2 * 60 * 60 * 1000,
  '1M': 4 * 60 * 60 * 1000,
  '6M': 8 * 60 * 60 * 1000,
  '1J': 12 * 60 * 60 * 1000,
  '5J': 24 * 60 * 60 * 1000,
};

// ── REUTERS RSS FEEDS ─────────────────────────────────────────────────────
const REUTERS_FEEDS = {
  business:   'https://feeds.reuters.com/reuters/businessNews',
  technology: 'https://feeds.reuters.com/reuters/technologyNews',
  markets:    'https://feeds.reuters.com/reuters/marketsNews',
};

// ── CATEGORY DETECTION ────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'earnings', label: 'Quartalszahlen', color: '#7C3AED', bg: '#F5F3FF',
    patterns: [/earnings/i, /quartalszahl/i, /\beps\b/i, /results\b/i, /quarterly/i, /revenue beat/i, /revenue miss/i, /guidance/i, /beats? estimates/i, /misses? estimates/i] },
  { id: 'analyst', label: 'Analyst', color: '#2563EB', bg: '#EFF6FF',
    patterns: [/upgrade\b/i, /downgrade\b/i, /price target/i, /analyst/i, /overweight/i, /underweight/i, /buy rating/i, /sell rating/i, /hold rating/i, /kursziel/i, /hochstufung/i, /abstufung/i] },
  { id: 'ma', label: 'M&A', color: '#059669', bg: '#ECFDF5',
    patterns: [/merger/i, /acquisition/i, /acquired/i, /acquires/i, /takeover/i, /übernahme/i, /buyout/i, /deal\b/i, /to acquire/i, /to buy\b/i] },
  { id: 'regulierung', label: 'Regulierung', color: '#B45309', bg: '#FEF3C7',
    patterns: [/\bsec\b/i, /\bdoj\b/i, /antitrust/i, /lawsuit/i, /fine\b/i, /penalty/i, /\bban\b/i, /approved\b/i, /approval/i, /genehmigung/i, /klage/i, /regulat/i] },
  { id: 'produkt', label: 'Produkt', color: '#0369A1', bg: '#E0F2FE',
    patterns: [/launch/i, /release\b/i, /unveil/i, /introduces?/i, /new product/i, /new model/i, /announced\b/i, /partnership/i, /kooperation/i, /launch\b/i] },
  { id: 'krypto', label: 'Krypto', color: '#F59E0B', bg: '#FFFBEB',
    patterns: [/bitcoin/i, /ethereum/i, /crypto/i, /blockchain/i, /defi/i, /nft\b/i, /stablecoin/i, /digital asset/i] },
  { id: 'geopolitik', label: 'Geopolitik', color: '#DC2626', bg: '#FEF2F2',
    patterns: [/tariff/i, /trade war/i, /sanction/i, /export control/i, /trump/i, /china.us/i, /geopolit/i] },
  { id: 'makro', label: 'Makro', color: '#64748B', bg: '#F1F5F9',
    patterns: [/federal reserve/i, /\bfed\b/i, /inflation/i, /rate cut/i, /rate hike/i, /recession/i, /gdp\b/i, /cpi\b/i] },
];

function detectCategory(text) {
  const t = (text || '').toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.patterns.some(p => p.test(t))) return { id: cat.id, label: cat.label, color: cat.color, bg: cat.bg };
  }
  return { id: 'news', label: 'News', color: '#64748B', bg: '#F1F5F9' };
}

// ── SENTIMENT ─────────────────────────────────────────────────────────────
const BULLISH_W = ['rise','rises','gain','gains','beat','beats','surge','jump','strong','record','upgrade','profit','revenue','growth','breakthrough','approved','outperform','raised guidance','soars','steigt','gestiegen','zulegen','rekord','wächst','positiv','rally','erholung','übertrifft','hochstufung'];
const BEARISH_W = ['fall','falls','drop','decline','miss','missed','weak','crisis','crash','fear','warning','below','recession','inflation','rate hike','fine','lawsuit','ban','sanction','layoffs','bankruptcy','downgrade','plunges','tumbles','fällt','verliert','sinkt','schwach','krise','einbruch','angst','warnung','verfehlt','rezession','zinserhöhung','abstufung'];

function getSentiment(text) {
  const l = (text || '').toLowerCase();
  let bull = 0, bear = 0;
  BULLISH_W.forEach(w => { if (l.includes(w)) bull++; });
  BEARISH_W.forEach(w => { if (l.includes(w)) bear++; });
  if (bull > bear) return 'bullish';
  if (bear > bull) return 'bearish';
  return 'neutral';
}

// ── IMPACT LEVEL ──────────────────────────────────────────────────────────
const HIGH_KW = [
  'federal reserve','fed rate','fomc','rate cut','rate hike','ecb','interest rate','zinsentscheid',
  'inflation','cpi','recession','gdp','etf approval','bitcoin etf','sec','regulation','ban','lawsuit',
  'breakthrough','acquisition','merger','ipo','restructuring','bankruptcy','default','crisis',
  'war','tariff','sanction','trade war','export control',
];
const MEDIUM_KW = [
  'earnings','quarterly','revenue','profit','guidance','upgrade','downgrade','price target',
  'analyst','rating','q1','q2','q3','q4','quartalszahlen','ausblick','umsatz',
];

function getImpactLevel(text) {
  const l = (text || '').toLowerCase();
  if (HIGH_KW.some(k => l.includes(k))) return 'high';
  if (MEDIUM_KW.some(k => l.includes(k))) return 'medium';
  return 'low';
}

function isRelevantForRange(article, range) {
  const impact = article.impactLevel;
  switch (range) {
    case '1T': case '1W': return true;
    case '1M': case '6M': return impact === 'high' || impact === 'medium';
    case '1J': case '5J': return impact === 'high';
    default: return true;
  }
}

// ── DATE HELPERS ──────────────────────────────────────────────────────────
function rangeToFromDate(range) {
  const now = new Date();
  const map = { '1T': 2, '1W': 8, '1M': 32, '6M': 185, '1J': 370, '5J': 1830 };
  const days = map[range] || 7;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
}

// ── FETCH HELPERS ─────────────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Finanzblick/1.0', 'Accept': 'application/json' },
      timeout: 7000
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { reject(e); } });
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

function fetchSafe(url, ms) {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(null), ms);
    fetchJSON(url).then(d => { clearTimeout(t); resolve(d); }).catch(() => { clearTimeout(t); resolve(null); });
  });
}

// ── RSS FETCH ─────────────────────────────────────────────────────────────
function fetchRSSFromUrl(url, sourceName) {
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 }, res => {
      if (res.statusCode !== 200) { resolve([]); return; }
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(parseRSS(raw, sourceName)); } catch(e) { resolve([]); } });
    }).on('error', () => resolve([])).on('timeout', function() { this.destroy(); resolve([]); });
  });
}

// PRIMARY: Reuters RSS (businessNews, technologyNews, marketsNews)
function fetchReutersRSS(feedKeys) {
  const keys = feedKeys || ['business', 'markets'];
  return Promise.all(keys.map(k => fetchRSSFromUrl(REUTERS_FEEDS[k], 'Reuters')))
    .then(results => {
      const seen = new Set();
      const merged = [];
      results.flat().forEach(a => {
        const key = a.title.slice(0, 50).toLowerCase();
        if (!seen.has(key)) { seen.add(key); merged.push(a); }
      });
      return merged;
    });
}

// FALLBACK: Yahoo Finance RSS (symbol-specific)
function fetchYahooRSS(symbol) {
  if (!symbol) return Promise.resolve([]);
  return fetchRSSFromUrl(
    `https://finance.yahoo.com/rss/headline?s=${encodeURIComponent(symbol)}`,
    'Yahoo Finance'
  );
}

function parseRSS(xml, sourceName) {
  const items = [];
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  matches.slice(0, 8).forEach(item => {
    const title = stripHTML(extractTag(item, 'title'));
    const link = extractTag(item, 'link') || extractAttr(item, 'link', 'href');
    const description = stripHTML(extractTag(item, 'description') || '');
    const pubDate = extractTag(item, 'pubDate') || new Date().toISOString();
    if (title && title.length > 10 && link && link.startsWith('http')) {
      items.push({ title, source: sourceName || 'RSS', url: link, publishedAt: new Date(pubDate).toISOString(), description: description.slice(0, 250) });
    }
  });
  return items;
}

function extractTag(xml, tag) {
  const p1 = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const p2 = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  let m = xml.match(p1); if (m && m[1]) return m[1].trim();
  m = xml.match(p2); if (m && m[1]) return m[1].trim();
  return '';
}
function extractAttr(xml, tag, attr) {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, 'i'));
  return m ? m[1] : '';
}
function stripHTML(str) {
  return str.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── REUTERS FEED SELECTION ────────────────────────────────────────────────
function selectReutersFeeds(symbol) {
  if (!symbol) return ['business', 'markets'];
  const isCrypto = symbol.endsWith('-USD');
  const isIndex = symbol.startsWith('^');
  const isCommodity = symbol.endsWith('=F');
  if (isCrypto || isIndex || isCommodity) return ['business', 'markets'];
  // For stocks: include technology feed for broader coverage
  return ['business', 'technology', 'markets'];
}

// ── HANDLER ───────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { asset, symbol, range } = req.query;
  const now = Date.now();
  const cacheKey = (symbol || asset || 'general') + '_' + (range || '1T');
  const cacheDuration = CACHE_BY_RANGE[range] || CACHE_BY_RANGE['1T'];

  if (assetCache[cacheKey] && (now - assetCache[cacheKey].time) < cacheDuration) {
    return res.status(200).json({ articles: assetCache[cacheKey].articles, cachedAt: new Date(assetCache[cacheKey].time).toISOString(), fromCache: true, range: range || '1T' });
  }

  const finnhubKey = process.env.FINNHUB_API_KEY;
  const { from, to } = rangeToFromDate(range || '1T');

  try {
    let articles = [];

    // ── PRIMARY: Finnhub company-news (wenn Symbol vorhanden) ──────────────
    if (symbol && finnhubKey) {
      const isCrypto = symbol.endsWith('-USD');
      const isIndex = symbol.startsWith('^');
      const isCommodity = symbol.endsWith('=F');

      if (!isCrypto && !isIndex && !isCommodity) {
        const data = await fetchSafe(
          `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${finnhubKey}`,
          6000
        );
        if (Array.isArray(data) && data.length > 0) {
          articles = data
            .filter(a => a.headline && a.headline.length > 15 && a.url)
            .slice(0, 15)
            .map(a => ({
              title: a.headline,
              source: a.source || 'Finnhub',
              url: a.url,
              publishedAt: a.datetime ? new Date(a.datetime * 1000).toISOString() : new Date().toISOString(),
              description: (a.summary || '').slice(0, 250),
            }));
        }
      }
    }

    // ── SECONDARY: Reuters RSS (wenn Finnhub < 3 Artikel liefert) ──────────
    if (articles.length < 3) {
      const feedKeys = selectReutersFeeds(symbol);
      const reutersArticles = await fetchReutersRSS(feedKeys);
      const seen = new Set(articles.map(a => a.title.slice(0, 50).toLowerCase()));
      reutersArticles.forEach(a => {
        const key = a.title.slice(0, 50).toLowerCase();
        if (!seen.has(key)) { seen.add(key); articles.push(a); }
      });
    }

    // ── FALLBACK: Yahoo Finance RSS (wenn Reuters nicht verfügbar) ──────────
    if (articles.length < 3 && symbol) {
      const yahooArticles = await fetchYahooRSS(symbol);
      const seen = new Set(articles.map(a => a.title.slice(0, 50).toLowerCase()));
      yahooArticles.forEach(a => {
        const key = a.title.slice(0, 50).toLowerCase();
        if (!seen.has(key)) { seen.add(key); articles.push(a); }
      });
    }

    // ── DEDUPLICATE ────────────────────────────────────────────────────────
    const seen = new Set();
    const unique = articles.filter(a => {
      if (!a.title || !a.url) return false;
      const key = a.title.slice(0, 50).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // ── ENRICH: category, sentiment, impact ────────────────────────────────
    const enriched = unique.map(a => {
      const text = a.title + ' ' + (a.description || '');
      return {
        ...a,
        category: detectCategory(text),
        sentiment: getSentiment(text),
        impactLevel: getImpactLevel(text),
      };
    });

    // ── FILTER BY RANGE ────────────────────────────────────────────────────
    const relevant = enriched.filter(a => isRelevantForRange(a, range || '1T'));

    // ── SORT: impact first, then date ─────────────────────────────────────
    relevant.sort((a, b) => {
      const impOrd = { high: 0, medium: 1, low: 2 };
      const diff = (impOrd[a.impactLevel] || 2) - (impOrd[b.impactLevel] || 2);
      if (diff !== 0) return diff;
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    });

    // ── PREFER NON-NEUTRAL ─────────────────────────────────────────────────
    const nonNeutral = relevant.filter(a => a.sentiment !== 'neutral');
    const neutral = relevant.filter(a => a.sentiment === 'neutral');
    const result = [...nonNeutral, ...neutral.slice(0, 2)].slice(0, 7);
    const final = result.length >= 2 ? result : relevant.slice(0, 6);

    assetCache[cacheKey] = { articles: final, time: now };

    return res.status(200).json({ articles: final, cachedAt: new Date(now).toISOString(), fromCache: false, range: range || '1T', total: unique.length });

  } catch(e) {
    if (assetCache[cacheKey]) {
      return res.status(200).json({ articles: assetCache[cacheKey].articles, cachedAt: new Date(assetCache[cacheKey].time).toISOString(), fromCache: true, stale: true });
    }
    return res.status(500).json({ error: e.message });
  }
};
