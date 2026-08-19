const https = require('https');

// ── CACHE ─────────────────────────────────────────────────────────────────
let marketNewsCache = null;
let cacheTime = null;
const CACHE_DURATION = 25 * 60 * 1000; // 25 Minuten

// ── CATEGORY DETECTION ────────────────────────────────────────────────────
const CATEGORIES = [
  {
    id: 'ipo',
    label: 'IPO / Börsengang',
    color: '#7C3AED',
    bg: '#F5F3FF',
    patterns: [/\bipo\b/i, /börsengang/i, /going public/i, /direct listing/i, /spac\b/i, /pre-ipo/i, /initial public/i, /listing/i],
  },
  {
    id: 'zentralbank',
    label: 'Zentralbank',
    color: '#0369A1',
    bg: '#E0F2FE',
    patterns: [/\bfed\b/i, /federal reserve/i, /fomc/i, /\becb\b/i, /european central bank/i, /zinsentscheid/i, /rate decision/i, /rate cut/i, /rate hike/i, /powell/i, /lagarde/i, /boj\b/i, /bank of japan/i, /monetary policy/i, /leitzins/i, /zinssenkung/i, /zinserhöhung/i, /interest rate/i],
  },
  {
    id: 'regulierung',
    label: 'Regulierung',
    color: '#B45309',
    bg: '#FEF3C7',
    patterns: [/\bsec\b/i, /\bcftc\b/i, /\bdoj\b/i, /antitrust/i, /regulat/i, /regulation/i, /\bban\b/i, /lawsuit/i, /fine\b/i, /penalty/i, /compliance/i, /eu digital/i, /dma\b/i, /dsa\b/i, /verbot\b/i, /regulierung/i, /klage\b/i, /strafe\b/i, /genehmigung/i, /approved\b/i, /approval/i, /etf approval/i],
  },
  {
    id: 'geopolitik',
    label: 'Geopolitik',
    color: '#DC2626',
    bg: '#FEF2F2',
    patterns: [/\bwar\b/i, /tariff/i, /\bzoll\b/i, /trade war/i, /sanction/i, /sanktionen/i, /geopolit/i, /nato/i, /ukraine/i, /china.us\b/i, /us.china/i, /export control/i, /exportkontroll/i, /trump/i, /election/i, /wahl\b/i, /conflict/i, /konflik/i, /taiwan/i, /middle east/i, /nahost/i],
  },
  {
    id: 'krypto',
    label: 'Krypto',
    color: '#F59E0B',
    bg: '#FFFBEB',
    patterns: [/bitcoin/i, /ethereum/i, /crypto/i, /blockchain/i, /defi/i, /nft\b/i, /stablecoin/i, /binance/i, /coinbase/i, /btc\b/i, /\beth\b/i, /solana/i, /tokeniz/i, /kryptowähr/i, /digital asset/i, /web3\b/i],
  },
  {
    id: 'ma',
    label: 'M&A',
    color: '#059669',
    bg: '#ECFDF5',
    patterns: [/merger/i, /acquisition/i, /acquired/i, /acquires/i, /takeover/i, /übernahme/i, /fusion/i, /deal\b/i, /buyout/i, /\bm&a\b/i, /acquired by/i, /to buy\b/i, /to acquire/i],
  },
  {
    id: 'ki',
    label: 'Künstliche Intelligenz',
    color: '#2563EB',
    bg: '#EFF6FF',
    patterns: [/artificial intelligence/i, /\bai\b/i, /\bkünstliche intelligenz\b/i, /machine learning/i, /large language model/i, /\bllm\b/i, /chatgpt/i, /openai/i, /gemini/i, /claude\b/i, /nvidia gpu/i, /ai chip/i, /data center/i, /generative ai/i, /\bgpt\b/i],
  },
  {
    id: 'makro',
    label: 'Makro',
    color: '#64748B',
    bg: '#F1F5F9',
    patterns: [/gdp\b/i, /inflation/i, /\bcpi\b/i, /\bppi\b/i, /unemployment/i, /payroll/i, /retail sales/i, /consumer confidence/i, /recession/i, /rezession/i, /konjunktur/i, /wirtschaftswachstum/i, /arbeitsmarkt/i, /\bpmi\b/i],
  },
  {
    id: 'earnings',
    label: 'Quartalszahlen',
    color: '#7C3AED',
    bg: '#F5F3FF',
    patterns: [/earnings/i, /quartalszahl/i, /\beps\b/i, /revenue beat/i, /revenue miss/i, /quarterly results/i, /q[1-4] \d{4}/i, /profit\b/i, /results\b/i, /guidance/i, /forecast\b/i],
  },
];

