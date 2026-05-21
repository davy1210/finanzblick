const https = require('https');

const RANGE_CONTEXT = {
  '1T': { label: 'Heute', timeframe: 'kurzfristig', focus: 'Intraday-Bewegungen, heutige Ereignisse und kurzfristige Katalysatoren.' },
  '1W': { label: 'Diese Woche', timeframe: 'kurzfristig', focus: 'Wochenverlauf, wichtige Ereignisse der letzten 7 Tage.' },
  '1M': { label: 'Letzter Monat', timeframe: 'mittelfristig', focus: 'Monatliche Entwicklung, Quartalszahlen, Zinsentscheidungen, Analystenratings.' },
  '6M': { label: 'Letzte 6 Monate', timeframe: 'mittelfristig', focus: 'Halbjahres-Trend, Makroökonomie, Sektorrotation, Unternehmenstransformationen.' },
  '1J': { label: 'Letztes Jahr', timeframe: 'langfristig', focus: 'Jahresentwicklung, strukturelle Faktoren, Wettbewerbsposition, regulatorische Änderungen.' },
  '5J': { label: 'Letzte 5 Jahre', timeframe: 'langfristig', focus: 'Mehrjährige Marktzyklen, technologische Disruption, makroökonomische Zyklen, Paradigmenwechsel.' },
};

const LEVEL_PROMPTS = {
  beginner: 'Schreibe für Einsteiger ohne Finanzwissen. Erkläre jeden Fachbegriff sofort in einfachen Worten (z.B. KGV = wie teuer die Aktie im Verhältnis zum Gewinn ist). Kurze, direkte Sätze. Vermeide Abkürzungen ohne Erklärung.',
  intermediate: 'Schreibe für Investoren mit Grundwissen. Fachbegriffe sind ok, erkläre komplexe Zusammenhänge kurz. Nenne konkrete Zahlen und Vergleichswerte.',
  expert: 'Professionelle Finanzsprache. Makroökonomische Analyse, technische und fundamentale Faktoren, institutionelle Perspektive. Quantitative Argumente bevorzugen.',
};

const MACRO_FALLBACK = `Aktueller Makro-Kontext (Mai 2026):
- Fed Leitzins: ~4.25-4.50% (restriktiv)
- EZB Leitzins: ~2.65% (Zinssenkungszyklus)
- US Inflation (CPI): ~2.4% (nahe Ziel)
- Globale Themen: KI-Superzyklus (Nvidia dominiert), Handelsspannungen USA-China, Energiewende`;

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Finanzblick-Internal/1.0' },
      timeout: 3000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('t')); });
  });
}

async function getLiveMacro() {
  try {
    const m = await fetchJSON('https://finanzblick.vercel.app/api/macro');
    if (!m || !m.fedRate) return MACRO_FALLBACK;
    return `Makro-Kontext (Live):
- Fed Leitzins: ${m.fedRate}% ${m.fedRate > 4 ? '(restriktiv)' : m.fedRate > 2 ? '(neutral)' : '(expansiv)'}
- EZB Leitzins: ${m.ecbRate !== null ? m.ecbRate + '%' : 'k.A.'}
- US Inflation (CPI): ${m.cpiYoy !== null ? m.cpiYoy + '% YoY' : 'k.A.'} ${m.cpiYoy > 3 ? '(über Ziel)' : m.cpiYoy < 2 ? '(unter Ziel)' : '(nahe Ziel)'}
- US Arbeitslosigkeit: ${m.unemployment !== null ? m.unemployment + '%' : 'k.A.'}
- Globale Themen: KI-Superzyklus, Handelsspannungen USA-China, Energiewende`;
  } catch(e) {
    return MACRO_FALLBACK;
  }
}

function buildFundBlock(f) {
  if (!f || Object.keys(f).length === 0) return '';
  const parts = [];
  if (f.pe) parts.push(`KGV: ${f.pe.toFixed(1)}${f.pe > 40 ? ' (sehr hoch)' : f.pe < 12 ? ' (günstig)' : ''}`);
  if (f.forwardPE) parts.push(`Forward-KGV: ${f.forwardPE.toFixed(1)}`);
  if (f.pb) parts.push(`Kurs-Buchwert: ${f.pb.toFixed(1)}x`);
  if (f.eps) parts.push(`EPS: $${f.eps.toFixed(2)}`);
  if (f.ebitda) parts.push(`EBITDA: $${(f.ebitda/1e9).toFixed(1)}B`);
  if (f.grossMargin) parts.push(`Bruttomarge: ${f.grossMargin}%`);
  if (f.netMargin || f.profitMargin) parts.push(`Nettomarge: ${(f.netMargin || f.profitMargin)}%`);
  if (f.revenueGrowth) parts.push(`Umsatzwachstum YoY: ${f.revenueGrowth}%`);
  if (f.roe) parts.push(`ROE: ${f.roe}%`);
  if (f.beta) parts.push(`Beta: ${f.beta.toFixed(2)}`);
  if (f.weekHigh52 && f.weekLow52) parts.push(`52W-Band: $${f.weekLow52.toLocaleString()} – $${f.weekHigh52.toLocaleString()}`);
  if (f.dividendYield) parts.push(`Dividendenrendite: ${f.dividendYield}%`);
  if (f.sector) parts.push(`Sektor: ${f.sector}`);
  if (f.marketCap) parts.push(`Market Cap: $${(f.marketCap/1e9).toFixed(0)}B`);
  if (parts.length === 0) return '';
  return '\n\nFUNDAMENTALDATEN:\n' + parts.join(' | ');
}

