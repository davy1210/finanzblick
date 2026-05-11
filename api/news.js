const https = require('https');

let globalCache = null;
let cacheTime = null;
const CACHE_DURATION = 4 * 60 * 60 * 1000;

const BULLISH_WORDS = [
  'steigt','gestiegen','zulegen','gewinnt','gewinn','wächst','wachstum','rekord','allzeithoch',
  'stark','positiv','optimismus','rally','aufschwung','erholung','kaufen','boom','übertrifft',
  'besser als erwartet','zuversicht','profitiert','expansion','durchbruch','genehmigung','dividende',
  'rise','rises','rising','gain','gains','grew','growth','record','high','strong','positive',
  'rally','recovery','surge','surges','beat','beats','exceeded','bullish','upgrade','profit',
  'profits','revenue','expansion','breakthrough','approved','approval','partnership','outperform',
  'soars','soaring','jumps','jumped','climbs','climbing','boosts','boosted'
];

const BEARISH_WORDS = [
  'fällt','gefallen','verliert','verlust','sinkt','gesunken','schwach','negativ','krise',
  'einbruch','crash','verkaufen','angst','sorge','risiko','warnung','enttäuscht','verfehlt',
  'rezession','inflation','zinserhöhung','strafe','klage','verbot','rückgang','minus',
  'entlassung','insolvenz','pleite','downgrade','gewinnwarnung',
  'fall','falls','falling','drop','drops','loss','losses','decline','weak','weaker','negative',
  'crisis','crash','sell','fear','risk','warning','warns','missed','below','recession',
  'inflation','rate hike','fine','lawsuit','ban','sanction','slowdown','layoffs','bankruptcy',
  'downgrade','profit warning','bearish','underperform','plunges','plunging','tumbles','tumbling',
  'slumps','slumping','sinks','sinking'
];

function getSentiment(text) {
  const lower = text.toLowerCase();
  let bull = 0, bear = 0;
  BULLISH_WORDS.forEach(w => { if(lower.includes(w)) bull++; });
  BEARISH_WORDS.forEach(w => { if(lower.includes(w)) bear++; });
  if(bull > bear) return 'bullish';
  if(bear > bull) return 'bearish';
  return 'neutral';
}

const ASSET_KEYWORDS = {
  'bitcoin': ['bitcoin','btc','crypto','cryptocurrency','satoshi','halving','coinbase'],
  'ethereum': ['ethereum','eth','ether','defi','web3','smart contract'],
  'krypto': ['crypto','bitcoin','ethereum','blockchain','coinbase','binance'],
  'dax': ['dax','germany','german','frankfurt','deutsche','bundesbank','dax40'],
  'nvidia': ['nvidia','nvda','jensen huang','gpu','ai chips','graphics card'],
  'apple': ['apple','aapl','iphone','ipad','tim cook','app store','ios','mac'],
  'tesla': ['tesla','tsla','elon musk','electric vehicle','ev','cybertruck','model 3'],
  'gold': ['gold','xau','precious metal','gold price','bullion'],
  'amazon': ['amazon','amzn','aws','jeff bezos','andy jassy','prime','alexa'],
  'microsoft': ['microsoft','msft','windows','azure','satya nadella','office','copilot'],
  'volkswagen': ['volkswagen','vw','audi','porsche','oliver blume','wolfsburg'],
  'siemens': ['siemens','sie'],
  'meta': ['meta','facebook','zuckerberg','instagram','whatsapp','threads'],
  'alphabet': ['google','alphabet','googl','youtube','gemini','search'],
  'sp500': ['s&p','sp500','wall street','nasdaq','dow jones','federal reserve','fed'],
  's&p': ['s&p','sp500','wall street','nasdaq','dow jones','federal reserve','fed'],
};

function filterNews(articles, asset) {
  if(!asset || !articles || !articles.length) return articles || [];
  const al = asset.toLowerCase();

  let keywords = [al];
  for(const [key, words] of Object.entries(ASSET_KEYWORDS)) {
    if(al.includes(key) || key.includes(al)) {
      keywords = [...new Set([...keywords, ...words])];
      break;
    }
  }

  const relevant = articles.filter(a => {
    const text = (a.title + ' ' + (a.description || '')).toLowerCase();
    return keywords.some(kw => text.includes(kw));
  });

  // Immer etwas zurückgeben
  return relevant.length > 0 ? relevant.slice(0,5) : articles.slice(0,5);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if(req.method !== 'GET') return res.status(405).end();

  const { asset } = req.query;
  const apiKey = process.env.GNEWS_API_KEY;
  const now = Date.now();

  // Cache gültig?
  if(globalCache && cacheTime && (now - cacheTime) < CACHE_DURATION) {
    const filtered = filterNews(globalCache, asset);
    const withSentiment = filtered.map(a => ({...a, sentiment: getSentiment(a.title+' '+(a.description||''))}));
    return res.status(200).json({articles: withSentiment, cachedAt: new Date(cacheTime).toISOString(), fromCache: true});
  }

  // Englische Suche — viel mehr Finanznews
  const query = encodeURIComponent('stock market finance economy crypto investment');
  const url = `https://gnews.io/api/v4/search?q=${query}&lang=en&max=10&apikey=${apiKey}`;

  try {
    const data = await new Promise((resolve, reject) => {
      https.get(url, response => {
        let raw = '';
        response.on('data', chunk => raw += chunk);
        response.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { reject(e); } });
      }).on('error', reject);
    });

    if(data.errors) return res.status(500).json({error: data.errors.join(', ')});

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
    const withSentiment = filtered.map(a => ({...a, sentiment: getSentiment(a.title+' '+(a.description||''))}));

    res.status(200).json({articles: withSentiment, cachedAt: new Date(cacheTime).toISOString(), fromCache: false, total: articles.length});

  } catch(e) {
    if(globalCache) {
      const filtered = filterNews(globalCache, asset);
      const withSentiment = filtered.map(a => ({...a, sentiment: getSentiment(a.title+' '+(a.description||''))}));
      return res.status(200).json({articles: withSentiment, cachedAt: new Date(cacheTime).toISOString(), fromCache: true, stale: true});
    }
    res.status(500).json({error: 'News nicht verfügbar', details: e.message});
  }
};
