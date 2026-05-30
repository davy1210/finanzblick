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

// Makro-Kontext wird dynamisch aus Request-Body oder Fallback gebaut
function buildMacroContext(macro) {
  if (!macro || Object.keys(macro).length === 0) {
    return `Aktueller Makro-Kontext:
- Fed Leitzins: ~4.25-4.50% (restriktive Geldpolitik)
- EZB Leitzins: ~2.65% (Zinssenkungszyklus läuft)
- US Inflation: ~2.4% (nahe Fed-Ziel von 2%)
- Globale Themen: KI-Revolution, Handelsspannungen USA-China, Energiewende`;
  }
  const parts = ['Aktueller Makro-Kontext (Live-Daten):'];
  if (macro.fedRate !== null && macro.fedRate !== undefined) parts.push(`- Fed Leitzins: ${macro.fedRate}% (${macro.fedRate > 4 ? 'restriktiv' : macro.fedRate > 2 ? 'neutral' : 'expansiv'})`);
  if (macro.ecbRate !== null && macro.ecbRate !== undefined) parts.push(`- EZB Leitzins: ${macro.ecbRate}%`);
  if (macro.cpiYoy !== null && macro.cpiYoy !== undefined) parts.push(`- US Inflation (CPI): ${macro.cpiYoy}% YoY (${macro.cpiYoy > 3 ? 'zu hoch' : macro.cpiYoy > 2 ? 'leicht erhöht' : 'nahe Fed-Ziel'})`);
  if (macro.unemployment !== null && macro.unemployment !== undefined) parts.push(`- US Arbeitslosigkeit: ${macro.unemployment}% (${macro.unemployment < 4 ? 'Vollbeschäftigung' : 'moderat'})`);
  if (macro.gdpGrowth !== null && macro.gdpGrowth !== undefined) parts.push(`- US BIP-Wachstum: ${macro.gdpGrowth}% (annualisiert)`);
  parts.push('- Globale Themen: KI-Revolution (Nvidia/Tech), Handelsspannungen USA-China, Energiewende');
  return parts.join('\n');
}

// Makro-Kontext wird live von FRED geladen
const MACRO_FALLBACK = `
Aktueller Makro-Kontext (Mai 2026):
- Fed Leitzins: ~4.25-4.50% (restriktiv — dämpft Wirtschaft und Inflation)
- EZB Leitzins: ~2.65% (Zinssenkungszyklus läuft seit 2024)
- US Inflation (CPI): ~2.4% (nahe Fed-Ziel von 2%)
- US Wirtschaft: Moderates Wachstum, Arbeitsmarkt stabil (~4% Arbeitslosigkeit)
- Globale Themen: KI-Revolution, Handelsspannungen USA-China, Energiewende
`;

