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
        const eps = e.epsEstimate ? '$' + e.epsEstimate + ' pro Aktie' : 'noch nicht bekannt';
        return {
          type: 'earnings',
          day: dt.day,
          mon: dt.mon,
          date: e.date,
          title: `${e.symbol} Quartalszahlen`,
          what: `${e.symbol} veröffentlicht seinen Quartalsbericht — Einblick in Umsatz, Gewinn und Ausblick des Unternehmens.`,
          why: `Quartalszahlen zeigen ob ein Unternehmen wächst oder stagniert. Analysten-Erwartung für Gewinn pro Aktie: ${eps}.`,
          effect: `Besser als erwartet → Aktie steigt oft stark. Schlechter als erwartet → Aktie kann stark fallen. Überraschungen beim Ausblick wirken oft stärker als der aktuelle Gewinn.`,
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

        let what, why, effect, assets;

        if (isFed) {
          what = 'Die US-Notenbank (Fed) entscheidet ob Geldleihen teurer oder günstiger wird.';
          why = 'Zinsen sind der wichtigste Hebel der Weltwirtschaft. Höhere Zinsen bremsen Wachstum und Inflation — niedrigere Zinsen kurbeln sie an.';
          effect = 'Zinssenkung → Aktien steigen oft, Gold steigt, Dollar fällt. Zinserhöhung → Aktien fallen oft, Anleihen unter Druck.';
          assets = ['S&P 500','Gold','Bitcoin','USD'];
        } else if (isCPI) {
          what = 'Der Verbraucherpreisindex misst wie stark die Preise gestiegen sind — also wie hoch die Inflation ist.';
          why = 'Inflation bestimmt was die Notenbank als nächstes tut. Zu viel Inflation → Zinserhöhung. Zu wenig → Zinssenkung möglich.';
          effect = 'Inflation fällt → Hoffnung auf Zinssenkung → Aktien und Bitcoin steigen oft. Inflation steigt → Märkte fallen.';
          assets = ['S&P 500','Gold','Bitcoin','Anleihen'];
        } else if (isNFP) {
          what = 'Non-Farm Payrolls: wie viele neue Stellen außerhalb der Landwirtschaft in den USA geschaffen wurden.';
          why = 'Viele neue Jobs = Wirtschaft läuft gut, aber auch mehr Lohninflation → Fed erhöht Zinsen. Wenige Jobs = Konjunkturschwäche.';
          effect = 'Zu viele Jobs → Zinserhöhungsangst → Aktien fallen. Zu wenige → Rezessionsangst → Aktien fallen. Nur ein "goldener Mittelweg" ist gut.';
          assets = ['S&P 500','DAX','Gold','USD'];
        } else if (isECB) {
          what = 'Die Europäische Zentralbank entscheidet über Zinsen in der Eurozone — betrifft direkt Europa und den DAX.';
          why = 'EZB-Zinsen bestimmen wie teuer Kredite für europäische Unternehmen und Haushalte sind.';
          effect = 'Zinssenkung → gut für DAX und europäische Aktien. Zinserhöhung → Druck auf Aktien und Immobilien.';
          assets = ['DAX','Euro','Europäische Aktien'];
        } else {
          what = 'Wichtiger Wirtschaftstermin der Hinweise auf den Zustand der Wirtschaft gibt.';
          why = 'Wirtschaftsdaten beeinflussen die Erwartungen der Investoren und damit die Kurse.';
          effect = 'Besser als erwartet → Märkte steigen. Schlechter als erwartet → Märkte fallen.';
          assets = ['S&P 500','DAX'];
        }

        return {
          type: 'economic',
          day: dt.day,
          mon: dt.mon,
          date: e.time,
          title: e.event,
          what, why, effect,
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
