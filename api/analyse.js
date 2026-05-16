const https = require(‘https’);

module.exports = async function handler(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
if (req.method !== ‘POST’) return res.status(405).end();

const { asset, price, changePct, isPos, frage, news, range, level } = req.body;
const apiKey = process.env.GROQ_API_KEY;

const rangeLabels = { ‘1T’:‘Heute’,‘1W’:‘Diese Woche’,‘1M’:‘Letzter Monat’,‘6M’:‘Letzte 6 Monate’,‘1J’:‘Letztes Jahr’,‘5J’:‘Letzte 5 Jahre’ };
const rangeLabel = rangeLabels[range] || ‘Heute’;

const levelText = level === ‘expert’ ? ‘Professionelle Sprache, keine Vereinfachungen.’ : level === ‘intermediate’ ? ‘Fachbegriffe verwenden, kurz erklären.’ : ‘Sehr einfache Sprache, keine Fachbegriffe.’;

const richtung = isPos ? ‘gestiegen (+’ + Math.abs(changePct||0).toFixed(2) + ‘%)’ : ‘gefallen (-’ + Math.abs(changePct||0).toFixed(2) + ‘%)’;

const newsText = news && news.length > 0 ? ‘\n\nNews:\n’ + news.slice(0,3).map(n => ‘- ’ + n.title).join(’\n’) : ‘’;

const system = ‘Du bist Finanzblick, ein sachlicher Finanzerklärer fuer Privatanleger. ’ + levelText + ’ Antworte auf Deutsch. WICHTIG: Krypto ist KEIN sicherer Hafen. Keine Sterne oder ** im Text. Keine Anlageberatung.’;

const user = frage
? asset + ’ bei ’ + price + ’, Zeitraum ’ + rangeLabel + ’, ’ + richtung + ‘.’ + newsText + ’\n\nFrage: ’ + frage + ‘\n\nMax. 3 kurze Absaetze.’
: asset + ’ bei ’ + price + ’, Zeitraum ’ + rangeLabel + ’, ’ + richtung + ‘.’ + newsText + ‘\n\nMARKTLAGE: Warum diese Entwicklung? (2-3 Saetze)\n\nAUSBLICK: Was koennte als naechstes passieren? (2-3 Saetze)’;

const body = JSON.stringify({
model: ‘llama-3.1-8b-instant’,
max_tokens: 500,
temperature: 0.3,
messages: [{ role: ‘system’, content: system }, { role: ‘user’, content: user }]
});

try {
const text = await new Promise(function(resolve, reject) {
const r = https.request({
hostname: ‘api.groq.com’,
path: ‘/openai/v1/chat/completions’,
method: ‘POST’,
headers: { ‘Content-Type’: ‘application/json’, ‘Authorization’: ’Bearer ’ + apiKey, ‘Content-Length’: Buffer.byteLength(body) }
}, function(resp) {
let d = ‘’;
resp.on(‘data’, function(c) { d += c; });
resp.on(‘end’, function() {
try {
const p = JSON.parse(d);
if (p.error) return reject(new Error(p.error.message));
resolve((p.choices && p.choices[0] && p.choices[0].message && p.choices[0].message.content) || ‘’);
} catch(e) { reject(e); }
});
});
r.on(‘error’, reject);
r.write(body);
r.end();
});

```
const clean = text.replace(/\*\*/g, '').replace(/\*/g, '').trim();

if (frage) {
  return res.status(200).json({ antwort: clean, typ: 'frage' });
}

const mMatch = clean.match(/MARKTLAGE[:\s]*([\s\S]*?)(?=AUSBLICK|$)/i);
const aMatch = clean.match(/AUSBLICK[:\s]*([\s\S]*?)$/i);
return res.status(200).json({
  warum: mMatch ? mMatch[1].trim() : clean,
  ausblick: aMatch ? aMatch[1].trim() : '',
  typ: 'auto'
});
```

} catch(e) {
return res.status(500).json({ error: e.message });
}
};
