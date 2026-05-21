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

function getEconAssets(eventName) {
  const n = (eventName || '').toLowerCase();
  if (n.includes('fed') || n.includes('federal funds') || n.includes('fomc')) return ['S&P 500', 'Gold', 'Bitcoin', 'USD'];
  if (n.includes('cpi') || n.includes('inflation') || n.includes('consumer price')) return ['S&P 500', 'Gold', 'Anleihen', 'USD'];
  if (n.includes('payroll') || n.includes('employment') || n.includes('jobs')) return ['S&P 500', 'DAX', 'Gold', 'USD'];
  if (n.includes('ecb') || n.includes('european central')) return ['DAX', 'Euro', 'Europäische Aktien'];
  if (n.includes('gdp') || n.includes('growth') || n.includes('bip')) return ['S&P 500', 'DAX', 'Gold'];
  if (n.includes('retail') || n.includes('consumer')) return ['S&P 500', 'Konsumaktien'];
  if (n.includes('producer') || n.includes('ppi')) return ['S&P 500', 'Anleihen', 'USD'];
  if (n.includes('housing') || n.includes('home')) return ['S&P 500', 'Immobilien-ETFs'];
  if (n.includes('pmi') || n.includes('manufacturing')) return ['DAX', 'S&P 500', 'Industrieaktien'];
  return ['S&P 500', 'DAX'];
}

const PRIORITY_EVENTS = [
  { key: 'Federal Funds Rate', title: 'Fed Zinsentscheidung (FOMC)' },
  { key: 'FOMC', title: 'Fed Zinsentscheidung (FOMC)' },
  { key: 'CPI', title: 'US Inflationsdaten (CPI)' },
  { key: 'Non Farm Payroll', title: 'US Arbeitsmarktdaten (NFP)' },
  { key: 'Nonfarm Payroll', title: 'US Arbeitsmarktdaten (NFP)' },
  { key: 'ECB Rate', title: 'EZB Zinsentscheidung' },
  { key: 'European Central Bank', title: 'EZB Zinsentscheidung' },
  { key: 'GDP', title: 'US Wirtschaftswachstum (BIP)' },
  { key: 'Unemployment Rate', title: 'US Arbeitslosenquote' },
  { key: 'Producer Price', title: 'US Erzeugerpreise (PPI)' },
  { key: 'Retail Sales', title: 'US Einzelhandelsumsätze' },
  { key: 'Consumer Confidence', title: 'US Verbrauchervertrauen' },
  { key: 'PMI', title: 'US Einkaufsmanagerindex (PMI)' },
  { key: 'Durable Goods', title: 'US Auftragseingänge langlebige Güter' },
  { key: 'Housing Starts', title: 'US Wohnungsbaubeginne' },
  { key: 'Initial Jobless', title: 'US Erstanträge Arbeitslosenhilfe' },
];

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
    const [earningsData, econData] = await Promise.all([
      fetchJSON(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${finnhubKey}`),
      fetchJSON(`https://finnhub.io/api/v1/calendar/economic?token=${finnhubKey}`)
    ]);

    // Earnings: alle wichtigen Symbole filtern
    const allEarnings = (earningsData.earningsCalendar || [])
      .filter(e => HIGH_IMPACT_SYMBOLS.includes((e.symbol || '').toUpperCase()))
      .slice(0, 8)
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

    // Wirtschafts-Events: priorisiert und dedupliziert
    const seenTypes = new Set();
    const topEcon = (econData.economicCalendar || [])
      .filter(e => {
        const name = e.event || '';
        if (e.time < from || e.time > to) return false;
        const match = PRIORITY_EVENTS.find(p => name.includes(p.key));
        if (!match) return false;
        // Deduplizieren: gleicher Typ nur einmal
        const dedupeKey = match.title;
        if (seenTypes.has(dedupeKey)) return false;
        seenTypes.add(dedupeKey);
        return true;
      })
      .slice(0, 6)
      .map(e => {
        const dt = fmtDate(e.time);
        const prio = PRIORITY_EVENTS.find(p => (e.event || '').includes(p.key));
        const title = prio ? prio.title : e.event;
        return {
          type: 'economic',
          day: dt.day, mon: dt.mon, date: e.time,
          title: title,
          extra: e.actual !== null && e.actual !== undefined ? `Aktuell: ${e.actual}` : '',
          context: '',
          impact: 'Hoher Einfluss', impCls: 'imp-high',
          assets: getEconAssets(e.event)
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
