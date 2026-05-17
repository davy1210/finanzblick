const https = require('https');

// Cache pro Event-Titel
const explainCache = {};
const CACHE_DURATION = 6 * 60 * 60 * 1000;

function callGroq(prompt, apiKey) {
  const body = JSON.stringify({
    model: 'llama-3.1-8b-instant',
    max_tokens: 250,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: 'Du bist Finanzblick. Erkläre Börsenereignisse sachlich auf Deutsch für Privatanleger. Antworte NUR als JSON ohne Markdown: {"was":"...","warum":"...","reaktion":"..."} — je 1-2 präzise Sätze.'
      },
      { role: 'user', content: prompt }
    ]
  });

  return new Promise((resolve, reject) => {
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
          if (p.error) return reject(new Error(p.error.message));
          const text = (p.choices && p.choices[0] && p.choices[0].message && p.choices[0].message.content) || '';
          const clean = text.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(clean);
          resolve({ what: parsed.was || '', why: parsed.warum || '', effect: parsed.reaktion || '' });
        } catch(e) { reject(e); }
      });
    });
    r.on('error', reject);
    r.setTimeout(9000, function() { this.destroy(); reject(new Error('Timeout')); });
    r.write(body);
    r.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { title, type } = req.query;
  if (!title) return res.status(400).json({ error: 'Kein Titel' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API Key fehlt' });

  const cacheKey = title;
  const now = Date.now();

  if (explainCache[cacheKey] && (now - explainCache[cacheKey].time) < CACHE_DURATION) {
    return res.status(200).json({ ...explainCache[cacheKey].data, fromCache: true });
  }

  const prompt = type === 'earnings'
    ? `Erkläre das Börsenereignis "${title}" spezifisch: Was sind Quartalszahlen dieses Unternehmens? Warum schauen Anleger darauf? Was passiert wenn Ergebnisse besser/schlechter als erwartet sind?`
    : `Erkläre den Wirtschaftstermin "${title}" spezifisch: Was wird hier gemessen oder entschieden? Warum ist das für Anleger wichtig? Wie reagieren Märkte typischerweise?`;

  try {
    const data = await callGroq(prompt, apiKey);
    explainCache[cacheKey] = { data, time: now };
    return res.status(200).json({ ...data, fromCache: false });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
