const https = require('https');

// ── LOKALER INDEX GAENGIGER WERTE ─────────────────────────────────────────
// Yahoos Suche kennt nur Praefixe: "Simens" und "Nvidea" liefern null Treffer,
// "Aple" findet einen REIT statt Apple. Dieser Index faengt Tippfehler und
// gaengige Zweitnamen ab — er muss nicht vollstaendig sein, sondern die Werte
// abdecken, nach denen tatsaechlich gesucht wird.
const POPULAR = [
  // DAX / Deutschland
  { s:'SIE.DE',  n:'Siemens',              t:'Aktie', a:['siemens ag'] },
  { s:'ENR.DE',  n:'Siemens Energy',       t:'Aktie' },
  { s:'SHL.DE',  n:'Siemens Healthineers', t:'Aktie' },
  { s:'VOW3.DE', n:'Volkswagen',           t:'Aktie', a:['vw','volkswagen ag'] },
  { s:'P911.DE', n:'Porsche',              t:'Aktie' },
  { s:'MBG.DE',  n:'Mercedes-Benz',        t:'Aktie', a:['daimler','mercedes'] },
  { s:'BMW.DE',  n:'BMW',                  t:'Aktie', a:['bayerische motoren werke'] },
  { s:'ALV.DE',  n:'Allianz',              t:'Aktie' },
  { s:'MUV2.DE', n:'Muenchener Rueck',     t:'Aktie', a:['munich re','münchener rück'] },
  { s:'SAP.DE',  n:'SAP',                  t:'Aktie' },
  { s:'DTE.DE',  n:'Deutsche Telekom',     t:'Aktie', a:['telekom'] },
  { s:'DBK.DE',  n:'Deutsche Bank',        t:'Aktie' },
  { s:'CBK.DE',  n:'Commerzbank',          t:'Aktie' },
  { s:'BAS.DE',  n:'BASF',                 t:'Aktie' },
  { s:'BAYN.DE', n:'Bayer',                t:'Aktie' },
  { s:'IFX.DE',  n:'Infineon',             t:'Aktie' },
  { s:'RHM.DE',  n:'Rheinmetall',          t:'Aktie' },
  { s:'AIR.DE',  n:'Airbus',               t:'Aktie' },
  { s:'ADS.DE',  n:'Adidas',               t:'Aktie' },
  { s:'PUM.DE',  n:'Puma',                 t:'Aktie' },
  { s:'DHL.DE',  n:'DHL Group',            t:'Aktie', a:['deutsche post','post'] },
  { s:'HEN3.DE', n:'Henkel',               t:'Aktie' },
  { s:'MRK.DE',  n:'Merck',                t:'Aktie' },
  { s:'ZAL.DE',  n:'Zalando',              t:'Aktie' },
  { s:'LHA.DE',  n:'Lufthansa',            t:'Aktie' },
  { s:'EOAN.DE', n:'E.ON',                 t:'Aktie', a:['eon'] },
  { s:'RWE.DE',  n:'RWE',                  t:'Aktie' },
  { s:'HFG.DE',  n:'HelloFresh',           t:'Aktie' },
  { s:'NDA.DE',  n:'Aurubis',              t:'Aktie' },
  // Europa
  { s:'NESN.SW', n:'Nestle',               t:'Aktie', a:['nestlé'] },
  { s:'MC.PA',   n:'LVMH',                 t:'Aktie' },
  { s:'ASML',    n:'ASML',                 t:'Aktie' },
  { s:'NOVN.SW', n:'Novartis',             t:'Aktie' },
  { s:'SAN.PA',  n:'Sanofi',               t:'Aktie' },
  { s:'SHEL.L',  n:'Shell',                t:'Aktie' },
  // USA
  { s:'AAPL',  n:'Apple',      t:'Aktie' },
  { s:'MSFT',  n:'Microsoft',  t:'Aktie' },
  { s:'NVDA',  n:'Nvidia',     t:'Aktie' },
  { s:'GOOGL', n:'Alphabet',   t:'Aktie', a:['google'] },
  { s:'AMZN',  n:'Amazon',     t:'Aktie' },
  { s:'META',  n:'Meta',       t:'Aktie', a:['facebook'] },
  { s:'TSLA',  n:'Tesla',      t:'Aktie' },
  { s:'NFLX',  n:'Netflix',    t:'Aktie' },
  { s:'AMD',   n:'AMD',        t:'Aktie' },
  { s:'INTC',  n:'Intel',      t:'Aktie' },
  { s:'AVGO',  n:'Broadcom',   t:'Aktie' },
  { s:'JPM',   n:'JPMorgan',   t:'Aktie', a:['jp morgan'] },
  { s:'V',     n:'Visa',       t:'Aktie' },
  { s:'MA',    n:'Mastercard', t:'Aktie' },
  { s:'DIS',   n:'Disney',     t:'Aktie' },
  { s:'KO',    n:'Coca-Cola',  t:'Aktie', a:['coca cola','cola'] },
  { s:'MCD',   n:'McDonalds',  t:'Aktie', a:["mcdonald's"] },
  { s:'BA',    n:'Boeing',     t:'Aktie' },
  { s:'PLTR',  n:'Palantir',   t:'Aktie' },
  { s:'COIN',  n:'Coinbase',   t:'Aktie' },
  { s:'UBER',  n:'Uber',       t:'Aktie' },
  { s:'PFE',   n:'Pfizer',     t:'Aktie' },
  { s:'XOM',   n:'Exxon Mobil',t:'Aktie', a:['exxon'] },
  // Indizes
  { s:'^GDAXI',    n:'DAX',           t:'Index' },
  { s:'^GSPC',     n:'S&P 500',       t:'Index', a:['sp500','s&p 500','sundp'] },
  { s:'^IXIC',     n:'Nasdaq',        t:'Index' },
  { s:'^DJI',      n:'Dow Jones',     t:'Index', a:['dow'] },
  { s:'^STOXX50E', n:'Euro Stoxx 50', t:'Index', a:['eurostoxx'] },
  { s:'^N225',     n:'Nikkei 225',    t:'Index', a:['nikkei'] },
  // Krypto
  { s:'BTC-USD',  n:'Bitcoin',  t:'Krypto', a:['btc'] },
  { s:'ETH-USD',  n:'Ethereum', t:'Krypto', a:['eth','ether'] },
  { s:'SOL-USD',  n:'Solana',   t:'Krypto', a:['sol'] },
  { s:'XRP-USD',  n:'XRP',      t:'Krypto', a:['ripple'] },
  { s:'ADA-USD',  n:'Cardano',  t:'Krypto', a:['ada'] },
  { s:'DOGE-USD', n:'Dogecoin', t:'Krypto', a:['doge'] },
  { s:'BNB-USD',  n:'BNB',      t:'Krypto', a:['binance coin'] },
  // Rohstoffe
  { s:'GC=F', n:'Gold',      t:'Rohstoff' },
  { s:'SI=F', n:'Silber',    t:'Rohstoff', a:['silver'] },
  { s:'CL=F', n:'Oel (WTI)', t:'Rohstoff', a:['öl','oel','oil','crude','wti','erdöl','erdoel'] },
  { s:'HG=F', n:'Kupfer',    t:'Rohstoff', a:['copper'] },
  { s:'NG=F', n:'Erdgas',    t:'Rohstoff', a:['gas','natural gas'] },
];

