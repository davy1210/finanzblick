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

// ── RSS-QUELLEN ───────────────────────────────────────────────────────────
// Die frueheren Reuters-Feeds (feeds.reuters.com) sind abgeschaltet — die
// Domain loest nicht einmal mehr im DNS auf. Sie waren als PRIMAERE Quelle
// fuer Krypto, Indizes und Rohstoffe eingetragen, weshalb diese Assets
// ueberhaupt keine Nachrichten mehr bekamen.
const FEEDS = {
  crypto:    'https://cointelegraph.com/rss',
  commodity: 'https://www.investing.com/rss/commodities.rss',
  markets:   'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',
  business:  'https://feeds.content.dowjones.io/public/rss/mw_topstories',
};

// Welche Feeds passen zu welchem Instrument?
function feedsForSymbol(symbol, asset) {
  const s = (symbol || '').toUpperCase();
  const a = (asset || '').toLowerCase();
  const isCrypto = s.endsWith('-USD') || /bitcoin|ethereum|krypto|crypto|solana|ripple/.test(a);
  const isCommodity = s.endsWith('=F') || /gold|silber|silver|öl|oel|oil|kupfer|copper|rohstoff/.test(a);
  if (isCrypto) return ['crypto', 'markets'];
  if (isCommodity) return ['commodity', 'markets'];
  return ['markets', 'business'];
}

// Nur Artikel behalten, die das Asset wirklich betreffen. Ein allgemeiner
// Markt-Feed enthaelt sonst 90% Rauschen, das nichts mit dem Wert zu tun hat.
function buildKeywords(symbol, asset) {
  const words = new Set();
  const base = (symbol || '').toUpperCase().replace(/-USD$/, '').replace(/=F$/, '').replace(/^\^/, '');
  if (base.length >= 2) words.add(base.toLowerCase());
  (asset || '').toLowerCase().split(/[^a-zä-ü0-9]+/).forEach(w => { if (w.length >= 3) words.add(w); });
  // Gebraeuchliche Zweitnamen, damit z.B. "BTC" auch "bitcoin" findet
  const alias = {
    'btc': ['bitcoin'], 'eth': ['ethereum', 'ether'], 'sol': ['solana'], 'xrp': ['ripple'],
    'gc': ['gold'], 'si': ['silver', 'silber'], 'cl': ['oil', 'crude', 'öl'], 'hg': ['copper', 'kupfer'],
    'gold': ['bullion'], 'bitcoin': ['btc'], 'ethereum': ['eth', 'ether'],
  };
  [...words].forEach(w => (alias[w] || []).forEach(x => words.add(x)));
  return [...words];
}

function isAboutAsset(article, keywords) {
  if (!keywords.length) return true;
  const text = (article.title + ' ' + (article.description || '')).toLowerCase();
  return keywords.some(k => text.includes(k));
}

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
// Nur kursbewegende Ereignisse. Quartalszahlen und Rating-Aenderungen stehen
// jetzt bewusst hier drin: fuer eine Aktie sind sie der staerkste Kurstreiber
// ueberhaupt und gehoerten nie in eine zweite Liga.
const HIGH_KW = [
  // Geldpolitik & Makro
  'federal reserve','fed rate','fomc','rate cut','rate hike','ecb','ezb','interest rate','zinsentscheid',
  'inflation','cpi','ppi','recession','rezession','gdp','bip','payroll','jobs report','unemployment',
  // Regulierung, Recht, Aufsicht
  'sec ','regulation','regulator','antitrust','kartell','lawsuit','klage','investigation','ermittlung',
  'ban','verbot','approval','zulassung','etf approval',
  // Unternehmensereignisse
  'earnings','quartalszahlen','quarterly results','guidance','prognose','profit warning','gewinnwarnung',
  'acquisition','uebernahme','übernahme','merger','takeover','ipo','buyback','aktienrueckkauf',
  'dividend','dividende','restructuring','bankruptcy','insolvenz','default','layoff','stellenabbau',
  'upgrade','downgrade','price target','kursziel','beats','misses','recall','rueckruf',
  // Geopolitik & Angebot
  'war','krieg','tariff','zoll','sanction','sanktion','trade war','export control','crisis','krise',
  'opec','supply cut','foerderkuerzung','embargo',
  // Krypto-spezifisch
  'halving','etf inflow','etf outflow','zufluss','abfluss','hack','exploit','hard fork','staking',
  'liquidation','whale',
];

