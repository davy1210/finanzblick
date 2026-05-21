const https = require('https');

// ── INSTRUMENT PROFILES ───────────────────────────────────────────────────
// Jedes Asset bekommt seine echten Kurstreiber. Die KI wählt selbst,
// welche davon für die aktuelle Kursbewegung am relevantesten sind.
const INSTRUMENT_PROFILES = {
  // ── US MEGA-CAP TECH ──────────────────────────────────────────────────
  'Nvidia': {
    ticker: 'NVDA', sector: 'Halbleiter / KI-Infrastruktur',
    drivers: [
      'Data Center GPU-Nachfrage: H100/H200/Blackwell-Bestellungen von Microsoft, Google, Amazon, Meta',
      'CUDA-Ökosystem-Monopol: ~80% Marktanteil im KI-Training — Wechselkosten für Entwickler extrem hoch',
      'Gross Margin als Qualitätsindikator: >74% Bruttomarge ist Zielzone; Unterschreiten = Warnsignal',
      'US-China Exportkontrollen: Jede neue Regulierung trifft Nvidias China-Geschäft (~15% des Umsatzes)',
      'Wettbewerb: AMD MI300X/MI350 gewinnt Inferenz-Marktanteile; Google TPUs, Amazon Trainium als custom silicon',
      'Hyperscaler Capex-Zyklus: Investitionspläne von Microsoft/Google/Amazon bestimmen die Chip-Nachfrage',
      'Segmentanalyse: Data Center, Gaming, Professional Viz, Automotive — Data Center dominiert den Wert',
    ],
    watchFor: 'EPS und Data Center Revenue vs. Erwartungen, Gross Margin-Trend, Guidance-Anhebungen, neue Export-Beschränkungen',
    macroSensitivity: 'Hohes Beta, zinssensibel als Wachstumsaktie mit hohem KGV; fällt überproportional bei Rezessionsangst',
  },
  'Apple': {
    ticker: 'AAPL', sector: 'Consumer Electronics / Software-Ökosystem',
    drivers: [
      'Services-Segment: App Store, iCloud, Apple TV+, Apple Pay — höchste Marge (~75%) und größter Wachstumsmotor',
      'iPhone-Upgrade-Zyklen: Wie viele aktive Nutzer wechseln auf neues Modell? Durchschnittliche Haltedauer steigt',
      'Greater China Revenue: ~17% des Umsatzes — anfällig für Handelskonflikt und Huawei-Comeback',
      'Apple Intelligence / KI-Features: Können KI-Funktionen eine neue Upgrade-Welle auslösen?',
      'App Store Regulierung: EU-DMA, US-DOJ-Klage — Einschränkungen bedrohen Services-Margen',
      'Aktienrückkäufe: ~90 Mrd. USD/Jahr — mechanisch kursunterstützend, erhöht EPS kontinuierlich',
      'Wearables & Vision Pro: Apple Watch, AirPods, Vision Pro — noch klein aber strategisch wichtig',
    ],
    watchFor: 'iPhone-Einheiten, Services-Wachstum, China-Umsatz, Gross Margin-Entwicklung, Management-Guidance',
    macroSensitivity: 'Relativ defensiv (Kunden-Loyalität hoch), aber Consumer-Spending-sensitiv bei Recession',
  },
  'Microsoft': {
    ticker: 'MSFT', sector: 'Cloud-Computing / Enterprise Software',
    drivers: [
      'Azure Cloud: Wachstumsrate vs. AWS und GCP entscheidend — jeder Prozentpunkt Abweichung bewegt die Aktie',
      'Copilot-Monetarisierung: AI-Seats in Office 365, GitHub Copilot, Azure AI — wie schnell wächst ARR?',
      'OpenAI-Investment: Microsoft hat ~49% Anteil an OpenAI-Profits — strategisch und kommerziell verknüpft',
      'Enterprise-Spending: IT-Budgets von Großkonzernen bestimmen Microsoft-Wachstum stärker als Makro',
      'Gaming: Xbox, Activision-Blizzard-Integration, Game Pass — Skaleneffekte noch nicht voll realisiert',
      'LinkedIn: Konjunktursensibel (Stellenanzeigen), aber stabiler B2B-Datenschatz',
      'Teams vs. Slack: Kollaborationsmarkt gesättigt, Differenzierung über KI-Features',
    ],
    watchFor: 'Azure-Wachstumsrate (YoY %), Intelligent Cloud Operating Income, Copilot-Seat-Zahlen, Capex-Guidance',
    macroSensitivity: 'Defensiver als reiner Wachstumsaktie: Enterprise-Subscriptions rezessionsresistenter, aber schwächerer Arbeitsmarkt = weniger M365-Seats',
  },
  'Alphabet': {
    ticker: 'GOOGL', sector: 'Digital Advertising / Cloud / KI',
    drivers: [
      'Search-Werbeumsatz: Kern des Geschäfts, beeinflusst von ad pricing, Suchvolumen und KI-Disruption durch ChatGPT',
      'YouTube: Werbeumsatz + YouTube Premium + Shorts-Monetarisierung — 2. größtes Social Network',
      'Google Cloud (GCP): Drittgrößter Cloud-Anbieter, wächst schneller als Azure/AWS — noch verlustreich aber strategisch',
      'KI-Wettbewerb: Gemini vs. ChatGPT — verliert Google Search-Anteile an KI-gestützte Antworten?',
      'Other Bets: Waymo (autonomes Fahren) — langfristiger Optionswert, kurzfristig Kostenfaktor',
      'Regulierung: EU-Kartellstrafen, US-DOJ Antitrust-Klage gegen Search-Monopol — strukturelle Risiken',
      'Werbe-Makro: Konjunktursensibel — in Rezessionen kürzen Unternehmen Marketingbudgets zuerst',
    ],
    watchFor: 'Search-Umsatzwachstum, GCP-Wachstum, YouTube-Ads, Operating Margin, TAC (Traffic Acquisition Costs)',
    macroSensitivity: 'Stark konjunktursensibel durch Werbeumsatz; KI-Substitutions-Risiko ist strukturelle Langzeitfrage',
  },
  'Amazon': {
    ticker: 'AMZN', sector: 'Cloud (AWS) / E-Commerce / Werbung',
    drivers: [
      'AWS: Obwohl <15% des Umsatzes, generiert AWS ~60% des operativen Gewinns — Wachstum ist der Kernwert-Treiber',
      'Advertising: Am schnellsten wachsendes Segment (~25% YoY) — Amazon-Werbung im hochmargigen Sponsor-Bereich',
      'Retail-Effizienz: Logistik-Netzwerk-Optimierung verbessert Retail-Margen kontinuierlich',
      'Prime-Ökosystem: Prime-Abonnenten als Retention-Mechanismus für alle Segmente',
      'AI/Bedrock: AWS-KI-Dienste mit Anthropic-Integration — Konkurrenz zu Azure OpenAI und GCP Vertex',
      'Kuiper: Satelliten-Breitband-Projekt — langfristig, kurzfristig Capex-Belastung',
      'Internationale Expansion: Neue Märkte (Indien, Mittlerer Osten) als Wachstumsoptionen',
    ],
    watchFor: 'AWS Revenue Growth (%), Advertising Growth, Retail Operating Margin, Gesamtcapex-Guidance',
    macroSensitivity: 'AWS relativ defensiv; Retail konjunktursensibel; Werbung mittelmäßig zyklisch',
  },
  'Meta': {
    ticker: 'META', sector: 'Social Media / Digital Advertising',
    drivers: [
      'Ad Revenue: 97% des Umsatzes — DAUs × ARPU = Revenue; Werbemarkt-Zyklus und Targeting-Qualität entscheidend',
      'KI-Targeting: Llama-Modelle verbessern Ad-Targeting-Effizienz → höhere CPMs für Werbetreibende',
      'TikTok-Wettbewerb: Reels auf Instagram/Facebook konkurriert um Aufmerksamkeit und Werbebudgets',
      'Reality Labs: ~5 Mrd. USD/Quartal operativer Verlust — Märkte tolerieren dies solange Kerngeschäft stark',
      'WhatsApp-Monetarisierung: Business-API und Click-to-Message Ads — noch früh aber wachsend',
      'Regulierung: EU DSA, US-Kartell-Verfahren, COPPA (Minderjährige) — strukturelle Risiken in allen Märkten',
      'Capex-Zyklus: Massive KI-Infrastruktur-Investitionen erhöhen Capex stark — Effizienz wird beobachtet',
    ],
    watchFor: 'DAU/MAU-Wachstum, ARPU (bes. USA/Europa), Reality Labs Verlust, Capex-Guidance',
    macroSensitivity: 'Stark werbezyklisch; besonders sensitiv für europäische Regulierungsrisiken',
  },
  'Tesla': {
    ticker: 'TSLA', sector: 'Elektrofahrzeuge / Energie / Autonomes Fahren',
    drivers: [
      'Fahrzeug-Auslieferungen: Quartalslieferungen vs. Markterwartungen — stärkster kurzfristiger Kurstreiber',
      'Automotive Gross Margin: Preissenkungen zur Absatzsteigerung komprimieren Margen — kritische Kennzahl',
      'Full Self-Driving (FSD): Regulatorische Zulassung für Robotaxi-Dienst = enormes Upside-Potenzial',
      'Energy Storage: Megapack-Wachstum (Energiespeicher für Netze) — margenstärker als Autos, unterschätzt',
      'China-Markt: ~25% des Umsatzes — BYD und Xpeng als direkte Konkurrenten, Handelspolitik-Risiko',
      'Optimus-Roboter: Noch Zukunftsprojekt, aber Musk-Ankündigungen bewegen die Aktie',
      'Elon-Musk-Faktor: Musk-Aktivitäten außerhalb Tesla (DOGE, X/Twitter) können Reputation und Fokus belasten',
    ],
    watchFor: 'Quartals-Deliveries, Automotive Gross Margin (excl. Credits), Energy Revenue, FSD-Regulierungsnews',
    macroSensitivity: 'Sehr hohes Beta, zinssensibel (Auto-Finanzierung teurer bei hohen Zinsen), Consumer-diskretionär',
  },
  'Netflix': {
    ticker: 'NFLX', sector: 'Streaming-Entertainment',
    drivers: [
      'Paid Memberships: Absolute Wachstumszahlen und ob Password-Sharing-Crackdown neue Abonnenten bringt',
      'Average Revenue Per Member (ARM): Preiserhöhungen und Mix-Shift zu günstigerem Ads-Tier',
      'Werbeumsatz (Ads-Tier): Noch klein aber wächst — zunehmend wichtig für Margenperspektive',
      'Content-Qualität: Originale (Squid Game, Wednesday, Stranger Things) treiben Subscriber-Akquisition',
      'Live-Events: Boxkämpfe, NFL-Spiele — strategischer Differentiator gegen andere Streamer',
      'Wettbewerb: Disney+, Max (Warner), Amazon Prime, Apple TV+ — Preissensitivität steigt',
      'Operating Margin: Ziel 29%+ — zeigt wie gut Content-Kosten und Abo-Einnahmen skalieren',
    ],
    watchFor: 'Paid Net Adds, ARM, Operating Margin, Content-Pipeline-Ankündigungen',
    macroSensitivity: 'Relativ defensiv (günstiger Entertainmentausweg in Rezession), aber Consumer-Spending-sensitiv',
  },
  'AMD': {
    ticker: 'AMD', sector: 'Halbleiter / KI-Beschleuniger',
    drivers: [
      'Instinct GPU (MI300X/MI350): Wächst Nvidias KI-Marktanteil heraus — Data Center Revenue entscheidend',
      'EPYC Server CPU: Gewinnt Marktanteile von Intel in Rechenzentren — hohe Margen, stabiler Treiber',
      'Client-Segment (Ryzen): PC-Marktzyklus und Laptop-Prozessor-Nachfrage — weniger relevant für Bewertung',
      'Embedded: Zyklische Schwäche 2023/24 erholt sich — zeigt Industrial/IoT-Nachfragemuster',
      'CUDA vs. ROCm: AMDs Software-Schwäche vs. Nvidias CUDA-Ökosystem bleibt Haupthindernis für KI-Dominanz',
      'Hyperscaler-Diversifizierung: Microsoft, Google wollen zweiten GPU-Lieferanten — AMDs strategische Chance',
    ],
    watchFor: 'Data Center Revenue Wachstum, MI-GPU-Auslieferungen, Gross Margin-Trend, EPYC-Marktanteil',
    macroSensitivity: 'Hohes Beta, zyklisch durch PC-Markt, aber KI-Komponente entkoppelt teilweise',
  },
  'JPMorgan': {
    ticker: 'JPM', sector: 'Großbank / Investment Banking',
    drivers: [
      'Net Interest Income (NII): Zinsdifferenz zwischen Einlagen und Krediten — direkt durch Fed-Zinsen beeinflusst',
      'Kreditausfälle (Loan Loss Provisions): Steigen bei wirtschaftlicher Schwäche — leading indicator für Kreditqualität',
      'Investment Banking: M&A-Beratung, IPO-Underwriting — sehr zyklisch, belebt sich bei risikofreundlichem Umfeld',
      'Return on Tangible Common Equity (ROTCE): Effizienzmaßstab der Bank — Ziel >17%',
      'Jamie Dimon Commentary: JPM-CEO als einer der einflussreichsten Wirtschaftskommentatoren weltweit',
      'Kapitalquoten (CET1): Regulatorische Kapitalanforderungen bestimmen Aktienrückkauf-Potenzial',
    ],
    watchFor: 'NII-Guidance, Loan Loss Provisions, Investment Banking Fees, ROTCE, CET1-Quote',
    macroSensitivity: 'Profitiert von höheren Zinsen (NIM), leidet bei Rezession (Kreditausfälle); stark von Fed-Pfad abhängig',
  },

  // ── DEUTSCHE / EUROPÄISCHE AKTIEN ─────────────────────────────────────
  'Volkswagen': {
    ticker: 'VOW3.DE', sector: 'Automobil / Elektromobilität',
    drivers: [
      'China-Umsatz: ~30% des Gesamtumsatzes — BYD/Nio/Xpeng fressen Marktanteile, Marktzugang-Risiko',
      'EV-Transition: ID.-Baureihe vs. chinesische Konkurrenz — Margendruck durch notwendige Preissenkungen',
      'Kostensenkungsprogramm: Werksschließungen, Personalabbau — Kapitalmarkt beobachtet Umsetzung',
      'Porsche AG / Audi: Premium-Töchter generieren überproportionale Margen — Bewertungsanker',
      'Energiekosten: Hohe europäische Energiepreise post-2022 belasten Produktion mehr als US-Konkurrenten',
      'EUR/CNY Wechselkurs: Starker Euro = schwächere China-Erträge in EUR gerechnet',
    ],
    watchFor: 'China-Verkaufszahlen, EV-Auslieferungen, operative Marge, Nettoliquidität, Guidance-Anpassungen',
    macroSensitivity: 'Sehr zyklisch, stark abhängig von europäischem Konsumklima, Zinsen (Auto-Kredite) und China-Konjunktur',
  },
  'Siemens': {
    ticker: 'SIE.DE', sector: 'Industrieautomation / Digitalisierung',
    drivers: [
      'Digital Industries: Fabrikautomation, PLM-Software (Siemens Xcelerator) — Industrie-Capex-Zyklus ist Treiber',
      'Smart Infrastructure: Gebäudetechnik, Energiemanagement — profitiert von Dekarbonisierung und Rechenzentrum-Boom',
      'Mobility: Züge, Signalanlagen — langfristige Infrastruktur-Verträge glätten Zyklizität',
      'Reshoring/Nearshoring-Trend: Neue Fabriken in USA/Europa brauchen Automatisierung → Siemens-Nachfrage steigt',
      'Auftragseingänge: Book-to-Bill-Ratio > 1 = Wachstum, < 1 = Auftragsabschwächung — leading indicator',
      'Software-Anteil: Wächst kontinuierlich, erhöht Margen und Bewertungsmultiples',
    ],
    watchFor: 'Order Intake, Digital Industries Margin, Xcelerator-Software-Wachstum, Jahresziele-Bestätigung',
    macroSensitivity: 'Zyklisch mit Industriecapex, aber diversifiziert durch Infrastruktur-Langzeitverträge',
  },

  // ── INDIZES ───────────────────────────────────────────────────────────
  'DAX': {
    ticker: '^GDAXI', sector: 'Deutscher Aktienindex',
    drivers: [
      'Deutsche Wirtschaft: Industrieproduktion, IFO-Geschäftsklimaindex, ZEW-Erwartungen als leading indicators',
      'China-Abhängigkeit: BASF, BMW, VW, Siemens machen 15-25% Umsatz in China — jede China-Nachricht trifft DAX',
      'Energie & Wettbewerbsfähigkeit: Hohe Industriestrompreise belasten deutsche Hersteller vs. US-/Asien-Konkurrenz',
      'EZB-Politik: Zinssenkungen entlasten Refinanzierung, schwächerer Euro begünstigt Export-Unternehmen',
      'EUR/USD: Schwächerer Euro erhöht Eurowert von USD-Erträgen deutscher Exporteure mechanisch',
      'Auto-Sektor (25% des DAX): VW, BMW, Mercedes — chinesischer EV-Wettbewerb ist strukturelle Herausforderung',
      'Defense & Rüstung: Rheinmetall, Hensoldt profitieren von NATO-Aufrüstung — wachsende Gewichtung im DAX',
    ],
    watchFor: 'IFO-Index, PMI Industrie/Dienstleistungen, ZEW-Erwartungen, EUR/USD-Kurs, EZB-Signale',
    macroSensitivity: 'Einer der zyklischsten Indizes weltweit durch hohen Industrie- und Export-Anteil',
  },
  'S&P 500': {
    ticker: '^GSPC', sector: 'US-Aktienmarkt (Leitindex)',
    drivers: [
      'Fed-Zinspfad: Jede Änderung der Zinserwartungen bewegt S&P Multiples — "higher for longer" = Bewertungsdruck',
      'Corporate Earnings: Quartalsgewinn-Saison — Top-7 Unternehmen (Magnificent 7) machen >30% Gewichtung aus',
      'Forward P/E: Aktuell ~21x vs. historisch ~16x — Bewertung ist erhöht, braucht starkes Gewinnwachstum als Rechtfertigung',
      'Konjunkturerwartungen: Soft Landing vs. Rezession — jeder Datenpunkt (NFP, CPI, GDP) neu bewertet',
      'Magnificent 7 Dominanz: AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA — überproportionaler Einfluss auf Index',
      'Sektoren-Rotation: Zinssensitive Sektoren (Utilities, REITs) vs. Tech — zeigt Risk-on/Risk-off-Dynamik',
      'VIX: Volatilitätsindex als Angstbarometer — Spitzen über 20 signalisieren Marktstress',
    ],
    watchFor: 'Fed-Statements, CPI/PCE-Inflation, NFP, Q-Earnings der Top-10, Forward P/E-Trend',
    macroSensitivity: 'Höchst sensitiv für Fed-Signale; Global-Risk-Barometer',
  },

  // ── KRYPTOWÄHRUNGEN ───────────────────────────────────────────────────
  'Bitcoin': {
    ticker: 'BTC-USD', sector: 'Kryptowährung / Digitales Gold',
    drivers: [
      'Spot-ETF-Flows: BlackRock iShares Bitcoin ETF, Fidelity — tägliche Zuflüsse/Abflüsse als Haupttreiber 2024/25',
      'Halving-Zyklus: April 2024 Halving → historisch 12-18 Monate danach starke Rallys (2013, 2017, 2021)',
      'Institutionelle Adoption: MicroStrategy (>400.000 BTC), El Salvador, US-strategische Reserve-Diskussionen',
      'Makro-Risikoappetit: BTC korreliert mit Tech/Risk-on in Krisen — Korrelation mit Gold steigt langfristig',
      'US Regulierung: SEC, CFTC, Banken-Zulassungen, strategische Bitcoin-Reserve-Politik',
      'Miner Economics: Hash Rate, Miner-Capitulation nach Halving, On-Chain-Aktivität',
      'Stablecoin-Flows: USDT/USDC Marktkapitalisierung zeigt Liquiditätszufluss in Krypto-Ökosystem',
    ],
    watchFor: 'ETF-Nettomittelflüsse, Exchange-Reserven, Miner-Signale, US-Regulierungsnews, Makro-Risikosentiment',
    macroSensitivity: 'Dual: High-Beta-Risk-Asset in Krisen, zunehmend Digital-Gold-Narrativ bei langfristiger Betrachtung. Kein sicherer Hafen.',
  },
  'Ethereum': {
    ticker: 'ETH-USD', sector: 'Smart Contract Plattform / DeFi',
    drivers: [
      'DeFi Total Value Locked (TVL): Wie viel Kapital ist im Ethereum-Ökosystem gesperrt — Nutzungsindikator',
      'ETH Spot ETF: Zugelassen 2024, aber Flows schwächer als Bitcoin-ETF — institutionelle Adoption noch früher',
      'EIP-1559 Burn: Netzwerk-Nutzung bestimmt ETH-Burn-Rate → bei hoher Aktivität deflationär',
      'Layer-2 Ökosystem: Arbitrum, Optimism, Base (Coinbase) — Scaling ohne Mainchain-Congestion',
      'Staking-Rendite: ~4% jährlich durch Staking — macht ETH zum "Yield-Asset" im Krypto-Raum',
      'Solana-Wettbewerb: SOL gewinnt DeFi/NFT/Meme-Anteile durch niedrigere Gebühren und höhere Speed',
      'Upgrade-Roadmap: Pectra, Fusaka — Ethereum-Entwicklung beeinflusst langfristige Positionierung',
    ],
    watchFor: 'DeFi TVL, ETF-Flows, Gas Fees (Netzwerkauslastung), Layer-2 Aktivität, Solana-Konkurrenz',
    macroSensitivity: 'Höher als Bitcoin, da stärker von Krypto-spezifischer Aktivität abhängig. Kein sicherer Hafen.',
  },

  // ── ROHSTOFFE ─────────────────────────────────────────────────────────
  'Gold': {
    ticker: 'GC=F', sector: 'Edelmetall / Sicherer Hafen',
    drivers: [
      'Reale Zinsen (TIPS-Yields): Stärkster Einzeltreiber — steigende reale Zinsen = Gold-Konkurrenz durch Anleihen',
      'USD-Stärke (DXY): Gold in USD → schwächerer Dollar = höherer Goldpreis in USD und vice versa',
      'Zentralbank-Käufe: China, Indien, Türkei, Polen kaufen strukturell Gold → inflexible Nachfrage-Unterstützung',
      'Geopolitische Risikoprämie: Kriege, Handelskonflikte, Finanzierungskrisen erhöhen sicherer-Hafen-Nachfrage',
      'Gold-ETF-Flows: SPDR Gold Shares (GLD), iShares Gold — westliche institutionelle Nachfrage',
      'Schmuck-Nachfrage: Indien und China als saisonal und einkommensabhängig schwankende physische Nachfrage',
      'Mining-Angebot: Relativ inelastisch (Mine braucht Jahre bis Produktion), beeinflusst nur langfristig',
    ],
    watchFor: 'TIPS-Renditen 10Y, DXY-Entwicklung, Zentralbank-Kaufberichte (WGC), Fed-Zinspfad-Erwartungen',
    macroSensitivity: 'Klassischer sicherer Hafen — steigt bei Rezessionsangst, Inflation und geopolitischer Unsicherheit',
  },
};

