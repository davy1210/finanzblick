const https = require('https');

let eventsCache = null;
let cacheTime = null;
const CACHE_DURATION = 4 * 60 * 60 * 1000;

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

// Alle wichtigen Symbole — breit abdecken
// ── WIRTSCHAFTSTERMINE AUS FRED ───────────────────────────────────────────
// Schluessel sind die exakten Release-Namen von FRED. Bewusst eng gehalten:
// FRED veroeffentlicht rund 96 Reihen in 45 Tagen, davon bewegen nur diese
// hier tatsaechlich Kurse. Der Rest ist Statistik ("Commercial Paper",
// "Economic Policy Uncertainty") und wuerde die Seite nur zumuellen.
const FRED_EVENTS = {
  'FOMC Press Release': {
    title: 'Fed-Zinsentscheid', high: true,
    context: 'Die US-Notenbank verkuendet ihren Leitzins. Hoehere Zinsen verteuern Kredite und druecken meist Aktien und Gold, niedrigere wirken umgekehrt.',
    assets: ['S&P 500', 'Nasdaq', 'Gold', 'USD'],
  },
  'Consumer Price Index': {
    title: 'US-Verbraucherpreise (CPI)', high: true,
    context: 'Wichtigste Inflationszahl der USA. Faellt sie hoeher aus als erwartet, sinkt die Hoffnung auf Zinssenkungen — das belastet Aktien und Anleihen.',
    assets: ['S&P 500', 'Anleihen', 'Gold', 'USD'],
  },
  'Employment Situation': {
    title: 'US-Arbeitsmarktbericht', high: true,
    context: 'Neue Stellen und Arbeitslosenquote. Ein starker Arbeitsmarkt spricht fuer hoehere Zinsen, ein schwacher fuer Zinssenkungen.',
    assets: ['S&P 500', 'USD', 'Anleihen'],
  },
  'Personal Income and Outlays': {
    title: 'US-Konsumausgaben & PCE-Inflation', high: true,
    context: 'Enthaelt die PCE-Rate — das bevorzugte Inflationsmass der Fed. Wichtiger fuer Zinsentscheidungen als der CPI.',
    assets: ['S&P 500', 'Anleihen', 'USD'],
  },
  'Gross Domestic Product': {
    title: 'US-Bruttoinlandsprodukt', high: true,
    context: 'Misst das Wirtschaftswachstum. Deutliche Abweichungen von der Erwartung verschieben die Zinserwartungen und damit den gesamten Markt.',
    assets: ['S&P 500', 'USD', 'Anleihen'],
  },
  'Harmonized Indices of Consumer Prices (HICP)': {
    title: 'Euroraum-Inflation (HVPI)', high: true,
    context: 'Die Inflationszahl, an der sich die EZB orientiert. Bestimmt massgeblich den Zinspfad im Euroraum.',
    assets: ['DAX', 'EUR', 'Euro-Anleihen'],
  },
  'Producer Price Index': {
    title: 'US-Erzeugerpreise (PPI)', high: false,
    context: 'Preise auf Herstellerebene — gilt als Fruehindikator fuer die Verbraucherinflation der kommenden Monate.',
    assets: ['S&P 500', 'Anleihen'],
  },
  'Advance Monthly Sales for Retail and Food Services': {
    title: 'US-Einzelhandelsumsaetze', high: false,
    context: 'Der Konsum traegt rund zwei Drittel der US-Wirtschaft. Schwache Zahlen naehren Rezessionssorgen.',
    assets: ['S&P 500', 'Konsumwerte'],
  },
  'Job Openings and Labor Turnover Survey': {
    title: 'US-Stellenangebote (JOLTS)', high: false,
    context: 'Zahl der offenen Stellen. Sinkt sie deutlich, kuehlt der Arbeitsmarkt ab — ein Argument fuer Zinssenkungen.',
    assets: ['S&P 500', 'USD'],
  },
  'G.17 Industrial Production and Capacity Utilization': {
    title: 'US-Industrieproduktion', high: false,
    context: 'Zeigt die Auslastung der Industrie. Relevant vor allem fuer Rohstoffe und Industriewerte.',
    assets: ['Industriewerte', 'Kupfer', 'Öl'],
  },
};

