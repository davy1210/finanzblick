import https from 'https';
import http from 'http';

const assetCache = {};
const CACHE_DURATION = 4 * 60 * 60 * 1000;

const BULLISH = ['steigt','gestiegen','gewinnt','gewinn','wächst','rekord','allzeithoch','stark','positiv','rally','aufschwung','erholung','übertrifft','dividende','boom','upgrade','rise','rises','gain','gains','growth','record','strong','positive','recovery','surge','beat','beats','exceeded','bullish','profit','revenue','approved','outperform','soars','jumps'];
const BEARISH = ['fällt','gefallen','verliert','verlust','sinkt','schwach','negativ','krise','einbruch','crash','angst','sorge','warnung','enttäuscht','rezession','rückgang','entlassung','insolvenz','downgrade','fall','falls','drop','loss','losses','decline','weak','negative','crisis','fear','risk','warning','missed','below','recession','rate hike','fine','ban','slowdown','layoffs','bankruptcy','bearish','plunges','tumbles'];

function getSentiment(text) {
  const l = text.toLowerCase();
  let bull = 0, bear = 0;
  BULLISH.forEach(w => { if(l.includes(w)) bull++; });
  BEARISH.forEach(w => { if(l.includes(w)) bear++; });
  if(bull > bear) return 'bullish';
  if(bear > bull) return 'bearish';
  return 'neutral';
}

const NAME_TO_SYMBOL = {
  'bitcoin':'BTC-USD','btc':'BTC-USD','ethereum':'ETH-USD','eth':'ETH-USD',
  'nvidia':'NVDA','nvda':'NVDA','apple':'AAPL','aapl':'AAPL',
  'tesla':'TSLA','tsla':'TSLA','amazon':'AMZN','microsoft':'MSFT',
  'meta':'META','google':'GOOGL','alphabet':'GOOGL',
  'volkswagen':'VOW3.DE','vw':'VOW3.DE','siemens':'SIE.DE',
  'dax':'^GDAXI','s&p':'^GSPC','sp500':'^GSPC','gold':'GC=F',
};

function getSymbol(asset, urlSymbol) {
  if(urlSymbol) return urlSymbol;
  const al = (asset||'').toLowerCase().trim();
  for(const [key, sym] of Object.entries(NAME_TO_SYMBOL)) {
    if(al.includes(key)||key.includes(al)) return sym;
  }
  return null;
}

function fetchRSS(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 }, res => {
      if(res.statusCode === 301 || res.statusCode === 302) {
        return fetchRSS(res.headers.location).then(resolve).catch(() => resolve([]));
      }
      if(res.statusCode !== 200) { resolve([]); return; }
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(parseRSS(raw)); } catch(e) { resolve([]); } });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
  });
}

function parseRSS(xml) {
  const items = [];
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  matches.slice(0, 8).forEach(item => {
    const title = stripHTML(extractTag(item, 'title'));
    const link = extractTag(item, 'link') || extractAttr(item, 'link', 'href');
    const description = stripHTML(extractTag(item, 'description') || '');
    const pubDate = extractTag(item, 'pubDate') || new Date().toISOString();
    if(title && title.length > 5) {
      items.push({ title: title.slice(0,150), source:'', url: link||'#', publishedAt: new Date(pubDate).toISOString(), description: description.slice(0,250) });
    }
  });
  return items;
}

function extractTag(xml, tag) {
  const patterns = [
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'),
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),
  ];
  for(const p of patterns) { const m = xml.match(p); if(m&&m[1]) return m[1].trim(); }
  return '';
}
function extractAttr(xml, tag, attr) {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, 'i'));
  return m ? m[1] : '';
}
function stripHTML(str) {
  return str.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}

const GERMAN_FEEDS = [
  { url:'https://feeds.cms.handelsblatt.com/schlagzeilen', source:'Handelsblatt' },
  { url:'https://www.faz.net/rss/aktuell/wirtschaft/', source:'FAZ' },
  { url:'https://rss.sueddeutsche.de/rss/Wirtschaft', source:'Süddeutsche' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if(req.method !== 'GET') return res.status(405).end();

  const { asset, symbol } = req.query;
  const now = Date.now();
  const yahooSymbol = getSymbol(asset, symbol);
  const cacheKey = yahooSymbol || asset || 'general';

  if(assetCache[cacheKey] && (now - assetCache[cacheKey].time) < CACHE_DURATION) {
    return res.status(200).json({ articles: assetCache[cacheKey].articles, cachedAt: new Date(assetCache[cacheKey].time).toISOString(), fromCache: true });
  }

  try {
    let yahooArticles = [];
    if(yahooSymbol) {
      const articles = await fetchRSS(`https://finance.yahoo.com/rss/headline?s=${encodeURIComponent(yahooSymbol)}`);
      yahooArticles = articles.map(a => ({...a, source:'Yahoo Finance'}));
    }

    const germanResults = await Promise.all(GERMAN_FEEDS.map(f => fetchRSS(f.url).then(articles => articles.map(a => ({...a, source:f.source})))));
    const germanArticles = germanResults.flat();

    const seen = new Set();
    const combined = [];
    [...yahooArticles, ...germanArticles].forEach(a => {
      if(!seen.has(a.title) && a.title.length > 5) { seen.add(a.title); combined.push(a); }
    });

    const withSentiment = combined.slice(0,7).map(a => ({...a, sentiment: getSentiment(a.title+' '+a.description)}));
    assetCache[cacheKey] = { articles: withSentiment, time: now };

    return res.status(200).json({ articles: withSentiment, cachedAt: new Date(now).toISOString(), fromCache: false });
  } catch(e) {
    if(assetCache[cacheKey]) {
      return res.status(200).json({ articles: assetCache[cacheKey].articles, cachedAt: new Date(assetCache[cacheKey].time).toISOString(), fromCache: true, stale: true });
    }
    return res.status(500).json({ error: e.message });
  }
}
