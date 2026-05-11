const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { asset, price, changePct, isPos, frage } = req.body;
  const apiKey = process.env.GROQ_API_KEY;

  const richtung = isPos
    ? `gestiegen (+${Math.abs(changePct).toFixed(2)}%)`
    : `gefallen (-${Math.abs(changePct).toFixed(2)}%)`;

  const userPrompt = frage
    ? `${asset} steht bei ${price} und ist heute ${richtung}. Frage: "${frage}". Erkläre auf Deutsch für Einsteiger, max. 3 Absätze, keine Anlageberatung.`
    : `${asset} steht bei ${price} und ist heute ${richtung}. Erkläre auf Deutsch für Börsen-Einsteiger warum und was man wissen sollte. Max. 3 Absätze, keine Anlageberatung.`;

  const body = JSON.stringify({
    model: 'llama-3.1-8b-instant',
    max_tokens: 800,
    messages: [
      { role: 'system', content: 'Du bist Finanzblick, ein freundlicher Finanzerklärer für Privatanleger in Österreich und Deutschland. Antworte immer auf Deutsch, einfach und klar. Keine Anlageberatung.' },
      { role: 'user', content: userPrompt }
    ]
  });

  const options = {
    hostname: 'api.groq.com',
    path: '/openai/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(body)
    }
  };

  try {
    const text = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) return reject(new Error(parsed.error.message));
            resolve(parsed.choices?.[0]?.message?.content || 'Keine Antwort erhalten.');
          } catch(e) { reject(e); }
        });
      });
      request.on('error', reject);
      request.write(body);
      request.end();
    });

    res.status(200).json({ antwort: text });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
