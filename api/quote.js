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

    // Fundamentaldaten aus Finnhub
    let fundamentals = {
      weekHigh52: meta.fiftyTwoWeekHigh || null,
      weekLow52: meta.fiftyTwoWeekLow || null,
      exchange: meta.exchangeName || null,
    };
    const finnhubKey = process.env.FINNHUB_API_KEY;
    if (finnhubKey) {
      try {
        // Finnhub basic financials
        const fhUrl = 'https://finnhub.io/api/v1/stock/metric?symbol=' + encodeURIComponent(symbol) + '&metric=all&token=' + finnhubKey;
        const fhBody = await fetchUrl(fhUrl);
        const fhJson = JSON.parse(fhBody);
        const m = fhJson?.metric || {};
        fundamentals = {
          weekHigh52: m['52WeekHigh'] || meta.fiftyTwoWeekHigh || null,
          weekLow52: m['52WeekLow'] || meta.fiftyTwoWeekLow || null,
          pe: m.peExclExtraTTM || m.peTTM || null,
          forwardPE: m.peNormalizedAnnual || null,
          pb: m.pbAnnual || null,
          ps: m.psAnnual || null,
          beta: m.beta || null,
          dividendYield: m.dividendYieldIndicatedAnnual ? Math.round(m.dividendYieldIndicatedAnnual * 100) / 100 : null,
          eps: m.epsBasicExclExtraItemsTTM || null,
          revenueGrowth: m.revenueGrowthTTMYoy ? Math.round(m.revenueGrowthTTMYoy * 100) / 100 : null,
          grossMargin: m.grossMarginTTM ? Math.round(m.grossMarginTTM) : null,
          netMargin: m.netProfitMarginTTM ? Math.round(m.netProfitMarginTTM) : null,
          roe: m.roeTTM ? Math.round(m.roeTTM) : null,
          exchange: meta.exchangeName || null,
        };
      } catch(e) {
        // Finnhub nicht verfügbar
      }
    }

    // Krypto-Fundamentaldaten
    if (meta.instrumentType === 'CRYPTOCURRENCY' || meta.exchangeName === 'CCC') {
      fundamentals.isCrypto = true;
      // 24h Volumen direkt aus Chart-Meta (immer verfügbar)
      if (meta.regularMarketVolume) fundamentals.volume24Hr = meta.regularMarketVolume;

      // Market Cap + Supply via CoinGecko /coins/markets (ein Aufruf, alles drin)
      const ticker = symbol.replace(/-[A-Z]{3,4}$/, '');
      const cgId = COINGECKO_IDS[ticker];
      if (cgId) {
        try {
          const cgUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${cgId}&per_page=1`;
          const cgBody = await fetchUrl(cgUrl);
          const cgJson = JSON.parse(cgBody);
          const c = Array.isArray(cgJson) ? cgJson[0] : null;
          if (c) {
            if (c.market_cap) fundamentals.marketCap = c.market_cap;
            if (c.circulating_supply) fundamentals.circulatingSupply = c.circulating_supply;
            if (c.max_supply) fundamentals.maxSupply = c.max_supply;
            if (c.total_volume) fundamentals.volume24Hr = c.total_volume;
            if (c.fully_diluted_valuation) fundamentals.fdv = c.fully_diluted_valuation;
          }
        } catch(e) {
          // CoinGecko nicht verfügbar — volume24Hr aus Chart-Meta bleibt
        }
      }

      if (fundamentals.maxSupply && price && !fundamentals.fdv) {
        fundamentals.fdv = Math.round(price * fundamentals.maxSupply);
      }
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