// Harte Sperrliste: Formate, die per Bauart keine Kursinformation tragen.
// Kalibriert an dem, was live tatsaechlich durchkam ("Explore the top gainers
// and losers...", "Is Microsoft Stock Overvalued At 28x Earnings?",
// "Here's what happened in crypto today").
const NOISE_PATTERNS = [
  /top (gainers|losers|movers)/i, /gainers and losers/i, /sector update/i,
  /stock market (today|midday|open|close|now)/i, /market (recap|wrap|roundup|snapshot)/i,
  /here'?s what happened/i, /what happened in .+ today/i, /things to know/i,
  /\b\d+\s+(stocks|things|reasons|charts|picks)\b/i, /stocks? to (buy|watch|avoid|consider)/i,
  /best (stocks|etfs|funds)/i, /should you (buy|sell|own)/i,
  /\b(is|are)\b.+\b(overvalued|undervalued|a buy|worth it)\b/i,
  /motley fool|zacks|jim cramer|seeking alpha premium/i,
  /watchlist/i, /daily briefing|morning brief|evening brief|week in review/i,
  /\bexplore the\b/i, /\bhere are\b/i, /\bpodcast\b|\bwebinar\b/i,
  /sponsored|anzeige|werbung/i,
  // Spekulative Frage-Ueberschriften sind Meinung, keine Nachricht. Echte
  // Meldungen sind Aussagesaetze ("Nvidia hebt Dividende an"), nicht Fragen
  // ("Can Apple's Foldable iPhone Fuel the Next Growth Cycle?").
  /^\s*(is|are|can|could|should|will|would|why|what|how|does|do|has|have)\b[^?]*\?/i,
  /does it even matter|is it time to|the next big|worth buying|worth a look|too late to/i,
  // Ueberschriften, die als Frage enden, sind in Finanzmedien nahezu immer
  // Spekulation statt Meldung ("... but will AI companies compete in hardware?").
  /\?\s*$/,
  // Sammelartikel ueber viele Werte erklaeren keinen einzelnen Kurs
  /and more stocks/i, /stocks that (explain|moved|are moving)/i,
  /\bmovers\b/i, /\b(winners|losers) (and|&)\b/i,
];

function isNoise(article) {
  const t = (article.title || '') + ' ' + (article.description || '');
  return NOISE_PATTERNS.some(p => p.test(t));
}

function getImpactLevel(text) {
  const l = (text || '').toLowerCase();
  return HIGH_KW.some(k => l.includes(k)) ? 'high' : 'low';
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
// Folgt Weiterleitungen: Yahoos RSS antwortet von Vercel aus mit 301, und der
// frühere Abbruch bei allem ausser 200 liess die Quelle still ins Leere laufen.
function fetchRSSFromUrl(url, sourceName, depth) {
  const hop = depth || 0;
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hop < 3) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        res.resume();
        return resolve(fetchRSSFromUrl(next, sourceName, hop + 1));
      }
      if (res.statusCode !== 200) { res.resume(); resolve([]); return; }
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(parseRSS(raw, sourceName)); } catch(e) { resolve([]); } });
    }).on('error', () => resolve([])).on('timeout', function() { this.destroy(); resolve([]); });
  });
}

const FEED_LABEL = { crypto: 'Cointelegraph', commodity: 'Investing.com', markets: 'CNBC', business: 'MarketWatch' };

