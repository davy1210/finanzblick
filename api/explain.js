const https = require('https');

const explainCache = {};
const CACHE_DURATION = 6 * 60 * 60 * 1000;

function callGroq(prompt, apiKey) {
  const body = JSON.stringify({
    model: 'llama-3.1-8b-instant',
    max_tokens: 350,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content: 'Du bist Finanzblick. Erkläre Börsenereignisse sachlich auf Deutsch für Privatanleger. Antworte NUR als reines JSON-Objekt ohne jegliches Markdown, keine Codeblöcke, keine Backticks: {"was":"...","warum":"...","reaktion":"..."} — je 1-2 präzise, konkrete Sätze. Niemals generisch, immer spezifisch zum Ereignis.'
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
          let text = (p.choices?.[0]?.message?.content) || '';

          // Robust JSON extraction — strip all markdown wrappers
          text = text
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .replace(/^\s*json\s*/i, '')
            .trim();

          // Try to find JSON object in the text
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('No JSON found');

          const parsed = JSON.parse(jsonMatch[0]);
          resolve({
            what: parsed.was || parsed.what || '',
            why: parsed.warum || parsed.why || '',
            effect: parsed.reaktion || parsed.effect || ''
          });
        } catch(e) {
          // Last-resort: extract values with regex
          try {
            const raw = d;
            const content = JSON.parse(raw)?.choices?.[0]?.message?.content || '';
            const wasM = content.match(/"was"\s*:\s*"([^"]+)"/);
            const warumM = content.match(/"warum"\s*:\s*"([^"]+)"/);
            const reaktM = content.match(/"reaktion"\s*:\s*"([^"]+)"/);
            if (wasM || warumM) {
              resolve({
                what: wasM ? wasM[1] : '',
                why: warumM ? warumM[1] : '',
                effect: reaktM ? reaktM[1] : ''
              });
            } else {
              reject(new Error('Parse failed'));
            }
          } catch(e2) { reject(e); }
        }
      });
    });
    r.on('error', reject);
    r.setTimeout(10000, function() { this.destroy(); reject(new Error('Timeout')); });
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

  const cacheKey = title + '_' + (type || 'economic');
  const now = Date.now();

  if (explainCache[cacheKey] && (now - explainCache[cacheKey].time) < CACHE_DURATION) {
    return res.status(200).json({ ...explainCache[cacheKey].data, fromCache: true });
  }

  const prompt = type === 'earnings'
    ? `Erkläre das Börsenereignis "${title}" präzise: Was genau wird hier veröffentlicht (EPS, Umsatz, Ausblick)? Warum ist das für Anleger entscheidend und wie beeinflusst es den Aktienkurs je nach Ergebnis? Sei konkret, nicht generisch.`
    : `Erkläre den Wirtschaftstermin "${title}" präzise: Was wird gemessen oder entschieden? Warum reagieren Märkte so stark darauf? Welche konkreten Assets und Richtungen sind bei positivem vs. negativem Ergebnis zu erwarten?`;

  try {
    const data = await callGroq(prompt, apiKey);
    explainCache[cacheKey] = { data, time: now };
    return res.status(200).json({ ...data, fromCache: false });
  } catch(e) {
    // Fallback: return structured error that frontend can display
    return res.status(200).json({
      what: `${title} — Erklärung vorübergehend nicht verfügbar.`,
      why: 'Bitte versuche es in einigen Minuten erneut.',
      effect: '',
      error: true
    });
  }
};
