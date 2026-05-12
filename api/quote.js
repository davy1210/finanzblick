const https = require(‘https’);

module.exports = async function handler(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
if (req.method !== ‘GET’) return res.status(405).end();

const { symbol, range, interval } = req.query;
if (!symbol) return res.status(400).json({ error: ‘Kein Symbol’ });

// Zeitraum-Konfiguration
const configs = {
‘1T’: { range: ‘1d’,  interval: ‘5m’  },  // ~78 Punkte
‘1W’: { range: ‘5d’,  interval: ‘30m’ },  // ~80 Punkte
‘1M’: { range: ‘1mo’, interval: ‘1d’  },  // ~22 Punkte
‘6M’: { range: ‘6mo’, interval: ‘1d’  },  // ~126 Punkte
‘1J’: { range: ‘1y’,  interval: ‘1d’  },  // ~252 Punkte
‘5J’: { range: ‘5y’,  interval: ‘1wk’ },  // ~260 Punkte
};

const cfg = configs[range] || configs[‘1T’];

try {
const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${cfg.interval}&range=${cfg.range}&lang=de`;
const response = await new Promise((resolve, reject) => {
https.get(url, { headers: { ‘User-Agent’: ‘Mozilla/5.0’ } }, res => {
let raw = ‘’;
res.on(‘data’, chunk => raw += chunk);
res.on(‘end’, () => { try { resolve(JSON.parse(raw)); } catch(e) { reject(e); } });
}).on(‘error’, reject);
});

```
const result = response?.chart?.result?.[0];
if (!result) return res.status(404).json({ error: 'Asset nicht gefunden' });

const meta = result.meta;
const closes = result.indicators?.quote?.[0]?.close || [];
const timestamps = result.timestamp || [];

const chartPoints = timestamps
  .map((t, i) => ({ time: t, price: closes[i] }))
  .filter(p => p.price != null);

const currentPrice = meta.regularMarketPrice;
const prevClose = meta.previousClose || meta.chartPreviousClose;
const firstPrice = chartPoints[0]?.price || prevClose;
const change = currentPrice - prevClose;
const changePct = (change / prevClose) * 100;
const rangeChange = currentPrice - firstPrice;
const rangeChangePct = (rangeChange / firstPrice) * 100;

res.status(200).json({
  symbol: meta.symbol,
  name: meta.shortName || meta.symbol,
  currency: meta.currency || 'USD',
  price: currentPrice,
  change,
  changePct,
  rangeChange,
  rangeChangePct,
  isPos: rangeChange >= 0,
  high: meta.regularMarketDayHigh,
  low: meta.regularMarketDayLow,
  volume: meta.regularMarketVolume,
  chartData: chartPoints.map(p => p.price),
  chartTimes: chartPoints.map(p => {
    const d = new Date(p.time * 1000);
    if(range === '1T') return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if(range === '1W') return d.toLocaleDateString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    if(range === '1M' || range === '6M') return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
    return d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
  }),
  exchange: meta.exchangeName || '',
  range: range || '1T',
});
```

} catch(e) {
res.status(500).json({ error: ‘Fehler beim Laden’, details: e.message });
}
};
