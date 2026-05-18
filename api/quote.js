const https = require('https');

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

    // Fundamentaldaten via v10 API
    let fundamentals = {};
    try {
      const fundUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,financialData,defaultKeyStatistics,assetProfile`;
      const fundBody = await fetchUrl(fundUrl);
      const fundJson = JSON.parse(fundBody);
      const s = fundJson?.quoteSummary?.result?.[0] || {};
      const sd = s.summaryDetail || {};
      const fd = s.financialData || {};
      const ks = s.defaultKeyStatistics || {};
      const ap = s.assetProfile || {};

      fundamentals = {
        // Bewertung
        pe: sd.trailingPE?.raw || ks.trailingPE?.raw || null,
        forwardPE: sd.forwardPE?.raw || null,
        pb: ks.priceToBook?.raw || null,
        ps: ks.priceToSalesTrailing12Months?.raw || null,
        // Profitabilität
        ebitda: fd.ebitda?.raw || null,
        grossMargin: fd.grossMargins?.raw ? Math.round(fd.grossMargins.raw * 100) : null,
        operatingMargin: fd.operatingMargins?.raw ? Math.round(fd.operatingMargins.raw * 100) : null,
        profitMargin: fd.profitMargins?.raw ? Math.round(fd.profitMargins.raw * 100) : null,
        // Wachstum
        revenueGrowth: fd.revenueGrowth?.raw ? Math.round(fd.revenueGrowth.raw * 100) : null,
        earningsGrowth: fd.earningsGrowth?.raw ? Math.round(fd.earningsGrowth.raw * 100) : null,
        // Dividende
        dividendYield: sd.dividendYield?.raw ? Math.round(sd.dividendYield.raw * 100 * 100) / 100 : null,
        // Markt
        beta: ks.beta?.raw || null,
        weekHigh52: sd.fiftyTwoWeekHigh?.raw || null,
        weekLow52: sd.fiftyTwoWeekLow?.raw || null,
        marketCap: sd.marketCap?.raw || null,
        // Empfehlung
        recommendation: fd.recommendationKey || null,
        targetPrice: fd.targetMeanPrice?.raw || null,
        // Sektor
        sector: ap.sector || null,
        industry: ap.industry || null,
      };
    } catch(e) {
      // Fundamentals optional — kein Fehler
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