async function getLiveMacro() {
  try {
    const raw = await new Promise((resolve, reject) => {
      https.get('https://finanzblick.vercel.app/api/macro', {
        headers: { 'User-Agent': 'Finanzblick-Internal/1.0' },
        timeout: 3000
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(d));
      }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('t')); });
    });
    const m = JSON.parse(raw);
    if (!m || !m.fedRate) return MACRO_FALLBACK;
    return `
Aktueller Makro-Kontext (Live FRED-Daten):
- Fed Leitzins: ${m.fedRate}% ${m.fedRate > 4 ? '(restriktiv)' : m.fedRate > 2 ? '(neutral)' : '(expansiv)'}
- EZB Leitzins: ${m.ecbRate !== null ? m.ecbRate + '%' : 'k.A.'}
- US Inflation (CPI): ${m.cpiYoy !== null ? m.cpiYoy + '% YoY' : 'k.A.'} ${m.cpiYoy > 3 ? '(über Ziel — Zinssenkungen unwahrscheinlich)' : m.cpiYoy < 2 ? '(unter Ziel — Zinssenkungen möglich)' : '(nahe Fed-Ziel von 2%)'}
- US Arbeitslosigkeit: ${m.unemployment !== null ? m.unemployment + '%' : 'k.A.'}
- US BIP Wachstum: ${m.gdpGrowth !== null ? m.gdpGrowth + '% (annualisiert)' : 'k.A.'}
- Globale Themen: KI-Revolution (Nvidia dominiert KI-Chips), Handelsspannungen USA-China, Energiewende
`;
  } catch(e) {
    return MACRO_FALLBACK;
  }
}

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
    max_tokens: 1000,
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
    r.setTimeout(15000, function() { this.destroy(); reject(new Error('Timeout')); });
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

  // Live Makro-Daten laden
  const MACRO_CONTEXT = await getLiveMacro();

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
    // Instrument-Typ bestimmen
    const assetLower = (asset || '').toLowerCase();
    const sym = (req.body.symbol || '').toUpperCase();

    const isCrypto = assetLower.includes('bitcoin') || assetLower.includes('ethereum') ||
      assetLower.includes('crypto') || sym.includes('BTC') || sym.includes('ETH') || sym.includes('-USD');
    const isGold = assetLower.includes('gold') || assetLower.includes('xau') || sym === 'GC=F';
    const isBond = assetLower.includes('anleihe') || assetLower.includes('bond') || assetLower.includes('treasury');
    const isETF = assetLower.includes('etf') || assetLower.includes('msci') || sym.startsWith('^') || assetLower.includes('index');
    const isOil = assetLower.includes('oil') || assetLower.includes('öl') || assetLower.includes('crude') || sym.includes('CL=F') || sym.includes('BNO') || sym.includes('USO');
    const isSilver = assetLower.includes('silver') || assetLower.includes('silber') || sym.includes('SI=F') || sym.includes('SLV');
    const isCopper = assetLower.includes('copper') || assetLower.includes('kupfer') || sym.includes('HG=F');
    const isCommodity = (isOil || isSilver || isCopper || assetLower.includes('rohstoff') || assetLower.includes('commodity') || sym.includes('=F')) && !isGold;
    const hasFunds = fundamentals && (fundamentals.pe || fundamentals.beta || fundamentals.grossMargin);
    const isShort = ['1T','1W'].includes(range);
    const isMid = ['1M','6M'].includes(range);

    let sections, instructions;

    if (isCrypto) {
      const isBTC = assetLower.includes('bitcoin') || sym.includes('BTC');
      const isETH = assetLower.includes('ethereum') || sym.includes('ETH');

      if (isShort) {
        sections = 'MARKTLAGE, KURSTREIBER, MAKRO & LIQUIDITÄT, AUSBLICK';
        instructions = `MARKTLAGE: Was hat ${asset} heute/diese Woche konkret bewegt? Nenne spezifische Ereignisse — keine generellen Aussagen. Unterscheide: War es eine breite Marktbewegung oder ein kryptosspezifischer Auslöser?

KURSTREIBER: Analysiere diese kryptospezifischen Faktoren konkret — nenne nur die aktuell relevanten:
${isBTC ? `- Bitcoin ETF-Zuflüsse/-Abflüsse (BlackRock IBIT, Fidelity FBTC): Hohe Zuflüsse = institutionelle Nachfrage steigt
- Miner-Aktivität: Verkaufen Miner nach dem Halving (April 2024) oder halten sie?
- Bitcoin Dominanz: Steigt sie (Risk-Off in Krypto = Kapital in BTC) oder fällt sie (Altcoin-Season)?
- On-Chain: Bewegen sich große Mengen BTC zu Exchanges (Verkaufsdruck) oder von Exchanges weg (HODLing)?` : ''}
${isETH ? `- Ethereum Staking-Rendite: Wie viel ETH ist gestaked? Hohe Staking-Quote = weniger Angebot im Umlauf
- Layer-2 Aktivität (Arbitrum, Optimism, Base): Wächst das Netzwerk?
- DeFi Total Value Locked (TVL): Steigt oder fällt das Kapital in DeFi-Protokollen?
- Gas-Preise: Niedrige Gas = wenig Netzwerkaktivität, hohe Gas = starke Nutzung` : ''}
- Regulierungsnews: SEC-Entscheidungen, EU MiCA Umsetzung, staatliche Adoption oder Verbote
- Liquidierungen: Wurden Long- oder Short-Positionen liquidiert? Das erklärt scharfe Bewegungen

MAKRO & LIQUIDITÄT: Wie beeinflussen diese Faktoren ${asset} konkret?
- Fed-Leitzins (aktuell aus FRED-Daten): Erkläre den Mechanismus — höhere Zinsen = risikoärmere Alternativen attraktiver = Kapital verlässt Krypto
- Dollar-Stärke (DXY): Starker Dollar belastet Krypto strukturell — erkläre warum
- Nasdaq-Korrelation: ${asset} korreliert stark mit Tech-Aktien — wie entwickelt sich der Nasdaq?
- Globale Liquidität: Mehr Geld im System (QE, Zinssenkungen) = mehr Kapital in Risk Assets wie Krypto

AUSBLICK: Nenne konkret — keine allgemeinen Aussagen:
- Nächste Fed-Entscheidung und erwartete Wirkung auf ${asset}
- Anstehende regulatorische Entscheidungen (SEC, EU, nationale Behörden)
- ${isBTC ? 'Halving-Nachwirkung: Wo stehen wir im historischen Post-Halving-Zyklus (Halving war April 2024)?' : ''}
- ${isETH ? 'Nächste Ethereum-Upgrades und deren Auswirkung auf Angebot/Nachfrage' : ''}`;

      } else {
        sections = 'MARKTLAGE, KRYPTOSPEZIFISCHE TREIBER, MAKRO & LIQUIDITÄTSZYKLUS, AUSBLICK';
        instructions = `MARKTLAGE: Kursentwicklung im Zeitraum "${ctx.label}" — was waren die 2-3 wichtigsten Wendepunkte? Erkläre jeden konkret.

KRYPTOSPEZIFISCHE TREIBER: Analysiere diese Faktoren für den Zeitraum — nur relevante einbeziehen:
${isBTC ? `- Halving-Zyklus (April 2024): Historisch steigen BTC-Kurse 12-18 Monate nach dem Halving. Wo stehen wir im Zyklus? Erkläre den Mechanismus: weniger neue BTC = Angebotsschock bei gleichbleibender Nachfrage
- Bitcoin ETF-Entwicklung: Wie haben sich Zuflüsse in BlackRock IBIT, Fidelity FBTC etc. entwickelt? Institutionelle Nachfrage ist der stärkste neue strukturelle Treiber
- Bitcoin Dominanz-Entwicklung: Ist Kapital in Altcoins geflossen oder in BTC konzentriert?
- Mining-Ökonomie: Sind Miner nach dem Halving profitabel? Verkaufsdruck durch Miner?` : ''}
${isETH ? `- Ethereum nach dem Merge (Proof of Stake): Deflationäre Mechanismen — wird mehr ETH geburned als neu erstellt?
- Staking-Entwicklung: Wie viel % des ETH-Angebots ist gestaked? Reduziert das Umlaufangebot
- Layer-2 Ökosystem (Arbitrum, Base, Optimism): Wächst die Nutzung? Das erhöht ETH-Nachfrage
- DeFi & NFT Aktivität: TVL-Entwicklung als Indikator für Netzwerknutzung` : ''}
- Regulierungslandschaft: Welche regulatorischen Entwicklungen haben den Zeitraum geprägt? SEC, MiCA, nationale Gesetze
- Institutionelle Adoption: Welche großen Akteure sind neu eingestiegen oder ausgestiegen?

MAKRO & LIQUIDITÄTSZYKLUS: Der wichtigste langfristige Treiber für Krypto ist der globale Liquiditätszyklus:
- Fed-Zinszyklus (FRED-Daten): Wo befinden wir uns — Zinserhöhung, Pause, Zinssenkung? Erkläre direkte Wirkung auf Krypto
- Globale Geldmenge (M2): Expansion = mehr Kapital sucht Rendite in Risk Assets. Kontraktion = Kapital flieht in Sicherheit
- Dollar-Zyklus: Schwacher Dollar begünstigt Krypto strukturell — erkläre warum (Inflationsschutz-Narrativ, globale Liquidität)
- Korrelation mit Nasdaq: Krypto verhält sich wie gehebelte Tech-Aktien — wie entwickelt sich der Tech-Sektor?
- Institutionelle Positionierung: Sind Hedgefonds long oder short positioniert?

AUSBLICK: Konkrete Faktoren die als nächstes wirken:
- ${isBTC ? 'Historischer Post-Halving-Ausblick: Was passierte 12-24 Monate nach den Halvings 2016 und 2020?' : ''}
- ${isETH ? 'Ethereum Roadmap: Nächste Upgrades und deren Wirkung auf Angebot/Nachfrage-Dynamik' : ''}
- Fed-Zinspfad (FRED-Daten nutzen): Wann und wie stark werden Zinsen gesenkt? Direkter Krypto-Hebel
- Regulierungsausblick: Welche Entscheidungen stehen an die die Adoption fördern oder bremsen?
- Institutionelle Dynamik: Nächste große ETF-Zulassungen, Unternehmens-Adoptionen`;
      }
    } else if (isGold) {
      sections = 'MARKTLAGE, REALZINSEN & DOLLAR, GEOPOLITIK & ZENTRALBANKEN, AUSBLICK';
      instructions = `MARKTLAGE: Was hat Gold im Zeitraum "${ctx.label}" konkret bewegt? Nenne spezifische Treiber — kein allgemeines Marktkommentar.

REALZINSEN & DOLLAR: Die wichtigsten Preistreiber für Gold — erkläre immer den Mechanismus:
- Reale Zinsen (Nominalzins minus Inflation, FRED-Daten): Fallende Realzinsen = Gold steigt. Warum? Gold zahlt keine Zinsen — bei niedrigen Realzinsen ist der Verzicht auf Gold-Kauf geringer
- US-Dollar (DXY): Gold wird in Dollar gehandelt — starker Dollar = günstigeres Gold für andere Währungen = weniger Nachfrage = Preisdruck. Erkläre die inverse Beziehung
- Fed-Zinspolitik (FRED): Zinssenkungserwartungen senken Realzinsen und Dollar gleichzeitig — doppelt positiv für Gold
- Inflation (FRED CPI): Gold als Inflationsschutz — bei hoher Inflation steigt die Nachfrage nach realem Werterhalt

GEOPOLITIK & ZENTRALBANKEN: Gold als sicherer Hafen — konkrete Ereignisse:
- Geopolitische Risiken: Welche Konflikte, Spannungen, Kriege treiben aktuell die Gold-Nachfrage? Erkläre: In Krisen fließt Kapital in sichere Häfen — Gold, CHF, US-Staatsanleihen
- Zentralbankkäufe: China, Indien, Türkei, Russland kaufen systematisch Gold — Entdollarisierungstrend. Erkläre warum das strukturell bullisch für Gold ist
- Systemisches Vertrauen: Bei Vertrauensverlust in Währungen oder Finanzsystem steigt Gold — erkläre den Mechanismus

AUSBLICK: Konkrete Faktoren die als nächstes wirken:
- Fed-Zinspfad (FRED): Wann und wie stark werden Zinsen gesenkt? Direkte Wirkung auf Realzinsen und Dollar
- Geopolitische Lage: Eskalations- oder De-Eskalationsszenarien und deren Wirkung auf Gold
- Zentralbank-Käufe: Setzt sich der strukturelle Kauftrend fort?
- Inflation (FRED CPI): Bleibt Inflation hartnäckig? Das stärkt Gold als Absicherung`;
    } else if (isBond) {
      sections = 'MARKTLAGE, ZINSEN & INFLATION, AUSBLICK';
      instructions = `MARKTLAGE: Zuerst inverse Beziehung Zinsen/Anleihekurs erklären, dann Kursentwicklung.
ZINSEN & INFLATION: Fed/EZB-Entscheidungen, CPI-Entwicklung, Duration-Risiko — alle mit Mechanismus.
AUSBLICK: Zinspfad, Inflationstrend, geopolitische Risiken.`;
    } else if (isCommodity) {
      // Rohstoff-Analyse — spezifisch je nach Typ
      if (isShort) {
        sections = 'MARKTLAGE, ANGEBOT & NACHFRAGE, DOLLAR & MAKRO, AUSBLICK';
        instructions = `MARKTLAGE: Was hat ${asset} heute/diese Woche konkret bewegt? Nenne spezifische Ereignisse — kein allgemeines Marktkommentar.

ANGEBOT & NACHFRAGE: Analysiere die für ${asset} relevanten Faktoren:
${isOil ? `- OPEC+ Produktionsentscheidungen: Erhöhen oder senken sie die Förderung? Direkte Preiswirkung erklären
- US-Lagerbestände (EIA Weekly Report): Mehr Lager als erwartet = Preisdruck, weniger = Preisanstieg
- Geopolitische Lieferstörungen: Konflikte in Förderregionen (Naher Osten, Russland), Sanktionen
- Shale Oil Produktion (USA): Steigende US-Produktion begrenzt OPEC-Preismacht
- Nachfrage: China-Konjunktur ist der wichtigste globale Nachfragetreiber für Öl` : ''}
${isSilver ? `- Industrienachfrage: Silber wird zu 50%+ industriell genutzt — Solarmodule, Elektronik, Elektromobilität
- Investment-Nachfrage: Silber als günstigere Alternative zu Gold bei Risk-Off
- Gold/Silber-Ratio: Hohes Ratio = Silber historisch günstig relativ zu Gold
- Minenproduktion: Angebotsstörungen aus Mexiko, Peru (größte Produzenten)` : ''}
${isCopper ? `- China-Nachfrage: China verbraucht ~55% des globalen Kupfers — Konjunkturdaten sind entscheidend
- Energiewende-Nachfrage: Elektroautos, Windturbinen, Solaranlagen brauchen Mengen Kupfer
- Lagerbestände (LME, SHFE): Sinkende Lager = Angebotsknappheit = Preisanstieg
- Minenproduktion: Chile und Peru liefern ~40% des globalen Kupfers — Streiks, Wetter, Politik` : ''}
${!isOil && !isSilver && !isCopper ? `- Angebot: Produktionsdaten, Lagerbestände, Lieferkettenstörungen
- Nachfrage: Industrie, China-Konjunktur, saisonale Faktoren` : ''}

DOLLAR & MAKRO: Rohstoffe werden global in Dollar gehandelt:
- Dollar-Stärke (DXY): Starker Dollar = Rohstoffe für andere Währungen teurer = Nachfrage sinkt = Preisdruck
- Fed-Zinsen (FRED): Höhere Zinsen stärken Dollar → belasten Rohstoffpreise
- Globales Wachstum: Konjunktursorgen drücken Industrierohstoffe, sichern Edelmetalle

AUSBLICK: Konkret — keine Allgemeinaussagen:
${isOil ? `- Nächste OPEC+ Sitzung: Wann und welche Produktionsentscheidung wird erwartet?
- US-Ölproduktion: Steigt oder fällt die Shale-Produktion?
- China-Nachfrageausblick: Konjunktur und Ölimporte` : ''}
${isSilver ? `- Solarsektor-Wachstum: Stärkster struktureller Nachfragetreiber für Silber
- Fed-Zinspfad: Zinssenkungen = schwächerer Dollar = positiv für Silber
- Gold-Korrelation: Silber folgt oft Gold mit Hebel` : ''}
${isCopper ? `- China-Stimulus: Staatliche Konjunkturprogramme treiben Kupfernachfrage direkt
- Energiewende-Pipeline: Geplante Solar- und Windprojekte = strukturell steigende Kupfernachfrage
- Mineninvestitionen: Unterinvestition der letzten Jahre schafft mittelfristige Angebotsknappheit` : ''}`;
      } else {
        sections = 'MARKTLAGE, STRUKTURELLE TREIBER, MAKRO & DOLLARZYKLUS, AUSBLICK';
        instructions = `MARKTLAGE: Kursentwicklung im Zeitraum "${ctx.label}" — was waren die wichtigsten Wendepunkte?

STRUKTURELLE TREIBER: Langfristige Faktoren die ${asset} antreiben:
${isOil ? `- OPEC+ Strategie: Hat das Kartell Produktionsdisziplin gehalten? Russland-Sanktionen und deren Wirkung auf den Ölmarkt
- Energiewende vs. Öl-Nachfrage: Elektromobilität wächst aber Öl-Nachfrage steigt global noch — erkläre den Widerspruch
- Shale Revolution (USA): USA ist weltgrößter Ölproduzent — Kostenstruktur bestimmt Preisboden
- Geopolitische Neuordnung: Wie verändern Konflikte und Sanktionen die globalen Lieferwege langfristig?` : ''}
${isSilver ? `- Solare Revolution: Silbernachfrage durch Photovoltaik wächst jährlich um 10-15% — struktureller Megatrend
- Elektromobilität: Silber in Schaltern, Kontakten, Batteriemanagementsystemen
- Minenproduktion: Silber ist oft Beiprodukt von Kupfer-/Bleibergbau — Angebotsausweitung begrenzt
- Investment vs. Industrie: Wie verschiebt sich die Nachfrage zwischen spekulativem Kauf und industrieller Nutzung?` : ''}
${isCopper ? `- Energiewende: Ein Elektroauto benötigt 4x mehr Kupfer als ein Verbrenner. Solaranlagen, Windturbinen — strukturell steigende Nachfrage bis 2030+
- Angebotsdefizit: Neue Minen brauchen 10-15 Jahre bis zur Produktion — Unterinvestition schafft strukturelle Knappheit
- China-Industrialisierung: Urbanisierung in China und Indien treibt Kupfernachfrage langfristig
- Recycling: Steigender Recycling-Anteil kann Primärproduktion teilweise ersetzen` : ''}

MAKRO & DOLLARZYKLUS:
- Dollar-Zyklus (FRED): In Zinssenkungsphasen schwächelt der Dollar — Rohstoffe steigen strukturell. Erkläre Mechanismus
- Globales Wachstum: Ist die Weltwirtschaft in einer Expansions- oder Kontraktionsphase?
- China-Konjunktur: Entscheidend für alle Industrierohstoffe — Bausektor, Infrastruktur, Exportproduktion
- Inflation: Rohstoffe als Inflationsschutz — bei hoher Inflation steigt physische Nachfrage

AUSBLICK:
- Strukturelles Angebot/Nachfrage-Bild: Wo entwickelt sich langfristig ein Defizit oder Überschuss?
- Fed-Zinspfad (FRED): Zinssenkungen = schwächerer Dollar = strukturell positiv für Rohstoffe
- Geopolitische Neuordnung: Neue Handelsrouten, Lieferketten, Sanktionen`;
      }
    } else if (isETF) {
      // ETF-spezifische Analyse
      const isDax = sym.includes('GDAXI') || assetLower.includes('dax');
      const isSP = sym.includes('GSPC') || assetLower.includes('s&p') || assetLower.includes('sp500');
      const isMSCI = assetLower.includes('msci') || assetLower.includes('world');
      const isNasdaq = assetLower.includes('nasdaq') || sym.includes('NDX') || sym.includes('QQQ');
      const isSector = assetLower.includes('sector') || assetLower.includes('clean energy') || assetLower.includes('tech etf');

      if (isShort) {
        sections = 'MARKTLAGE, INDEX-TREIBER, MAKRO-KONTEXT, AUSBLICK';
        instructions = `MARKTLAGE: Was hat ${asset} heute/diese Woche bewegt? Konkrete Ereignisse nennen.

INDEX-TREIBER: Analysiere die spezifischen Treiber für ${asset}:
${isDax ? `- Schwergewichte im DAX: SAP (größte Gewichtung), Siemens, Allianz, BASF, BMW, Volkswagen — welche haben sich heute wie entwickelt?
- Deutsche/Europäische Konjunktur: Industriedaten, IFO-Index, PMI Deutschland — spiegelt den Exportmotor
- EUR/USD: Starker Euro belastet Export-orientierte DAX-Unternehmen direkt (BMW, BASF)
- Energiepreise: Deutschland ist energieintensiv — Gaspreise, Strompreise beeinflussen Industrieunternehmen` : ''}
${isSP ? `- Magnificent 7 (Apple, Microsoft, Nvidia, Alphabet, Amazon, Meta, Tesla): Diese 7 Aktien machen ~30% des S&P 500 aus
- Earnings-Saison: Welche großen Unternehmen haben diese Woche berichtet?
- Fed-Kommunikation: Direkte Reaktion des S&P 500 auf jede Fed-Aussage
- Sektorrotation: Welche Sektoren (Tech, Energie, Financials) gewinnen oder verlieren?` : ''}
${isNasdaq ? `- Tech-Earnings: Nvidia, Microsoft, Apple, Alphabet — diese Quartalsberichte bewegen den Nasdaq stark
- KI-Sentiment: Positive/negative KI-News treffen direkt die Tech-Schwergewichte
- Zinssensitivität: Nasdaq reagiert stärker als S&P 500 auf Zinsänderungen (höhere Bewertungen = höhere Duration)
- Risikobereitschaft: Nasdaq ist der Beta-Index — steigt und fällt stärker als der breite Markt` : ''}
${isMSCI ? `- USA-Gewichtung (~65%): US-Marktbewegungen dominieren den MSCI World
- Währungseffekte: Für EUR-Anleger ist EUR/USD entscheidend — starker Euro reduziert die USD-Rendite
- Globale Wachstumsdaten: BIP-Daten aus USA, Europa, Japan beeinflussen die jeweiligen Regionen` : ''}
${isSector ? `- Sektorspezifische Treiber: Welche Regulierung, Rohstoffpreise oder Technologieentwicklungen treffen diesen Sektor?` : ''}

MAKRO-KONTEXT: Übergeordnete Faktoren:
- Fed/EZB-Entscheidungen (FRED): Direkter Einfluss auf Aktienbewertungen
- Geopolitik: Handelskonflikte, Kriege — wie betrifft das den Index?
- Risikosentiment: Risk-On oder Risk-Off heute?

AUSBLICK: Konkrete bevorstehende Ereignisse die den Index bewegen.`;
      } else {
        sections = 'MARKTLAGE, INDEX-CHARAKTERISTIKA & TREIBER, MAKRO & BEWERTUNG, AUSBLICK';
        instructions = `MARKTLAGE: Entwicklung im Zeitraum "${ctx.label}" — wichtigste Phasen und Wendepunkte.

INDEX-CHARAKTERISTIKA & TREIBER: Was macht ${asset} einzigartig?
${isDax ? `- DAX-Struktur: 40 deutsche Unternehmen, exportorientiert, zyklisch. Stark abhängig von China (Hauptabsatzmarkt für Autos, Maschinen)
- China-Risiko: BMW, Volkswagen, BASF, BASF erzielen 20-35% des Umsatzes in China — direkter Risikofaktor
- Energiewende in Deutschland: Hohe Energiekosten belasten die Industrie strukturell
- EUR-Stärke/Schwäche: Schwacher Euro begünstigt Export-DAX — erkläre Mechanismus
- Zinspolitik der EZB: Europäische Wirtschaft reagiert stärker auf EZB als auf Fed` : ''}
${isSP ? `- Magnificent 7 Dominanz: 7 Tech-Konzerne machen ~30% des Index aus — der S&P 500 ist teilweise ein Tech-Index
- Earnings-Qualität: US-Unternehmen zeigen historisch stärkstes Gewinnwachstum global
- Dollar-Effekt: Starker Dollar belastet multinationale US-Konzerne (Übersee-Einnahmen weniger wert)
- Fed-Abhängigkeit: Bewertungen (KGV ~20x) basieren auf niedrigen Diskontierungszinsen — Zinssensitivität ist hoch` : ''}
${isNasdaq ? `- Tech-Konzentration: Top 10 Unternehmen machen ~50% des Nasdaq aus — extrem konzentriert
- KI-Revolution: Nvidia, Microsoft, Alphabet profitieren direkt — Nasdaq ist der KI-Proxy-Index
- Höhere Duration: Wachstumsaktien mit hohem KGV sind bei steigenden Zinsen besonders anfällig
- Innovation Premium: Nasdaq handelt mit Bewertungsaufschlag wegen Wachstumserwartungen` : ''}
${isMSCI ? `- Globale Diversifikation: 1.500 Unternehmen aus 23 Ländern — aber USA dominiert mit ~65%
- Währungsrisiko für EUR-Anleger: EUR/USD beeinflusst die tatsächliche Rendite stark
- Langfrist-Rendite: MSCI World liefert historisch ~7-8% p.a. — erklär den Zinseszinseffekt` : ''}

MAKRO & BEWERTUNG:
- Zinsumfeld (FRED): Wie haben sich Zinsen entwickelt und welche Wirkung auf Indexbewertungen?
- Gewinnwachstum: Wie entwickeln sich die Unternehmensgewinne im Index?
- Bewertung: KGV im historischen Kontext — teuer oder günstig?
- Geopolitische Einflüsse: Handelskonflikte, Sanktionen die den Index-Zusammensetzung betreffen

AUSBLICK: Zinspfad (FRED), nächste Earnings-Saison, strukturelle Megatrends.`;
      }
    } else if (hasFunds && !isShort) {
      sections = 'MARKTLAGE, FUNDAMENTALS, MAKRO & GEOPOLITIK, AUSBLICK';
      instructions = `MARKTLAGE: Was hat die Aktie bewegt? Wichtigste Ereignisse konkret.
FUNDAMENTALS: Kennzahlen analysieren — KGV, Margen, Wachstum im Kontext. Was sagen diese Zahlen aus?
MAKRO & GEOPOLITIK: Zinsentwicklung, Sektortrends, geopolitische Faktoren — immer mit Mechanismus.
AUSBLICK: Nächste Quartalszahlen, Zinspfad, strukturelle Treiber oder Risiken.`;
    } else {
      sections = 'MARKTLAGE, MARKT-KONTEXT, AUSBLICK';
      instructions = `MARKTLAGE: Was hat die Aktie bewegt? Unternehmensspezifisch und Sektorentwicklung.
MARKT-KONTEXT: Makroumfeld, geopolitische Einflüsse auf diesen Sektor, Sektorstimmung.
AUSBLICK: Anstehende Ereignisse, 52W-Position, wichtigste Risikofaktoren.`;
    }

    system = `Du bist Finanzblick — ein präziser Finanzanalyst für Privatanleger in Deutschland und Österreich.

${levelPrompt}

${MACRO_CONTEXT}

${RULES}

AUSGABE-REGELN — strikt einhalten:
- Jeder Abschnitt: 2-4 prägnante Sätze — vollständige Gedanken, nie mitten im Satz abbrechen
- Kein Einleitungssatz, kein Fazit, keine Wiederholungen
- Direkt zum Punkt: Faktor nennen → Mechanismus in 1-2 Sätzen erklären → fertig
- Kein "Es ist wichtig zu beachten dass..." oder ähnliche Füllsätze
- Der Nutzer soll jeden Abschnitt in 15 Sekunden lesen können

STRUKTUR — genau diese Abschnitte, keine anderen:
${sections}

WAS IN JEDEM ABSCHNITT STEHEN SOLL (Orientierung, nicht wörtlich kopieren):
${instructions}

BEISPIEL für guten Stil (konkret, Mechanismus klar, vollständige Sätze):
"MARKTLAGE: Nvidia stieg nach Quartalszahlen die Erwartungen um 15% übertrafen — Umsatz im KI-Chip-Segment verdoppelte sich. Der gesamte Halbleitersektor profitierte vom positiven Sentiment und zog nach."

Keine Anlageberatung.`;

    user = `Asset: ${asset}
Kurs: ${price} | Zeitraum "${ctx.label}": ${richtung}${weekPosition}${fundBlock}${newsBlock}

Analysiere ${asset} für den Zeitraum "${ctx.label}" (${ctx.timeframe}).
Fokus: ${ctx.focus}`;
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
      .replace(/#{1,6} /g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (frage) {
      return res.status(200).json({ antwort: clean, typ: 'frage' });
    }

    // Abschnitte dynamisch parsen — Überschrift = Großbuchstaben gefolgt von Doppelpunkt
    const lines = clean.split('\n');
    const sections = [];
    let currentTitle = null;
    let currentContent = [];

    for (const line of lines) {
      const headerMatch = line.match(/^([A-ZÄÖÜ][A-ZÄÖÜ\s&]{2,40}):\s*(.*)/);
      if (headerMatch) {
        if (currentTitle && currentContent.join(' ').trim().length > 10) {
          sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
        }
        currentTitle = headerMatch[1].trim();
        currentContent = headerMatch[2] ? [headerMatch[2]] : [];
      } else if (currentTitle) {
        currentContent.push(line);
      }
    }
    if (currentTitle && currentContent.join(' ').trim().length > 10) {
      sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
    }

    if (sections.length >= 2) {
      return res.status(200).json({
        sections,
        warum: sections[0].content,
        ausblick: sections[sections.length - 1].content,
        range: range || '1T',
        typ: 'auto'
      });
    }

    // Fallback: altes Format
    const mMatch = clean.match(/MARKTLAGE[\s\S]*?:([\s\S]*?)(?=AUSBLICK|$)/i);
    const aMatch = clean.match(/AUSBLICK[\s\S]*?:([\s\S]*?)$/i);
    return res.status(200).json({
      warum: mMatch ? mMatch[1].trim() : clean,
      ausblick: aMatch ? aMatch[1].trim() : '',
      sections: [],
      range: range || '1T',
      typ: 'auto'
    });
    } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