function fetchFeeds(feedKeys) {
  const keys = feedKeys || ['markets', 'business'];
  return Promise.all(keys.map(k => fetchRSSFromUrl(FEEDS[k], FEED_LABEL[k] || 'RSS')))
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
  // 25 statt 8: die Feeds werden anschliessend auf das Asset gefiltert —
  // aus nur 8 Eintraegen bleibt danach oft nichts uebrig (Ethereum: 0).
  matches.slice(0, 25).forEach(item => {
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

// ── HANDLER ───────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { asset, symbol, range } = req.query;
  const now = Date.now();

  // Nachrichten richten sich nach dem Analyse-Horizont, nicht mehr nach dem
  // Chart-Zeitraum: ein Klick auf 1M/6M tauscht die Nachrichtenliste nicht aus.
  const RANGE_TO_HORIZON = { '1T':'kurz','1W':'kurz','1M':'mittel','6M':'mittel','1J':'lang','5J':'lang' };
  const HZ = {
    kurz:   { windowDays: 7,   cache: 20 * 60 * 1000 },
    mittel: { windowDays: 60,  cache: 4 * 60 * 60 * 1000 },
    lang:   { windowDays: 180, cache: 12 * 60 * 60 * 1000 },
  };
  const horizon = HZ[req.query.horizon] ? req.query.horizon : (RANGE_TO_HORIZON[range] || 'kurz');
  const hz = HZ[horizon];

  const cacheKey = (symbol || asset || 'general') + '_' + horizon;
  const cacheDuration = hz.cache;

  if (assetCache[cacheKey] && (now - assetCache[cacheKey].time) < cacheDuration) {
    return res.status(200).json({ articles: assetCache[cacheKey].articles, cachedAt: new Date(assetCache[cacheKey].time).toISOString(), fromCache: true, range: range || '1T' });
  }

  const finnhubKey = process.env.FINNHUB_API_KEY;
  const toD = new Date();
  const fromD = new Date(toD.getTime() - hz.windowDays * 86400000);
  const from = fromD.toISOString().split('T')[0];
  const to = toD.toISOString().split('T')[0];

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
            // 30 statt 15: der Qualitaetsfilter siebt anschliessend stark aus
            // (bei Apple blieb von 15 nur 1 uebrig). Mehr Rohmaterial heisst
            // mehr echte Treffer, ohne die Huerden zu senken.
            .filter(a => a.headline && a.headline.length > 15 && a.url)
            .slice(0, 30)
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

    // ── SECONDARY: passende RSS-Feeds, auf das Asset gefiltert ─────────────
    // Krypto und Rohstoffe bekommen hier ihre eigentlichen Nachrichten: fuer
    // sie liefert Finnhub company-news nichts und Yahoos Symbol-Feed ist von
    // Vercel aus leer.
    const keywords = buildKeywords(symbol, asset);
    if (articles.length < 5) {
      const feedKeys = feedsForSymbol(symbol, asset);
      const feedArticles = await fetchFeeds(feedKeys);
      const seen = new Set(articles.map(a => a.title.slice(0, 50).toLowerCase()));
      const add = list => list.forEach(a => {
        const key = a.title.slice(0, 50).toLowerCase();
        if (!seen.has(key)) { seen.add(key); articles.push(a); }
      });
      add(feedArticles.filter(a => isAboutAsset(a, keywords)));

      // Greift der Stichwortfilter zu scharf, duerfen themenverwandte
      // Meldungen aus dem Fachfeed ergaenzen — aber nur solche, die die
      // Qualitaetshuerden ebenfalls nehmen. Lieber eine kurze Liste als
      // Fuellmaterial.
      if (articles.length < 2 && (feedKeys[0] === 'crypto' || feedKeys[0] === 'commodity')) {
        add(feedArticles.filter(a =>
          a.source === FEED_LABEL[feedKeys[0]] &&
          !isNoise(a) &&
          getImpactLevel(a.title + ' ' + (a.description || '')) === 'high'
        ));
      }
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

    // ── FILTER: drei Huerden, alle drei muessen genommen werden ────────────
    // 1. Kein Listicle/Meinungsstueck/Marktbericht (Sperrliste)
    // 2. Nur 'high' — also ein tatsaechlich kursbewegendes Ereignis
    // 3. Muss dieses Asset betreffen, auch bei Finnhub company-news: dort kam
    //    unter Apple eine Microsoft-Schlagzeile durch, weil die Relevanzpruefung
    //    frueher nur fuer RSS-Feeds galt.
    // Die Stichwortpflicht allein war zu eng: Nvidia bestand 0 von 30 Meldungen,
    // weil echte Unternehmensnachrichten ("Nvidia stellt neuen Chip vor") keines
    // der Makro-/Ereignis-Stichwoerter enthalten. Deshalb zwei gleichwertige
    // Wege ueber die Impact-Huerde:
    //   a) ein kursbewegendes Stichwort ODER
    //   b) das Asset steht in der UEBERSCHRIFT — dann ist die Meldung per se
    //      ueber dieses Papier und keine allgemeine Marktnotiz.
    // Die Sperrliste greift in beiden Faellen, sie ist die eigentliche
    // Qualitaetshuerde.
    const inTitle = a => {
      const t = (a.title || '').toLowerCase();
      return keywords.some(k => t.includes(k));
    };
    // Zaehlt mit, woran Meldungen scheitern — ohne diese Sicht laesst sich der
    // Filter nicht nachjustieren (Nvidia bestand 0 von 30, ohne erkennbaren Grund).
    const abgelehnt = { rauschen: 0, nicht_zum_asset: 0, kein_impact: 0 };
    const relevant = enriched.filter(a => {
      if (isNoise(a)) { abgelehnt.rauschen++; return false; }
      if (!isAboutAsset(a, keywords)) { abgelehnt.nicht_zum_asset++; return false; }
      if (a.impactLevel !== 'high' && !inTitle(a)) { abgelehnt.kein_impact++; return false; }
      return true;
    });

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
    const result = [...nonNeutral, ...neutral.slice(0, 2)];
    const fresh = result.length >= 2 ? result : relevant;

    // ── MERGE: Neues dazu, Veraltetes raus ─────────────────────────────────
    // Bereits bekannte Meldungen bleiben erhalten, solange sie im Zeitfenster
    // liegen. Ohne das verschwaende die Liste, sobald eine Quelle bei einem
    // einzelnen Abruf nichts liefert.
    const cutoff = now - hz.windowDays * 86400000;
    const prev = (assetCache[cacheKey] && assetCache[cacheKey].articles) || [];
    const mergedSeen = new Set();
    const merged = [];
    for (const a of [...fresh, ...prev]) {
      const key = a.title.slice(0, 50).toLowerCase();
      if (mergedSeen.has(key)) continue;
      const ts = new Date(a.publishedAt).getTime();
      if (isFinite(ts) && ts < cutoff) continue;   // veraltet
      mergedSeen.add(key);
      merged.push(a);
    }
    merged.sort((a, b) => {
      const ord = { high: 0, medium: 1, low: 2 };
      const d = (ord[a.impactLevel] || 2) - (ord[b.impactLevel] || 2);
      return d !== 0 ? d : new Date(b.publishedAt) - new Date(a.publishedAt);
    });
    const final = merged.slice(0, 7);

    // Leere Ergebnisse NICHT cachen — sonst wird ein einzelner Fehlschlag
    // stundenlang als "keine Nachrichten" ausgeliefert. Genau das liess
    // Bitcoin und Gold dauerhaft leer erscheinen.
    if (final.length > 0) assetCache[cacheKey] = { articles: final, time: now };

    return res.status(200).json({
      articles: final, cachedAt: new Date(now).toISOString(), fromCache: false,
      horizon, total: unique.length, abgelehnt, stichworte: keywords,
    });

  } catch(e) {
    if (assetCache[cacheKey]) {
      return res.status(200).json({ articles: assetCache[cacheKey].articles, cachedAt: new Date(assetCache[cacheKey].time).toISOString(), fromCache: true, stale: true });
    }
    return res.status(500).json({ error: e.message });
  }
};
