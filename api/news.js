const https = require('https');
const http = require('http');

let globalCache = null;
let cacheTime = null;
const CACHE_DURATION = 4 * 60 * 60 * 1000;

// ── DEUTSCHE & INTERNATIONALE RSS FEEDS ──────────────────────────────────
const RSS_FEEDS = [
  // Deutsche Quellen
  'https://www.handelsblatt.com/contentexport/feed/schlagzeilen',
  'https://www.finanzen.net/rss/news',
  'https://www.boerse.de/rss/nachrichten',
  'https://www.manager-magazin.de/themen/boerse/index.rss',
  'https://rss.sueddeutsche.de/rss/Wirtschaft',
  'https://www.faz.net/rss/aktuell/wirtschaft/',
  // International als Backup
  'https://feeds.reuters.com/reuters/businessNews',
  'https://finance.yahoo.com/news/rssindex',
];

// ── SENTIMENT ─────────────────────────────────────────────────────────────
const BULLISH = [
  'steigt','gestiegen','zulegen','gewinnt','gewinn','gewinne','wächst','wachstum',
  'rekord','allzeithoch','stark','positiv','optimismus','rally','aufschwung','erholung',
  'übertrifft','besser als erwartet','zuversicht','profitiert','durchbruch','genehmigung',
  'dividende','kaufen','boom','expansion','upgrade','zulassung','konjunktur steigt',
  'rise','gain','growth','record','strong','positive','rally','recovery','surge',
  'beat','exceeded','bullish','upgrade','profit','revenue','breakthrough','approved','soars','jumps'
];

const BEARISH = [
  'fällt','gefallen','verliert','verlust','sinkt','gesunken','schwach','negativ',
  'krise','einbruch','crash','angst','sorge','risiko','warnung','enttäuscht','verfehlt',
  'rezession','inflation','zinserhöhung','strafe','klage','verbot','rückgang','minus',
  'entlassung','insolvenz','pleite','downgrade','gewinnwarnung','konjunktur schwächelt',
  'fall','drop','loss','decline','weak','negative','crisis','crash','fear','risk',
  'warning','missed','below','recession','rate hike','fine','lawsuit','ban','slowdown',
  'layoffs','bankruptcy','downgrade','bearish','plunges','tumbles','slumps'
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
  'bitcoin': ['bitcoin','btc','krypto','crypto','kryptowährung','coinbase','halving'],
  'ethereum': ['ethereum','eth','ether','defi','blockchain','krypto'],
  'dax': ['dax','deutschland','german','frankfurt','dax40','mdax','deutsche aktien'],
  'nvidia': ['nvidia','nvda','ki-chips','gpu','künstliche intelligenz','halbleiter','chip'],
  'apple': ['apple','aapl','iphone','tim cook','app store','ios','mac'],
  'tesla': ['tesla','tsla','elon musk','elektroauto','e-auto','ev','cybertruck'],
  'gold': ['gold','xau','edelmetall','goldpreis','rohstoff','safe haven'],
  'amazon': ['amazon','amzn','aws','andy jassy','prime','cloud'],
  'microsoft': ['microsoft','msft','azure','satya nadella','copilot','windows'],
  'volkswagen': ['volkswagen','vw','audi','porsche','wolfsburg','oliver blume','elektroauto'],
  'siemens': ['siemens','automatisierung','industrie','digital industries'],
  'meta': ['meta','facebook','zuckerberg','instagram','whatsapp','threads'],
  'alphabet': ['google','alphabet','googl','youtube','suchmaschine','ki'],
  'sp500': ['s&p','sp500','wall street','nasdaq','dow jones','fed','federal reserve','us-börse'],
  's&p': ['s&p','sp500','wall street','nasdaq','dow jones','fed','us-börse'],
  'zinsen': ['zinsen','ezb','fed','leitzins','zinserhöhung','zinssenkung','geldpolitik'],
};

const GENERAL_FINANCE = [
  'börse','aktien','dax','wirtschaft','zinsen','inflation','konjunktur','anleger',
  'aktionäre','dividende','quartalszahlen','markt','handel','investition','fonds','etf',
  'stock','market','economy','inflation','investment','shares','earnings','finance',
  'federal reserve','interest rate','gdp','recession','central bank'
];