// Sektor-basierte Fallback-Profile für unbekannte Assets
const SECTOR_PROFILES = {
  'Technology': {
    drivers: ['Umsatzwachstum (YoY %)', 'Gross Margin-Entwicklung', 'Cloud/SaaS-Anteil des Umsatzes', 'R&D-Effizienz', 'Wettbewerbsposition'],
    watchFor: 'EPS vs. Schätzungen, Guidance, Gross Margin, Kundenwachstum',
    macroSensitivity: 'Hohes KGV = zinssensibel; Kapital-allokation in Wachstumsaktien sinkt bei steigenden Zinsen',
  },
  'Financial Services': {
    drivers: ['Net Interest Margin', 'Kreditausfallraten', 'Return on Equity', 'Kapitalquoten', 'Zinspfad der Zentralbanken'],
    watchFor: 'NIM-Guidance, Loan Loss Provisions, ROE, CET1-Quote',
    macroSensitivity: 'Direkt abhängig von Zinspolitik und Konjunkturverlauf',
  },
  'Consumer Cyclical': {
    drivers: ['Konsumentenvertrauen', 'Reallohnentwicklung', 'Sparquote', 'Kreditverfügbarkeit', 'Marktanteile'],
    watchFor: 'Same-Store-Sales, Gross Margin, Inventory-Levels, Consumer Confidence',
    macroSensitivity: 'Sehr zyklisch — fällt bei Rezession, steigt bei Aufschwung',
  },
  'Healthcare': {
    drivers: ['Pipeline-Studien (Phase 2/3)', 'FDA-Zulassungen', 'Patentlaufzeiten', 'Preisverhandlungen', 'M&A-Aktivität'],
    watchFor: 'Studienergebnisse, Zulassungsankündigungen, Umsatz von Blockbuster-Medikamenten',
    macroSensitivity: 'Defensiv — relativ unabhängig vom Konjunkturzyklus',
  },
  'Energy': {
    drivers: ['Öl-/Gaspreise (WTI, Brent, Henry Hub)', 'OPEC-Produktionsentscheidungen', 'Energiepolitik', 'Kapex-Disziplin'],
    watchFor: 'Rohstoffpreise, Förderkosten, Reserven-Entwicklung, Dividendenpolitik',
    macroSensitivity: 'Stark rohstoffzyklisch; geopolitisches Risiko als wichtiger Faktor',
  },
  'default': {
    drivers: ['Umsatzwachstum', 'Operative Marge', 'Wettbewerbsposition', 'Makro-Umfeld', 'Branchenspezifische Treiber'],
    watchFor: 'EPS, Umsatz vs. Erwartungen, Guidance, Branchennews',
    macroSensitivity: 'Abhängig von Sektor — siehe Fundamentaldaten',
  },
};

