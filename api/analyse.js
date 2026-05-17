const https = require('https');

const RANGE_CONTEXT = {
  '1T': { label: 'Heute', focus: 'Fokussiere auf die heutige Kursbewegung, tagesaktuelle Nachrichten und kurzfristige Markttreiber.' },
  '1W': { label: 'Diese Woche', focus: 'Analysiere die Wochenentwicklung, wichtige Ereignisse der letzten 7 Tage und kurzfristige Trends.' },
  '1M': { label: 'Letzter Monat', focus: 'Betrachte die monatliche Entwicklung, Quartalszahlen, Zinsentscheidungen und mittelfristige Faktoren.' },
  '6M': { label: 'Letzte 6 Monate', focus: 'Analysiere das Halbjahr: Zinsentwicklung, makroökonomische Trends, Sektorrotation und wichtige Ereignisse.' },
  '1J': { label: 'Letztes Jahr', focus: 'Betrachte die Jahresentwicklung: Makroökonomie, Regulierung, strukturelle Veränderungen und Jahres-Highlights.' },
  '5J': { label: 'Letzte 5 Jahre', focus: 'Langfristperspektive: Strukturwandel, Technologiezyklen, Marktzyklen, COVID-Erholung, KI-Revolution und langfristige Treiber.' },
};

const LEVEL_PROMPTS = {
  beginner: 'Schreibe für absolute Einsteiger ohne Finanzwissen. Vermeide Fachbegriffe komplett oder erkläre sie sofort in Klammern. Kurze, einfache Sätze. Beispiele aus dem Alltag wenn möglich.',
  intermediate: 'Schreibe für Investoren mit Grundwissen. Verwende Fachbegriffe wie KGV, Volatilität, Zinsen — aber erkläre komplexere Zusammenhänge kurz. Technische und fundamentale Perspektive.',
  expert: 'Schreibe für erfahrene Investoren und Trader. Professionelle Finanzsprache, makroökonomische Analyse, technische Faktoren, institutionelle Perspektive. Keine vereinfachenden Erklärungen nötig.',
};

