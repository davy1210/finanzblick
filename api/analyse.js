const https = require('https');

const RANGE_CONTEXT = {
  '1T': { label: 'Heute', timeframe: 'kurzfristig', focus: 'Tageshandel, intraday Bewegungen, heutige Nachrichten und kurzfristige Markttreiber.' },
  '1W': { label: 'Diese Woche', timeframe: 'kurzfristig', focus: 'Wochenverlauf, wichtige Ereignisse der letzten 7 Tage.' },
  '1M': { label: 'Letzter Monat', timeframe: 'mittelfristig', focus: 'Monatliche Entwicklung, Quartalszahlen, Zinsentscheidungen.' },
  '6M': { label: 'Letzte 6 Monate', timeframe: 'mittelfristig', focus: 'Halbjahres-Trend, Makroökonomie, Sektorentwicklung.' },
  '1J': { label: 'Letztes Jahr', timeframe: 'langfristig', focus: 'Jahresentwicklung, strukturelle Faktoren, regulatorische Änderungen.' },
  '5J': { label: 'Letzte 5 Jahre', timeframe: 'langfristig', focus: 'Mehrjährige Marktzyklen, technologische Disruption, makroökonomische Zyklen.' },
};

const LEVEL_PROMPTS = {
  beginner: 'Schreibe für Einsteiger ohne Finanzwissen. Erkläre jeden Fachbegriff sofort in einfachen Worten. Kurze, klare Sätze.',
  intermediate: 'Schreibe für Investoren mit Grundwissen. Fachbegriffe sind okay, erkläre komplexe Zusammenhänge kurz.',
  expert: 'Professionelle Finanzsprache. Makroökonomische Analyse, technische Faktoren, institutionelle Perspektive.',
};

const MACRO_CONTEXT = `
Aktueller Makro-Kontext (Mai 2026):
- Fed Leitzins: ~4.25-4.50% (restriktive Geldpolitik, Zinssenkungen erwartet H2 2026)
- EZB Leitzins: ~2.65% (Zinssenkungszyklus läuft seit 2024)
- US Inflation (CPI): ~2.4% (nahe Fed-Ziel von 2%)
- US Wirtschaft: Moderates Wachstum, Arbeitsmarkt stabil
- Globale Themen: KI-Revolution (Nvidia, Tech-Sektor), Handelsspannungen USA-China, Energiewende
- Marktstimmung: Vorsichtiger Optimismus, S&P 500 nahe Allzeithoch
`;

const RULES = `
STRIKTE REGELN — niemals verletzen:
1. Krypto ist KEIN sicherer Hafen — hochspekulative, volatile Assets
2. Sichere Häfen: Gold, CHF, US-Staatsanleihen, JPY
3. KEINE Kursziele oder Preisprognosen
4. NICHT sagen: kaufen, verkaufen, einsteigen
5. KEIN Markdown: keine **, keine #, keine Listen mit -
6. Keine schwammigen "könnte eventuell möglicherweise" Aussagen
7. Konkrete Faktoren nennen und deren Wirkung erklären
8. News sind NUR ein Faktor — nicht übergewichten
`;