// ── PROFILE LOOKUP ────────────────────────────────────────────────────────
function getProfile(assetName, fundamentals) {
  const name = (assetName || '').toLowerCase();

  // Direkter Treffer über Asset-Namen
  for (const [key, profile] of Object.entries(INSTRUMENT_PROFILES)) {
    if (name.includes(key.toLowerCase()) || (profile.ticker && name.includes(profile.ticker.toLowerCase()))) {
      return { found: true, ...profile };
    }
  }

  // Krypto-Erkennung
  if (fundamentals?.isCrypto || (assetName || '').includes('-USD')) {
    return {
      found: false,
      sector: 'Kryptowährung',
      drivers: ['Marktsentiment und Risikoappetit', 'Regulierungsumfeld', 'Adoption durch institutionelle Investoren', 'Technische Entwicklung des Netzwerks', 'Makro-Liquiditätsbedingungen'],
      watchFor: 'Regulierungsnews, Institutional Flows, Netzwerk-Metriken, Makro-Risikosentiment',
      macroSensitivity: 'High-Beta Risk-Asset. Kryptowährungen sind KEIN sicherer Hafen.',
    };
  }

  // Sektor-basiertes Fallback
  const sector = (fundamentals?.sector || '');
  for (const [key, sp] of Object.entries(SECTOR_PROFILES)) {
    if (key !== 'default' && sector.toLowerCase().includes(key.toLowerCase().replace(/\s/g, ''))) {
      return { found: false, sector, ...sp };
    }
  }

  return { found: false, sector: sector || 'Unbekannt', ...SECTOR_PROFILES.default };
}

