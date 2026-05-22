const https = require('https');
const { enrichSymbol } = require('./enrich');

// ── INSTRUMENT PROFILES ───────────────────────────────────────────────────
// Jedes Asset bekommt seine echten Kurstreiber. Die KI wählt selbst,
// welche davon für die aktuelle Kursbewegung am relevantesten sind.
const INSTRUMENT_PROFILES = {
  // ── US MEGA-CAP TECH ──────────────────────────────────────────────────
  'Nvidia': {
    ticker: 'NVDA', sector: 'Halbleiter / KI-Infrastruktur',
    narrative: 'Nvidia ist de facto die Infrastruktur des KI-Booms. Wer KI-Modelle trainieren will, braucht H100/H200/Blackwell-GPUs — praktisch ohne Alternative. Die Aktie bewertet nicht nur Chips, sondern einen Plattform-Monopolisten in der wichtigsten Technologiewende seit dem Internet.',
    drivers: [
      'Data Center Revenue (Haupttreiber, ~88% des Umsatzes): Q4 FY2025 = $39.1 Mrd. (+142% YoY). Jede Quartalsguidance nach oben/unten von ±5% bewegt die Aktie um ±8-12%. Microsoft, Google, Amazon, Meta kaufen H100/H200/Blackwell für KI-Training — ihre Capex-Pläne sind Nvidias Auftragsbuch.',
      'Gross Margin als Qualitätsindikator: Zielzone >74%. Blackwell-Chips haben anfänglich niedrigere Margen durch Anlaufkosten — Margen steigen aber mit Skaleneffekten. Unter 70% = kritisches Warnsignal. Aktuelle Bruttomarge ~73-75%. Jeder Prozentpunkt Margenveränderung bewegt Fair Value um ~8-10%.',
      'CUDA-Ökosystem-Burggraben: ~80% aller KI-Modelle laufen auf CUDA-Software. Entwickler haben jahrelang mit CUDA-Code investiert — Wechselkosten zur AMD-Alternative (ROCm) sind enorm hoch. Dieser Software-Burggraben, nicht die Hardware, ist Nvidias dauerhafter Wettbewerbsvorteil.',
      'US-China Exportkontrollen — akutes Risiko: China-Umsatz war ~20-25% des Revenues. Nach H100-Exportverbot versuchte Nvidia mit H800/A800-Chips auszuweichen. Bei jeder neuen Einschränkung: direkt $3-6 Mrd. Revenue-Risiko p.a. Pro Stufe der Exportverschärfung verliert Nvidia ~5-10% Fair Value.',
      'Hyperscaler-Capex-Zyklus — kritischer Vorlaufindikator: Microsoft FY2025 Capex: $80 Mrd.; Google 2025: $75 Mrd.; Amazon 2025: $105 Mrd.; Meta 2025: $65 Mrd. → Zusammen ~$325 Mrd. KI-Infrastrukturausgaben. Jede Guidance-Senkung eines Hyperscalers = Nvidia Kursrisiko -5 bis -15%. Capex-Erhöhungen = Katalysator.',
      'Wettbewerb (mittel- bis langfristig): AMD MI300X gewinnt Inferenz-Marktanteile. Google TPU v5, Amazon Trainium 2, Microsoft Maia 2 als Custom-Silicon-Alternativen könnten langfristig 15-20% des Marktes zurückgewinnen. Kurzfristig (<2 Jahre) kein ernstes Bedrohungsszenario für Nvidias Dominanz.',
      'Bewertung & Sentiment: Forward P/E ~35-45x bei KI-Boom; ~20-25x bei Capex-Pause-Angst. NTM P/E über 40x = Markt preist perfektes Wachstum ein — erhöhte Korrekturanfälligkeit bei Enttäuschungen. Beta ~1.7-2.0.',
    ],
    bullScenario: 'Hyperscalers erhöhen Capex weiter, Blackwell-Nachfrage übertrifft Angebot, keine neuen China-Exportbeschränkungen → Data Center Revenue $50+ Mrd./Quartal möglich.',
    bearScenario: 'Einer der Top-3 Hyperscaler kürzt Capex deutlich ("AI ROI enttäuscht"), neue US-Exportverbote auf H20-Chips, AMD MI400 gewinnt >20% Marktanteil → Multiple-Kompression auf 20-25x möglich.',
    watchFor: 'Data Center Revenue YoY%, Gross Margin (>74% = stark), Guidance für nächstes Quartal, Hyperscaler-Capex-Statements, China-Export-News',
    macroSensitivity: 'Beta ~1.8. Zinssensibel als Wachstumsaktie mit hohem KGV: Bei 10Y-Yield >4.5% steigt Diskontierungsdruck. Fällt überproportional bei Rezessionsangst (-30 bis -50% in Drawdowns).',
  },

  'Apple': {
    ticker: 'AAPL', sector: 'Consumer Electronics / Software-Ökosystem',
    narrative: 'Apple ist kein Smartphone-Hersteller mehr — es ist ein Ökosystem-Monopolist. 2,2 Milliarden aktive Geräte erzeugen einen Services-Umsatzstrom von ~$100 Mrd./Jahr mit ~75% Bruttomargen. Die eigentliche Frage ist: Kann Apple Intelligence eine neue iPhone-Upgrade-Welle auslösen und den Services-Anteil weiter steigern?',
    drivers: [
      'Services-Segment (Hauptwachstumsmotor): FY2024 ~$96 Mrd. Umsatz bei ~75% Bruttomarge — verglichen mit iPhone-Marge von ~35%. App Store, iCloud (1 Mrd.+ Abonnenten), Apple TV+, Apple Pay, Apple Arcade. Jeder Prozentpunkt Wachstum im Services-Segment hat überproportionalen Einfluss auf den Gesamtgewinn.',
      'iPhone (56% des Umsatzes): Installierte Basis von 2,2 Mrd. Aktiv-Geräten ist entscheidender als Quartalsverkäufe. Upgrade-Zyklus verlängert sich auf 3,5-4 Jahre — bedeutet: Höherer Einzel-Verkaufspreis, nicht mehr Volumen ist die Wachstumsstrategie. iPhone 16 mit Apple Intelligence = möglicher Super-Upgrade-Zyklus.',
      'China-Risiko (~18% des Umsatzes = ~$75 Mrd.): Huawei Mate 60 Pro hat 2023/24 direkte Apple-Käufer zurückgewonnen. Handelszölle, DeepSeek-Konkurrenz im KI-Bereich und staatliche Restriktionen sind drei unabhängige Risikoquellen. Worst-Case: -20% auf China-Revenue = -$15 Mrd. Jahresgewinn.',
      'Aktienrückkäufe (~$90-95 Mrd./Jahr): Apple ist der größte Rückkäufer der Welt. Mechanisch kursunterstützend: Reduziert Aktienanzahl um ~3%/Jahr → EPS steigt automatisch um ~3% ohne organisches Wachstum. Dieser Effekt ist ein struktureller Boden.',
      'Apple Intelligence / KI-Monetarisierung: Siri-Integration mit ChatGPT, On-Device-KI-Features. Frage: Wird KI Users dazu bringen, früher upzugraden? Und können Premium-KI-Features als neues Services-Abonnement ($20-30/Monat) monetarisiert werden? Upside von $5-10 Mrd. zusätzlichem ARR möglich.',
      'App Store Regulierung (strukturelles Risiko): EU-DMA zwingt Apple zur Öffnung für alternative App Stores — Gefahr für App Store Revenue. DOJ-Klage in den USA. Worst-Case: 10-15% Reduktion des App-Store-Umsatzes (~$25 Mrd.) möglich über 3-5 Jahre.',
    ],
    bullScenario: 'Apple Intelligence löst Super-Upgrade-Zyklus aus (iPhone-Verkäufe +10% YoY), Services wächst auf $120 Mrd./Jahr, China-Spannungen stabilisieren sich → KGV-Expansion auf 32-35x gerechtfertigt.',
    bearScenario: 'China-Umsatz fällt 25% (Handelskonflikt/Huawei-Comeback), App-Store-Regulierung kostet $8 Mrd./Jahr, kein Upgrade-Zyklus durch KI → KGV-Kompression auf 22-24x.',
    watchFor: 'iPhone-Absatz vs. Erwartung, Services-Wachstum YoY%, China-Umsatz-Trend, Gross Margin (>46% = stark), Guidance',
    macroSensitivity: 'Beta ~1.2. Relativ defensiv durch Ökosystem-Loyalität und Rückkaufprogramm. Aber: Consumer-Discretionary-Komponente — bei Rezession können iPhone-Käufe verschoben werden.',
  },

  'Microsoft': {
    ticker: 'MSFT', sector: 'Cloud-Computing / Enterprise Software / KI',
    narrative: 'Microsoft ist das reinste "KI-Monetarisierungs-Play" unter den Mega-Caps. Durch das OpenAI-Investment und Copilot-Integration in alle Produkte hat Microsoft einen strukturellen Vorteil: KI erhöht den Wert jeder bestehenden M365/Azure-Subscription. Die Frage ist nicht ob KI-Umsatz wächst, sondern wie schnell.',
    drivers: [
      'Azure (Intelligent Cloud, ~45% des Umsatzes): Wachstumsrate ist DIE Schlüsselkennzahl. Q3 FY2025: +33% YoY — AWS wächst ~17%, GCP ~28%. Jeder Prozentpunkt über/unter Erwartungen bewegt MSFT-Aktie ±3-5%. KI-Anteil am Azure-Wachstum: ~8-10 Prozentpunkte. Das bedeutet: Azure würde ohne KI nur ~20-23% wachsen.',
      'Copilot-Monetarisierung: M365 Copilot = $30/User/Monat zusätzlich. Microsoft-installed Base: 400+ Mio. M365-Nutzer. Wenn nur 10% Copilot adopten → $14+ Mrd. neuer ARR bei ~80% Marge. GitHub Copilot: 1,8 Mio. Enterprise-Nutzer (Stand 2024). Azure Copilot: Direkte Integration erhöht Azure ARPU.',
      'OpenAI-Investment (strategische Kronjuwele): Microsoft hat ~$13 Mrd. investiert und erhält 49% der Profits bis zur Rückzahlung. Aber wichtiger: Microsoft hat Exklusivrechte für GPT-Technologie in Azure → direkter Wettbewerbsvorteil vs. AWS und GCP.',
      'Enterprise-Stickiness: Azure + M365 + Teams + Defender = Deep Integration in Unternehmens-IT. Durchschnittlicher Enterprise-Kunde hat 6-8 Microsoft-Produkte. Kündigung ist teurer als Beibehaltung — Churn-Rate <5%. Rezessionsresistenter als reine SaaS-Anbieter.',
      'Capex-Zyklus (Risiko und Chance): Microsoft investiert $80 Mrd. in FY2025 in KI-Infrastruktur (Rechenzentren, NVIDIA-GPUs). Hohe Investitionen heute = Kapazität für Umsatzwachstum in 2-3 Jahren. Aber: Kurzfristig drückt das auf Free Cash Flow — Investoren überwachen ROI-Entwicklung.',
      'Gaming — Activision-Synergien: Call of Duty, World of Warcraft im Game Pass-Ökosystem. Xbox/Game Pass: ~30 Mio. Abonnenten. Noch kein volles Potenzial realisiert, aber strukturell wachsend.',
    ],
    bullScenario: 'Copilot-Adoption erreicht 15-20% der M365-Basis bis Ende 2025, Azure-Wachstum bleibt >30%, OpenAI-Partnership stärkt sich → Revenue FY2026 >$310 Mrd. möglich.',
    bearScenario: 'Azure-Wachstum verlangsamt auf <25% (Enterprise-Budget-Kürzungen), Copilot-Adoption enttäuscht, hohe Capex belastet FCF-Multiples → KGV-Kompression auf 27-30x.',
    watchFor: 'Azure-Wachstum YoY%, Copilot-Seat-Zahlen, Intelligent Cloud Operating Margin, Capex-Guidance, OpenAI-Revenue-Beitrag',
    macroSensitivity: 'Beta ~0.9. Defensiver als reine Wachstumsaktien durch Enterprise-Subscriptions. Aber: Schwächerer Arbeitsmarkt = weniger M365-Seats, höhere Zinsen = Azure-Migration-Budgets könnten schrumpfen.',
  },

  'Alphabet': {
    ticker: 'GOOGL', sector: 'Digital Advertising / Cloud / KI',
    narrative: 'Alphabet steht vor der paradoxen Situation: Die KI, die Google maßgeblich mit entwickelt hat (Transformer-Architektur, Gemini), bedroht gleichzeitig sein Kerngeschäft. Search-AI-Antworten reduzieren Klicks auf Werbeanzeigen. Gleichzeitig wächst Google Cloud stark — die Frage ist, ob Cloud-Wachstum den möglichen Search-Rückgang kompensieren kann.',
    drivers: [
      'Google Search (57% des Umsatzes = ~$200 Mrd./Jahr): Strukturelles Risiko durch KI-Suche (ChatGPT, Perplexity). AI Overviews reduzieren Klickrate auf gesponserte Links. Je 10% Rückgang des Search-ARPU = ~$20 Mrd. weniger Revenue. Gegenmaßnahme: Google selbst integriert KI in Search — bisher ohne drastische Umsatzeinbußen.',
      'Google Cloud (GCP, ~12% des Umsatzes, wächst schnell): Q1 2025: ~$12 Mrd. Revenue (+28% YoY), Operating Profit $900 Mio. (erstmals profitabel). TPU v5-Chips als differenzierendes Alleinstellungsmerkmal vs. AWS/Azure. Gemini-Integration in Vertex AI zieht Enterprise-KI-Kunden an.',
      'YouTube (10% des Umsatzes = ~$36 Mrd./Jahr): YouTube Shorts konkurriert mit TikTok — mittlerweile 2+ Mrd. tägliche Nutzungen von Shorts. YouTube Premium: 100+ Mio. Abonnenten. NFL-Sunday-Ticket als Premium-Content-Anchor. YouTube bleibt das einzige soziale Netzwerk, das TikTok in Watch-Time herausfordert.',
      'Waymo (Optionswert): Autonomes Fahren — 150.000+ Fahrten pro Woche in Phoenix/San Francisco. Nicht in Alphabets Marktkapitalisierung eingepreist (Analyst-Schätzungen: $30-50 Mrd. Fair Value). Langfristiger Call-Option auf Mobilitäts-Plattform.',
      'Aktienrückkäufe (~$60-70 Mrd./Jahr): Ähnlich wie Apple ein struktureller Kursboden. Niedrigstes KGV unter den Mag-7 (~22-24x Forward P/E) macht Alphabet fundamental attraktiver bei Einbrüchen.',
      'DOJ-Antitrust-Klage (existenzielles Risiko): US-Gericht hat Googles Search-Monopol als illegal befunden. Mögliche Konsequenz: Trennung von Google Search und Chrome/Android. Worst-Case könnte $100+ Mrd. Marktwert vernichten. Urteil und Rechtsmittel laufen bis 2026/27.',
    ],
    bullScenario: 'AI Overviews monetarisieren sich besser als erwartet, GCP gewinnt Enterprise-KI-Kunden, Waymo IPO oder Spin-off hebt versteckten Wert → KGV-Expansion auf 26-28x.',
    bearScenario: 'DOJ-Urteil zwingt zu strukturellen Änderungen, ChatGPT/Perplexity fressen >10% Search-Marktanteile, GCP-Wachstum verlangsamt → KGV bleibt unter 20x als "Value-Trap".',
    watchFor: 'Search-Umsatz YoY%, GCP-Wachstum und Profitabilität, YouTube-Ads, Operating Margin, TAC (Traffic Acquisition Costs), DOJ-Verfahren',
    macroSensitivity: 'Beta ~1.1. Stark konjunktursensibel durch digitale Werbung. In Rezessionen kürzen Unternehmen Marketing als erstes. Aber: günstigstes Bewertungsniveau unter den Mag-7 bietet Downside-Schutz.',
  },

  'Amazon': {
    ticker: 'AMZN', sector: 'Cloud (AWS) / E-Commerce / Werbung / KI',
    narrative: 'Amazon ist ein Konglomerat aus drei Businesses mit unterschiedlichen Bewertungslogiken: AWS (Cloud-Monopol mit ~60% des Konzerngewinns), Advertising (hochmargiges, schnell wachsendes Segment), und E-Commerce (niedrigmargig, aber Cashflow-Maschine). Die Aktie reagiert auf AWS und Advertising — nicht auf Retail.',
    drivers: [
      'AWS (Herzstück der Bewertung): Q1 2025: $29.3 Mrd. Revenue (+17% YoY) bei ~37% Operating Margin. AWS generiert ~60% des gesamten Konzern-Betriebsgewinns, obwohl es <15% des Umsatzes ausmacht. Anthropic-Partnerschaft (Claude-Modelle exklusiv auf AWS) = KI-Differenzierungsmerkmal. Bei AWS-Wachstum <15% reagiert die Aktie negativ; >20% = starker Katalysator.',
      'Amazon Advertising (schnellstes Wachstum): Q1 2025: ~$13.9 Mrd. (+19% YoY) bei ~75% Marge. Amazon-Werbung basiert auf Kaufabsicht (User sucht Produkt → sieht Anzeige) = höchste Conversion-Rate im digitalen Marketing. Struktureller Gewinner gegenüber Facebook/Google bei direkten Verkaufsanzeigen.',
      'Prime-Ökosystem (Retention-Maschine): 200+ Mio. Prime-Mitglieder weltweit. Prime-Mitglieder geben 3-4× mehr auf Amazon aus als Nicht-Mitglieder. Preiserhöhungen ($139/Jahr in USA) werden von 90%+ der Mitglieder akzeptiert — zeigt extrem hohen wahrgenommenen Wert.',
      'Retail-Effizienz (unterschätzter Treiber): Amazon hat 2023/24 sein Logistiknetzwerk regionalisiert und damit Lieferkosten um 30-40% gesenkt. Retail Operating Margin: von -1% (2022) auf +5-6% (2025) verbessert. Same-Day-Delivery als struktureller Wettbewerbsvorteil vs. Walmart.',
      'Capex/AI-Investitionen: $105 Mrd. geplant für 2025 (Rechenzentren, Trainium-KI-Chips). Kurzfristiger FCF-Druck, aber AWS-Kapazität für nächste Wachstumsstufe wird aufgebaut. Trainium 2 als Alternative zu Nvidia für günstigere KI-Inferenz.',
      'Internationale Expansion: Indien ist nächster großer Wachstumsmarkt. Amazon India-Invest: $26 Mrd. bis 2030 angekündigt. Long-Term Optionswert, kurzfristig Kostenfaktor.',
    ],
    bullScenario: 'AWS-Wachstum beschleunigt auf >22% durch KI-Workloads, Advertising überholt YouTube in Revenue, Retail-Margen auf 7%+ → EPS >$8/Aktie FY2026.',
    bearScenario: 'AWS verlangsamt auf <12% (Enterprise-Budget-Kürzungen), hoher Capex belastet FCF, Retail-Margen komprimieren bei Preiskämpfen → KGV-Kompression auf 35-40x FCF.',
    watchFor: 'AWS Revenue Growth und Operating Margin, Advertising-Wachstum, Retail Operating Income, Gesamtcapex, Freier Cashflow',
    macroSensitivity: 'Beta ~1.2. AWS defensiver (Enterprise-Verträge); Retail sehr konsumzyklisch. Bei Rezession: E-Commerce-Anteil steigt (Trading-Down vom stationären Handel), aber Consumer-Spending insgesamt fällt.',
  },

  'Meta': {
    ticker: 'META', sector: 'Social Media / Digital Advertising / VR',
    narrative: 'Meta hat die "Year of Efficiency" (2023) zu einem der stärksten Comeback-Stories gemacht: Kosten radikal gesenkt, Margen auf Rekordhoch, KI-Targeting durch Llama-Modelle verbessert. Das Risiko: 97% Abhängigkeit von digitalem Werbeumsatz, Reality Labs verliert >$5 Mrd./Quartal, und regulatorische Risiken sind existenziell.',
    drivers: [
      'Advertising Revenue (97% des Umsatzes): Revenue-Gleichung: DAU × Sessions × CPM × Klickrate. Q1 2025: ~$41.4 Mrd. Revenue (+16% YoY). Advantage+ KI-Targeting steigert Advertiser-ROI nachweislich 30%+ → höhere CPMs. Jeder 1$ mehr ARPU in USA/Europa (derzeit ~$60/Q) bewegt Revenue um ~$4 Mrd./Jahr.',
      'Family of Apps (FB/IG/WA/Threads): 3,27 Mrd. Daily Active People (DAP) — mehr Menschen täglich als irgendein anderer Dienst. Instagram Reels dominiert short-form Video in Europa/USA. WhatsApp Business: 500+ Mio. Business-Accounts — Monetarisierung noch früh, aber riesiges Potenzial.',
      'Reality Labs (strategische Wette): Kumulierter Verlust 2020-2025: ~$60 Mrd. Quest 3 ist technisch führendes Mixed-Reality-Headset. Ray-Ban Meta Smart Glasses: 2024 Bestseller in smart glasses. Markt toleriert Verluste solange Core-Business wächst — aber bei Core-Schwäche wird Reality-Labs-Verlust zum Problem.',
      'KI-Infrastruktur & Llama: Meta ist größter Open-Source-KI-Anbieter (Llama 3.1, 3.2). Kostenloser Llama-Zugang schafft KI-Ecosystem-Wert, reduziert aber direkte KI-Monetarisierung. Llama verbessert Ad-Targeting und Inhalts-Recommendation — direkte Profitabilitätswirkung.',
      'Capex-Explosion (kritisches Risiko/Chance): 2025 Capex-Guidance: $64-72 Mrd. (+60% YoY). Markt beobachtet obsessiv den ROI dieser Investitionen. Solange Revenue >15% wächst, wird Capex toleriert. Bei Revenue-Verlangsamung + hohem Capex = massiver Kursrückgang möglich.',
      'Regulatorische Risiken: EU DSA, GDPR-Bußgelder, FTC-Klage auf Aufspaltung (Instagram/WhatsApp-Verkauf). US-COPPA-Verschärfung für Minderjährige. Jedes neue Bußgeld oder Verbot in einem großen Markt kann Aktie um 5-10% bewegen.',
    ],
    bullScenario: 'Advantage+ KI-Targeting treibt CPM +20%, WhatsApp-Monetarisierung skaliert, Reality Labs Verluste sinken durch Quest-Verkäufe → Operating Margin >45% möglich.',
    bearScenario: 'FTC erzwingt Abspaltung von Instagram (größter Revenue-Treiber), EU-Regulierung schränkt Targeting ein, Jugendliche verlieren Interesse → Bewertung halbiert sich.',
    watchFor: 'DAU/DAP-Wachstum, ARPU (USA/Europa), Reality Labs Operating Loss, Capex-Guidance, Regulatory-News',
    macroSensitivity: 'Beta ~1.2. Sehr werbezyklisch — in Rezessionen kürzen Unternehmen digitale Werbung. Aber: Meta ist häufig letzter Cut (Performance-Marketing mit messbarem ROI).',
  },

  'Tesla': {
    ticker: 'TSLA', sector: 'Elektrofahrzeuge / Energie / Autonomes Fahren',
    narrative: 'Tesla ist keine normale Autoaktie. Das Bewertungsmultiple von 60-100x KGV reflektiert nicht das Autogeschäft (wäre mit 10-15x fair) — es reflektiert das Upside-Potenzial von FSD/Robotaxi. Wenn FSD/Robotaxi in 3-5 Jahren skaliert: Aktie könnte sich verdoppeln. Wenn nicht: massive Überbewertung. Das ist die Investment-These in einem Satz.',
    drivers: [
      'Fahrzeug-Auslieferungen (kurzfristiger Kurstreiber): Q1 2025: 336.681 Auslieferungen (-13% YoY) — deutliche Enttäuschung. Preiskrieg mit BYD, Xpeng und anderen chinesischen Herstellern drückt Volumen UND Margen. Markt erwartet 2025 insgesamt 1,8-2,0 Mio. Auslieferungen. Jede 100.000-Einheit-Abweichung vom Konsensus bewegt Aktie ±5-8%.',
      'Automotive Gross Margin (excl. Regulatory Credits): Q1 2025: ~12.5% — historisches Tief. Ziel: >20%. Preissenkungen zur Absatzsteigerung zerstören Margen. Ohne FSD-Credits und Regulatory Credits ist die Automobil-Marge kaum profitabel. Unter 10% = existenzielle Bedrohung des Autogeschäfts.',
      'FSD / Robotaxi (Kernwert der Aktie): FSD v13 mit verbesserter neuronaler Netz-Architektur. Regulatorische Genehmigung für Robotaxi-Dienst in mehr US-Städten = Schlüsselkatalysator. Tesla Cybercab (Robotaxi-Konzept) soll 2026 produziert werden. 1 Mio. autonome Tesla-Taxis mit $0.40/Meile = >$100 Mrd. Revenue/Jahr theoretisch.',
      'Energy Storage (unterschätzter, wachsender Treiber): Megapack (Netzwerk-Batteriespeicher) Q1 2025: 4.1 GWh deployed (+154% YoY). Energy Gross Margin: ~24% — höher als Automotive! Mega-Batteries für Solarparks und Grid-Stabilisierung sind konjunkturresistenter als Auto-Verkäufe.',
      'Elon-Musk-Faktor (idiosynkratisches Risiko): DOGE-Engagement, X/Twitter-Aktivitäten, politische Äußerungen belasten Tesla-Marke in Europa und Liberalen-Segmenten in USA. Q1 2025 Rückgang in Europa: -35% YoY. Marken-Damage ist schwer zu quantifizieren, aber messbar.',
      'Optimus-Roboter (Langfristiger Optionswert): Humanoid-Roboter-Produktion 2025 intern gestartet. Markt zahlt dafür noch nichts (reine Spekulation). Wenn skalierbar: potenziell größter Markt der Techgeschichte ($10+ Bio.). Morgan Stanley schätzt Optimus-Wert bei vollem Erfolg auf >$700/Aktie.',
    ],
    bullScenario: 'FSD erhält regulatorische Genehmigung in 5+ US-Bundesstaaten (2025/26), Cybercab-Launch läuft nach Plan, Automotive-Margen erholen sich auf 18%+ → KGV-Expansion auf 100x gerechtfertigt.',
    bearScenario: 'FSD-Genehmigungen verzögern sich bis 2027+, Marktanteile in China fallen auf <5%, Automotive-Margen unter 10%, Musk-Ablenkung hält an → Multiple-Kompression auf 20-25x.',
    watchFor: 'Quartalszahlen: Deliveries, Automotive Gross Margin (excl. Credits), Energy Revenue, FSD-Aktivierungsrate, Robotaxi-Regulierungsnews',
    macroSensitivity: 'Beta ~2.0. Sehr hohes Marktrisiko. Zinssensibel (Auto-Finanzierung teurer), konsumzyklisch, sehr hohe Bewertung = größte Korrekturanfälligkeit unter S&P-500-Schwergewichten.',
  },

  'Netflix': {
    ticker: 'NFLX', sector: 'Streaming-Entertainment',
    narrative: 'Netflix hat das "Streaming-Wars"-Narrativ gewonnen: Profitabilität stieg von 0% (2022) auf 26%+ Operating Margin (2024). Das Password-Sharing-Crackdown brachte 30+ Mio. neue zahlende Abonnenten. Jetzt ist die Frage: Kann Netflix als Werbeplattform die nächste Profitabilitätsstufe erreichen?',
    drivers: [
      'Paid Memberships (330+ Mio., Q1 2025): Netflix hat angekündigt, keine vierteljährlichen Subscriber-Zahlen mehr zu veröffentlichen — Fokus auf Revenue und Marge. Das reduziert die Volatilität rund um Abonnenten-Enttäuschungen. Stattdessen: ARM (Average Revenue per Member) als Hauptkennzahl.',
      'Advertising Tier (Wachstumstreiber): Ad-Tier hat 40 Mio. monatliche Nutzer (Stand 2024). Werbeumsatz noch klein (~$1-2 Mrd./Jahr) aber wächst >100% YoY. Ziel: Netflix-Werbeplattform mit CPMs auf Level von Premium-TV. Potenzial: $10-15 Mrd. Werbe-Revenue bei voller Skalierung.',
      'ARM-Steigerung (Hauptmarginenhebel): Q1 2025 ARM: ~$17.40/Monat (weltweit). USA/Kanada: $20+/Monat. Preiserhöhungen werden von Abonnenten akzeptiert solange Inhaltsqualität hoch bleibt — Netflix hat historisch 15-20% Churn bei Preiserhöhungen. Mix-Shift zu Ad-Tier mit niedrigerem Abo-Preis drückt ARM kurzfristig.',
      'Content als Wettbewerbsvorteil: $17 Mrd. Content-Budget (2025). Squid Game S2, Wednesday S2, Stranger Things S5 als definierte Viewership-Anker. Live-Events (Jake Paul vs. Mike Tyson, NFL Christmas Games 2024) — live content differenziert von anderen Streamern. Netflix gewinnt Zeitanteile zurück von TikTok/YouTube.',
      'Operating Margin (Profitabilitätsstory): Ziel >26% Operating Margin (2025). Jede Margensteigerung um 1% = ~$680 Mio. mehr Operating Income. Content-Amortisierung statt -Ausgaben = GAAP-Marge>Cash-Marge. Skaleneffekte: Zusätzliche Abonnenten haben fast null Grenzkosten.',
      'Wettbewerb (strukturell bewältigt): Disney+ hat 125 Mio. Abonnenten bei -$4 Mrd. kumuliertem Verlust. Max (Warner) kämpft um Profitabilität. Netflix hat 5+ Jahre Vorsprung in Technologie, Personalisierung und internationaler Content-Produktion.',
    ],
    bullScenario: 'Advertising-Revenue skaliert auf $8 Mrd. (2026), Operating Margin >30%, Live-Events-Rechte sichern differenzierten Content → EPS $30+/Aktie FY2026.',
    bearScenario: 'Subscriber-Wachstum stagniert post-Crackdown, Ad-Tier CPMs enttäuschen, Streaming-Fatigue senkt ARM, Content-Kosten steigen → Multiple-Kompression auf 25-28x.',
    watchFor: 'Revenue Growth %, Operating Margin, ARM-Trend, Ad-Tier-Wachstum, Live-Events-Ankündigungen, Guidance',
    macroSensitivity: 'Beta ~1.2. Relativ defensiv — Streaming ist günstigste Entertainment-Alternative in Rezessionen. Aber: Consumer-Discretionary bei Einkommensschocks.',
  },

  'AMD': {
    ticker: 'AMD', sector: 'Halbleiter / KI-Beschleuniger / Server-CPUs',
    narrative: 'AMD ist der einzige realistische Konkurrent zu Nvidia im KI-GPU-Markt — aber der Abstand ist groß. CUDA-Ökosystem-Lock-In und Nvidias Software-Vorsprung machen es schwer, signifikante Marktanteile zu gewinnen. AMDs Stärke liegt in EPYC-Server-CPUs, wo Intel systematisch verdrängt wird. Das ist AMDs profitabelster und verlässlichster Wachstumstreiber.',
    drivers: [
      'Instinct GPU (MI300X/MI350) für KI (Wachstumstreiber): Q1 2025 Data Center Revenue: $3.7 Mrd. (+57% YoY). MI300X-Nische: Inferenz (nicht Training) und Memory-intensive Workloads (große Language Models benötigen viel VRAM). MI300X hat 192 GB HBM3 vs. Nvidias H100 mit 80 GB — struktureller Vorteil für sehr große Modelle.',
      'EPYC Server CPUs (stabiler, margenstarker Treiber): EPYC gewinnt systematisch Marktanteile von Intel: Von 5% (2020) auf ~25%+ (2025) Marktanteil im x86-Server-Segment. Warum: 2x die Kern-Anzahl, bessere Energie-Effizienz, kompetitiver Preis. Intel kämpft mit Produktionsproblemen (TSMC vs. eigene Fabs). EPYC-Marge: ~60%+.',
      'CUDA vs. ROCm (Haupthindernis für GPU-Dominanz): Nvidias CUDA-Ökosystem: Millionen Entwickler, 10+ Jahre Code-Investment, tausende optimierte Bibliotheken. ROCm (AMDs Alternative): Deutlich kleiner, weniger Unterstützung, höhere Migrationskosten. Solange dies nicht gelöst wird, bleibt AMD ein Nischen-Anbieter für KI-Training.',
      'Hyperscaler als Schlüsselkunden: Microsoft Azure, Google, Meta kaufen MI300X als Nvidia-Diversifizierung. Kein Hyperscaler will 100% Nvidia-Abhängigkeit. AMDs Chance: Auch 20-30% Marktanteil bei wachsendem Gesamtmarkt = massive absolute Revenue-Steigerung.',
      'PC/Client-Segment (Ryzen, zyklisch): PC-Markt erholt sich 2024/25 nach Pandemie-Kater. Ryzen dominiert High-End-PC-Segment. Laptop-AICs (AI-PCs) mit NPU brauchen Ryzen AI 300 = möglicher Wachstumstreiber. Aber: PC-Zyklus ist commoditized, niedrigere Margen als Server.',
      'Embedded-Segment (zyklische Erholung): Automotive, Industrial, Telecom — nach Lagerabbau 2023/24 erholt sich die Nachfrage. Embedded hat bei Normalisierung ~$1.5 Mrd./Quartal Revenue-Potenzial.',
    ],
    bullScenario: 'MI350/MI400 schließt Lücke zu Nvidia in Software-Unterstützung, Hyperscaler vergeben 25% ihrer GPU-Budgets an AMD, EPYC überschreitet 30% Marktanteil → Revenue $35+ Mrd. FY2026.',
    bearScenario: 'Nvidia-Software-Vorsprung wird unangreifbar, CUDA-Migration lohnt sich für Kunden nicht, Custom-Silicon von Microsoft/Google ersetzt AMD ebenfalls → AMD bleibt Nischenanbieter <15% GPU-Marktanteil.',
    watchFor: 'Data Center Revenue YoY%, MI300/MI350-Auslieferungen, EPYC-Marktanteil-Kommentare, Gross Margin (>50% = stark), Guidance',
    macroSensitivity: 'Beta ~1.7. Hohes Marktrisiko, zyklisch durch PC-Markt. KI-Komponente teilweise entkoppelt. Bei Rezessionsangst fällt AMD überproportional (30-40% Drawdown-Potenzial).',
  },

  'JPMorgan': {
    ticker: 'JPM', sector: 'Großbank / Investment Banking / Vermögensverwaltung',
    narrative: 'JPMorgan ist die einzige Großbank, die in jedem Zins- und Konjunkturumfeld profitabel bleibt — und in jedem Krisenszenario stärker aus Verwerfungen hervorgeht (Übernahme First Republic 2023, Washington Mutual 2008). Jamie Dimons Kommentare zur Wirtschaft sind wichtiger als jeder Makro-Bericht.',
    drivers: [
      'Net Interest Income (NII) — Hauptertragsquelle: Q1 2025 NII: ~$23.5 Mrd. Bei Fed Funds Rate von 4.25-4.5% verdient JPM auf der Differenz zwischen Einlagenzins (~0.5-2%) und Kreditrendite (~6-8%). Zinssenkung um 100bps → NII sinkt ~$5-7 Mrd./Jahr. Zinssenkungszyklus ist struktureller NII-Druck.',
      'Loan Loss Provisions (Kreditrisikoindikator): Q1 2025: ~$3.3 Mrd. Rückstellungen. Steigende Provisions signalisieren erwartete Ausfälle — leading indicator für Wirtschaftspessimismus. Bei Rezession: Provisions können sich verdoppeln/verdreifachen. Consumer-Credit-Card-Ausfallrate als Frühindikator (aktuell ~2.5%, historisches Normal: ~3-4%).',
      'Investment Banking (zyklische Ertragssäule): IB-Gebühren Q1 2025: ~$2.0 Mrd. (+13% YoY). M&A-Deal-Volumen ist Funktion von Risikoappetit und Zinsen. Bei niedrigen Zinsen und Bullenmarkt steigen M&A, IPO-Underwriting und ECM-Gebühren. Höhere Zinsen hemmen Leveraged-Buyouts.',
      'ROTCE (Return on Tangible Common Equity): Ziel: >17%. Q1 2025: ~18-20%. Beste unter den Großbanken. Zeigt, wie effizient JPM mit dem Eigenkapital arbeitet. Über 17% = Aktienrückkäufe sinnvoll; unter 15% = strategische Überprüfung notwendig.',
      'Jamie Dimon Commentary: JPM-CEO ist einer der einflussreichsten Wirtschaftskommentatoren. Dimon-Warnungen vor Rezession, Stagflation oder "Sturm am Horizont" bewegen nicht nur JPM-Aktie sondern gesamten Bankensektor. Dimon-Briefe an Aktionäre sind Pflichtlektüre für jeden Investor.',
      'Kapitalquoten (CET1): Basel III Endgame-Regeln erhöhen Kapitalanforderungen. Mehr gebundenes Kapital = weniger Aktienrückkäufe = geringeres EPS-Wachstum. CET1-Quote: ~15.3% (Q1 2025) — weit über Mindestanforderung.',
    ],
    bullScenario: 'Soft Landing, Fed pausiert Zinssenkungen bei 3.75%, IB-Boom durch M&A-Erholung, Provisions bleiben niedrig → ROTCE >20%, KGV-Expansion auf 14-15x.',
    bearScenario: 'Rezession: Loan Losses explodieren (Provisions >$8 Mrd./Q), IB-Gebühren fallen 30%, NII-Druck durch aggressive Fed-Zinssenkungen → KGV-Kompression auf 8-10x.',
    watchFor: 'NII-Guidance, Loan Loss Provisions, Investment Banking Revenue, ROTCE, CET1-Quote, Dimon-Kommentare zur Wirtschaft',
    macroSensitivity: 'Beta ~1.1. Direkt abhängig von Fed-Zinspfad und Konjunkturverlauf. Profitiert von hohen Zinsen (NIM) — leidet bei Zinssenkungen und Rezession. Defensiver als reine IB-Banken durch diversifizierte Geschäftsmodell.',
  },

  // ── DEUTSCHE / EUROPÄISCHE AKTIEN ─────────────────────────────────────
  'Volkswagen': {
    ticker: 'VOW3.DE', sector: 'Automobil / Elektromobilität',
    narrative: 'VW steckt in einer existenziellen Transformation: Europas größter Autobauer muss gleichzeitig das Verbrenner-Massengeschäft verteidigen UND Milliarden in Elektromobilität investieren — während chinesische Konkurrenten wie BYD mit halb so teuren EVs kommen. Die Bewertung reflektiert diese Unsicherheit: VW handelt auf Tiefstständen mit KGV <5.',
    drivers: [
      'China-Desaster (akutes Strukturproblem): China-Umsatz: ~35% des Konzernumsatzes 2023, fällt auf ~28% (2024). Marktanteil in China: Von 22% (2018) auf 14% (2024) — BYD, NIO, SAIC-GM-Wuling verdrängen VW systematisch. Preiskrieg durch chinesische Hersteller erzwingt VW-Preissenkungen bei ohnehin schlechten Margen.',
      'Restrukturierungsprogramm (operative Wende): Geplante Werksschließungen in Deutschland (erstes Mal seit VW-Geschichte). 35.000 Stellenabbau bis 2030. Kostensenkungsziel: €10 Mrd./Jahr bis 2026. Markt beobachtet Umsetzungsfortschritt — Verzögerungen durch Betriebsrat-Widerstand sind Risiko.',
      'ID.-Baureihe vs. Konkurrenz: ID.3, ID.4 haben technisch gute Bewertungen, aber Verkaufszahlen enttäuschen. VW-EV-Absatz 2024: ~900.000 (vs. BYD: 3.6 Mio.). Software-Probleme (keine intuitive Integration wie Tesla). VW benötigt 2+ Jahre um Tesla/BYD-Software-Qualität zu erreichen.',
      'Porsche AG / Audi (Bewertungsanker): Porsche AG (25% VW-Eigentum via Porsche SE): Marktkapitalisierung ~€70 Mrd. Allein Porsches Anteil wäre mehr wert als VW-Konzerns gesamte Börsenbewertung in Krisenzeiten — struktureller Bewertungsanker.',
      'Energiekosten & Wettbewerbsfähigkeit: Europäische Industriestrompreise: 3-4× höher als in USA oder China. VW zahlt strukturell mehr für Produktion als Tesla (Texas/Nevada) oder BYD (China). Elektromobilitäts-Subventionen in Deutschland weggefallen (2024) — weiterer Nachfrageeinbruch.',
      'Dividende & FCF: VW zahlt historisch hohe Dividenden (Dividendenrendite >6%). Bei Free Cashflow-Druck können Dividenden gekürzt werden — strukturelles Risiko für yield-orientierte Investoren.',
    ],
    bullScenario: 'Restrukturierung läuft nach Plan, China-Markt stabilisiert sich bei 20% Marktanteil, EV-Software-Qualität verbessert sich, Bewertung KGV 6-8x als faire Kompensation.',
    bearScenario: 'China-Marktanteil fällt auf <10%, Restrukturierung scheitert an Arbeitnehmerprotesten, EU-Strafzölle triggern chinesische Gegenmaßnahmen → KGV <4x, Dividendenkürzung.',
    watchFor: 'China-Absatzzahlen monatlich, EV-Auslieferungen, operative Marge (VW-Brand: Ziel >6.5%), Restrukturierungsfortschritt, Free Cashflow',
    macroSensitivity: 'Beta ~1.4. Sehr zyklisch: Consumer-Discretionary + China-Abhängig + Exportorientiert. EUR/CNY und EUR/USD sind direkte Ertragseffekte. IFO-Klimaindex als leading indicator.',
  },

  'Siemens': {
    ticker: 'SIE.DE', sector: 'Industrieautomation / Digitalisierung / Infrastruktur',
    narrative: 'Siemens ist nicht mehr der klassische Industriekonzern — er ist zunehmend ein Industrie-Software-Unternehmen. Xcelerator-Plattform (PLM, Digitaler Zwilling, Industrial IoT) wächst wie ein SaaS-Unternehmen mit ~12-15% YoY. Das Rechenzentrum-Boom ist ein direkter Nachfragetreiber für Siemens Smart Infrastructure.',
    drivers: [
      'Digital Industries (Flaggschiff-Segment): Fabrikautomation (PLC, SCADA), PLM-Software (NX, Teamcenter), Industrial IoT. Xcelerator-SaaS-Revenue wächst ~15% YoY bei ~70% Gross Margin. Book-to-Bill-Ratio >1.0 = Wachstum; <1.0 = Auftrags-Schwäche. 2024: Kurzzyklische Schwäche durch Lagerabbau bei Kunden.',
      'Smart Infrastructure (Wachstumsbeschleuniger): Rechenzentrum-Boom treibt Nachfrage nach Mittelspannungs-Anlagen, USV, Gebäudeautomation. Segment wächst 2024/25 besonders stark durch KI-Infrastruktur-Investitionen global. Siemens liefert nicht die KI-Chips, aber die elektrische Infrastruktur, die sie betreibt.',
      'Reshoring-Trend (struktureller Langzeittreiber): Neue Halbleiterfabriken (TSMC Arizona, Intel Magdeburg) und Pharma-Fabriken (post-COVID Supply-Chain-Resilienz) brauchen Fabrikautomation → Siemens Digital Industries. Dieser Trend dauert 5-10 Jahre.',
      'Mobility (Infrastruktur-Langzeitverträge): Hochgeschwindigkeitszüge, U-Bahnen, Signaltechnik für Bahn-Modernisierung weltweit. Hohe Auftragsvisibilität (3-5 Jahre Backlog), aber niedrige Margen (~8-10%).',
      'Software-Anteil als Bewertungsmotor: Software macht ~25% des Revenue aus bei ~65% Bruttomargen. Je höher Software-Anteil, desto höher das Bewertungsmultiple (Richtung 20-25x P/E anstatt 12-15x Industrie-P/E).',
      'Europa-Stärke und -Schwäche: Starker Euro belastet USD-Umsätze in EUR-Berichtswährung. EZB-Zinssenkungen verbessern Kapitalmarktbedingungen für Industrieinvestitionen. Deutsche Industrieschwäche 2023/24 drückt kurzzyklisches Auftragsvolumen.',
    ],
    bullScenario: 'Digital Industries erholt sich nach Lagerabbau, Xcelerator-Software wächst >20%, Rechenzentrum-Boom beschleunigt Smart-Infrastructure-Wachstum → EPS €12+ FY2026.',
    bearScenario: 'Globale Industrie-Rezession bricht kurzzyklische Aufträge ein, EZB-Zinsstruktur belastet Capex-Investitionen, China-Geschäft schwächt sich weiter ab → KGV-Kompression auf 12-14x.',
    watchFor: 'Order Intake (besonders Digital Industries), Book-to-Bill-Ratio, Xcelerator-Revenue-Wachstum, Jahresziele-Bestätigung, Smart-Infrastructure-Auftragslage',
    macroSensitivity: 'Beta ~1.0. Zyklisch mit Industrie-Capex-Zyklen, aber diversifiziert durch Software und Infrastruktur-Langzeitverträge. Defensiver als reine Zyklikerwerte.',
  },

  // ── INDIZES ───────────────────────────────────────────────────────────
  'DAX': {
    ticker: '^GDAXI', sector: 'Deutscher Leitindex (40 Unternehmen)',
    narrative: 'Der DAX ist der meistzyklische Index unter den großen westlichen Leitindizes — und gleichzeitig strukturell unter Druck. Deutschland kämpft mit hohen Energiepreisen, China-Abhängigkeit, demografischem Wandel und mangelnder Digitalisierung. Gleichzeitig: Rüstungsaktien (Rheinmetall +600% in 2 Jahren) und Luxus/Gesundheitssektor als Gegengewicht.',
    drivers: [
      'China-Abhängigkeit (systemisches Risiko): BASF (~30% China-Umsatz), BMW (~30%), Mercedes (~35%), VW (~28%), Siemens (~20%) — zusammen >€200 Mrd. China-Umsatz im DAX. Jeder negative China-Datenpunkt (PMI, Einzelhandel, Immobilien) trifft den DAX direkt. China-Stimulus → DAX-Rally.',
      'Deutsche Wirtschaftslage: BIP-Wachstum 2023: -0.3%; 2024: 0.0%; Prognose 2025: 0.2%. IFO-Geschäftsklimaindex als leading indicator — unter 85 = Kontraktion, über 95 = Expansion. ZEW-Erwartungsindex: Optimismus der Analysten für deutsche Wirtschaft in 6 Monaten.',
      'EZB-Zinspolitik: EZB-Leitzins bei ~2.65% (Mai 2026) — Zinssenkungszyklus entlastet Export-finanzierung und Immobilien. Schwächerer Euro (oft Begleiterscheinung von EZB-Lockerung) erhöht den EUR-Wert von USD/CNY-Umsätzen der Exporteure mechanisch.',
      'Auto-Sektor (~20% DAX-Gewichtung): VW, BMW, Mercedes, Porsche, Continental. Strukturelle Herausforderung: Chinesische EV-Hersteller (BYD) dringen in Europa ein, Verbrenner-Verbot 2035. EU-Zölle auf chinesische EVs (17-35%) als politische Gegenmaßnahme.',
      'Rüstung & Defense (~5-8% DAX, wachsend): Rheinmetall, Hensoldt, Renk profitieren massiv von NATO-2%-Ziel und Ukraine-Konflikt. Rheinmetall: Revenue-Guidance 2025 >€10 Mrd. (+40% YoY). Defense ist der einzige Sektor, wo Deutschland strukturell investiert.',
      'EUR/USD Wechselkurs: Bei EUR/USD von 1.00 vs. 1.10 → +10% mehr EUR-Revenue für alle US-Dollar-Einnahmen. DAX-Exportwerte sind natürliche EUR/USD-Shorts. Dollar-Stärke = DAX-Rückenwind.',
    ],
    bullScenario: 'China-Stimulus stabilisiert Nachfrage, EZB senkt aggressiv auf 2%, EUR/USD fällt auf 1.00-1.05, Rüstungsausgaben steigen → DAX >25.000.',
    bearScenario: 'China-Konjunktur kollabiert, EU-Zollkrieg mit China, Energiekrise 2.0, deutsche Rezession → DAX-Korrektur auf 15.000-17.000.',
    watchFor: 'IFO-Geschäftsklima (monatlich), ZEW-Erwartungen, PMI Industrie/Dienstleistungen, EUR/USD-Kurs, China-Konjunkturdaten, EZB-Statements',
    macroSensitivity: 'Einer der zyklischsten Indizes der Welt. Hoher Industrie- und Export-Anteil macht ihn besonders sensitiv für globale Konjunktur, Währungseffekte und China.',
  },

  'S&P 500': {
    ticker: '^GSPC', sector: 'US-Aktienmarkt — 500 größte Unternehmen',
    narrative: 'Der S&P 500 wird von 7 Unternehmen (Magnificent 7) mit >33% Gewichtung dominiert. Das bedeutet: Der "breite Markt" ist in Wahrheit ein konzentriertes Tech-Portfolio. Das Forward P/E von ~21x (historisch ~16x) ist nur zu rechtfertigen, wenn die KI-Wachstumsstory liefert. Der Index ist Fed-sensitiver als je zuvor.',
    drivers: [
      'Fed-Zinspfad (stärkster Einzeltreiber): Fed Funds Rate bei 4.25-4.5% (Mai 2026). Jede 25bps-Senkung → ~2-3% S&P-Anstieg (historisch). "Higher for longer" bei Fed = Bewertungsdruck auf wachstumsorientierte Tech-Titel. PCE-Inflation >2.5% verhindert aggressive Zinssenkungen — zentraler Hemmschuh.',
      'Magnificent 7 Earnings (Konzentrationsrisiko): AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA = >33% des S&P 500 — und >40% des Gewinnwachstums. Wenn alle 7 enttäuschen → S&P-Drawdown -15 bis -25%. Wenn alle 7 überliefern → S&P-Anstieg +20-30%/Jahr ist möglich.',
      'Forward P/E (~21x): Historischer Durchschnitt: ~16x. Premium ist gerechtfertigt durch: KI-Produktivitätsgewinne, Aktienrückkäufe, und die "Exzeptionalismus"-These der US-Wirtschaft. ABER: Jede Rezessionsangst → Multiple-Kompression auf 15-17x = S&P-Korrektur von -25 bis -30%.',
      'Konjunkturerwartungen (Soft Landing vs. Rezession): NFP (Non-Farm Payrolls) monatlich, CPI monatlich, GDP Quartalsweise — die drei wichtigsten Datenpunkte. Soft Landing = S&P bullish. Rezession = S&P -30% oder mehr. Die Yield-Curve (2Y-10Y) als leading indicator für Rezession (invertiert = Warnsignal).',
      'Aktienrückkäufe (~$1 Bio./Jahr): US-Konzerne kaufen ~$1 Bio. eigene Aktien jährlich zurück. Das ist mechanischer Kursstützung. Bei Gewinneinbrüchen werden Rückkäufe gestoppt — dieser Wegfall verstärkt Abschwünge.',
      'VIX als Angstbarometer: VIX unter 15 = Sorglosigkeit, Markt in Risk-on. VIX 20-30 = erhöhte Unsicherheit. VIX über 30 = Krisenmodus. Historisch ist VIX-Spike über 40 ein Kaufsignal (Kapitulation). VIX-Anstieg von 15 auf 25 ohne Wirtschaftsschock = Korrektur von 8-12% often follows.',
    ],
    bullScenario: 'KI-Produktivitätsgewinne beschleunigen EPS-Wachstum auf 15%+/Jahr, Fed senkt Zinsen auf 3%, keine Rezession → S&P 7.000-8.000 bis Ende 2026.',
    bearScenario: 'Rezession, CPI re-accelerates auf >3.5%, Fed kann nicht senken, Magnificent-7-Earnings enttäuschen → S&P-Korrektur auf 3.800-4.200 (-35 bis -40%).',
    watchFor: 'Fed-Statements und Dot Plot, CPI/PCE-Inflation monatlich, NFP, Quartalsergebnisse der Top-10, Forward P/E-Entwicklung, VIX',
    macroSensitivity: 'Global-Risk-Barometer. Höchst sensitiv für Fed-Signale, US-Makrodaten und geopolitische Risiken. Beta per Definition 1.0, aber Tail-Risk deutlich asymmetrisch.',
  },

  // ── KRYPTOWÄHRUNGEN ───────────────────────────────────────────────────
  'Bitcoin': {
    ticker: 'BTC-USD', sector: 'Kryptowährung / Digitales Gold',
    narrative: 'Bitcoin hat 2024 durch die Spot-ETF-Zulassung (BlackRock iShares: >$60 Mrd. AUM in 12 Monaten) eine neue Anlegerklasse erschlossen. Das April-2024-Halving (Block-Reward: 6.25 → 3.125 BTC) reduziert das jährliche neue Angebot auf ~165.000 BTC — bei strukturell steigender Nachfrage. Die historischen Halving-Zyklen (Preishöchststand 12-18 Monate nach Halving) sind ein bekanntes Muster.',
    drivers: [
      'Spot-ETF-Flows (dominanter kurzfristiger Treiber): BlackRock IBIT, Fidelity FBTC, ARK 21Shares zusammen >$100+ Mrd. AUM. Tägliche Nettozuflüsse/-abflüsse sind direkt kursbewegende Datenpunkte. Positive Flows >$500 Mio./Tag = bullish. Negative Flows >$500 Mio./Tag = bearish. ETF-Investoren sind weniger emotionale "Diamond Hands" als Krypto-Urgesteine.',
      'Halving-Zyklus (April 2024): Block-Reward halbiert = ~$2 Mrd. weniger monatliches Angebot bei aktuellem Preisniveau. Historisch folgte jedes Halving von einem Bull-Market-Peak 12-18 Monate später. 2024-Halving → erwarteter Zyklushöhepunkt: Mitte bis Ende 2025. Aber: Vergangene Performance ≠ zukünftige Renditen.',
      'Institutionelle Adoption: MicroStrategy: ~600.000+ BTC (~$50+ Mrd. zu aktuellen Preisen). El Salvador: gesetzliches Zahlungsmittel. US-Federal-Government erwägt strategische Bitcoin-Reserve. Pro-Krypto-Regulierungsumfeld unter Trump-Administration ist positiver Windchange seit 2024.',
      'US-Regulierung (strukturelles Risiko/Chance): SEC-Klage gegen Coinbase abgewiesen (2024), Bitcoin als Rohstoff (nicht Wertpapier) klassifiziert. Strategic Bitcoin Reserve-Diskussionen. Mehr Banken erhalten Krypto-Custody-Genehmigungen. Regulatory clarity = Institutioneller Zufluss.',
      'Makro-Korrelation: In Risk-off-Phasen (Rezession, Marktstress) fällt BTC oft stärker als Aktien (-50 bis -80% in Bärenmärkten). Langfristig steigende Korrelation mit "digitales Gold"-Narrativ, aber kurzfristig bleibt BTC High-Beta-Risk-Asset.',
      'On-Chain-Indikatoren: MVRV-Ratio >3.5 = historisch überkauft; <1 = Kaufzone. Exchange-Reserven fallend = weniger Verkaufsdruck. Long-Term-Holder (>1 Jahr) Anteil: >75% = starke Halte-Überzeugung.',
    ],
    bullScenario: 'ETF-Zuflüsse halten an ($500+ Mio./Tag), US-strategische Bitcoin-Reserve wird konkret, Halving-Zyklus peak 2025 wie historisch → $150.000-200.000 Reichweite.',
    bearScenario: 'Makro-Rezession triggert Risk-off, ETF-Abflüsse, Regulierungsrückschlag in EU oder Asien, MVRV >4.0 Überhitzung → -50 bis -70% Drawdown möglich.',
    watchFor: 'ETF-Nettomittelflüsse (täglich), Exchange-Reserven, MVRV-Ratio, US-Regulierungsnews, Makro-Risk-Sentiment, On-Chain-Aktivität',
    macroSensitivity: 'High-Beta Risk-Asset (Korrelation mit Nasdaq in Krisen: ~0.7). Kein sicherer Hafen kurzfristig. Langfristiger Digital-Gold-Charakter erst ab 10+ Jahre Zeithorizont erkennbar.',
  },

  'Ethereum': {
    ticker: 'ETH-USD', sector: 'Smart Contract Plattform / DeFi / Layer-2',
    narrative: 'Ethereum ist die Plattform für dezentrale Anwendungen — DeFi, NFTs, Stablecoins, tokenisierte Assets. Die strategische Frage: Ist Ethereums Layer-1-Modell mit Layer-2-Skalierung zukunftsfähig, oder gewinnen Solana/andere Chains Ökosystem-Marktanteile? ETH ist strukturell schwächer als BTC in diesem Marktzyklus.',
    drivers: [
      'DeFi Total Value Locked (TVL): TVL im Ethereum-Ökosystem ~$50-80 Mrd. (Mai 2025). Höheres TVL = mehr Gebühreneinnahmen = deflationärerer ETH-Burn. DeFi-Aktivität ist Funktion von Risikoappetit und ETH-Preis (zirkuläre Logik). Aave, Uniswap, Lido als Top-3-TVL-Protokolle.',
      'EIP-1559 Burn-Mechanismus: Bei hoher Netzwerkaktivität wird ETH deflationär verbrannt. Bei >15 Gwei Basisgebühr: mehr ETH verbrennt als neu emittiert wird. Post-Merge (PoS): ETH-Emission stark reduziert. Aktuell: ETH ist leicht inflationär durch niedrige Netzwerkaktivität.',
      'ETH Spot ETF (schwache Flows): BlackRock ETHA, Fidelity FETH — aber Flows deutlich schwächer als Bitcoin-ETFs (~$3-5 Mrd. vs. $100+ Mrd. für BTC-ETFs). Institutionelle Investoren sehen ETH als "riskanteres Krypto-Beta" ohne ähnliche Store-of-Value-These wie BTC.',
      'Solana-Konkurrenz (strukturelle Herausforderung): SOL ist schneller (65.000 TPS vs. ETH L1: 15 TPS), günstiger ($0.0001/Tx vs. ETH: $1-10). Meme-Coins, Retail-DeFi wandern zu Solana. ETH hält Advantage in Security, Dezentralisierung und Layer-2-Ökosystem (Arbitrum, Base, Optimism).',
      'Pectra-Upgrade (2025): Verbesserung der Layer-2-Integration, Account-Abstraction, Blob-Kapazitätssteigerung. Layer-2-Fees fließen weniger an ETH L1 als ursprünglich erwartet — das ist ein strukturelles Revenue-Problem für ETH-Inhaber.',
      'Staking-Rendite (~3.5-4% APY): ETH ist durch Staking ein "Yield-Asset". 28+ Mio. ETH gestaked (~$70+ Mrd.). Lido Finance = 30% Marktanteil beim Staking — Dezentralisierungsrisiko. Staking-Rendite sinkt mit steigender Participation-Rate.',
    ],
    bullScenario: 'DeFi-Adoption skaliert durch tokenisierte Real-World-Assets (BlackRock BUIDL), Pectra verbessert L2-Integration, ETH-ETF-Flows beschleunigen sich → ETH/BTC-Ratio steigt auf 0.08+.',
    bearScenario: 'Solana dominiert Consumer-DeFi-Markt, ETH L1 verliert Relevanz, Layer-2s "extrahieren" Wert ohne ETH zu verbrennen → ETH/BTC-Ratio fällt auf 0.02-0.03.',
    watchFor: 'DeFi TVL, ETH-Burn-Rate (deflationary?), ETF-Flows, Gas-Fees-Niveau, Layer-2-Aktivität, ETH/BTC-Ratio als Sentiment-Indikator',
    macroSensitivity: 'Höheres Beta als Bitcoin (1.2-1.5x BTC-Bewegungen typisch). Stärker von Krypto-spezifischer Aktivität abhängig. Kein sicherer Hafen.',
  },

  // ── ROHSTOFFE ─────────────────────────────────────────────────────────
  'Gold': {
    ticker: 'GC=F', sector: 'Edelmetall / Sicherer Hafen / Inflation-Hedge',
    narrative: 'Gold hat 2024/25 alle-Zeithochs erreicht trotz hoher Realzinsen — das widerspricht dem klassischen Modell. Der Grund: Zentralbank-Käufe (besonders China, Indien, Türkei) schaffen eine neue, preisunelastische Nachfragequelle. Das "Ende des Dollar-Monopols"-Narrativ treibt institutionelle Diversifikation hin zu Gold.',
    drivers: [
      'Reale Zinsen / TIPS-Yields (klassischer Haupttreiber): 10Y TIPS-Yield bei ~2.0% (Mai 2025). Historisch: Steigendes Real-Yield → Gold fällt (Opportunitätskosten). Fallende Real-Yields → Gold steigt. ABER 2024/25 hat Gold TROTZ hoher Realzinsen neue Hochs erreicht — die klassische Korrelation ist gebrochen. Das deutet auf strukturell neue Nachfragequellen hin.',
      'USD-Stärke (DXY-Index): Gold wird in USD notiert → schwächerer Dollar = höherer Goldpreis mechanisch. DXY und Gold haben historisch -0.7 Korrelation. Fed-Zinssenkungserwartungen = schwächerer USD = Gold-bullish. De-Dollarisierungsnarrative schwächen USD langfristig strukturell.',
      'Zentralbank-Käufe (neuer struktureller Treiber): 2024: Weltweit >1.000 Tonnen Netto-Zentralbankkäufe (3. Jahr in Folge). China: Reduziert USD-Reserven und kauft Gold (Sanktionsrisiko nach Ukraine-Erfahrung). Indien, Türkei, Polen ebenfalls große Käufer. Dieser Nachfragestrom ist preisunelastisch und vorhersehbar.',
      'Geopolitische Risikoprämie: Ukraine-Krieg, Nahost-Konflikt, US-China-Spannungen = erhöhte Tail-Risk-Wahrnehmung. Anleger zahlen Risikoaufschlag für "echtes" Eigentum. Jede neue Eskalation treibt Kurzzyklus-Spike von 2-5%.',
      'Westliche ETF-Flows (schwankend, weniger relevant als früher): SPDR GLD, iShares IAU. Westliche institutionelle Investoren waren 2022-2023 Netto-Verkäufer — die Rally wurde trotzdem von Zentralbanken und asiatischer Privatnachfrage getragen. ETF-Flows bleiben wichtig für Sentiment, sind aber nicht mehr alleiniger Treiber.',
      'Goldpreis vs. Mining-Kosten: All-in Sustaining Cost (AISC) der großen Goldminen: ~$1.300-1.500/Unze. Bei Goldpreis >$2.500 haben Goldminen-Aktien (Barrick, Newmont) massive Margin-Expansion. Goldpreis unter AISC = Minen stellen Produktion ein → Angebotsdisziplin.',
    ],
    bullScenario: 'Fed-Zinssenkungen senken Real-Yields auf 1.0%, USD schwächt sich, Zentralbanken kaufen >1.200 Tonnen/Jahr weiter, geopolitische Eskalation → $3.500-4.000/Unze.',
    bearScenario: 'Inflation re-accelerates (Fed muss Zinsen erhöhen), USD stärkt sich auf DXY >110, Zentralbanken pausieren Käufe, Risk-on eliminiert Sicherheitsaufschlag → $2.000-2.200/Unze.',
    watchFor: '10Y TIPS-Yield, DXY-Entwicklung, Monatliche Zentralbank-Kaufdaten (WGC), Fed-Signale, Geopolitik-Eskalationsrisiken',
    macroSensitivity: 'Klassischer sicherer Hafen — steigt bei Rezessionsangst, Inflation, Staatsschuldenkrisen und geopolitischer Unsicherheit. Korrelation mit Aktien in Krisen oft negativ.',
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
  '1T': {
    label: 'Heute', tf: 'Intraday',
    focus: 'Analysiere NUR was HEUTE passiert ist: aktuelle News, Pre-/After-Market-Reaktionen, Intraday-Bewegungen. Keine Monats- oder Jahresrückblicke.',
    timeWord: 'heute', perspective: 'kurzfristig',
    ausblick: 'Was in den nächsten 1-3 Tagen relevant wird (z.B. bevorstehende Earnings, Makrodaten, Fed-Statements).',
  },
  '1W': {
    label: 'Diese Woche', tf: '1-Wochen-Zeitraum',
    focus: 'Analysiere die Entwicklung dieser Woche: welche News/Ereignisse haben die Bewegung der letzten 5 Handelstage getrieben?',
    timeWord: 'diese Woche', perspective: 'kurzfristig',
    ausblick: 'Was in den nächsten 1-2 Wochen relevant wird (Earnings-Saison, Makrodaten, Sektorbewegungen).',
  },
  '1M': {
    label: 'Letzter Monat', tf: '1-Monats-Zeitraum',
    focus: 'Analysiere die Monatsbewegung: Quartalszahlen, Zinsentscheidungen, strukturelle Sektorfaktoren der letzten 4 Wochen.',
    timeWord: 'diesen Monat', perspective: 'mittelfristig',
    ausblick: 'Was in den nächsten 4-6 Wochen relevant wird (nächste Earnings-Saison, Makro-Regime, Sektordynamik).',
  },
  '6M': {
    label: 'Letzte 6 Monate', tf: '6-Monats-Zeitraum',
    focus: 'Analysiere das Halbjahr: strukturelle Faktoren, Makro-Regime-Wechsel, strategische Entwicklungen die über Wochen wirkten.',
    timeWord: 'in den letzten 6 Monaten', perspective: 'mittelfristig',
    ausblick: 'Welche strukturellen Treiber in den nächsten 3-6 Monaten dominieren werden.',
  },
  '1J': {
    label: 'Letztes Jahr', tf: '1-Jahres-Zeitraum',
    focus: 'Analysiere das gesamte Jahr: regulatorische Änderungen, mehrere Earnings-Zyklen, Marktpositionierungsverschiebungen.',
    timeWord: 'im letzten Jahr', perspective: 'langfristig',
    ausblick: 'Langfristige strukturelle Faktoren und strategische Ausrichtung (12-24 Monate Horizont).',
  },
  '5J': {
    label: 'Letzte 5 Jahre', tf: '5-Jahres-Zeitraum',
    focus: 'Analysiere mehrjährige Zyklen: technologische Disruption, strategische Neuausrichtungen, Marktstrukturwandel über Wirtschaftszyklen.',
    timeWord: 'in den letzten 5 Jahren', perspective: 'langfristig (mehrjährig)',
    ausblick: 'Strategische Megatrends und strukturelle Verschiebungen (3-5+ Jahre Horizont).',
  },
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

function fmtBn(n) { return n >= 1e12 ? (n/1e12).toFixed(2)+'B €/$ (Bio.)' : n >= 1e9 ? (n/1e9).toFixed(1)+'B' : n >= 1e6 ? (n/1e6).toFixed(0)+'M' : n.toLocaleString(); }

function buildFundBlock(f) {
  if (!f || Object.keys(f).length === 0) return '';
  const rows = [];

  // Bewertung
  if (f.marketCap && !f.isCrypto) rows.push(`Market Cap ${fmtBn(f.marketCap)}`);
  if (f.pe)        rows.push(`KGV ${f.pe.toFixed(1)}${f.pe > 40 ? ' (hoch)' : f.pe < 12 ? ' (günstig)' : ''}`);
  if (f.forwardPE) rows.push(`Forward-KGV ${f.forwardPE.toFixed(1)}`);
  if (f.pegRatio)  rows.push(`PEG ${f.pegRatio.toFixed(2)}`);
  if (f.pb)        rows.push(`P/B ${f.pb.toFixed(1)}x`);
  if (f.eps)       rows.push(`EPS ${f.eps.toFixed(2)}`);
  if (f.beta)      rows.push(`Beta ${f.beta.toFixed(2)}`);
  if (f.dividendYield) rows.push(`Dividende ${f.dividendYield}%`);

  // Umsatz & Wachstum
  if (f.revenue)       rows.push(`Umsatz ${fmtBn(f.revenue)}`);
  if (f.revenueGrowth) rows.push(`Umsatzwachstum ${f.revenueGrowth}%`);
  if (f.earningsGrowth !== undefined && f.earningsGrowth !== null) rows.push(`Gewinnwachstum ${f.earningsGrowth}%`);

  // Rentabilität
  if (f.grossMargin)    rows.push(`Bruttomarge ${f.grossMargin}%`);
  if (f.operatingMargin !== undefined && f.operatingMargin !== null) rows.push(`Op.Marge ${f.operatingMargin}%`);
  if (f.netMargin || f.profitMargin) rows.push(`Nettomarge ${f.netMargin || f.profitMargin}%`);
  if (f.roe)            rows.push(`ROE ${f.roe}%`);

  // Bilanz / Cash
  if (f.freeCashflow)  rows.push(`FCF ${fmtBn(f.freeCashflow)}`);
  if (f.debtToEquity !== undefined && f.debtToEquity !== null) rows.push(`Verschuldung ${f.debtToEquity}%`);

  // 52W Position
  if (f.weekHigh52 && f.weekLow52) {
    rows.push(`52W ${f.weekLow52.toLocaleString('de-DE')}–${f.weekHigh52.toLocaleString('de-DE')}`);
  }

  // Krypto-spezifisch
  if (f.isCrypto) {
    if (f.marketCap)  rows.push(`Market Cap ${fmtBn(f.marketCap)}`);
    if (f.volume24Hr) rows.push(`24h-Volumen ${fmtBn(f.volume24Hr)}`);
  }

  if (f.ebitda) rows.push(`EBITDA ${fmtBn(f.ebitda)}`);

  if (rows.length === 0) return '';
  return `\n\nFUNDAMENTALDATEN: ${rows.join(' | ')}`;
}

function parseSections(raw) {
  const sections = {};
  const re = /\[(MODELL|BEWERTUNG|WACHSTUM|RISIKEN)\]\s*([\s\S]*?)(?=\s*\[(MODELL|BEWERTUNG|WACHSTUM|RISIKEN)\]|$)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    sections[m[1].toLowerCase()] = m[2].replace(/\*\*/g,'').replace(/\*/g,'').replace(/#{1,6}\s/g,'').trim();
  }
  return sections;
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

async function fetchYahooProfile(symbol) {
  if (!symbol || symbol.startsWith('^') || symbol.endsWith('-USD') || symbol.endsWith('=F')) return null;
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryProfile`;
    const raw = await new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        timeout: 3500
      }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      });
      req.on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('t')); });
    });
    const sp = raw?.quoteSummary?.result?.[0]?.summaryProfile;
    if (!sp) return null;
    return {
      description: sp.longBusinessSummary ? sp.longBusinessSummary.slice(0, 480) : null,
      industry: sp.industry || null,
      sector: sp.sector || null,
    };
  } catch(e) { return null; }
}

function callGroq(model, system, user, apiKey) {
  const body = JSON.stringify({
    model, max_tokens: 1400, temperature: 0.2,
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

// ── SERVER-SIDE CACHE & REQUEST-DEDUPLICATION ─────────────────────────────
// Auto-Analysen werden pro warmer Vercel-Instanz gecacht. Bei parallelen
// Anfragen für denselben Key wartet die zweite auf die laufende statt
// einen zweiten Groq-Call zu starten.
const analyseCache = {};
const analyseInflight = {};
const ANALYSE_SERVER_TTL = {
  '1T': 30 * 60 * 1000,      // 30 min
  '1W': 3 * 60 * 60 * 1000,  // 3 h
  '1M': 6 * 60 * 60 * 1000,  // 6 h
  '6M': 12 * 60 * 60 * 1000, // 12 h
  '1J': 18 * 60 * 60 * 1000, // 18 h
  '5J': 24 * 60 * 60 * 1000, // 24 h
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { asset, symbol, price, changePct, isPos, frage, news, range, level, fundamentals, macro } = req.body || {};
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API Key fehlt' });

  // Server-Cache Lookup für Auto-Analysen (nicht für Freitext-Fragen)
  const cacheKey = !frage ? `${asset}|${symbol}|${range || '1T'}|${level || 'beginner'}` : null;
  if (cacheKey) {
    const ttl = ANALYSE_SERVER_TTL[range] || ANALYSE_SERVER_TTL['1T'];
    const hit = analyseCache[cacheKey];
    if (hit && (Date.now() - hit.ts) < ttl) {
      return res.status(200).json({ ...hit.data, fromServerCache: true });
    }
    // Request-Deduplication: parallel call zum selben Key → auf laufendes Promise warten
    if (analyseInflight[cacheKey]) {
      try {
        const data = await analyseInflight[cacheKey];
        return res.status(200).json({ ...data, fromInflight: true });
      } catch(e) { /* falls inflight failed, normal weiter */ }
    }
  }

  const ctx = RANGE_CONTEXT[range] || RANGE_CONTEXT['1T'];
  const levelPrompt = LEVEL_PROMPTS[level] || LEVEL_PROMPTS['beginner'];
  const richtung = isPos ? `+${Math.abs(changePct || 0).toFixed(2)}%` : `-${Math.abs(changePct || 0).toFixed(2)}%`;

  // Instrument-Profil bestimmen
  const profile = getProfile(asset, fundamentals);

  // Parallel: Enrich + Makro + Yahoo Unternehmensprofil (für unbekannte Instrumente)
  const finnhubKey = process.env.FINNHUB_API_KEY;
  const priceNum = parseFloat(String(price || '0').replace(/[^0-9.]/g, '')) || null;

  const [enrichResult, macroLine, yahooProfile] = await Promise.all([
    symbol && finnhubKey
      ? enrichSymbol(symbol, finnhubKey, priceNum).catch(() => ({ context: '' }))
      : Promise.resolve({ context: '' }),
    macro?.fedRate
      ? Promise.resolve(`Makro: Fed ${macro.fedRate}% | EZB ${macro.ecbRate || '?'}% | CPI ${macro.cpiYoy || '?'}%`)
      : getLiveMacro(),
    !profile.found && !fundamentals?.isCrypto && !fundamentals?.description
      ? fetchYahooProfile(symbol).catch(() => null)
      : Promise.resolve(null),
  ]);

  // Unternehmenskontext für unbekannte Instrumente:
  // 1. Bevorzugt: description kommt direkt aus quote.js (Yahoo quoteSummary)
  // 2. Fallback: fetchYahooProfile wenn quote.js keine description geliefert hat
  if (!profile.found) {
    if (fundamentals?.description) {
      profile.narrative = fundamentals.description;
      if (fundamentals.industry) profile.sector = fundamentals.industry;
      else if (fundamentals.sector) profile.sector = fundamentals.sector;
    } else if (yahooProfile) {
      if (yahooProfile.description) profile.narrative = yahooProfile.description;
      if (yahooProfile.industry) profile.sector = yahooProfile.industry;
      else if (yahooProfile.sector) profile.sector = yahooProfile.sector;
    }
  }

  const enrichBlock = enrichResult.context ? '\n\nLIVE-MARKTDATEN:\n' + enrichResult.context : '';
  const fundBlock = buildFundBlock(fundamentals);
  const newsBlock = buildNewsBlock(news);

  // Profil-Block: bei bekannten Instrumenten detaillierte Treiber, sonst datenbasiert
  const narrativeLine = profile.narrative ? `\nGeschäftsmodell: ${profile.narrative}` : '';
  const scenarioLines = (profile.bullScenario || profile.bearScenario)
    ? `\nBull-Szenario: ${profile.bullScenario || '—'}\nBear-Szenario: ${profile.bearScenario || '—'}`
    : '';
  const driversSection = profile.found
    ? `Kurstreiber (mit Schwellenwerten und Kausalzusammenhängen):\n${(profile.drivers || []).map(d => '  • ' + d).join('\n')}${scenarioLines}\nWorauf achten: ${profile.watchFor || '—'}\nMakro-Sensitivität: ${profile.macroSensitivity || '—'}`
    : `Analysiere die Kurstreiber anhand der vorliegenden Fundamentaldaten, Earnings-History, Analysten-Konsens und Nachrichten.`;
  const profileBlock = `
INSTRUMENT-PROFIL: ${asset}
Sektor: ${profile.sector}${narrativeLine}
${driversSection}`;

  let system, user;

  if (frage) {
    system = `Du bist Finanzblick — präziser Finanzerklärer für Privatanleger. ${levelPrompt}
Beantworte konkret, faktenbasiert, kausal. Nenne konkrete Zahlen aus den vorliegenden Daten. Keine Anlageberatung, keine Kursziele. Kein Markdown.`;

    user = `${profileBlock}${fundBlock}${enrichBlock}${newsBlock}

${macroLine}
Asset: ${asset} | Kurs: ${price} | ${ctx.label}: ${richtung}

Frage: "${frage}"

Antworte direkt und konkret — erkläre Kausalzusammenhänge, nenne Zahlen aus Fundamentaldaten und Live-Marktdaten. Beziehe dich auf ${asset} spezifisch. Max. 3 Absätze.`;

  } else {
    const taskInstruction = profile.found
      ? `Analysiere, WELCHE der Kurstreiber im Profil die aktuelle Bewegung (${richtung}) ${ctx.timeWord} am stärksten erklären. Wähle die 2-3 relevantesten — basierend auf den konkreten Daten und News.`
      : `Kein vorgefertigtes Profil vorhanden. Analysiere ${asset} direkt anhand der vorliegenden Daten: Fundamentalkennzahlen, Earnings-History, Analysten-Konsens und Nachrichten. Leite die 2-3 Haupttreiber der Kursbewegung aus diesen konkreten Zahlen ab.`;

    system = `Du bist ein erfahrener Finanzanalyst der Finanzblick-Plattform. ${levelPrompt}

Du erhältst aktuelle Daten für ${asset}: Geschäftsmodell, Fundamentalkennzahlen, Earnings-History, Analysten-Konsens und Marktnachrichten.

ZEITRAUM-FOKUS: ${ctx.focus}
AUFGABE: ${taskInstruction}

PFLICHTREGELN:
1. Nenne mindestens 2 konkrete Zahlen aus den Daten (KGV, Marge, EPS-Überraschung, Kurszielabstand, Wachstumsrate o.ä.)
2. Fed/Zinsen NUR bei direktem Nachrichtenbezug zu ${asset}
3. Analysiere ${asset} spezifisch — nicht den Gesamtmarkt
4. Fehlen Daten, sage es kurz

FORMAT — EXAKT diese 4 Abschnitte mit Bezeichnungen in eckigen Klammern, kein anderer Text davor oder danach, kein Markdown:
[MODELL]
Geschäftsmodell & Marktposition: Womit verdient ${asset} Geld, welche Segmente/Produkte sind die Haupttreiber?
[BEWERTUNG]
Bewertung & aktuelle Kursbewegung (${richtung} ${ctx.timeWord}): Was hat den Kurs konkret bewegt? Kausal, mit Zahlen aus den Fundamentaldaten.
[WACHSTUM]
Wachstum & Qualität: Umsatzentwicklung, Margen, Gewinnqualität — mit konkreten Werten aus den vorliegenden Daten.
[RISIKEN]
Risiken & Katalysatoren: ${ctx.ausblick} Was sind die wichtigsten Chancen und Risiken für ${asset}?

Keine Anlageberatung. Spezifisch, kausal, zahlenbasiert.`;

    user = `${profileBlock}${fundBlock}${enrichBlock}${newsBlock}

${macroLine}
Asset: ${asset} | Kurs: ${price} | ${ctx.label} (${ctx.tf}): ${richtung}

Erstelle die 4-Abschnitt-Analyse für ${asset}. Nutze ausschließlich die vorliegenden Daten.`;
  }

  // Fragen → 8b (schneller/günstiger); Auto-Analysen → 70b (Qualität)
  const primaryModel = frage ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile';

  const runCall = async () => {
    let raw;
    try {
      raw = await callGroq(primaryModel, system, user, apiKey);
    } catch(e) {
      if (e.message === 'rate_limit' && primaryModel !== 'llama-3.1-8b-instant') {
        raw = await callGroq('llama-3.1-8b-instant', system, user, apiKey);
      } else throw e;
    }
    const clean = raw.replace(/\*\*/g,'').replace(/\*/g,'').replace(/#{1,6}\s/g,'').replace(/\n{3,}/g,'\n\n').trim();

    if (frage) return { antwort: clean, typ: 'frage' };

    const sections = parseSections(clean);
    if (Object.keys(sections).length >= 3) {
      return {
        modell: sections.modell || '', bewertung: sections.bewertung || '',
        wachstum: sections.wachstum || '', risiken: sections.risiken || '',
        range: range || '1T', typ: 'auto',
      };
    }
    const parts = clean.split(/\n\n+/);
    return { warum: parts[0] || clean, ausblick: parts.slice(1).join('\n\n') || '', range: range || '1T', typ: 'auto' };
  };

  try {
    let data;
    if (cacheKey) {
      // Promise in inflight-map ablegen damit parallele Requests es teilen
      const p = runCall();
      analyseInflight[cacheKey] = p;
      try {
        data = await p;
        analyseCache[cacheKey] = { data, ts: Date.now() };
      } finally {
        delete analyseInflight[cacheKey];
      }
    } else {
      data = await runCall();
    }
    return res.status(200).json(data);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
