import https from 'https';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { asset, price, changePct, isPos, frage, news } = req.body;
  const apiKey = process.env.GROQ_API_KEY;

  const richtung = isPos
    ? `gestiegen (+${Math.abs(changePct).toFixed(2)}%)`
    : `gefallen (-${Math.abs(changePct).toFixed(2)}%)`;

  const newsKontext = news && news.length > 0
    ? '\n\nAktuelle News:\n' + news.map(n => `- ${n.title}`).join('\n')
    : '';

  let systemPrompt, userPrompt;
  if (frage) {
    systemPrompt = 'Du bist Finanzblick, ein freundlicher Finanzerklärer für Privatanleger in Österreich und Deutschland. Antworte auf Deutsch, einfach und klar. Keine Anlageberatung.';
    userPrompt = `${asset} steht bei ${price} und ist heute ${richtung}.${newsKontext}\n\nFrage: "${frage}"\n\nBeantworte einfach auf Deutsch für Einsteiger. Max. 3 Absätze.`;
  } else {
    systemPrompt = 'Du bist Finanzblick, ein freundlicher Finanzerklärer für Privatanleger. Antworte auf Deutsch, einfach und klar. Strukturiere deine Antwort mit WARUM und AUSBLICK. Keine Anlageberatung.';
    userPrompt = `${asset} steht bei ${price} und ist heute ${richtung}.${newsKontext}\n\nWARUM: Erkläre in 2-3 Sätzen warum sich ${asset} gerade so bewegt.\n\nAUSBLICK: Erkläre in 2-3 Sätzen was als nächstes passieren könnte.\n\nKeine Anlageberatung.`;
  }

  const body = JSON.stringify({
    model: 'llama-3.1-8b-instant',
    max_tokens: 600,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });

  try {
    const text = await new Promise((resolve, reject) => {
      const r = https.request({
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(body)
        }
      }, (resp) => {
        let d = '';
        resp.on('data', c => d += c);
        resp.on('end', () => {
          try {
            const p = JSON.parse(d);
            if (p.error) return reject(new Error(p.error.message));
            resolve(p.choices?.[0]?.message?.content || 'Keine Antwort.');
          } catch(e) { reject(e); }
        });
      });
      r.on('error', reject);
      r.write(body);
      r.end();
    });

    if (!frage) {
      const warumMatch = text.match(/WARUM[:\s]*([\s\S]*?)(?=AUSBLICK|$)/i);
      const ausblickMatch = text.match(/AUSBLICK[:\s]*([\s\S]*?)$/i);
      return res.status(200).json({
        warum: warumMatch ? warumMatch[1].trim() : text,
        ausblick: ausblickMatch ? ausblickMatch[1].trim() : '',
        typ: 'auto'
      });
    }
    return res.status(200).json({ antwort: text, typ: 'frage' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
