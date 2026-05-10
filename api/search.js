// api/search.js
// Sucht nach Assets via Yahoo Finance — läuft sicher auf Vercel

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { q } = req.query;
  if (!q || q.length < 1) return res.status(400).json({ error: 'Kein Suchbegriff' });

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=de-DE&region=DE&quotesCount=8&newsCount=0`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const data = await response.json();

    const results = (data.quotes || [])
      .filter(q => ['EQUITY','ETF','CRYPTOCURRENCY','MUTUALFUND','INDEX','CURRENCY'].includes(q.quoteType))
      .slice(0, 7)
      .map(q => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        type: translateType(q.quoteType),
        exchange: q.exchange || '',
      }));

    res.status(200).json({ results });
  } catch (e) {
    res.status(500).json({ error: 'Yahoo Finance nicht erreichbar', details: e.message });
  }
}

function translateType(t) {
  const map = { EQUITY:'Aktie', ETF:'ETF', CRYPTOCURRENCY:'Krypto', INDEX:'Index', MUTUALFUND:'Fonds', CURRENCY:'Währung' };
  return map[t] || t;
}