const HIGH_IMPACT_SYMBOLS = [
  'AAPL','MSFT','NVDA','GOOGL','GOOG','AMZN','META','TSLA','NFLX','AMD',
  'JPM','BAC','GS','MS','WFC','V','MA',
  'AVGO','QCOM','INTC','ARM','TSM',
  'ORCL','ADBE','CRM','SAP',
  'BABA','JD','PDD',
  'BRK.B','XOM','CVX','PFE','LLY','UNH',
  'SHOP','COIN','MSTR','PLTR',
  'RKLB','SPCE', // Raumfahrt
  'VW','BMW','MBG','SAP','SIE', // Europäische
];

function getImpact(symbol) {
  const mega = ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','JPM'];
  const high = ['NFLX','AMD','GS','V','MA','AVGO','QCOM','ORCL','ADBE','ARM'];
  const s = (symbol || '').toUpperCase();
  if (mega.includes(s)) return { label: 'Marktbewegend', cls: 'imp-high' };
  if (high.includes(s)) return { label: 'Hoher Einfluss', cls: 'imp-high' };
  return { label: 'Mittlerer Einfluss', cls: 'imp-med' };
}

// Erklärt warum ein Quartalszahlen-Termin wichtig ist
function getEarningsContext(symbol) {
  const ctx = {
    'NVDA': 'Nvidia liefert ~80% aller KI-Trainingschips. Quartalszahlen zeigen ob der KI-Investitionsboom anhält — entscheidend für den gesamten Tech-Sektor.',
    'AAPL': 'Apple ist das wertvollste Unternehmen der Welt. iPhone-Verkäufe, Services-Wachstum und China-Umsätze sind die kritischen Kennzahlen.',
    'MSFT': 'Microsoft ist der führende Cloud-Anbieter (Azure). KI-Integration in Office 365 und Copilot-Wachstum stehen im Fokus.',
    'GOOGL': 'Alphabets Kerngeschäft ist digitale Werbung. Zusätzlich: Gemini KI, Cloud-Wachstum und YouTube-Umsätze werden analysiert.',
    'AMZN': 'Amazon: AWS-Cloud-Wachstum ist der Gewinnmotor. Retail-Marge und Advertising-Umsatz als Wachstumstreiber.',
    'META': 'Meta lebt von Digital-Werbung auf Facebook/Instagram. KI-Investitionen (Capex) und Reality Labs-Verluste im Fokus.',
    'TSLA': 'Tesla: Auslieferungszahlen, Bruttomargen und Energiesparte. Preiskrieg mit chinesischen Herstellern unter Beobachtung.',
    'JPM': 'JPMorgan Chase — größte US-Bank. Kreditausfälle, Zinsmarge (NIM) und Investment-Banking-Erträge als Schlüsselkennzahlen.',
  };
  return ctx[(symbol || '').toUpperCase()] || 'Quartalszahlen zeigen EPS, Umsatz und Ausblick (Guidance). Beat der Erwartungen = oft Kursanstieg, Miss = Rückgang.';
}

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
  const future = new Date(today.getTime() + 75 * 24 * 60 * 60 * 1000); // 75 Tage voraus
  const from = today.toISOString().split('T')[0];
  const to = future.toISOString().split('T')[0];

  try {
    // Finnhubs Wirtschaftskalender ist im kostenlosen Tarif gesperrt (403) —
    // ersetzt durch FREDs Release-Kalender, der dieselben Termine kostenfrei
    // liefert. Beide Abrufe scheitern einzeln, ohne den anderen mitzureissen.
    const fredKey = (process.env.FRED_API_KEY || '').trim();
    const fredUrl = fredKey
      ? `https://api.stlouisfed.org/fred/releases/dates?api_key=${fredKey}&file_type=json&realtime_start=${from}&realtime_end=${to}&include_release_dates_with_no_data=true&sort_order=asc&limit=1000`
      : null;

    const [earningsData, fredData] = await Promise.all([
      fetchJSON(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${finnhubKey}`).catch(() => ({})),
      fredUrl ? fetchJSON(fredUrl).catch(() => ({})) : Promise.resolve({}),
    ]);
    const fredDates = (fredData && fredData.release_dates) || [];

    // Earnings: erst die Schwergewichte, dann mit den naechstgroessten
    // auffuellen. Die reine Whitelist liess die Seite zwischen zwei
    // Berichtssaisons fast leer stehen — live waren es 4 Termine, alle erst
    // in ueber zwei Monaten.
    const cal = (earningsData.earningsCalendar || [])
      .filter(e => e.symbol && e.date);
    const isTop = e => HIGH_IMPACT_SYMBOLS.includes((e.symbol || '').toUpperCase());
    const byDate = (a, b) => new Date(a.date) - new Date(b.date);
    // Auffuellkandidaten: nach erwartetem Umsatz, damit keine Kleinstwerte
    // die Liste fluten.
    const filler = cal
      .filter(e => !isTop(e) && (e.revenueEstimate || 0) > 5e9)
      .sort((a, b) => (b.revenueEstimate || 0) - (a.revenueEstimate || 0));
    const allEarnings = [...cal.filter(isTop).sort(byDate), ...filler.sort(byDate)]
      .slice(0, 10)
      .map(e => {
        const dt = fmtDate(e.date);
        const imp = getImpact(e.symbol);
        const context = getEarningsContext(e.symbol);
        let extra = '';
        if (e.epsEstimate) extra += `EPS-Schätzung: $${e.epsEstimate}`;
        if (e.revenueEstimate) extra += (extra ? ' | ' : '') + `Umsatz-Schätzung: $${(e.revenueEstimate/1e9).toFixed(1)}B`;
        return {
          type: 'earnings',
          day: dt.day, mon: dt.mon, date: e.date,
          title: e.symbol + ' Quartalszahlen',
          extra: extra,
          context: context,
          impact: imp.label, impCls: imp.cls,
          assets: [e.symbol, 'Nasdaq', e.symbol.match(/^(NVDA|AMD|AAPL|MSFT|META|GOOGL|AMZN)$/) ? 'S&P 500' : 'Tech-Sektor'].filter(Boolean)
        };
      });

    // Wirtschaftstermine aus FREDs Release-Kalender. Finnhubs Kalender ist im
    // kostenlosen Tarif gesperrt (HTTP 403) und lieferte dauerhaft nichts.
    // FRED veroeffentlicht rund 96 verschiedene Reihen — die allermeisten sind
    // Statistik ohne Kursrelevanz. Deshalb die enge Auswahl unten.
    const seenTypes = new Set();
    const topEcon = fredDates
      .filter(e => {
        if (!e.date || e.date < from || e.date > to) return false;
        const cfg = FRED_EVENTS[e.release_name];
        if (!cfg) return false;
        if (seenTypes.has(cfg.title)) return false;   // je Termin-Art nur der naechste
        seenTypes.add(cfg.title);
        return true;
      })
      .slice(0, 6)
      .map(e => {
        const cfg = FRED_EVENTS[e.release_name];
        const dt = fmtDate(e.date);
        return {
          type: 'economic',
          day: dt.day, mon: dt.mon, date: e.date,
          title: cfg.title,
          extra: '',
          context: cfg.context,
          impact: cfg.high ? 'Hoher Einfluss' : 'Mittlerer Einfluss',
          impCls: cfg.high ? 'imp-high' : 'imp-med',
          assets: cfg.assets,
        };
      });

    const events = [...topEcon, ...allEarnings]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 10);

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
