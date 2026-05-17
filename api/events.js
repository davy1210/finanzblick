const https = require('https');

// Cache für Events
let eventsCache = null;
let cacheTime = null;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 Stunden

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

// Datum formatieren
function fmtDate(ts) {
  const d = new Date(ts * 1000);
  return {
    day: d.getDate().toString(),
    mon: d.toLocaleDateString('de-DE', { month: 'short' }),
    full: d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
  };
}

// Wichtigkeit eines Earnings einschätzen
function getImpact(symbol) {
  const high = ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','NFLX','AMD','INTC','JPM','BAC','GS'];
  const sym = (symbol || '').toUpperCase();
  if (high.includes(sym)) return { label: 'Hoher Einfluss', cls: 'imp-high' };
  return { label: 'Mittlerer Einfluss', cls: 'imp-med' };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Finnhub API Key fehlt' });

  const now = Date.now();

  // Cache prüfen
  if (eventsCache && cacheTime && (now - cacheTime) < CACHE_DURATION) {
    return res.status(200).json({ events: eventsCache, cachedAt: new Date(cacheTime).toISOString(), fromCache: true });
  }

  // Datumsbereich: heute bis 60 Tage
  const today = new Date();
  const future = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
  const from = today.toISOString().split('T')[0];
  const to = future.toISOString().split('T')[0];

  try {
    // 1. Earnings Kalender von Finnhub
    const earningsUrl = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${apiKey}`;
    const earningsData = await fetchJSON(earningsUrl);

    // Top Earnings filtern (nur bekannte Symbole)
    const topSymbols = ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','NFLX','AMD','INTC','JPM','BAC','GS','V','WMT'];
    const earnings = (earningsData.earningsCalendar || [])
      .filter(e => topSymbols.includes(e.symbol))
      .slice(0, 5)
      .map(e => {
        const dt = fmtDate(new Date(e.date).getTime() / 1000);
        const impact = getImpact(e.symbol);
        return {
          type: 'earnings',
          day: dt.day,
          mon: dt.mon,
          date: e.date,
          title: `${e.symbol} Quartalszahlen`,
          desc: `${e.symbol} veröffentlicht Quartalsergebnisse. EPS-Schätzung: ${e.epsEstimate ? '$' + e.epsEstimate : 'ausstehend'}. Überraschungen bewegen oft den gesamten Sektor.`,
          impact: impact.label,
          impCls: impact.cls,
          assets: [e.symbol]
        };
      });

    // 2. Wirtschaftskalender von Finnhub
    const econUrl = `https://finnhub.io/api/v1/calendar/economic?token=${apiKey}`;
    const econData = await fetchJSON(econUrl);

    // Wichtige Wirtschaftstermine filtern
    const importantEvents = ['Federal Funds Rate','CPI','Non Farm Payroll','GDP','ECB Rate','Unemployment'];
    const econ = (econData.economicCalendar || [])
      .filter(e => {
        const name = e.event || '';
        return importantEvents.some(k => name.includes(k)) && e.time >= from && e.time <= to;
      })
      .slice(0, 5)
      .map(e => {
        const dt = fmtDate(new Date(e.time).getTime() / 1000);
        const isFed = e.event.includes('Federal Funds') || e.event.includes('Fed');
        const isCPI = e.event.includes('CPI') || e.event.includes('Inflation');
        const isNFP = e.event.includes('Non Farm') || e.event.includes('Payroll');
        const isECB = e.event.includes('ECB');

        let desc = 'Wichtiger Wirtschaftstermin der die Märkte bewegen kann.';
        let assets = ['S&P 500','DAX'];
        if (isFed) { desc = 'Die US-Notenbank entscheidet über Zinsen. Jede Formulierung von Fed-Chef Powell wird von den Märkten genau analysiert.'; assets = ['S&P 500','Gold','Bitcoin','USD']; }
        if (isCPI) { desc = 'US-Inflationsdaten. Fällt Inflation schneller als erwartet, steigen Zinssenkungshoffnungen. Zu hohe Inflation = Zinserhöhungsrisiko.'; assets = ['S&P 500','Gold','Bitcoin','Anleihen']; }
        if (isNFP) { desc = 'US-Arbeitsmarktdaten. Zu viele Jobs = Inflation = Zinserhöhung. Zu wenige = Konjunkturschwäche. Beide Extreme bewegen Märkte stark.'; assets = ['S&P 500','DAX','Gold','USD']; }
        if (isECB) { desc = 'EZB-Zinsentscheidung für Europa. Zinssenkung stützt Aktien. Zinserhöhung belastet Kredite und Märkte.'; assets = ['DAX','Euro','Europäische Aktien']; }

        return {
          type: 'economic',
          day: dt.day,
          mon: dt.mon,
          date: e.time,
          title: e.event,
          desc,
          impact: 'Hoher Einfluss',
          impCls: 'imp-high',
          assets
        };
      });

    // Kombinieren und nach Datum sortieren
    const allEvents = [...econ, ...earnings]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 10);

    eventsCache = allEvents;
    cacheTime = now;

    return res.status(200).json({
      events: allEvents,
      cachedAt: new Date(now).toISOString(),
      fromCache: false,
      total: allEvents.length
    });

  } catch(e) {
    // Fallback auf Cache falls vorhanden
    if (eventsCache) {
      return res.status(200).json({ events: eventsCache, cachedAt: new Date(cacheTime).toISOString(), fromCache: true, stale: true });
    }
    return res.status(500).json({ error: e.message });
  }
};