function buildNewsBlock(news) {
  if (!news || news.length === 0) return '';
  // Priorisiere: zuerst Earnings/Events, dann High-Impact
  const sorted = [...news].sort((a, b) => {
    const isEarningsA = /earnings|quartal|revenue|eps|q[1-4]\s|beat|miss|guidance|ipo|börsengang/i.test(a.title + (a.description || ''));
    const isEarningsB = /earnings|quartal|revenue|eps|q[1-4]\s|beat|miss|guidance|ipo|börsengang/i.test(b.title + (b.description || ''));
    if (isEarningsA && !isEarningsB) return -1;
    if (!isEarningsA && isEarningsB) return 1;
    const impOrder = { high: 0, medium: 1, low: 2 };
    return (impOrder[a.impactLevel] || 2) - (impOrder[b.impactLevel] || 2);
  });
  const top = sorted.slice(0, 5);
  return '\n\nAKTUELLE NEWS (nach Relevanz):\n' + top.map(n => {
    const tag = n.sentiment === 'bullish' ? '[+]' : n.sentiment === 'bearish' ? '[-]' : '[~]';
    const impact = n.impactLevel === 'high' ? ' [WICHTIG]' : '';
    const desc = n.description && n.description.length > 20 ? ' — ' + n.description.slice(0, 120) : '';
    return `${tag}${impact} ${n.title}${desc}`;
  }).join('\n');
}

function buildEventsBlock(news) {
  if (!news || news.length === 0) return '';
  const earningsNews = news.filter(n => {
    const t = (n.title + ' ' + (n.description || '')).toLowerCase();
    return /earnings|quartal|revenue|eps|q[1-4]|beat|miss|raised guidance|lowered guidance/.test(t);
  });
  const ipoNews = news.filter(n => {
    const t = (n.title + ' ' + (n.description || '')).toLowerCase();
    return /\bipo\b|börsengang|going public|s-1|direct listing/.test(t);
  });
  const acquiNews = news.filter(n => {
    const t = (n.title + ' ' + (n.description || '')).toLowerCase();
    return /acquisition|merger|acquires|übernimmt|übernahme|buyout/.test(t);
  });

  let block = '';
  if (earningsNews.length > 0) {
    block += '\n\n!!! QUARTALSZAHLEN-EVENT — PRIMÄRER ANALYSEFOKUS !!!\n';
    block += earningsNews.map(n => `- ${n.title}: ${n.description || ''}`).join('\n');
    block += '\nAnweisung: Diese Quartalszahlen sind der Haupttreiber der Kursbewegung. Erkläre EPS, Umsatz, Guidance und Marktreaktion konkret.';
  }
  if (ipoNews.length > 0) {
    block += '\n\n!!! IPO/BÖRSENGANG-EVENT !!!\n';
    block += ipoNews.map(n => `- ${n.title}`).join('\n');
  }
  if (acquiNews.length > 0) {
    block += '\n\nFUSION/ÜBERNAHME-EVENT:\n';
    block += acquiNews.map(n => `- ${n.title}`).join('\n');
  }
  return block;
}

function build52wBlock(fundamentals, price) {
  if (!fundamentals?.weekHigh52 || !fundamentals?.weekLow52 || !price) return '';
  const pNum = typeof price === 'number' ? price : parseFloat(String(price).replace(/[^0-9.]/g, ''));
  if (!pNum) return '';
  const range52 = fundamentals.weekHigh52 - fundamentals.weekLow52;
  if (range52 <= 0) return '';
  const pos = Math.round(((pNum - fundamentals.weekLow52) / range52) * 100);
  const label = pos > 80 ? 'nahe Jahreshoch — möglicher Widerstand' : pos < 20 ? 'nahe Jahrestief — mögliche Unterstützung' : 'im mittleren Bereich';
  return `\n52W-Position: ${Math.max(0, Math.min(100, pos))}% vom Tief (${label})`;
}