function detectCategory(text) {
  const combined = text.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.patterns.some(p => p.test(combined))) return cat;
  }
  return { id: 'markt', label: 'Markt', color: '#64748B', bg: '#F1F5F9' };
}

// ── AFFECTED ASSETS DETECTION ─────────────────────────────────────────────
const ASSET_PATTERNS = [
  { symbol: 'BTC', label: 'Bitcoin', pattern: /bitcoin|btc\b/i },
  { symbol: 'ETH', label: 'Ethereum', pattern: /ethereum|\beth\b/i },
  { symbol: 'NVDA', label: 'Nvidia', pattern: /nvidia/i },
  { symbol: 'AAPL', label: 'Apple', pattern: /\bapple\b/i },
  { symbol: 'MSFT', label: 'Microsoft', pattern: /microsoft/i },
  { symbol: 'GOOGL', label: 'Alphabet', pattern: /\bgoogle\b|alphabet/i },
  { symbol: 'AMZN', label: 'Amazon', pattern: /\bamazon\b/i },
  { symbol: 'META', label: 'Meta', pattern: /\bmeta\b|facebook/i },
  { symbol: 'TSLA', label: 'Tesla', pattern: /\btesla\b/i },
  { symbol: 'JPM', label: 'JPMorgan', pattern: /jpmorgan|j\.p\. morgan/i },
  { symbol: 'COIN', label: 'Coinbase', pattern: /coinbase/i },
  { symbol: '^GSPC', label: 'S&P 500', pattern: /s&p 500|s&p500|wall street|us stocks/i },
  { symbol: '^GDAXI', label: 'DAX', pattern: /\bdax\b|german stocks|frankfurt/i },
  { symbol: 'GC=F', label: 'Gold', pattern: /\bgold\b|precious metal/i },
  { symbol: 'USD', label: 'US-Dollar', pattern: /\busd\b|dollar\b|dxy/i },
];

function detectAffectedAssets(text) {
  const found = [];
  for (const a of ASSET_PATTERNS) {
    if (a.pattern.test(text) && found.length < 4) {
      found.push({ symbol: a.symbol, label: a.label });
    }
  }

  // Fallback based on category
  if (found.length === 0) {
    if (/fed|fomc|federal reserve/i.test(text)) return [{ symbol: '^GSPC', label: 'S&P 500' }, { symbol: 'GC=F', label: 'Gold' }, { symbol: 'USD', label: 'US-Dollar' }];
    if (/ecb|european central|ezb/i.test(text)) return [{ symbol: '^GDAXI', label: 'DAX' }, { symbol: 'USD', label: 'Euro/USD' }];
    if (/crypto|krypto|blockchain/i.test(text)) return [{ symbol: 'BTC', label: 'Bitcoin' }, { symbol: 'ETH', label: 'Ethereum' }];
    return [{ symbol: '^GSPC', label: 'S&P 500' }];
  }
  return found;
}

// ── FETCH HELPERS ─────────────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Finanzblick/1.0' },
      timeout: 8000
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { reject(new Error('parse')); } });
    });
    req.on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

function fetchSafe(url, ms) {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve([]), ms);
    fetchJSON(url).then(d => { clearTimeout(t); resolve(d); }).catch(() => { clearTimeout(t); resolve([]); });
  });
}

// ── AI BATCH EXPLANATION ──────────────────────────────────────────────────
function callGroqBatch(articles, apiKey) {
  const headlines = articles.map((a, i) => `${i+1}. "${a.headline}" — ${a.summary || ''}`).join('\n');

  const body = JSON.stringify({
    model: 'openai/gpt-oss-120b',
    max_tokens: 800,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content: `Du bist Finanzblick-Marktexperte. Erkläre für jeden News-Artikel in maximal 1 Satz (45 Wörter), WARUM diese Nachricht für Anleger wichtig ist — konkret und kausal, keine Wiederholung des Titels.
SPRACHE: Jeder "context"-Wert AUSSCHLIESSLICH auf Deutsch, niemals Englisch — die Artikel sind meist englisch, deine Erklärung ist es nie.
Antworte als reines JSON-Array: [{"idx":1,"context":"..."},{"idx":2,"context":"..."},...]
Kein Markdown, keine Erklärungen außerhalb des JSON.`
      },
      {
        role: 'user',
        content: `Erkläre diese Marktnachrichten für Privatanleger (je 1 Satz, konkret, kausal):\n${headlines}`
      }
    ]
  });

  return new Promise((resolve) => {
    const r = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 12000
    }, resp => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => {
        try {
          const p = JSON.parse(d);
          let text = p.choices?.[0]?.message?.content || '[]';
          text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
          const match = text.match(/\[[\s\S]*\]/);
          if (!match) return resolve({});
          const parsed = JSON.parse(match[0]);
          const map = {};
          parsed.forEach(item => { if (item.idx) map[item.idx] = item.context || ''; });
          resolve(map);
        } catch(e) { resolve({}); }
      });
    });
    r.on('error', () => resolve({}));
    r.setTimeout(12000, function() { this.destroy(); resolve({}); });
    r.write(body); r.end();
  });
}