function scoreAndSort(articles, asset) {
  if(!articles || !articles.length) return [];
  const al = asset ? asset.toLowerCase() : '';

  let assetKeys = al ? [al] : [];
  for(const [key, words] of Object.entries(ASSET_KEYS)) {
    if(al.includes(key) || key.includes(al)) {
      assetKeys = [...new Set([...assetKeys, ...words])];
      break;
    }
  }

  const scored = articles.map(a => {
    const text = (a.title + ' ' + (a.description || '')).toLowerCase();
    const directMatch = assetKeys.length > 0 && assetKeys.some(kw => text.includes(kw));
    const financeMatch = GENERAL_FINANCE.some(kw => text.includes(kw));
    const score = directMatch ? 2 : financeMatch ? 1 : 0;
    return { ...a, score };
  });

  // Sortieren: direkte Treffer zuerst, dann Finanznews, dann Rest
  scored.sort((a, b) => b.score - a.score);

  // Immer mindestens 5 zurückgeben
  return scored.slice(0, 5);
}

// ── RSS PARSER ────────────────────────────────────────────────────────────
function fetchRSS(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 }, res => {
      // Redirects folgen
      if(res.statusCode === 301 || res.statusCode === 302) {
        return fetchRSS(res.headers.location).then(resolve).catch(() => resolve([]));
      }
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(parseRSS(raw, url)); }
        catch(e) { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
  });
}

function parseRSS(xml, sourceUrl) {
  const items = [];
  // Source-Name aus URL
  const sourceName = sourceUrl.includes('handelsblatt') ? 'Handelsblatt' :
    sourceUrl.includes('finanzen.net') ? 'Finanzen.net' :
    sourceUrl.includes('boerse.de') ? 'Börse.de' :
    sourceUrl.includes('manager-magazin') ? 'Manager Magazin' :
    sourceUrl.includes('sueddeutsche') ? 'Süddeutsche Zeitung' :
    sourceUrl.includes('faz.net') ? 'FAZ' :
    sourceUrl.includes('reuters') ? 'Reuters' :
    sourceUrl.includes('yahoo') ? 'Yahoo Finance' : 'News';

  // Items aus XML extrahieren
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  itemMatches.slice(0, 5).forEach(item => {
    const title = extractTag(item, 'title');
    const link = extractTag(item, 'link') || extractAttr(item, 'link', 'href');
    const description = stripHTML(extractTag(item, 'description') || extractTag(item, 'summary') || '');
    const pubDate = extractTag(item, 'pubDate') || extractTag(item, 'published') || extractTag(item, 'dc:date') || new Date().toISOString();

    if(title && title.length > 5) {
      items.push({
        title: stripHTML(title).slice(0, 120),
        source: sourceName,
        url: link || '#',
        publishedAt: new Date(pubDate).toISOString(),
        description: description.slice(0, 200),
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
  for(const p of patterns) {
    const m = xml.match(p);
    if(m && m[1]) return m[1].trim();
  }
  return '';
}

function extractAttr(xml, tag, attr) {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, 'i'));
  return m ? m[1] : '';
}

function stripHTML(str) {
  return str.replace(/<[^>]*>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').trim();
}

// ── HANDLER ───────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if(req.method !== 'GET') return res.status(405).end();

  const { asset } = req.query;
  const now = Date.now();

  // Cache gültig?
  if(globalCache && cacheTime && (now - cacheTime) < CACHE_DURATION) {
    const sorted = scoreAndSort(globalCache, asset);
    const result = sorted.map(a => ({...a, sentiment: getSentiment(a.title+' '+a.description)}));
    return res.status(200).json({articles: result, cachedAt: new Date(cacheTime).toISOString(), fromCache: true});
  }

  // Alle RSS Feeds parallel abrufen
  try {
    const results = await Promise.all(RSS_FEEDS.map(url => fetchRSS(url)));
    const allArticles = results.flat();

    // Duplikate entfernen
    const seen = new Set();
    const unique = allArticles.filter(a => {
      if(seen.has(a.title)) return false;
      seen.add(a.title);
      return true;
    });

    globalCache = unique;
    cacheTime = now;

    const sorted = scoreAndSort(unique, asset);
    const result = sorted.map(a => ({...a, sentiment: getSentiment(a.title+' '+a.description)}));

    res.status(200).json({
      articles: result,
      cachedAt: new Date(cacheTime).toISOString(),
      fromCache: false,
      total: unique.length
    });

  } catch(e) {
    if(globalCache) {
      const sorted = scoreAndSort(globalCache, asset);
      const result = sorted.map(a => ({...a, sentiment: getSentiment(a.title+' '+a.description)}));
      return res.status(200).json({articles: result, cachedAt: new Date(cacheTime).toISOString(), fromCache: true, stale: true});
    }
    res.status(500).json({error: 'News nicht verfügbar', details: e.message});
  }
};
