const https = require('https');

const COINGECKO_IDS = {
  'BTC':'bitcoin','ETH':'ethereum','BNB':'binancecoin','XRP':'ripple',
  'SOL':'solana','ADA':'cardano','DOGE':'dogecoin','TRX':'tron',
  'AVAX':'avalanche-2','LINK':'chainlink','DOT':'polkadot','UNI':'uniswap',
  'ATOM':'cosmos','LTC':'litecoin','SHIB':'shiba-inu','BCH':'bitcoin-cash',
  'XLM':'stellar','NEAR':'near','ARB':'arbitrum','OP':'optimism',
  'SUI':'sui','APT':'aptos','FIL':'filecoin','ICP':'internet-computer',
  'MATIC':'matic-network','POL':'matic-network','TON':'the-open-network',
  'HBAR':'hedera-hashgraph','VET':'vechain','ALGO':'algorand','XTZ':'tezos',
};

const CONFIGS = {
  '1T': { range: '1d',  interval: '5m'  },
  '1W': { range: '5d',  interval: '60m' },
  '1M': { range: '1mo', interval: '1d'  },
  '6M': { range: '6mo', interval: '1d'  },
  '1J': { range: '1y',  interval: '1d'  },
  '5J': { range: '5y',  interval: '1wk' },
};

