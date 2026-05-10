// api/quote.js
// Holt echte Kursdaten + Tages-Chart von Yahoo Finance — CommonJS Format

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Kein Symbol' });

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1h&range=1d&lang=de`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    if (!result) return res.status(404).json({ error: 'Asset nicht gefunden' });

    const meta = result.meta;
    const closes = result.indicators?.quote?.[0]?.close || [];
    const timestamps = result.timestamp || [];

    const chartData = timestamps
      .map((t, i) => ({ time: t, price: closes[i] }))
      .filter(p => p.price != null)
      .slice(-12);

    const currentPrice = meta.regularMarketPrice;
    const prevClose = meta.previousClose || meta.chartPreviousClose;
    const change = currentPrice - prevClose;
    const changePct = (change / prevClose) * 100;

    res.status(200).json({
      symbol: meta.symbol,
      name: meta.shortName || meta.symbol,
      currency: meta.currency || 'USD',
      price: currentPrice,
      change: change,
      changePct: changePct,
      isPos: change >= 0,
      high: meta.regularMarketDayHigh,
      low: meta.regularMarketDayLow,
      volume: meta.regularMarketVolume,
      chartData: chartData.map(p => p.price),
      chartTimes: chartData.map(p => {
        const d = new Date(p.time * 1000);
        return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      }),
      exchange: meta.exchangeName || '',
    });

  } catch (e) {
    res.status(500).json({ error: 'Fehler beim Laden', details: e.message });
  }
};