const RULES = `
STRIKTE INHALTLICHE REGELN — niemals verletzen:
1. Kryptowährungen (BTC, ETH etc.) sind HOCHSPEKULATIVE, VOLATILE ASSETS — NIEMALS als sicherer Hafen bezeichnen
2. Sichere Häfen sind NUR: Gold, Schweizer Franken (CHF), US-Staatsanleihen, japanischer Yen
3. KEINE konkreten Kursziele oder Preisprognosen nennen
4. NICHT sagen: kaufen, verkaufen, investieren, einsteigen — das ist Anlageberatung
5. KEINE Sterne (**), Rauten (#) oder Markdown-Formatierung — nur reiner Text
6. Keine übertriebenen Aussagen wie "sicher steigen", "garantiert" oder "wird definitiv"
7. Immer sachlich und faktenbasiert bleiben
`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { asset, price, changePct, isPos, frage, news, range, level } = req.body || {};
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'API Key fehlt' });

  const ctx = RANGE_CONTEXT[range] || RANGE_CONTEXT['1T'];
  const levelPrompt = LEVEL_PROMPTS[level] || LEVEL_PROMPTS['beginner'];
  const richtung = isPos
    ? `um +${Math.abs(changePct || 0).toFixed(2)}% gestiegen`
    : `um -${Math.abs(changePct || 0).toFixed(2)}% gefallen`;

  // News nach Impact filtern — wichtige News immer erklären
  const rangeNewsCount = {'1T':4,'1W':3,'1M':3,'6M':2,'1J':2,'5J':1}[range] || 3;
  const filteredNews = news ? news
    .filter(n => {
      if(['1J','5J'].includes(range)) return n.impactLevel === 'high';
      if(['1M','6M'].includes(range)) return n.impactLevel === 'high' || n.impactLevel === 'medium';
      return true;
    })
    .slice(0, rangeNewsCount) : [];

  const newsBlock = filteredNews.length > 0
    ? '\n\nAktuelle Nachrichten (relevant für Zeitraum "' + ctx.label + '"):\n' + filteredNews.map(n =>
        '- [' + (n.sentiment === 'bullish' ? 'Positiv' : n.sentiment === 'bearish' ? 'Negativ' : 'Neutral') +
        (n.impactLevel === 'high' ? ' — WICHTIG' : '') +
        '] ' + n.title + ' (' + (n.source || '') + ')'
      ).join('\n')
    : '';

  let system, user;

  if (frage) {
    system = `Du bist Finanzblick — ein sachlicher, präziser Finanzerklärer für Privatanleger in Deutschland und Österreich.
${levelPrompt}
${RULES}
Beantworte Fragen ausschließlich informativ und bildend. Keine Anlageberatung.`;

    user = `Kontext: ${asset} steht bei ${price} und ist im Zeitraum "${ctx.label}" ${richtung}.${newsBlock}

Nutzerfrage: "${frage}"

Beantworte sachlich und faktenbasiert im Kontext des Zeitraums "${ctx.label}". Maximal 3 Absätze.`;

  } else {
    system = `Du bist Finanzblick — ein sachlicher, präziser Finanzerklärer für Privatanleger in Deutschland und Österreich.
${levelPrompt}
${RULES}
Strukturiere deine Antwort EXAKT mit den zwei Überschriften: MARKTLAGE und AUSBLICK
Keine Anlageberatung — nur faktenbasierte Analyse und Bildung.`;

    user = `${asset} steht bei ${price} und ist im Zeitraum "${ctx.label}" ${richtung}.
${ctx.focus}${newsBlock}

MARKTLAGE: Erkläre sachlich in 2-3 Sätzen warum sich ${asset} im Zeitraum "${ctx.label}" so entwickelt hat. Beziehe verfügbare Nachrichten ein.

AUSBLICK: Nenne in 2-3 Sätzen die wichtigsten Faktoren die die weitere Entwicklung beeinflussen könnten — ohne Kursprognosen oder Empfehlungen.`;
  }

  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 600,
    temperature: 0.25,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  });

  async function callGroq(model, systemPrompt, userPrompt) {
    const b = JSON.stringify({
      model: model,
      max_tokens: 600,
      temperature: 0.25,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });
    return new Promise(function(resolve, reject) {
      const r = https.request({
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
          'Content-Length': Buffer.byteLength(b)
        }
      }, function(resp) {
        let d = '';
        resp.on('data', function(c) { d += c; });
        resp.on('end', function() {
          try {
            const p = JSON.parse(d);
            // Rate limit oder Kapazitätsgrenze erreicht
            if (p.error) {
              const errMsg = p.error.message || JSON.stringify(p.error);
              if (errMsg.includes('rate_limit') || errMsg.includes('capacity') || errMsg.includes('quota') || resp.statusCode === 429) {
                return reject(new Error('rate_limit'));
              }
              return reject(new Error(errMsg));
            }
            resolve((p.choices && p.choices[0] && p.choices[0].message && p.choices[0].message.content) || '');
          } catch(e) { reject(new Error('Parse error: ' + d.slice(0, 100))); }
        });
      });
      r.on('error', reject);
      r.setTimeout(15000, function() { r.destroy(); reject(new Error('Timeout')); });
      r.write(b);
      r.end();
    });
  }

  try {
    // Primär: llama-3.3-70b (beste Qualität)
    // Fallback: llama-3.1-8b (bei Rate Limit)
    let raw;
    try {
      raw = await callGroq('llama-3.3-70b-versatile', system, user);
    } catch(e) {
      if (e.message === 'rate_limit') {
        // Automatisch auf kleineres Modell wechseln
        raw = await callGroq('llama-3.1-8b-instant', system, user);
      } else {
        throw e;
      }
    }

    // Markdown und Sterne bereinigen
    const clean = raw
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (frage) {
      return res.status(200).json({ antwort: clean, typ: 'frage' });
    }

    const mMatch = clean.match(/MARKTLAGE[:\s]*([\s\S]*?)(?=AUSBLICK|$)/i);
    const aMatch = clean.match(/AUSBLICK[:\s]*([\s\S]*?)$/i);

    return res.status(200).json({
      warum: mMatch ? mMatch[1].trim() : clean,
      ausblick: aMatch ? aMatch[1].trim() : '',
      range: range || '1T',
      typ: 'auto'
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