// ── RANGE CONTEXT ─────────────────────────────────────────────────────────
const RANGE_CONTEXT = {
  '1T': { label: 'Heute', tf: 'kurzfristig (Intraday)', focus: 'Heutige Ereignisse, aktuelle News, Pre-/After-Market-Bewegungen' },
  '1W': { label: 'Diese Woche', tf: 'kurzfristig', focus: 'Wochenverlauf, Earnings, Makrodaten der Woche' },
  '1M': { label: 'Letzter Monat', tf: 'mittelfristig', focus: 'Quartalszahlen, Zinsentscheidungen, Sektorbewegungen' },
  '6M': { label: 'Letzte 6 Monate', tf: 'mittelfristig', focus: 'Halbjahrestrend, strukturelle Faktoren, Makro-Regime-Wechsel' },
  '1J': { label: 'Letztes Jahr', tf: 'langfristig', focus: 'Jahresentwicklung, regulatorische Änderungen, Marktpositionierung' },
  '5J': { label: 'Letzte 5 Jahre', tf: 'langfristig', focus: 'Mehrjährige Zyklen, technologische Disruption, strategische Neuausrichtungen' },
};

const LEVEL_PROMPTS = {
  beginner: 'Schreibe für Einsteiger. Erkläre jeden Fachbegriff beim ersten Auftreten kurz in Klammern. Vermeide Abkürzungen ohne Erklärung. Direkte, einfache Sprache.',
  intermediate: 'Schreibe für erfahrene Anleger mit Grundwissen. Fachbegriffe sind ok, erkläre komplexe Zusammenhänge kurz. Nenne konkrete Zahlen.',
  expert: 'Professionelle Finanzsprache. Makroökonomische Analyse, technische und fundamentale Faktoren, institutionelle Perspektive. Quantitative Argumente bevorzugen.',
};