const STRICT_RULES = `
ABSOLUT VERBOTENE FORMULIERUNGEN (Verletzung = Fehler):
- "Die Marktstimmung ist..." → VERBOTEN
- "Anleger reagieren auf..." → Erkläre warum konkret
- "könnte eventuell möglicherweise" → VERBOTEN
- "Es bleibt abzuwarten" → VERBOTEN
- Kursziele oder Kaufempfehlungen → VERBOTEN
- Markdown: **, #, - Listen → VERBOTEN

PFLICHTREGELN:
1. Wenn Quartalszahlen in den Daten: Diese MÜSSEN als primärer Treiber genannt werden
2. Wenn IPO/Börsengang: Muss erklärt werden was das für den Markt bedeutet
3. Konkrete Zahlen nennen: KGV, Marge, Wachstum, Kursveränderung
4. Makro-Zusammenhang immer herstellen: Wie beeinflusst Fed/EZB dieses spezielle Asset?
5. Krypto ist KEIN sicherer Hafen — nie so formulieren
6. Jeder Absatz muss einen konkreten Erkenntnisgewinn liefern`;

function callGroq(model, system, user, apiKey) {
  const body = JSON.stringify({
    model,
    max_tokens: 950,
    temperature: 0.15,
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
    r.setTimeout(18000, function() { this.destroy(); reject(new Error('Timeout')); });
    r.write(body);
    r.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { asset, price, changePct, isPos, frage, news, range, level, fundamentals, macro } = req.body || {};
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API Key fehlt' });

  const ctx = RANGE_CONTEXT[range] || RANGE_CONTEXT['1T'];
  const levelPrompt = LEVEL_PROMPTS[level] || LEVEL_PROMPTS['beginner'];
  const richtung = isPos
    ? `um +${Math.abs(changePct || 0).toFixed(2)}% gestiegen`
    : `um -${Math.abs(changePct || 0).toFixed(2)}% gefallen`;

  const fundBlock = buildFundBlock(fundamentals);
  const newsBlock = buildNewsBlock(news);
  const eventsBlock = buildEventsBlock(news);
  const week52Block = build52wBlock(fundamentals, price);

  const macroContext = macro && macro.fedRate
    ? `Makro-Kontext:
- Fed Leitzins: ${macro.fedRate}% ${macro.fedRate > 4 ? '(restriktiv)' : '(moderat)'}
- EZB: ${macro.ecbRate || 'k.A.'}%
- Inflation (CPI): ${macro.cpiYoy || 'k.A.'}%
- Globale Themen: KI-Superzyklus, Handelsspannungen USA-China`
    : await getLiveMacro();

  let system, user;

  if (frage) {
    system = `Du bist Finanzblick — ein präziser, sachlicher Finanzerklärer für Privatanleger in Deutschland und Österreich.
${levelPrompt}
${STRICT_RULES}
Beantworte Fragen direkt und faktenbasiert. Erkläre kausale Zusammenhänge. Keine Anlageberatung.`;

    user = `Asset: ${asset} | Kurs: ${price} | ${ctx.label}: ${richtung}${week52Block}${fundBlock}${eventsBlock}${newsBlock}

${macroContext}

Frage des Nutzers: "${frage}"

Beantworte konkret und direkt. Erkläre den Zusammenhang zwischen Faktoren und ${asset}. Nenne Zahlen. Max. 3 Absätze.`;

  } else {
    const hasEarnings = news && news.some(n =>
      /earnings|quartal|revenue|eps|q[1-4]|beat|miss/i.test(n.title + (n.description || ''))
    );
    const hasIPO = news && news.some(n => /\bipo\b|börsengang|going public/i.test(n.title));

    const focusInstruction = hasEarnings
      ? `WICHTIG: Quartalszahlen sind der primäre Treiber — analysiere EPS, Umsatz und Guidance als erstes.`
      : hasIPO
      ? `WICHTIG: IPO/Börsengang ist ein wesentliches Marktereignis — erkläre die Bedeutung für den Sektor.`
      : `Fokus: ${ctx.focus}`;

    system = `Du bist Finanzblick — ein professioneller Finanzanalyst für Privatanleger.
${levelPrompt}
${STRICT_RULES}

AUSGABEFORMAT (exakt einhalten):
MARKTLAGE: [Konkrete Analyse der Kursbewegung. Wenn Earnings/IPO vorhanden: diese ZUERST erklären. Dann Makro, Sektor, Fundamentals. Niemals "Die Marktstimmung ist positiv" oder ähnlich vage. Immer: WAS ist passiert, WARUM, welche ZAHLEN.]
AUSBLICK: [Die nächsten konkreten Katalysatoren: Ereignisse mit Datum wenn möglich, Risiken mit Auswirkung. Nicht: "Es bleibt abzuwarten". Sondern: Welche Events und Daten werden die Richtung bestimmen?]

Keine Anlageberatung. Keine Kaufempfehlungen.`;

    user = `Asset: ${asset}
Kurs: ${price} | Zeitraum "${ctx.label}": ${richtung}${week52Block}${fundBlock}${eventsBlock}${newsBlock}

${macroContext}

${focusInstruction}

Analysiere ${asset} für den Zeitraum "${ctx.label}" (${ctx.timeframe}). Stelle konkrete Kausalzusammenhänge her. Nenne Zahlen aus den Fundamentaldaten. Erkläre warum der Kurs sich so bewegt hat — nicht was er gemacht hat.`;
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
