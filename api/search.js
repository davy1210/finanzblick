import https from 'https';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const q = req.query.q || '';
  if (!q) return res.status(400).json({ error: 'Kein Suchbegriff' });

  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=de-DE&region=DE&quotesCount=8&newsCount=0`;

  try {
    const body = await new Promise((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (resp) => {
        let d = '';
        resp.on('data', c => d += c);
        resp.on('end', () => resolve(d));
      }).on('error', reject);
    });

    const data = JSON.parse(body);
    const results = (data.quotes || [])
      .filter(q => ['EQUITY','ETF','CRYPTOCURRENCY','INDEX'].includes(q.quoteType))
      .slice(0, 7)
      .map(q => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        type: { EQUITY:'Aktie', ETF:'ETF', CRYPTOCURRENCY:'Krypto', INDEX:'Index' }[q.quoteType] || q.quoteType,
        exchange: q.exchange || '',
      }));

    return res.status(200).json({ results });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
