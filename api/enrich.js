const https = require('https');

// ── CACHE ─────────────────────────────────────────────────────────────────
// Serverless: pro warmer Instanz gecacht. Bei Cold Start neu geladen.
const cache = {};
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 Stunden

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Finanzblick/1.0' },
      timeout: 5000
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error('parse')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

// Parallel mit individuellem Timeout — ein Fehler blockiert nicht die anderen
function fetchSafe(url, timeoutMs) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    fetchJSON(url)
      .then(d => { clearTimeout(timer); resolve(d); })
      .catch(() => { clearTimeout(timer); resolve(null); });
  });
}

// ── EARNINGS FORMATTER ────────────────────────────────────────────────────
function formatEarnings(data) {
  if (!data || !Array.isArray(data) || data.length === 0) return null;

  const quarters = data
    .filter(e => e.actual !== undefined && e.actual !== null)
    .slice(0, 4);

  if (quarters.length === 0) return null;

  const lines = quarters.map(e => {
    const actual = typeof e.actual === 'number' ? e.actual.toFixed(2) : '?';
    const est = typeof e.estimate === 'number' ? e.estimate.toFixed(2) : '?';
    const surprisePct = typeof e.surprisePercent === 'number' ? e.surprisePercent : null;

    let surpriseTag = '';
    if (surprisePct !== null) {
      const dir = surprisePct >= 0 ? '+' : '';
      const strength = Math.abs(surprisePct) >= 10 ? ' ★BEAT' : Math.abs(surprisePct) >= 5 ? ' BEAT' : surprisePct < -5 ? ' MISS' : '';
      surpriseTag = ` (${dir}${surprisePct.toFixed(1)}%${strength})`;
    }

    const period = e.period || `Q${e.quarter || '?'} ${e.year || ''}`;
    return `  ${period}: EPS $${actual} | Schätzung $${est}${surpriseTag}`;
  });

  const lastBeat = quarters[0]?.surprisePercent;
  const trend = quarters.length >= 2
    ? quarters.filter(e => (e.surprisePercent || 0) > 0).length + '/' + quarters.length + ' Quartale Beat'
    : null;

  return {
    lines,
    summary: trend,
    lastSurprisePct: lastBeat,
  };
}

// ── RECOMMENDATIONS FORMATTER ─────────────────────────────────────────────
function formatRecs(data) {
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  const r = data[0]; // aktuellster Monat
  const total = (r.strongBuy || 0) + (r.buy || 0) + (r.hold || 0) + (r.sell || 0) + (r.strongSell || 0);
  if (total === 0) return null;

  const bullish = (r.strongBuy || 0) + (r.buy || 0);
  const bearish = (r.sell || 0) + (r.strongSell || 0);
  const consensus = bullish / total >= 0.7 ? 'Starker Kauf' : bullish / total >= 0.5 ? 'Kauf' : bearish / total >= 0.4 ? 'Verkauf' : 'Halten';

  return {
    total,
    strongBuy: r.strongBuy || 0,
    buy: r.buy || 0,
    hold: r.hold || 0,
    sell: r.sell || 0,
    strongSell: r.strongSell || 0,
    consensus,
    bullishPct: Math.round((bullish / total) * 100),
  };
}

// ── PRICE TARGET FORMATTER ────────────────────────────────────────────────
function formatTargets(data) {
  if (!data || !data.targetMean) return null;
  return {
    mean: data.targetMean,
    high: data.targetHigh,
    low: data.targetLow,
    median: data.targetMedian,
  };
}

// ── BUILD AI CONTEXT STRING ───────────────────────────────────────────────
function buildContextString(earnings, recs, targets, currentPrice) {
  const parts = [];

  if (earnings) {
    parts.push('EARNINGS-HISTORY (EPS actual vs. Schätzung):');
    earnings.lines.forEach(l => parts.push(l));
    if (earnings.summary) parts.push('  Trend: ' + earnings.summary);
  }

  if (recs) {
    parts.push(`ANALYSTEN-KONSENS (${recs.total} Analysten): ${recs.consensus} — Strong Buy ${recs.strongBuy} | Buy ${recs.buy} | Hold ${recs.hold} | Sell ${recs.sell} | Strong Sell ${recs.strongSell} (${recs.bullishPct}% bullisch)`);
  }

  if (targets) {
    let updown = '';
    if (currentPrice && targets.mean) {
      const pct = ((targets.mean - currentPrice) / currentPrice * 100).toFixed(1);
      updown = ` (${pct > 0 ? '+' : ''}${pct}% zum Ø-Kursziel)`;
    }
    parts.push(`ANALYSTEN-KURSZIELE: Ø $${targets.mean}${updown} | Range $${targets.low}–$${targets.high}`);
  }

  return parts.length > 0 ? parts.join('\n') : '';
}

// ── CORE ENRICH FUNCTION (wiederverwendbar aus analyse.js) ────────────────
async function enrichSymbol(symbol, finnhubKey, currentPrice) {
  if (!symbol || !finnhubKey) return { context: '', raw: {} };

  // Nicht für Indizes, Krypto, Rohstoffe
  if (symbol.startsWith('^') || symbol.endsWith('-USD') || symbol.endsWith('=F') ||
      symbol.includes('.') && symbol.split('.').pop().length <= 2 && symbol.endsWith('.L')) {
    // Deutsche/europäische Aktien (z.B. VOW3.DE, SIE.DE) → trotzdem versuchen
    if (!symbol.endsWith('.DE') && !symbol.endsWith('.L') && !symbol.endsWith('.PA') && !symbol.endsWith('.MI')) {
      return { context: '', raw: {} };
    }
  }

  const cacheKey = symbol.toUpperCase();
  const now = Date.now();
  if (cache[cacheKey] && (now - cache[cacheKey].ts) < CACHE_TTL) {
    return cache[cacheKey].data;
  }

  const base = `https://finnhub.io/api/v1`;
  const [earningsRaw, recsRaw, targetsRaw] = await Promise.all([
    fetchSafe(`${base}/stock/earnings?symbol=${encodeURIComponent(symbol)}&limit=4&token=${finnhubKey}`, 4000),
    fetchSafe(`${base}/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${finnhubKey}`, 4000),
    fetchSafe(`${base}/stock/price-target?symbol=${encodeURIComponent(symbol)}&token=${finnhubKey}`, 4000),
  ]);

  const earnings = formatEarnings(earningsRaw);
  const recs = formatRecs(recsRaw);
  const targets = formatTargets(targetsRaw);
  const context = buildContextString(earnings, recs, targets, currentPrice);

  const result = { context, raw: { earnings, recs, targets } };
  cache[cacheKey] = { data: result, ts: now };
  return result;
}

// ── PUBLIC API HANDLER ────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { symbol, price } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol fehlt' });

  const finnhubKey = process.env.FINNHUB_API_KEY;
  if (!finnhubKey) return res.status(500).json({ error: 'Finnhub Key fehlt' });

  try {
    const currentPrice = price ? parseFloat(price) : null;
    const result = await enrichSymbol(symbol, finnhubKey, currentPrice);
    return res.status(200).json({
      symbol,
      ...result.raw,
      context: result.context,
      cachedAt: new Date().toISOString(),
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};

// Exportiere enrichSymbol für interne Nutzung aus analyse.js
module.exports.enrichSymbol = enrichSymbol;
