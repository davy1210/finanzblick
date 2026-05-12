const https = require(‘https’);

const CONFIGS = {
‘1T’: { range: ‘1d’,  interval: ‘5m’  },
‘1W’: { range: ‘5d’,  interval: ‘60m’ },
‘1M’: { range: ‘1mo’, interval: ‘1d’  },
‘6M’: { range: ‘6mo’, interval: ‘1d’  },
‘1J’: { range: ‘1y’,  interval: ‘1d’  },
‘5J’: { range: ‘5y’,  interval: ‘1wk’ },
};

function formatTime(ts, range) {
var d = new Date(ts * 1000);
if (range === ‘1T’) return d.toLocaleTimeString(‘de-DE’, { hour: ‘2-digit’, minute: ‘2-digit’ });
if (range === ‘1W’) return d.toLocaleDateString(‘de-DE’, { weekday: ‘short’ });
if (range === ‘1M’) return d.toLocaleDateString(‘de-DE’, { day: ‘2-digit’, month: ‘short’ });
if (range === ‘6M’) return d.toLocaleDateString(‘de-DE’, { day: ‘2-digit’, month: ‘short’ });
return d.toLocaleDateString(‘de-DE’, { month: ‘short’, year: ‘2-digit’ });
}

module.exports = async function handler(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
if (req.method !== ‘GET’) return res.status(405).end();

var symbol = req.query.symbol || ‘’;
var range = req.query.range || ‘1T’;
if (!symbol) return res.status(400).json({ error: ‘Kein Symbol’ });

var cfg = CONFIGS[range] || CONFIGS[‘1T’];
var url = ‘https://query1.finance.yahoo.com/v8/finance/chart/’ +
encodeURIComponent(symbol) +
‘?interval=’ + cfg.interval + ‘&range=’ + cfg.range +
‘&includePrePost=false&lang=de’;

try {
var body = await new Promise(function(resolve, reject) {
var r = https.get(url, {
headers: { ‘User-Agent’: ‘Mozilla/5.0’, ‘Accept’: ‘*/*’ },
timeout: 8000
}, function(resp) {
var d = ‘’;
resp.on(‘data’, function(c) { d += c; });
resp.on(‘end’, function() { resolve(d); });
});
r.on(‘error’, reject);
r.on(‘timeout’, function() { r.destroy(); reject(new Error(‘timeout’)); });
});

```
var json = JSON.parse(body);
var result = json.chart && json.chart.result && json.chart.result[0];
if (!result) return res.status(404).json({ error: 'Keine Daten' });

var meta = result.meta || {};
var closes = (result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close) || [];
var timestamps = result.timestamp || [];

var chartData = [], chartTimes = [];
for (var i = 0; i < timestamps.length; i++) {
  if (closes[i] != null && !isNaN(closes[i])) {
    chartData.push(Math.round(closes[i] * 100) / 100);
    chartTimes.push(formatTime(timestamps[i], range));
  }
}

var price = meta.regularMarketPrice || 0;
var prev = meta.previousClose || meta.chartPreviousClose || price;
var first = chartData[0] || prev;
var change = price - prev;
var changePct = prev ? (change / prev) * 100 : 0;
var rangeChange = price - first;
var rangeChangePct = first ? (rangeChange / first) * 100 : 0;

res.status(200).json({
  symbol: meta.symbol || symbol,
  name: meta.shortName || symbol,
  currency: meta.currency || 'USD',
  price: price,
  change: change,
  changePct: changePct,
  rangeChange: rangeChange,
  rangeChangePct: rangeChangePct,
  isPos: rangeChange >= 0,
  high: meta.regularMarketDayHigh || 0,
  low: meta.regularMarketDayLow || 0,
  volume: meta.regularMarketVolume || 0,
  chartData: chartData,
  chartTimes: chartTimes,
  exchange: meta.exchangeName || '',
  range: range,
});
```

} catch(e) {
res.status(500).json({ error: e.message });
}
};