// Umlaute und Sonderzeichen vereinheitlichen, damit "Münchener" und
// "Muenchener" sowie "Coca-Cola" und "coca cola" gleich behandelt werden.
function norm(s) {
  return (s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

// Levenshtein-Distanz: wie viele Zeichen muessen geaendert werden.
// "simens" -> "siemens" ist Distanz 1, "nvidea" -> "nvidia" ebenfalls 1.
function distance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

// Bewertet, wie gut ein Eintrag zur Eingabe passt. Hoeher ist besser.
function score(query, eintrag) {
  const q = norm(query);
  if (!q) return 0;
  const kandidaten = [eintrag.n, eintrag.s, ...(eintrag.a || [])].map(norm);
  let best = 0;
  for (const k of kandidaten) {
    if (!k) continue;
    if (k === q) return 100;
    if (k.startsWith(q)) { best = Math.max(best, 90); continue; }
    if (k.includes(q) && q.length >= 3) { best = Math.max(best, 78); continue; }
    // Tippfehler zulassen — je laenger das Wort, desto mehr Abweichung ist ok
    const d = distance(q, k);
    const erlaubt = k.length <= 5 ? 1 : k.length <= 9 ? 2 : 3;
    if (d <= erlaubt) best = Math.max(best, 72 - d * 6);
  }
  return best;
}

function lokaleTreffer(query) {
  return POPULAR
    .map(e => ({ e, sc: score(query, e) }))
    .filter(x => x.sc >= 60)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 6)
    .map(x => ({
      symbol: x.e.s, name: x.e.n, type: x.e.t, exchange: '', _score: x.sc,
    }));
}

function fetchYahoo(q) {
  const url = 'https://query1.finance.yahoo.com/v1/finance/search?q=' +
    encodeURIComponent(q) + '&lang=de-DE&region=DE&quotesCount=8&newsCount=0';
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 6000 }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(d);
          resolve((data.quotes || [])
            .filter(x => ['EQUITY','ETF','CRYPTOCURRENCY','INDEX','FUTURE'].includes(x.quoteType))
            .map(x => ({
              symbol: x.symbol,
              name: x.shortname || x.longname || x.symbol,
              type: { EQUITY:'Aktie', ETF:'ETF', CRYPTOCURRENCY:'Krypto', INDEX:'Index', FUTURE:'Rohstoff' }[x.quoteType] || x.quoteType,
              exchange: x.exchange || '',
            })));
        } catch(e) { resolve([]); }
      });
    }).on('error', () => resolve([])).on('timeout', function() { this.destroy(); resolve([]); });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const q = (req.query.q || '').trim().replace(/\s+/g, ' ');
  if (!q) return res.status(400).json({ error: 'Kein Suchbegriff' });

  try {
    const lokal = lokaleTreffer(q);
    let yahoo = await fetchYahoo(q);

    // Findet Yahoo nichts, der lokale Index aber schon, dann war es
    // vermutlich ein Tippfehler: mit dem korrigierten Namen erneut fragen,
    // um auch verwandte Werte zu bekommen ("Simens" -> auch Siemens Energy).
    let korrigiert = null;
    if (!yahoo.length && lokal.length) {
      korrigiert = lokal[0].name;
      yahoo = await fetchYahoo(korrigiert);
    }

    // Lokale Treffer zuerst — sie sind kuratiert und treffen die Absicht
    // besser als Yahoos Namensaehnlichkeit ("Aple" -> Apple Hospitality REIT).
    const gesehen = new Set();
    const results = [];
    for (const r of [...lokal, ...yahoo]) {
      const key = (r.symbol || '').toUpperCase();
      if (!key || gesehen.has(key)) continue;
      gesehen.add(key);
      results.push({ symbol: r.symbol, name: r.name, type: r.type, exchange: r.exchange || '' });
      if (results.length >= 8) break;
    }

    return res.status(200).json({ results, korrigiert });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
