const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { asset, price, changePct, isPos, frage, news } = req.body;
  const apiKey = process.env.GROQ_API_KEY;

  const richtung = isPos
    ? `gestiegen (+${Math.abs(changePct).toFixed(2)}%)`
    : `gefallen (-${Math.abs(changePct).toFixed(2)}%)`;

  // News als Kontext für die KI
  const newsKontext = news && news.length > 0
    ? `\n\nAktuelle News zu ${asset}:\n` + news.map(n => `- ${n.title}`).join('\n')
    : '';

  let systemPrompt, userPrompt;

  if (frage) {
    // Nutzer stellt eigene Frage
    systemPrompt = 'Du bist Finanzblick, ein freundlicher Finanzerklärer für Privatanleger in Österreich und Deutschland. Antworte immer auf Deutsch, einfach und klar. Keine Anlageberatung.';
    userPrompt = `${asset} steht bei ${price} und ist heute ${richtung}.${newsKontext}\n\nFrage des Nutzers: "${frage}"\n\nBeantworte die Frage einfach auf Deutsch für Einsteiger. Max. 3 Absätze.`;
  } else {
    // Automatische Analyse beim Asset öffnen
    systemPrompt = 'Du bist Finanzblick, ein freundlicher Finanzerklärer für Privatanleger in Österreich und Deutschland. Antworte immer auf Deutsch, einfach und klar. Keine Anlageberatung. Strukturiere deine Antwort immer exakt in drei Abschnitte mit diesen Überschriften: WARUM, AUSBLICK';
    userPrompt = `${asset} steht bei ${price} und ist heute ${richtung}.${newsKontext}\n\nErstelle eine kurze Analyse auf Deutsch für Börsen-Einsteiger:\n\nWARUM: Erkläre in 2-3 Sätzen warum sich ${asset} gerade so bewegt. Beziehe die aktuellen News ein falls vorhanden.\n\nAUSBLICK: Erkläre in 2-3 Sätzen was als nächstes passieren könnte und worauf Anleger achten sollten.\n\nKeine Anlageberatung — nur Bildung und Information.`;
  }

  const body = JSON.stringify({
    model: 'llama-3.1-8b-instant',
    max_tokens: 600,
    messages: [
      { role: 'system', content: systemPrompt },
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

    // Antwort aufteilen in WARUM und AUSBLICK
    if (!frage) {
      const warumMatch = text.match(/WARUM[:\s]*([\s\S]*?)(?=AUSBLICK|$)/i);
      const ausblickMatch = text.match(/AUSBLICK[:\s]*([\s\S]*?)$/i);
      return res.status(200).json({
        warum: warumMatch ? warumMatch[1].trim() : text,
        ausblick: ausblickMatch ? ausblickMatch[1].trim() : '',
        typ: 'auto'
      });
    }

    res.status(200).json({ antwort: text, typ: 'frage' });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
