import https from 'https';

// Zeitraum-spezifische Analyse-Kontexte
const RANGE_CONTEXT = {
  '1T': {
    label: 'Heute',
    focus: 'Erkläre was HEUTE passiert: aktuelle Kursbewegung, heutige News und kurzfristige Marktreaktionen. Fokus auf intraday-Bewegungen und tagesaktuelle Ereignisse.',
    newsCount: 3,
  },
  '1W': {
    label: 'Diese Woche',
    focus: 'Erkläre die Entwicklung der letzten 7 Tage: wöchentliche Trends, wichtige Ereignisse diese Woche, kurzfristige Marktbewegungen.',
    newsCount: 3,
  },
  '1M': {
    label: 'Letzter Monat',
    focus: 'Erkläre die Entwicklung des letzten Monats: monatliche Trends, Quartalszahlen, wichtige Ereignisse der letzten 4 Wochen, mittelfristige Faktoren.',
    newsCount: 4,
  },
  '6M': {
    label: 'Letzte 6 Monate',
    focus: 'Erkläre die Entwicklung der letzten 6 Monate: mittelfristige Trends, Zinsentscheidungen, wirtschaftliche Entwicklungen, Sektortrends.',
    newsCount: 4,
  },
  '1J': {
    label: 'Letztes Jahr',
    focus: 'Erkläre die Jahresentwicklung: wichtige Meilensteine des letzten Jahres, makroökonomische Faktoren, regulatorische Änderungen, langfristige Trends.',
    newsCount: 5,
  },
  '5J': {
    label: 'Letzte 5 Jahre',
    focus: 'Erkläre die langfristige Entwicklung über 5 Jahre: strukturelle Veränderungen, technologische Disruption, makroökonomische Zyklen, langfristige Wachstumstreiber.',
    newsCount: 5,
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if(req.method !== 'POST') return res.status(405).end();

  const { asset, price, changePct, isPos, frage, news, range } = req.body;
  const apiKey = process.env.GROQ_API_KEY;

  const ctx = RANGE_CONTEXT[range] || RANGE_CONTEXT['1T'];
  const richtung = isPos
    ? `gestiegen (+${Math.abs(changePct || 0).toFixed(2)}%)`
    : `gefallen (-${Math.abs(changePct || 0).toFixed(2)}%)`;

  const newsKontext = news && news.length > 0
    ? '\n\nAktuelle relevante News:\n' + news.slice(0, ctx.newsCount).map(n =>
        `- [${n.sentiment === 'bullish' ? '↑' : n.sentiment === 'bearish' ? '↓' : '→'}] ${n.title}`
      ).join('\n')
    : '';

  let systemPrompt, userPrompt;

  if(frage) {
    systemPrompt = `Du bist Finanzblick, ein freundlicher Finanzerklärer für Privatanleger in Österreich und Deutschland. 
Antworte immer auf Deutsch, einfach und klar verständlich für Einsteiger. 
Beziehe den Zeitraum "${ctx.label}" in deine Antwort ein.
Keine Anlageberatung — nur Information und Bildung.`;

    userPrompt = `${asset} steht bei ${price} und ist im Zeitraum "${ctx.label}" ${richtung}.${newsKontext}

Nutzerfrage: "${frage}"

Beantworte die Frage im Kontext des Zeitraums "${ctx.label}" auf Deutsch für Einsteiger. Max. 3 Absätze.`;

  } else {
    systemPrompt = `Du bist Finanzblick, ein professioneller aber verständlicher Finanzerklärer für Privatanleger. 
Antworte immer auf Deutsch, klar und strukturiert.
Strukturiere deine Antwort EXAKT mit diesen zwei Überschriften: MARKTLAGE und AUSBLICK
Keine Anlageberatung — nur Information und Bildung.`;

    userPrompt = `${asset} steht bei ${price} und ist im Zeitraum "${ctx.label}" ${richtung}.
${ctx.focus}${newsKontext}

MARKTLAGE: Erkläre in 2-3 Sätzen warum sich ${asset} im Zeitraum "${ctx.label}" so entwickelt hat. Beziehe die News ein falls vorhanden.

AUSBLICK: Erkläre in 2-3 Sätzen was als nächstes passieren könnte — passend zum Zeitraum "${ctx.label}".

Keine Anlageberatung.`;
  }

  const body = JSON.stringify({
    model: 'llama-3.1-8b-instant',
    max_tokens: 700,
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
      }, resp => {
        let d = '';
        resp.on('data', c => d += c);
        resp.on('end', () => {
          try {
            const p = JSON.parse(d);
            if(p.error) return reject(new Error(p.error.message));
            resolve(p.choices?.[0]?.message?.content || 'Keine Antwort.');
          } catch(e) { reject(e); }
        });
      });
      r.on('error', reject);
      r.write(body);
      r.end();
    });

    if(!frage) {
      const marktMatch = text.match(/MARKTLAGE[:\s]*([\s\S]*?)(?=AUSBLICK|$)/i);
      const ausblickMatch = text.match(/AUSBLICK[:\s]*([\s\S]*?)$/i);
      return res.status(200).json({
        warum: marktMatch ? marktMatch[1].trim() : text,
        ausblick: ausblickMatch ? ausblickMatch[1].trim() : '',
        range: range || '1T',
        rangeLabel: ctx.label,
        typ: 'auto'
      });
    }

    return res.status(200).json({ antwort: text, typ: 'frage' });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