// ── SCORE FOR RELEVANCE ───────────────────────────────────────────────────
const HIGH_IMPORTANCE = [
  /fed\b|fomc|federal reserve/i, /ecb\b|european central bank/i, /rate (cut|hike|decision)/i,
  /\bipo\b|initial public/i, /merger|acquisition|acquired/i, /tariff|trade war|sanction/i,
  /inflation|cpi\b|recession|gdp\b/i, /bitcoin.*etf|etf.*approval/i, /earnings beat|earnings miss/i,
  /breakthrough|revolutionary|historic/i, /bankruptcy|default\b/i, /nuclear|war\b|military/i,
];

function importanceScore(text) {
  let score = 0;
  HIGH_IMPORTANCE.forEach(p => { if (p.test(text)) score += 2; });
  if (/billion|trillion|milliarden/i.test(text)) score += 1;
  if (/\b(nvidia|apple|microsoft|google|amazon|tesla|meta|bitcoin)\b/i.test(text)) score += 1;
  return score;
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const now = Date.now();
  if (marketNewsCache && cacheTime && (now - cacheTime) < CACHE_DURATION) {
    return res.status(200).json({ articles: marketNewsCache, cachedAt: new Date(cacheTime).toISOString(), fromCache: true });
  }

  const finnhubKey = process.env.FINNHUB_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  if (!finnhubKey) return res.status(500).json({ error: 'Finnhub Key fehlt' });

  try {
    // Parallel: 3 Finnhub news categories
    const [generalRaw, mergerRaw, cryptoRaw] = await Promise.all([
      fetchSafe(`https://finnhub.io/api/v1/news?category=general&minId=0&token=${finnhubKey}`, 7000),
      fetchSafe(`https://finnhub.io/api/v1/news?category=merger&minId=0&token=${finnhubKey}`, 7000),
      fetchSafe(`https://finnhub.io/api/v1/news?category=crypto&minId=0&token=${finnhubKey}`, 7000),
    ]);

    // Kombinieren — merger und crypto immer bis zu 3 aufnehmen
    const seen = new Set();
    const allRaw = [
      ...(Array.isArray(generalRaw) ? generalRaw : []),
      ...(Array.isArray(mergerRaw) ? mergerRaw : []).slice(0, 5),
      ...(Array.isArray(cryptoRaw) ? cryptoRaw : []).slice(0, 5),
    ].filter(a => {
      if (!a.headline || a.headline.length < 15 || !a.url) return false;
      const key = a.headline.slice(0, 60).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Score und sortieren
    const scored = allRaw.map(a => ({
      ...a,
      score: importanceScore(a.headline + ' ' + (a.summary || '')),
    })).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.datetime || 0) - (a.datetime || 0);
    });

    // Top 8 für Anzeige, Top 5 für KI-Erklärung
    const top8 = scored.slice(0, 8);
    const top5 = top8.slice(0, 5);

    // AI-Erklärungen für Top 5
    let aiContextMap = {};
    if (groqKey && top5.length > 0) {
      aiContextMap = await callGroqBatch(top5, groqKey);
    }

    // Finales Format
    const articles = top8.map((a, i) => {
      const text = a.headline + ' ' + (a.summary || '');
      const cat = detectCategory(text);
      const assets = detectAffectedAssets(text);
      const aiCtx = aiContextMap[i + 1] || '';
      return {
        id: a.id || i,
        headline: a.headline,
        summary: (a.summary || '').slice(0, 200),
        source: a.source || 'Finnhub',
        url: a.url,
        publishedAt: a.datetime ? new Date(a.datetime * 1000).toISOString() : new Date().toISOString(),
        category: { id: cat.id, label: cat.label, color: cat.color, bg: cat.bg },
        affectedAssets: assets,
        context: aiCtx, // KI-Erklärung: warum wichtig für Anleger
        score: a.score,
      };
    });

    marketNewsCache = articles;
    cacheTime = now;

    return res.status(200).json({ articles, cachedAt: new Date(now).toISOString(), fromCache: false });

  } catch(e) {
    if (marketNewsCache) {
      return res.status(200).json({ articles: marketNewsCache, cachedAt: new Date(cacheTime).toISOString(), fromCache: true, stale: true });
    }
    return res.status(500).json({ error: e.message });
  }
};
