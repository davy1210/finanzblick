const https = require('https');

// ── QUELLEN-ÜBERWACHUNG ───────────────────────────────────────────────────
// Warum es das gibt: Die Reuters-Feeds waren ueber ein Jahr abgeschaltet und
// der FRED-Key tot, ohne dass es auffiel — beide Ausfaelle wurden von
// catch-Bloecken still verschluckt und durch Fallbacks kaschiert. Die App sah
// funktionsfaehig aus, lieferte aber fuer Krypto und Gold gar keine
// Nachrichten und fuer Makro monatealte Zahlen.
//
// Dieser Endpunkt ruft jede externe Quelle einzeln auf und prueft nicht nur,
// ob sie antwortet, sondern ob die Antwort brauchbar ist (`check`).

const CHECK_TIMEOUT = 8000;

function probe(url, opts = {}) {
  const started = opts._started || Date.now();
  const hop = opts._hop || 0;
  return new Promise(resolve => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', ...(opts.headers || {}) },
      timeout: CHECK_TIMEOUT,
    }, res => {
      // Weiterleitungen folgen, sonst meldet die Pruefung einen Ausfall,
      // wo die Quelle nur umgezogen ist.
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hop < 3) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        res.resume();
        return resolve(probe(next, { ...opts, _hop: hop + 1, _started: started }));
      }
      let raw = '';
      res.on('data', c => { if (raw.length < 200000) raw += c; });
      res.on('end', () => resolve({
        status: res.statusCode,
        ms: Date.now() - started,
        body: raw,
      }));
    });
    req.on('error', e => resolve({ status: 0, ms: Date.now() - started, error: e.message, body: '' }));
    req.on('timeout', function() { this.destroy(); resolve({ status: 0, ms: CHECK_TIMEOUT, error: 'timeout', body: '' }); });
  });
}

