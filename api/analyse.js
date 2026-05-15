const https = require(‘https’);

const RANGE_CONTEXT = {
‘1T’: { label: ‘Heute’, focus: ‘Analysiere die heutige Kursbewegung und tagesaktuelle Ereignisse.’ },
‘1W’: { label: ‘Diese Woche’, focus: ‘Analysiere die Entwicklung der letzten 7 Tage.’ },
‘1M’: { label: ‘Letzter Monat’, focus: ‘Analysiere die monatliche Entwicklung und mittelfristige Faktoren.’ },
‘6M’: { label: ‘Letzte 6 Monate’, focus: ‘Analysiere mittelfristige Trends und wirtschaftliche Entwicklungen.’ },
‘1J’: { label: ‘Letztes Jahr’, focus: ‘Analysiere die Jahresentwicklung und makroökonomische Faktoren.’ },
‘5J’: { label: ‘Letzte 5 Jahre’, focus: ‘Analysiere langfristige strukturelle Veränderungen und Marktzyklen.’ },
};

const LEVEL_CONTEXT = {
‘beginner’: ‘Erkläre in sehr einfacher Sprache ohne Fachjargon. Erkläre jeden Fachbegriff sofort.’,
‘intermediate’: ‘Verwende Finanzfachbegriffe und gehe auf technische und fundamentale Faktoren ein.’,
‘expert’: ‘Verwende professionelle Finanzsprache. Gehe auf Makroökonomie und Marktstruktur ein.’,
};

const FACT_RULES = `STRIKTE REGELN:

- Kryptowährungen sind KEINE sicheren Hafen - sie sind hochspekulative volatile Assets
- Sichere Hafen sind: Gold, Schweizer Franken, US-Staatsanleihen
- Keine konkreten Kursprognosen oder Preisziele
- Sage nicht kaufen oder verkaufen
- Keine Sterne oder Markdown-Formatierung in der Antwort`;

module.exports = async function handler(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
if (req.method !== ‘POST’) return res.status(405).end();

var body = req.body;
var asset = body.asset || ‘’;
var price = body.price || ‘’;
var changePct = body.changePct || 0;
var isPos = body.isPos !== undefined ? body.isPos : true;
var frage = body.frage || ‘’;
var news = body.news || [];
var range = body.range || ‘1T’;
var level = body.level || ‘beginner’;

var apiKey = process.env.GROQ_API_KEY;
var ctx = RANGE_CONTEXT[range] || RANGE_CONTEXT[‘1T’];
var levelInstruction = LEVEL_CONTEXT[level] || LEVEL_CONTEXT[‘beginner’];

var richtung = isPos
? ‘gestiegen (+’ + Math.abs(changePct).toFixed(2) + ‘%)’
: ‘gefallen (-’ + Math.abs(changePct).toFixed(2) + ‘%)’;

var newsText = ‘’;
if (news && news.length > 0) {
newsText = ‘\n\nAktuelle News:\n’ + news.slice(0, 4).map(function(n) {
return ‘- [’ + (n.sentiment === ‘bullish’ ? ‘Positiv’ : ‘Negativ’) + ‘] ’ + n.title;
}).join(’\n’);
}

var systemPrompt, userPrompt;

if (frage) {
systemPrompt = ‘Du bist Finanzblick, ein seriöser Finanzerklärer für Privatanleger in Deutschland und Österreich. ’ + levelInstruction + ’ Antworte auf Deutsch. ’ + FACT_RULES + ’ Keine Anlageberatung.’;
userPrompt = asset + ’ steht bei ’ + price + ’ und ist ’ + richtung + ‘.’ + newsText + ‘\n\nFrage: “’ + frage + ‘”\n\nMax. 3 Absätze auf Deutsch.’;
} else {
systemPrompt = ‘Du bist Finanzblick, ein seriöser Finanzerklärer. ’ + levelInstruction + ’ Antworte auf Deutsch mit MARKTLAGE und AUSBLICK. ’ + FACT_RULES + ’ Keine Anlageberatung.’;
userPrompt = asset + ’ steht bei ’ + price + ’ und ist im Zeitraum “’ + ctx.label + ’” ’ + richtung + ’. ’ + ctx.focus + newsText + ‘\n\nMARKTLAGE: 2-3 Sätze warum.\n\nAUSBLICK: 2-3 Sätze was als nächstes.’;
}

var reqBody = JSON.stringify({
model: ‘llama-3.1-8b-instant’,
max_tokens: 600,
temperature: 0.3,
messages: [
{ role: ‘system’, content: systemPrompt },
{ role: ‘user’, content: userPrompt }
]
});

try {
var text = await new Promise(function(resolve, reject) {
var r = https.request({
hostname: ‘api.groq.com’,
path: ‘/openai/v1/chat/completions’,
method: ‘POST’,
headers: {
‘Content-Type’: ‘application/json’,
‘Authorization’: ’Bearer ’ + apiKey,
‘Content-Length’: Buffer.byteLength(reqBody)
}
}, function(resp) {
var d = ‘’;
resp.on(‘data’, function(c) { d += c; });
resp.on(‘end’, function() {
try {
var p = JSON.parse(d);
if (p.error) return reject(new Error(p.error.message));
resolve(p.choices && p.choices[0] && p.choices[0].message && p.choices[0].message.content || ‘Keine Antwort.’);
} catch(e) { reject(e); }
});
});
r.on(‘error’, reject);
r.write(reqBody);
r.end();
});

```
var clean = text.replace(/\*\*/g, '').replace(/\*/g, '').trim();

if (!frage) {
  var marktMatch = clean.match(/MARKTLAGE[:\s]*([\s\S]*?)(?=AUSBLICK|$)/i);
  var ausblickMatch = clean.match(/AUSBLICK[:\s]*([\s\S]*?)$/i);
  return res.status(200).json({
    warum: marktMatch ? marktMatch[1].trim() : clean,
    ausblick: ausblickMatch ? ausblickMatch[1].trim() : '',
    range: range,
    typ: 'auto'
  });
}

return res.status(200).json({ antwort: clean, typ: 'frage' });
```

} catch(e) {
return res.status(500).json({ error: e.message });
}
};
