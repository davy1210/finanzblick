// api/analyse.js
// KI-Analyse mit Google Gemini — kostenlos, kein Guthaben nötig

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { asset, price, changePct, isPos, frage } = req.body;
  if (!asset) return res.status(400).json({ error: 'Kein Asset' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API-Key nicht konfiguriert' });

  const richtung = isPos
    ? `gestiegen (+${Math.abs(changePct).toFixed(2)}%)`
    : `gefallen (${Math.abs(changePct).toFixed(2)}%)`;

  const prompt = frage
    ? `${asset} steht aktuell bei ${price} und ist heute ${richtung}. Der Nutzer fragt: "${frage}". Beantworte das einfach und verständlich auf Deutsch für Börsen-Einsteiger. Max. 3 Absätze. Keine Anlageberatung — nur Information.`
    : `${asset} steht aktuell bei ${price} und ist heute ${richtung}. Erkläre auf einfachem Deutsch für Privatanleger-Einsteiger: 1. Warum könnte sich ${asset} gerade so bewegen? 2. Was sollten Einsteiger jetzt wissen? Max. 3 kurze Absätze. Keine Anlageberatung — nur Bildung und Information.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: 'Du bist Finanzblick, ein freundlicher Finanzerklärer für Privatanleger in Österreich und Deutschland. Antworte immer auf Deutsch, einfach und klar. Erkläre Fachbegriffe kurz. Gib keine konkrete Anlageberatung — formuliere immer als allgemeine Information und Bildung.' }]
          },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 800, temperature: 0.7 }
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Keine Antwort erhalten.';
    res.status(200).json({ antwort: text });

  } catch (e) {
    res.status(500).json({ error: 'KI nicht erreichbar', details: e.message });
  }
}
