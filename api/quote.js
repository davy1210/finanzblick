const https = require(‘https’);

const CONFIGS = {
‘1T’: { range: ‘1d’,  interval: ‘5m’  },
‘1W’: { range: ‘5d’,  interval: ‘30m’ },
‘1M’: { range: ‘1mo’, interval: ‘1d’  },
‘6M’: { range: ‘6mo’, interval: ‘1d’  },
‘1J’: { range: ‘1y’,  interval: ‘1d’  },
‘5J’: { range: ‘5y’,  interval: ‘1wk’ },
};

function formatTime(timestamp, range) {
const d = new Date(timestamp * 1000);
if (range === ‘1T’) return d.toLocaleTimeString(‘de-DE’, { hour: ‘2-digit’, minute: ‘2-digit’ });
if (range === ‘1W’) return d.toLocaleDateString(‘de-DE’, { weekday: ‘short’ }) + ’ ’ + d.toLocaleTimeString(‘de-DE’, { hour: ‘2-digit’, minute: ‘2-digit’ });
if (range === ‘1M’ || range === ‘6M’) return d.toLocaleDateString(‘de-DE’, { day: ‘2-digit’, month: ‘short’ });
return d.toLocaleDateString(‘de-DE’, { month: ‘short’, year: ‘2-digit’ });
}

module.exports = async function handler(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);

if (req.method !== ‘GET’) {
return res.status(405).json({ error: ‘Method not allowed’ });
}

var symbol = req.query.symbol;
var range = req.query.range || ‘1T’;

if (!symbol) {
return res.status(400).json({ error: ‘Kein Symbol’ });
}

var cfg = CONFIGS[range] || CONFIGS[‘1T’];
var url = ‘https://query1.finance.yahoo.com/v8/finance/chart/’ + encodeURIComponent(symbol) + ‘?interval=’ + cfg.interval + ‘&range=’ + cfg.range + ‘&lang=de’;

try {
var raw = await new Promise(function(resolve, reject) {
var req2 = https.get(url, { headers: { ‘User-Agent’: ‘Mozilla/5.0’ } }, function(response) {
var data = ‘’;
response.on(‘data’, function(chunk) { data += chunk; });
response.on(‘end’, function() { resolve(data); });
});
req2.on(‘error’, reject);
req2.setTimeout(8000, function() { req2.destroy(); reject(new Error(‘timeout’)); });
});

```
var parsed = JSON.parse(raw);
var result = parsed && parsed.chart && parsed.chart.result && parsed.chart.result[0];

if (!result) {
  return res.status(404).json({ error: 'Asset nicht gefunden' });
}

var meta = result.meta;
var closes = result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close || [];
var timestamps = result.timestamp || [];

var chartPoints = [];
for (var i = 0; i < timestamps.length; i++) {
  if (closes[i] != null) {
    chartPoints.push({ time: timestamps[i], price: closes[i] });
  }
}

var currentPrice = meta.regularMarketPrice;
var prevClose = meta.previousClose || meta.chartPreviousClose;
var firstPrice = chartPoints.length > 0 ? chartPoints[0].price : prevClose;
var change = currentPrice - prevClose;
var changePct = prevClose ? (change / prevClose) * 100 : 0;
var rangeChange = currentPrice - firstPrice;
var rangeChangePct = firstPrice ? (rangeChange / firstPrice) * 100 : 0;

return res.status(200).json({
  symbol: meta.symbol,
  name: meta.shortName || meta.symbol,
  currency: meta.currency || 'USD',
  price: currentPrice,
  change: change,
  changePct: changePct,
  rangeChange: rangeChange,
  rangeChangePct: rangeChangePct,
  isPos: rangeChange >= 0,
  high: meta.regularMarketDayHigh,
  low: meta.regularMarketDayLow,
  volume: meta.regularMarketVolume,
  chartData: chartPoints.map(function(p) { return p.price; }),
  chartTimes: chartPoints.map(function(p) { return formatTime(p.time, range); }),
  exchange: meta.exchangeName || '',
  range: range,
});
```

} catch (e) {
return res.status(500).json({ error: ‘Fehler beim Laden’, details: e.message });
}
};
