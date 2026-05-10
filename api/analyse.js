// api/analyse.js
// KI-Analyse mit echtem Marktkontext — API-Key bleibt geheim auf Vercel

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { asset, price, changePct, isPos, frage } = req.body;
  if (!asset) return res.status(400).json({ error: 'Kein Asset' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API-Key nicht konfiguriert' });

  const richtung = isPos ? `gestiegen (+${Math.abs(changePct).toFixed(2)}%)` : `gefallen (${changePct.toFixed(2)}%)`;

  const prompt = frage
    ? `${asset} steht aktuell bei ${price} und ist heute ${richtung}. 
       Der Nutzer fragt: "${frage}"
       Beantworte das einfach und verständlich auf Deutsch für Börsen-Einsteiger. Max. 3 Absätze.`
    : `${asset} steht aktuell bei ${price} und ist heute ${richtung}.
       Erkläre auf einfachem Deutsch für Privatanleger-Einsteiger:
       1. Warum könnte sich ${asset} gerade so bewegen? (mögliche Gründe, allgemein)
       2. Was sollten Einsteiger jetzt wissen oder beachten?
       Max. 3 kurze Absätze. Keine Anlageberatung — nur Information und Bildung.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: 'Du bist Finanzblick, ein freundlicher Finanzerklärer für Privatanleger in Österreich und Deutschland. Antworte immer auf Deutsch, einfach, klar, ohne unnötigen Fachjargon. Erkläre Fachbegriffe kurz wenn du sie verwendest. Gib keine konkrete Anlageberatung — formuliere immer als allgemeine Information und Bildung.',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.content?.map(c => c.text || '').join('') || 'Keine Antwort erhalten.';
    res.status(200).json({ antwort: text });

  } catch (e) {
    res.status(500).json({ error: 'KI nicht erreichbar', details: e.message });
  }
}