function formatTime(ts, range) {
  const d = new Date(ts * 1000);
  if (range === '1T') return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (range === '1W') return d.toLocaleDateString('de-DE', { weekday: 'short' });
  if (range === '1M' || range === '6M') return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
  return d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
      timeout: 8000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const symbol = req.query.symbol || '';
  const range = req.query.range || '1T';
  if (!symbol) return res.status(400).json({ error: 'Kein Symbol' });

  const cfg = CONFIGS[range] || CONFIGS['1T'];

  try {
    // Chart + Kursdaten
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${cfg.interval}&range=${cfg.range}&includePrePost=false&lang=de`;
    const chartBody = await fetchUrl(chartUrl);
    const chartJson = JSON.parse(chartBody);
    const result = chartJson?.chart?.result?.[0];
    if (!result) return res.status(404).json({ error: 'Keine Daten' });

    const meta = result.meta || {};
    const closes = result.indicators?.quote?.[0]?.close || [];
    const timestamps = result.timestamp || [];

    const chartData = [], chartTimes = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null && !isNaN(closes[i])) {
        chartData.push(Math.round(closes[i] * 100) / 100);
        chartTimes.push(formatTime(timestamps[i], range));
      }
    }

    const price = meta.regularMarketPrice || 0;
    const prev = meta.previousClose || meta.chartPreviousClose || price;
    const first = chartData[0] || prev;
    const change = price - prev;
    const changePct = prev ? (change / prev) * 100 : 0;
    const rangeChange = price - first;
    const rangeChangePct = first ? (rangeChange / first) * 100 : 0;

    // ── FUNDAMENTALDATEN: Finnhub + Yahoo Finance quoteSummary parallel ────────
    const isCryptoMeta = meta.instrumentType === 'CRYPTOCURRENCY' || meta.exchangeName === 'CCC';
    const isIndexOrFuture = symbol.startsWith('^') || symbol.endsWith('=F');
    const finnhubKey = process.env.FINNHUB_API_KEY;

    let fundamentals = {
      weekHigh52: meta.fiftyTwoWeekHigh || null,
      weekLow52: meta.fiftyTwoWeekLow || null,
      exchange: meta.exchangeName || null,
    };

    // Parallel: Finnhub metrics + Yahoo quoteSummary (nicht für Krypto/Indizes/Futures)
    const fhUrl = finnhubKey && !isCryptoMeta
      ? `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${finnhubKey}`
      : null;
    const yhUrl = !isCryptoMeta && !isIndexOrFuture
      ? `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryProfile%2CdefaultKeyStatistics%2CfinancialData%2CsummaryDetail`
      : null;

    const [fhRaw, yhRaw] = await Promise.all([
      fhUrl ? fetchUrl(fhUrl).catch(() => null) : Promise.resolve(null),
      yhUrl ? fetchUrl(yhUrl).catch(() => null) : Promise.resolve(null),
    ]);

    // Finnhub verarbeiten (Priorität bei Metriken)
    if (fhRaw) {
      try {
        const m = JSON.parse(fhRaw)?.metric || {};
        Object.assign(fundamentals, {
          weekHigh52: m['52WeekHigh'] || fundamentals.weekHigh52,
          weekLow52:  m['52WeekLow']  || fundamentals.weekLow52,
          pe:            m.peExclExtraTTM || m.peTTM || null,
          forwardPE:     m.peNormalizedAnnual || null,
          pb:            m.pbAnnual || null,
          ps:            m.psAnnual || null,
          beta:          m.beta || null,
          dividendYield: m.dividendYieldIndicatedAnnual ? Math.round(m.dividendYieldIndicatedAnnual * 100) / 100 : null,
          eps:           m.epsBasicExclExtraItemsTTM || null,
          revenueGrowth: m.revenueGrowthTTMYoy ? Math.round(m.revenueGrowthTTMYoy * 10) / 10 : null,
          grossMargin:   m.grossMarginTTM   ? Math.round(m.grossMarginTTM)        : null,
          netMargin:     m.netProfitMarginTTM ? Math.round(m.netProfitMarginTTM)  : null,
          roe:           m.roeTTM           ? Math.round(m.roeTTM)               : null,
        });
      } catch(e) {}
    }

    // Yahoo quoteSummary verarbeiten (füllt Lücken + neue Felder)
    if (yhRaw) {
      try {
        const r = JSON.parse(yhRaw)?.quoteSummary?.result?.[0];
        if (r) {
          const sp = r.summaryProfile     || {};
          const ks = r.defaultKeyStatistics || {};
          const fd = r.financialData       || {};
          const sd = r.summaryDetail       || {};

          // Unternehmensprofil — Kern für die KI-Analyse
          const desc = sp.longBusinessSummary;
          if (desc && desc.length > 30) fundamentals.description = desc.slice(0, 600);
          if (sp.industry) fundamentals.industry  = sp.industry;
          if (sp.sector)   fundamentals.sector    = sp.sector;
          if (sp.country)  fundamentals.country   = sp.country;
          if (sp.fullTimeEmployees) fundamentals.employees = sp.fullTimeEmployees;

          // Marktkapitalisierung (kritisch — bisher nur für Krypto vorhanden)
          const mc = sd.marketCap?.raw;
          if (mc && mc > 0) fundamentals.marketCap = mc;

          // Bewertungskennzahlen (Yahoo als Fallback wenn Finnhub leer)
          const safe = (v, factor = 1, digits = 1) => {
            const n = typeof v === 'number' ? v : v?.raw;
            if (!n || !isFinite(n)) return null;
            return Math.round(n * factor * Math.pow(10, digits)) / Math.pow(10, digits);
          };
          if (!fundamentals.pe)           fundamentals.pe           = safe(sd.trailingPE);
          if (!fundamentals.forwardPE)    fundamentals.forwardPE    = safe(ks.forwardPE);
          if (!fundamentals.beta)         fundamentals.beta         = safe(sd.beta, 1, 2);
          if (!fundamentals.eps)          fundamentals.eps          = safe(ks.trailingEps, 1, 2);
          if (!fundamentals.pb)           fundamentals.pb           = safe(ks.priceToBook);
          if (!fundamentals.dividendYield && sd.dividendYield?.raw)
            fundamentals.dividendYield = Math.round(sd.dividendYield.raw * 100 * 100) / 100;

          // Wachstum & Rentabilität (Yahoo-exklusive oder Fallback)
          const rev = fd.totalRevenue?.raw;
          if (rev && rev > 0) fundamentals.revenue = rev;
          if (!fundamentals.revenueGrowth && fd.revenueGrowth?.raw)
            fundamentals.revenueGrowth = Math.round(fd.revenueGrowth.raw * 100 * 10) / 10;
          if (!fundamentals.grossMargin && fd.grossMargins?.raw)
            fundamentals.grossMargin = Math.round(fd.grossMargins.raw * 100);
          if (!fundamentals.netMargin && fd.profitMargins?.raw)
            fundamentals.netMargin = Math.round(fd.profitMargins.raw * 100);
          if (!fundamentals.roe && fd.returnOnEquity?.raw)
            fundamentals.roe = Math.round(fd.returnOnEquity.raw * 100);

          // Neue Kennzahlen (nur via Yahoo)
          if (fd.operatingMargins?.raw)
            fundamentals.operatingMargin = Math.round(fd.operatingMargins.raw * 100);
          if (fd.freeCashflow?.raw && isFinite(fd.freeCashflow.raw))
            fundamentals.freeCashflow = fd.freeCashflow.raw;
          if (fd.debtToEquity?.raw && isFinite(fd.debtToEquity.raw))
            fundamentals.debtToEquity = Math.round(fd.debtToEquity.raw * 10) / 10;
          if (fd.earningsGrowth?.raw && isFinite(fd.earningsGrowth.raw))
            fundamentals.earningsGrowth = Math.round(fd.earningsGrowth.raw * 100 * 10) / 10;
          if (ks.pegRatio?.raw && isFinite(ks.pegRatio.raw) && ks.pegRatio.raw > 0)
            fundamentals.pegRatio = Math.round(ks.pegRatio.raw * 100) / 100;
          if (ks.enterpriseValue?.raw && ks.enterpriseValue.raw > 0)
            fundamentals.enterpriseValue = ks.enterpriseValue.raw;
        }
      } catch(e) {}
    }

    // Krypto-Fundamentaldaten (CoinGecko, unverändert)
    if (isCryptoMeta) {
      fundamentals.isCrypto = true;
      if (meta.regularMarketVolume) fundamentals.volume24Hr = meta.regularMarketVolume;

      const ticker = symbol.replace(/-[A-Z]{3,4}$/, '');
      const cgId = COINGECKO_IDS[ticker];
      if (cgId) {
        try {
          const cgUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${cgId}&per_page=1`;
          const cgJson = JSON.parse(await fetchUrl(cgUrl));
          const c = Array.isArray(cgJson) ? cgJson[0] : null;
          if (c) {
            if (c.market_cap)              fundamentals.marketCap        = c.market_cap;
            if (c.circulating_supply)      fundamentals.circulatingSupply = c.circulating_supply;
            if (c.max_supply)              fundamentals.maxSupply        = c.max_supply;
            if (c.total_volume)            fundamentals.volume24Hr       = c.total_volume;
            if (c.fully_diluted_valuation) fundamentals.fdv              = c.fully_diluted_valuation;
          }
        } catch(e) {}
      }

      if (fundamentals.maxSupply && price && !fundamentals.fdv)
        fundamentals.fdv = Math.round(price * fundamentals.maxSupply);
    }

    return res.status(200).json({
      symbol: meta.symbol || symbol,
      name: meta.shortName || symbol,
      currency: meta.currency || 'USD',
      price, change, changePct, rangeChange, rangeChangePct,
      isPos: rangeChange >= 0,
      high: meta.regularMarketDayHigh || 0,
      low: meta.regularMarketDayLow || 0,
      volume: meta.regularMarketVolume || 0,
      chartData, chartTimes,
      exchange: meta.exchangeName || '',
      range,
      fundamentals,
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