const MACRO_FALLBACK = `Makro-Kontext (Mai 2026):
Fed: ~4.25-4.50% (restriktiv) | EZB: ~2.65% (Zinssenkungszyklus) | US CPI: ~2.4% | Globale Themen: KI-Investitionsboom, US-China Handelskonflikte, Energiewende`;

async function getLiveMacro() {
  try {
    const m = await new Promise((resolve, reject) => {
      const req = https.get('https://finanzblick.vercel.app/api/macro', {
        headers: { 'User-Agent': 'Finanzblick-Internal/1.0' }, timeout: 3000
      }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      });
      req.on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('t')); });
    });
    if (!m?.fedRate) return MACRO_FALLBACK;
    return `Makro (Live): Fed ${m.fedRate}% ${m.fedRate > 4 ? '(restriktiv)' : '(moderat)'} | EZB ${m.ecbRate || '?'}% | CPI ${m.cpiYoy || '?'}% | BIP-Wachstum ${m.gdpGrowth || '?'}% | Arbeitslosigkeit ${m.unemployment || '?'}%`;
  } catch(e) { return MACRO_FALLBACK; }
}

function buildFundBlock(f) {
  if (!f || Object.keys(f).length === 0) return '';
  const rows = [];
  if (f.pe) rows.push(`KGV ${f.pe.toFixed(1)}${f.pe > 40 ? ' (hoch)' : f.pe < 12 ? ' (günstig)' : ''}`);
  if (f.forwardPE) rows.push(`Forward-KGV ${f.forwardPE.toFixed(1)}`);
  if (f.eps) rows.push(`EPS $${f.eps.toFixed(2)}`);
  if (f.grossMargin) rows.push(`Bruttomarge ${f.grossMargin}%`);
  if (f.netMargin || f.profitMargin) rows.push(`Nettomarge ${f.netMargin || f.profitMargin}%`);
  if (f.revenueGrowth) rows.push(`Umsatzwachstum ${f.revenueGrowth}%`);
  if (f.roe) rows.push(`ROE ${f.roe}%`);
  if (f.beta) rows.push(`Beta ${f.beta.toFixed(2)}`);
  if (f.ebitda) rows.push(`EBITDA $${(f.ebitda/1e9).toFixed(1)}B`);
  if (f.marketCap) rows.push(`Market Cap $${(f.marketCap/1e9).toFixed(0)}B`);
  if (f.dividendYield) rows.push(`Dividendenrendite ${f.dividendYield}%`);
  if (f.weekHigh52 && f.weekLow52) {
    const pct = f.price ? Math.round(((f.price - f.weekLow52) / (f.weekHigh52 - f.weekLow52)) * 100) : null;
    rows.push(`52W ${f.weekLow52.toLocaleString()}–${f.weekHigh52.toLocaleString()}${pct !== null ? ` (${pct}% vom Tief)` : ''}`);
  }
  // Krypto-spezifisch
  if (f.marketCap && f.isCrypto) rows.push(`Market Cap $${(f.marketCap/1e9).toFixed(0)}B`);
  if (f.volume24Hr) rows.push(`24h-Volumen $${(f.volume24Hr/1e9).toFixed(1)}B`);
  if (rows.length === 0) return '';
  return `\n\nFUNDAMENTALDATEN: ${rows.join(' | ')}`;
}