function rssItems(body) {
  return (body.match(/<item[\s>]/gi) || []).length;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const fh = process.env.FINNHUB_API_KEY;
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  // Jede Quelle bekommt eine eigene Pruefung dafuer, was "brauchbar" heisst.
  const sources = [
    {
      name: 'Yahoo Chart (Kurse)', critical: true,
      url: 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=5d',
      check: b => { try { return !!JSON.parse(b)?.chart?.result?.[0]?.meta?.regularMarketPrice; } catch(e) { return false; } },
      note: 'Ohne diese Quelle gibt es keine Kurse und keine Charts.',
    },
    {
      name: 'Yahoo Search (Suche)', critical: true,
      url: 'https://query1.finance.yahoo.com/v1/finance/search?q=apple&quotesCount=3',
      check: b => { try { return (JSON.parse(b).quotes || []).length > 0; } catch(e) { return false; } },
      note: 'Ohne diese Quelle funktioniert die Assetsuche nicht.',
    },
    {
      name: 'CoinGecko (Krypto-Fundamentaldaten)', critical: false,
      url: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin&per_page=1',
      check: b => { try { return !!JSON.parse(b)?.[0]?.market_cap; } catch(e) { return false; } },
      note: 'Faellt aus: Krypto zeigt keine Marktkapitalisierung und kein Angebot.',
    },
    {
      name: 'Cointelegraph RSS (Krypto-News)', critical: false,
      url: 'https://cointelegraph.com/rss',
      check: b => rssItems(b) >= 5,
      note: 'Faellt aus: Krypto-Assets haben keine eigenen Nachrichten mehr.',
    },
    {
      name: 'Investing.com RSS (Rohstoff-News)', critical: false,
      url: 'https://www.investing.com/rss/commodities.rss',
      check: b => rssItems(b) >= 3,
      note: 'Faellt aus: Gold, Silber und Oel haben keine eigenen Nachrichten mehr.',
    },
    {
      name: 'CNBC RSS (Marktnachrichten)', critical: false,
      url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',
      check: b => rssItems(b) >= 5,
      note: 'Faellt aus: allgemeine Marktnachrichten fehlen.',
    },
    {
      name: 'MarketWatch RSS (Marktnachrichten)', critical: false,
      url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
      check: b => rssItems(b) >= 3,
      note: 'Zweitquelle fuer allgemeine Marktnachrichten.',
    },
    {
      name: 'Yahoo RSS (Aktien-News)', critical: false,
      url: 'https://finance.yahoo.com/rss/headline?s=AAPL',
      check: b => rssItems(b) >= 3,
      note: 'Liefert nur fuer US-Aktien Eintraege, nicht fuer Krypto/Rohstoffe.',
    },
  ];

  if (fh) {
    sources.push(
      {
        name: 'Finnhub Unternehmensnews', critical: false,
        url: `https://finnhub.io/api/v1/company-news?symbol=AAPL&from=${weekAgo}&to=${today}&token=${fh}`,
        check: b => { try { return JSON.parse(b).length > 0; } catch(e) { return false; } },
        note: 'Faellt aus: US-Aktien verlieren ihre wichtigste Nachrichtenquelle.',
      },
      {
        name: 'Finnhub Kennzahlen', critical: false,
        url: `https://finnhub.io/api/v1/stock/metric?symbol=AAPL&metric=all&token=${fh}`,
        check: b => { try { return !!JSON.parse(b)?.metric?.peTTM; } catch(e) { return false; } },
        note: 'Faellt aus: Fundamentaldaten wie KGV und Margen fehlen.',
      },
      {
        name: 'Finnhub Quartalszahlen-Kalender', critical: false,
        url: `https://finnhub.io/api/v1/calendar/earnings?from=${today}&to=${new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]}&token=${fh}`,
        check: b => { try { return (JSON.parse(b).earningsCalendar || []).length > 0; } catch(e) { return false; } },
        note: 'Faellt aus: die Ereignisse-Seite bleibt leer.',
      },
      {
        name: 'Finnhub Wirtschaftskalender', critical: false,
        url: `https://finnhub.io/api/v1/calendar/economic?token=${fh}`,
        check: b => { try { return (JSON.parse(b).economicCalendar || []).length > 0; } catch(e) { return false; } },
        note: 'Im kostenlosen Tarif nicht enthalten — deshalb fehlen Zinsentscheide und Inflationstermine.',
      }
    );
  } else {
    sources.push({ name: 'Finnhub', critical: false, skip: 'FINNHUB_API_KEY ist nicht gesetzt' });
  }

  // FRED ueber den eigenen Endpunkt pruefen: interessant ist nicht, ob die
  // Funktion antwortet, sondern ob echte Zahlen ankommen.
  const results = await Promise.all(sources.map(async s => {
    if (s.skip) return { name: s.name, ok: false, detail: s.skip, critical: s.critical, note: s.note };
    const r = await probe(s.url);
    const reachable = r.status === 200;
    const usable = reachable && s.check(r.body);
    return {
      name: s.name,
      ok: usable,
      httpStatus: r.status || null,
      ms: r.ms,
      detail: !reachable
        ? (r.error ? `nicht erreichbar (${r.error})` : `HTTP ${r.status}`)
        : (usable ? 'liefert brauchbare Daten' : 'antwortet, aber ohne verwertbaren Inhalt'),
      critical: !!s.critical,
      note: s.note,
    };
  }));

  // Makro separat: eigener Endpunkt, aber inhaltliche Pruefung.
  const macro = await probe('https://finanzblick.vercel.app/api/macro');
  let macroOk = false, macroDetail = 'nicht erreichbar';
  try {
    const m = JSON.parse(macro.body);
    const felder = ['fedRate', 'cpiYoy', 'unemployment', 'gdpGrowth'];
    const gefuellt = felder.filter(f => m[f] !== null && m[f] !== undefined);
    macroOk = gefuellt.length > 0;
    macroDetail = macroOk
      ? `${gefuellt.length} von ${felder.length} Werten vorhanden`
      : 'antwortet, aber alle Werte sind null — FRED-Key vermutlich ungueltig';
  } catch(e) {}
  results.push({
    name: 'FRED / Makrodaten', ok: macroOk, httpStatus: macro.status || null, ms: macro.ms,
    detail: macroDetail, critical: false,
    note: 'Faellt aus: die Analyse nutzt hartkodierte Ersatzwerte statt aktueller Zinsen und Inflation.',
  });

  const defekt = results.filter(r => !r.ok);
  const kritischDefekt = defekt.filter(r => r.critical);

  return res.status(200).json({
    geprueft: new Date().toISOString(),
    gesamt: results.length,
    ok: results.length - defekt.length,
    defekt: defekt.length,
    zustand: kritischDefekt.length ? 'kritisch' : (defekt.length ? 'beeintraechtigt' : 'in Ordnung'),
    probleme: defekt.map(r => ({ quelle: r.name, grund: r.detail, folge: r.note })),
    quellen: results,
  });
};
