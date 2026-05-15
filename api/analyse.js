import https from ‘https’;

const RANGE_CONTEXT = {
‘1T’: { label: ‘Heute’, focus: ‘Analysiere die heutige Kursbewegung und tagesaktuelle Ereignisse. Fokus auf intraday-Bewegungen.’ },
‘1W’: { label: ‘Diese Woche’, focus: ‘Analysiere die Entwicklung der letzten 7 Tage und wöchentliche Trends.’ },
‘1M’: { label: ‘Letzter Monat’, focus: ‘Analysiere die monatliche Entwicklung, Quartalszahlen und mittelfristige Faktoren.’ },
‘6M’: { label: ‘Letzte 6 Monate’, focus: ‘Analysiere mittelfristige Trends, Zinsentscheidungen und wirtschaftliche Entwicklungen.’ },
‘1J’: { label: ‘Letztes Jahr’, focus: ‘Analysiere die Jahresentwicklung, makroökonomische Faktoren und regulatorische Änderungen.’ },
‘5J’: { label: ‘Letzte 5 Jahre’, focus: ‘Analysiere langfristige strukturelle Veränderungen, Marktzyklen und Wachstumstreiber.’ },
};

const LEVEL_CONTEXT = {
‘beginner’: {
label: ‘Einsteiger’,
instruction: ‘Erkläre alles in sehr einfacher Sprache ohne Fachjargon. Erkläre jeden Fachbegriff sofort wenn du ihn verwendest. Kurze, klare Sätze. Vermeide komplexe Zusammenhänge.’,
},
‘intermediate’: {
label: ‘Fortgeschritten’,
instruction: ‘Verwende Finanzfachbegriffe aber erkläre komplexere Konzepte kurz. Gehe auf technische und fundamentale Faktoren ein.’,
},
‘expert’: {
label: ‘Erfahrener Investor’,
instruction: ‘Verwende professionelle Finanzsprache. Gehe auf technische Analyse, Makroökonomie und Marktstruktur ein. Keine vereinfachenden Erklärungen nötig.’,
},
};

// Strikte Finanz-Fakten Regeln
const FACT_RULES = `
WICHTIGE REGELN — halte dich strikt daran:

- Kryptowährungen (Bitcoin, Ethereum etc.) sind KEINE sicheren Häfen — sie sind hochspekulative, volatile Assets
- Sichere Häfen sind: Gold, Schweizer Franken (CHF), US-Staatsanleihen, japanischer Yen
- Mache KEINE konkreten Kursprognosen oder Preisziele
- Sage NICHT “kaufen” oder “verkaufen” — das ist Anlageberatung
- Beschreibe nur was passiert ist und mögliche Faktoren — keine Garantien
- Wenn du dir bei einem Fakt nicht sicher bist, lass ihn weg
- Keine Aussagen wie “sicherer Hafen” für Aktien oder Krypto
  `;

export default async function handler(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
if(req.method !== ‘POST’) return res.status(405).end();

const { asset, price, changePct, isPos, frage, news, range, level } = req.body;
const apiKey = process.env.GROQ_API_KEY;

const ctx = RANGE_CONTEXT[range] || RANGE_CONTEXT[‘1T’];
const lvl = LEVEL_CONTEXT[level] || LEVEL_CONTEXT[‘beginner’];

const richtung = isPos
? `gestiegen (+${Math.abs(changePct || 0).toFixed(2)}%)`
: `gefallen (-${Math.abs(changePct || 0).toFixed(2)}%)`;

const newsKontext = news && news.length > 0
? ‘\n\nAktuelle relevante News:\n’ + news.slice(0, 4).map(n =>
`- [${n.sentiment === 'bullish' ? '↑ Bullisch' : '↓ Bärisch'}] ${n.title}`
).join(’\n’)
: ‘’;

let systemPrompt, userPrompt;

if(frage) {
systemPrompt = `Du bist Finanzblick, ein seriöser und präziser Finanzerklärer für Privatanleger in Österreich und Deutschland. Nutzerlevel: ${lvl.label}. ${lvl.instruction} Antworte immer auf Deutsch. ${FACT_RULES} Keine Anlageberatung — nur faktenbasierte Information und Bildung.`;

```
userPrompt = `${asset} steht bei ${price} und ist im Zeitraum "${ctx.label}" ${richtung}.${newsKontext}
```

Nutzerfrage: “${frage}”

Beantworte die Frage sachlich und faktenbasiert im Kontext des Zeitraums “${ctx.label}”. Max. 3 Absätze.`;

} else {
systemPrompt = `Du bist Finanzblick, ein seriöser und präziser Finanzerklärer für Privatanleger in Österreich und Deutschland. Nutzerlevel: ${lvl.label}. ${lvl.instruction} Antworte immer auf Deutsch. Strukturiere deine Antwort EXAKT mit: MARKTLAGE und AUSBLICK ${FACT_RULES} Keine Anlageberatung — nur faktenbasierte Information und Bildung.`;

```
userPrompt = `${asset} steht bei ${price} und ist im Zeitraum "${ctx.label}" ${richtung}.
```

${ctx.focus}${newsKontext}

MARKTLAGE: Erkläre sachlich und faktenbasiert in 2-3 Sätzen warum sich ${asset} im Zeitraum “${ctx.label}” so entwickelt hat.

AUSBLICK: Erkläre in 2-3 Sätzen welche Faktoren die weitere Entwicklung beeinflussen könnten — ohne konkrete Kursprognosen.`;
}

const body = JSON.stringify({
model: ‘llama-3.1-8b-instant’,
max_tokens: 700,
temperature: 0.3,
messages: [
{ role: ‘system’, content: systemPrompt },
{ role: ‘user’, content: userPrompt }
]
});

try {
const text = await new Promise((resolve, reject) => {
const r = https.request({
hostname: ‘api.groq.com’,
path: ‘/openai/v1/chat/completions’,
method: ‘POST’,
headers: {
‘Content-Type’: ‘application/json’,
‘Authorization’: `Bearer ${apiKey}`,
‘Content-Length’: Buffer.byteLength(body)
}
}, resp => {
let d = ‘’;
resp.on(‘data’, c => d += c);
resp.on(‘end’, () => {
try {
const p = JSON.parse(d);
if(p.error) return reject(new Error(p.error.message));
resolve(p.choices?.[0]?.message?.content || ‘Keine Antwort.’);
} catch(e) { reject(e); }
});
});
r.on(‘error’, reject);
r.write(body);
r.end();
});

```
// ** Sterne entfernen die Groq manchmal hinzufügt
const clean = text.replace(/\*\*/g, '').replace(/\*/g, '').trim();

if(!frage) {
  const marktMatch = clean.match(/MARKTLAGE[:\s]*([\s\S]*?)(?=AUSBLICK|$)/i);
  const ausblickMatch = clean.match(/AUSBLICK[:\s]*([\s\S]*?)$/i);
  return res.status(200).json({
    warum: marktMatch ? marktMatch[1].trim() : clean,
    ausblick: ausblickMatch ? ausblickMatch[1].trim() : '',
    range: range || '1T',
    rangeLabel: ctx.label,
    typ: 'auto'
  });
}

return res.status(200).json({ antwort: clean, typ: 'frage' });
```

} catch(e) {
return res.status(500).json({ error: e.message });
}
}