function buildNewsBlock(news) {
  if (!news || news.length === 0) return '';
  const sorted = [...news].sort((a, b) => {
    const scoreA = (a.impactLevel === 'high' ? 3 : a.impactLevel === 'medium' ? 2 : 1) +
      (/earnings|quartal|revenue|eps|beat|miss|guidance|ipo|merger|acquisition/i.test(a.title) ? 4 : 0);
    const scoreB = (b.impactLevel === 'high' ? 3 : b.impactLevel === 'medium' ? 2 : 1) +
      (/earnings|quartal|revenue|eps|beat|miss|guidance|ipo|merger|acquisition/i.test(b.title) ? 4 : 0);
    return scoreB - scoreA;
  });
  const top = sorted.slice(0, 5);
  return '\n\nAKTUELLE MARKTNACHRICHTEN:\n' + top.map(n => {
    const tag = n.sentiment === 'bullish' ? '[+]' : n.sentiment === 'bearish' ? '[-]' : '[~]';
    const imp = n.impactLevel === 'high' ? '[HIGH]' : '';
    const desc = n.description?.length > 30 ? ` — ${n.description.slice(0, 100)}` : '';
    return `${tag}${imp} ${n.title}${desc}`;
  }).join('\n');
}

function callGroq(model, system, user, apiKey) {
  const body = JSON.stringify({
    model, max_tokens: 900, temperature: 0.2,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
  });
  return new Promise((resolve, reject) => {
    const r = https.request({
      hostname: 'api.groq.com', path: '/openai/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey, 'Content-Length': Buffer.byteLength(body) }
    }, resp => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => {
        try {
          const p = JSON.parse(d);
          if (p.error) {
            if ((p.error.message || '').includes('rate_limit') || resp.statusCode === 429) return reject(new Error('rate_limit'));
            return reject(new Error(p.error.message));
          }
          resolve(p.choices?.[0]?.message?.content || '');
        } catch(e) { reject(e); }
      });
    });
    r.on('error', reject);
    r.setTimeout(18000, function() { this.destroy(); reject(new Error('Timeout')); });
    r.write(body); r.end();
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
  const richtung = isPos ? `+${Math.abs(changePct || 0).toFixed(2)}%` : `-${Math.abs(changePct || 0).toFixed(2)}%`;

  // Instrument-Profil bestimmen
  const profile = getProfile(asset, fundamentals);
  const profileBlock = `
INSTRUMENT-PROFIL: ${asset}
Sektor: ${profile.sector}
Bekannte Kurstreiber:
${(profile.drivers || []).map(d => '  • ' + d).join('\n')}
Worauf besonders achten: ${profile.watchFor || '—'}
Makro-Sensitivität: ${profile.macroSensitivity || '—'}`;

  const fundBlock = buildFundBlock(fundamentals);
  const newsBlock = buildNewsBlock(news);
  const macroLine = macro?.fedRate
    ? `Makro: Fed ${macro.fedRate}% | EZB ${macro.ecbRate || '?'}% | CPI ${macro.cpiYoy || '?'}%`
    : await getLiveMacro();

  let system, user;

  if (frage) {
    system = `Du bist Finanzblick — präziser Finanzerklärer für Privatanleger. ${levelPrompt}
Beantworte konkret, faktenbasiert, kausal. Keine Anlageberatung, keine Kursziele. Kein Markdown.`;

    user = `${profileBlock}${fundBlock}${newsBlock}

${macroLine}
Asset: ${asset} | Kurs: ${price} | ${ctx.label}: ${richtung}

Frage: "${frage}"

Antworte direkt und konkret — erkläre Kausalzusammenhänge, nenne Zahlen aus dem Profil und den Fundamentaldaten. Max. 3 Absätze.`;

  } else {
    system = `Du bist ein erfahrener Finanzanalyst der Finanzblick-Plattform. ${levelPrompt}

Du erhältst ein detailliertes Instrument-Profil mit den echten Kurstreibern sowie aktuelle Fundamentaldaten und Marktnachrichten.

DEINE AUFGABE: Analysiere, WELCHE der Profil-Treiber die aktuelle Kursbewegung (${richtung}) am stärksten erklären. Wähle selbst die 2-3 relevantesten Faktoren — basierend darauf, was in den aktuellen Daten und News am stärksten heraussticht.

FORMAT (ohne Überschriften, ohne Markdown, Fließtext):
Absatz 1 — MARKTLAGE: Was treibt die Bewegung gerade? Konkret, mit Zahlen, kausal erklärt.
Absatz 2 — AUSBLICK: Welche Profil-Treiber werden als nächstes relevant sein? Wann, wie?

STIL: Sachlich, präzise, individuell für dieses Asset — niemals generische Formeln. Keine Anlageberatung.`;

    user = `${profileBlock}${fundBlock}${newsBlock}

${macroLine}
Asset: ${asset} | Kurs: ${price} | Zeitraum "${ctx.label}" (${ctx.tf}): ${richtung}

Analysiere die Kursbewegung durch die Linse des Instrument-Profils. Welche der aufgeführten Treiber sind aktuell aktiv? Stelle Verbindungen zwischen Profil-Treibern, Fundamentaldaten und den aktuellen News her.`;
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

    // Versuche Absätze zu trennen; Fallback: gesamter Text als Marktlage
    const parts = clean.split(/\n\n+/);
    const warum = parts[0] || clean;
    const ausblick = parts.slice(1).join('\n\n') || '';

    return res.status(200).json({ warum, ausblick, range: range || '1T', typ: 'auto' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
