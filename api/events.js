const https = require('https');

let eventsCache = null;
let cacheTime = null;
const CACHE_DURATION = 6 * 60 * 60 * 1000;

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Finanzblick/1.0' },
      timeout: 8000
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error('Parse error')); }
      });
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

function fmtDate(dateStr) {
  const d = new Date(dateStr);
  return {
    day: d.getDate().toString(),
    mon: d.toLocaleDateString('de-DE', { month: 'short' }),
  };
}

function getImpact(symbol) {
  const high = ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','NFLX','AMD','JPM','BAC','GS'];
  if (high.includes((symbol||'').toUpperCase())) return { label: 'Hoher Einfluss', cls: 'imp-high' };
  return { label: 'Mittlerer Einfluss', cls: 'imp-med' };
}

function getEconAssets(eventName) {
  const n = (eventName || '').toLowerCase();
  if (n.includes('fed') || n.includes('federal funds')) return ['S&P 500','Gold','Bitcoin','USD'];
  if (n.includes('cpi') || n.includes('inflation')) return ['S&P 500','Gold','Bitcoin','Anleihen'];
  if (n.includes('payroll') || n.includes('employment')) return ['S&P 500','DAX','Gold','USD'];
  if (n.includes('ecb')) return ['DAX','Euro','Europäische Aktien'];
  if (n.includes('gdp') || n.includes('growth')) return ['S&P 500','DAX'];
  if (n.includes('retail')) return ['S&P 500','Konsumaktien'];
  if (n.includes('producer') || n.includes('ppi')) return ['S&P 500','Anleihen'];
  return ['S&P 500','DAX'];
}

const PRIORITY_EVENTS = [
  { key: 'Federal Funds Rate', title: 'Fed Zinsentscheidung' },
  { key: 'CPI', title: 'US Inflationsdaten (CPI)' },
  { key: 'Non Farm Payroll', title: 'US Arbeitsmarktdaten (NFP)' },
  { key: 'ECB Rate', title: 'EZB Zinsentscheidung' },
  { key: 'GDP', title: 'US Wirtschaftswachstum (BIP)' },
  { key: 'Unemployment Rate', title: 'US Arbeitslosenquote' },
  { key: 'Producer Price', title: 'US Erzeugerpreise (PPI)' },
  { key: 'Retail Sales', title: 'US Einzelhandelsumsätze' },
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const finnhubKey = process.env.FINNHUB_API_KEY;
  if (!finnhubKey) return res.status(500).json({ error: 'Finnhub API Key fehlt' });

  const now = Date.now();
  if (eventsCache && cacheTime && (now - cacheTime) < CACHE_DURATION) {
    return res.status(200).json({ events: eventsCache, cachedAt: new Date(cacheTime).toISOString(), fromCache: true });
  }

  const today = new Date();
  const future = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
  const from = today.toISOString().split('T')[0];
  const to = future.toISOString().split('T')[0];

  try {
    const [earningsData, econData] = await Promise.all([
      fetchJSON(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${finnhubKey}`),
      fetchJSON(`https://finnhub.io/api/v1/calendar/economic?token=${finnhubKey}`)
    ]);

    const topSymbols = ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','NFLX','AMD','JPM','BAC','GS'];
    const topEarnings = (earningsData.earningsCalendar || [])
      .filter(e => topSymbols.includes(e.symbol))
      .slice(0, 4)
      .map(e => {
        const dt = fmtDate(e.date);
        const imp = getImpact(e.symbol);
        return {
          type: 'earnings',
          day: dt.day, mon: dt.mon, date: e.date,
          title: e.symbol + ' Quartalszahlen',
          extra: e.epsEstimate ? 'EPS-Schätzung: $' + e.epsEstimate : '',
          impact: imp.label, impCls: imp.cls,
          assets: [e.symbol]
        };
      });

    const seenTypes = new Set();
    const topEcon = (econData.economicCalendar || [])
      .filter(e => {
        const name = e.event || '';
        if (e.time < from || e.time > to) return false;
        const match = PRIORITY_EVENTS.find(p => name.includes(p.key));
        if (!match || seenTypes.has(match.key)) return false;
        seenTypes.add(match.key);
        return true;
      })
      .slice(0, 5)
      .map(e => {
        const dt = fmtDate(e.time);
        const title = (PRIORITY_EVENTS.find(p => (e.event||'').includes(p.key)) || { title: e.event }).title;
        return {
          type: 'economic',
          day: dt.day, mon: dt.mon, date: e.time,
          title: title,
          extra: '',
          impact: 'Hoher Einfluss', impCls: 'imp-high',
          assets: getEconAssets(e.event)
        };
      });

    const events = [...topEcon, ...topEarnings]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 8);

    eventsCache = events;
    cacheTime = now;

    return res.status(200).json({ events, cachedAt: new Date(now).toISOString(), fromCache: false });

  } catch(e) {
    if (eventsCache) {
      return res.status(200).json({ events: eventsCache, cachedAt: new Date(cacheTime).toISOString(), fromCache: true, stale: true });
    }
    return res.status(500).json({ error: e.message });
  }
};
