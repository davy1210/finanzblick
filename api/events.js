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

// KI-Erklärung für ein spezifisches Ereignis generieren
function generateExplanation(title, type, extra, apiKey) {
  const system = `Du bist Finanzblick, ein sachlicher Finanzerklärer für Privatanleger in Deutschland und Österreich.
Erkläre Börsenereignisse präzise und verständlich auf Deutsch.
Antworte NUR im folgenden JSON-Format ohne Markdown oder Sterne:
{"was":"...", "warum":"...", "reaktion":"..."}
- "was": Was ist dieses Ereignis? (1-2 Sätze, einfach erklärt)
- "warum": Warum ist es für Anleger wichtig? (1-2 Sätze, konkret)
- "reaktion": Was kann passieren wenn es besser/schlechter als erwartet ist? (1-2 Sätze, konkret)`;

  const userMsg = type === 'earnings'
    ? `Erkläre dieses Börsenereignis: "${title}". ${extra ? 'Analyst-Schätzung: ' + extra : ''}`
    : `Erkläre diesen Wirtschaftstermin: "${title}". Gib eine spezifische, präzise Erklärung für genau dieses Ereignis.`;

  const body = JSON.stringify({
    model: 'llama-3.1-8b-instant',
    max_tokens: 300,
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userMsg }
    ]
  });

  return new Promise((resolve) => {
    const r = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body)
      }
    }, resp => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => {
        try {
          const p = JSON.parse(d);
          const text = p.choices && p.choices[0] && p.choices[0].message && p.choices[0].message.content || '';
          const clean = text.replace(/```json|```/g,'').trim();
          const parsed = JSON.parse(clean);
          resolve({
            what: parsed.was || '',
            why: parsed.warum || '',
            effect: parsed.reaktion || ''
          });
        } catch(e) {
          resolve({ what: '', why: '', effect: '' });
        }
      });
    });
    r.on('error', () => resolve({ what: '', why: '', effect: '' }));
    r.setTimeout(10000, function() { this.destroy(); resolve({ what: '', why: '', effect: '' }); });
    r.write(body);
    r.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const apiKey = process.env.GROQ_API_KEY;
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
    // 1. Earnings Kalender
    const earningsData = await fetchJSON(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${finnhubKey}`);
    const topSymbols = ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','NFLX','AMD','JPM','BAC','GS'];
    const topEarnings = (earningsData.earningsCalendar || [])
      .filter(e => topSymbols.includes(e.symbol))
      .slice(0, 4);

    // 2. Wirtschaftskalender
    const econData = await fetchJSON(`https://finnhub.io/api/v1/calendar/economic?token=${finnhubKey}`);

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

    const seenTypes = new Set();
    const topEcon = (econData.economicCalendar || [])
      .filter(e => {
        const name = e.event || '';
        if (e.time < from || e.time > to) return false;
        const match = PRIORITY_EVENTS.find(p => name.includes(p.key));
        if (!match) return false;
        if (seenTypes.has(match.key)) return false;
        seenTypes.add(match.key);
        return true;
      })
      .slice(0, 5);

    // 3. Alle Events kombinieren und nach Datum sortieren
    const allRaw = [
      ...topEcon.map(e => ({
        type: 'economic',
        date: e.time,
        rawTitle: e.event,
        title: (PRIORITY_EVENTS.find(p => (e.event||'').includes(p.key)) || { title: e.event }).title,
        extra: '',
        impCls: 'imp-high',
        impact: 'Hoher Einfluss',
        assets: getEconAssets(e.event)
      })),
      ...topEarnings.map(e => ({
        type: 'earnings',
        date: e.date,
        rawTitle: e.symbol + ' Quartalszahlen',
        title: e.symbol + ' Quartalszahlen',
        extra: e.epsEstimate ? 'Gewinn-Schätzung: $' + e.epsEstimate + ' pro Aktie' : '',
        ...getImpact(e.symbol),
        assets: [e.symbol]
      }))
    ].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 8);

    // 4. KI-Erklärungen parallel generieren (nur wenn apiKey vorhanden)
    let events;
    if (apiKey) {
      const explained = await Promise.all(allRaw.map(async e => {
        const explanation = await generateExplanation(e.title, e.type, e.extra, apiKey);
        const dt = fmtDate(e.date);
        return {
          type: e.type,
          day: dt.day,
          mon: dt.mon,
          date: e.date,
          title: e.title,
          what: explanation.what,
          why: explanation.why,
          effect: explanation.effect,
          extra: e.extra,
          impact: e.impact,
          impCls: e.impCls,
          assets: e.assets
        };
      }));
      events = explained;
    } else {
      events = allRaw.map(e => {
        const dt = fmtDate(e.date);
        return { ...e, day: dt.day, mon: dt.mon };
      });
    }

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