function callGroq(model, system, user, apiKey) {
  const body = JSON.stringify({
    model,
    max_tokens: 700,
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
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
          if (p.error) {
            const msg = p.error.message || '';
            if (msg.includes('rate_limit') || msg.includes('429') || resp.statusCode === 429) {
              return reject(new Error('rate_limit'));
            }
            return reject(new Error(msg));
          }
          resolve((p.choices?.[0]?.message?.content) || '');
        } catch(e) { reject(e); }
      });
    });
    r.on('error', reject);
    r.setTimeout(15000, function() { this.destroy(); reject(new Error('Timeout')); });
    r.write(body);
    r.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { asset, price, changePct, isPos, frage, news, range, level, fundamentals } = req.body || {};
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API Key fehlt' });

  const ctx = RANGE_CONTEXT[range] || RANGE_CONTEXT['1T'];
  const levelPrompt = LEVEL_PROMPTS[level] || LEVEL_PROMPTS['beginner'];
  const richtung = isPos
    ? `um +${Math.abs(changePct || 0).toFixed(2)}% gestiegen`
    : `um -${Math.abs(changePct || 0).toFixed(2)}% gefallen`;

  // Fundamentaldaten aufbereiten
  let fundBlock = '';
  if (fundamentals && Object.keys(fundamentals).length > 0) {
    const f = fundamentals;
    const parts = [];
    if (f.pe) parts.push(`KGV: ${f.pe.toFixed(1)}`);
    if (f.forwardPE) parts.push(`Forward-KGV: ${f.forwardPE.toFixed(1)}`);
    if (f.pb) parts.push(`Kurs-Buchwert: ${f.pb.toFixed(1)}`);
    if (f.ebitda) parts.push(`EBITDA: $${(f.ebitda/1e9).toFixed(1)}B`);
    if (f.grossMargin) parts.push(`Bruttomarge: ${f.grossMargin}%`);
    if (f.profitMargin) parts.push(`Nettomarge: ${f.profitMargin}%`);
    if (f.revenueGrowth) parts.push(`Umsatzwachstum: ${f.revenueGrowth}%`);
    if (f.beta) parts.push(`Beta: ${f.beta.toFixed(2)}`);
    if (f.weekHigh52 && f.weekLow52) parts.push(`52W-Spanne: $${f.weekLow52.toLocaleString()} - $${f.weekHigh52.toLocaleString()}`);
    if (f.dividendYield) parts.push(`Dividendenrendite: ${f.dividendYield}%`);
    if (f.sector) parts.push(`Sektor: ${f.sector}`);
    if (parts.length > 0) fundBlock = '\n\nFundamentaldaten:\n' + parts.join(' | ');
  }

  // News nur als Ergänzung — nicht als Hauptquelle
  let newsBlock = '';
  if (news && news.length > 0) {
    const highImpact = news.filter(n => n.impactLevel === 'high');
    const relevant = highImpact.length > 0 ? highImpact : news.slice(0, 2);
    if (relevant.length > 0) {
      newsBlock = '\n\nAktuelle hochrelevante News (nur als Ergänzung):\n' +
        relevant.map(n => `- [${n.sentiment === 'bullish' ? '+' : '-'}] ${n.title}`).join('\n');
    }
  }

  // 52W Position berechnen
  let weekPosition = '';
  if (fundamentals?.weekHigh52 && fundamentals?.weekLow52 && price) {
    const pNum = parseFloat(price.replace(/[^0-9.]/g,''));
    if (pNum) {
      const range52 = fundamentals.weekHigh52 - fundamentals.weekLow52;
      const pos = range52 > 0 ? Math.round(((pNum - fundamentals.weekLow52) / range52) * 100) : null;
      if (pos !== null) weekPosition = `\nPosition im 52W-Band: ${pos}% (${pos > 70 ? 'nahe Jahreshoch' : pos < 30 ? 'nahe Jahrestief' : 'im Mittelfeld'})`;
    }
  }

  let system, user;

  if (frage) {
    system = `Du bist Finanzblick — ein präziser, sachlicher Finanzerklärer für Privatanleger in Deutschland und Österreich.
${levelPrompt}
${RULES}
Beantworte Fragen konkret und faktenbasiert. Erkläre Zusammenhänge. Keine Anlageberatung.`;

    user = `${asset} | Kurs: ${price} | Zeitraum "${ctx.label}": ${richtung}${weekPosition}${fundBlock}${newsBlock}

Frage: "${frage}"

Beantworte konkret und direkt. Erkläre den Zusammenhang zwischen den genannten Faktoren und ${asset}. Max. 3 Absätze.`;

  } else {
    system = `Du bist Finanzblick — ein präziser Finanzanalyst für Privatanleger.
${levelPrompt}
${MACRO_CONTEXT}
${RULES}

Strukturiere deine Antwort EXAKT so:
MARKTLAGE: [Konkrete Erklärung der Kursbewegung mit den wichtigsten Ursachen — Makro, Fundamentals, Sektor. News nur wenn wirklich relevant.]
AUSBLICK: [Die entscheidenden Faktoren die als nächstes wirken werden — konkret, keine schwammigen Aussagen.]

Keine Anlageberatung.`;

    user = `Asset: ${asset}
Kurs: ${price} | Zeitraum "${ctx.label}": ${richtung}${weekPosition}${fundBlock}${newsBlock}

Analysiere ${asset} für den Zeitraum "${ctx.label}" (${ctx.timeframe}).
Fokus: ${ctx.focus}

Erkläre die Kursbewegung konkret: Welche Makrofaktoren, Sektortrends oder Fundamentaldaten sind entscheidend? Stelle Zusammenhänge her.`;
  }

  try {
    let raw;
    try {
      raw = await callGroq('llama-3.3-70b-versatile', system, user, apiKey);
    } catch(e) {
      if (e.message === 'rate_limit') {
        raw = await callGroq('llama-3.1-8b-instant', system, user, apiKey);
      } else throw e;
    }

    const clean = raw.replace(/\*\*/g,'').replace(/\*/g,'').replace(/#{1,6}\s/g,'').replace(/\n{3,}/g,'\n\n').trim();

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
