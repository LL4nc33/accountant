/**
 * Kontextuelle Hilfe-Inhalte für den Help-Drawer (rechtes Panel).
 * Pro Route ein Eintrag; `helpForUrl` matcht den ersten passenden RegExp.
 * Bewusst knapp gehalten — der Drawer ist Quick-Reference, kein Handbuch.
 * Für Tiefe verweisen wir aufs Anwender-Handbuch (docs/manual).
 */
export interface HelpSection {
  heading: string;
  body: string;
}
export interface HelpEntry {
  title: string;
  intro?: string;
  sections: HelpSection[];
  tips?: string[];
}

interface HelpRule {
  match: RegExp;
  entry: HelpEntry;
}

const RULES: HelpRule[] = [
  {
    match: /^\/(\?.*)?$/,
    entry: {
      title: 'Dashboard',
      intro: 'Dein Tagesüberblick — die wichtigsten Kennzahlen und schnelle Aktionen auf einen Blick.',
      sections: [
        { heading: 'KPI-Karten', body: 'Zeigen Umsatz, Ausgaben und Saldo des laufenden Monats plus offene Forderungen. Ein Klick auf eine Karte führt direkt zur jeweiligen Liste.' },
        { heading: 'Tab „Analyse"', body: 'Jahres- oder Monats-Auswertung mit Verlaufs-Chart, Top-Kunden und Aufwand pro Kategorie. Den Zeitraum wählst du oben rechts.' },
      ],
      tips: ['Über die Balken im Verlauf-Chart hovern zeigt die genauen Beträge.'],
    },
  },
  {
    match: /^\/om\/invoice/,
    entry: {
      title: 'Rechnungen',
      intro: 'Erstellen, festschreiben und versenden von §11-UStG-konformen Rechnungen.',
      sections: [
        { heading: 'Entwurf → Festgeschrieben', body: 'Eine neue Rechnung ist zunächst Entwurf und frei editierbar. Mit „Festschreiben" wird sie nach §131 BAO unveränderlich — danach nur noch Storno/Korrektur möglich.' },
        { heading: 'Reverse-Charge', body: 'Bei EU-Kunden mit UID schlägt die App automatisch Reverse-Charge vor (§3a Abs. 6 UStG). Du bestätigst pro Rechnung.' },
        { heading: 'PDF & XRechnung', body: 'Auf der Rechnungs-Ansicht lädst du das PDF herunter oder exportierst XRechnung-XML (UBL 2.1) für DE-B2B/AT-B2G.' },
      ],
      tips: ['„Als Vorlage kopieren" spart Tippen bei wiederkehrenden Kunden.'],
    },
  },
  {
    match: /^\/crm/,
    entry: {
      title: 'Kunden',
      intro: 'Personen und Firmen als Rechnungsempfänger verwalten.',
      sections: [
        { heading: 'Person vs. Firma', body: 'Personen (B2C) und Firmen (B2B) werden getrennt geführt — relevant für Verzugszinsen und Reverse-Charge.' },
        { heading: 'UID-Prüfung (VIES)', body: 'Bei Firmen mit UID prüfst du per Klick gegen die EU-VIES-Datenbank. Das Ergebnis wird 30 Tage gecacht und auf Reverse-Charge-Rechnungen als Audit-Zeile gedruckt.' },
      ],
    },
  },
  {
    match: /^\/pm/,
    entry: {
      title: 'Projekte & Zeiterfassung',
      intro: 'Kundenprojekte mit Stundenbuchung und „aus Stunden → Rechnung".',
      sections: [
        { heading: 'Stundensatz', body: 'Pro Projekt überschreibbar, sonst greift der Default aus den Firmen-Einstellungen. Jede Zeitbuchung speichert den Satz als Snapshot.' },
        { heading: 'Rechnung erzeugen', body: 'In der Projekt-Ansicht erzeugt „Rechnung erzeugen" aus allen offenen Zeitbuchungen eine Rechnung und markiert sie als abgerechnet.' },
      ],
    },
  },
  {
    match: /^\/expenses/,
    entry: {
      title: 'Ausgaben',
      intro: 'Eingangsrechnungen und Betriebsausgaben erfassen — Basis der Einnahmen-Ausgaben-Rechnung.',
      sections: [
        { heading: 'Beleg-OCR', body: 'Beim Anlegen kannst du einen Beleg fotografieren — ein Vision-Modell füllt die Felder vor. Du prüfst und bestätigst.' },
        { heading: 'Netto / Brutto', body: 'Netto und Brutto sind gekoppelt: Änderung an einem rechnet das andere über den USt-Satz neu.' },
      ],
    },
  },
  {
    match: /^\/om\/offers?/,
    entry: {
      title: 'Angebote',
      intro: 'Angebote, Auftragsbestätigungen und Lieferscheine.',
      sections: [
        { heading: 'In Rechnung umwandeln', body: 'Ein angenommenes Angebot wandelst du per Klick in eine Rechnung um — Positionen werden übernommen, das Angebot wird gesperrt.' },
      ],
    },
  },
  {
    match: /^\/reminders/,
    entry: {
      title: 'Mahnwesen',
      intro: '3-stufiges Mahnwesen mit Verzugszinsen und Mahnspesen.',
      sections: [
        { heading: 'Stufen & Zinsen', body: 'B2B: ECB-Basiszins + 9,2 PP (§456 UGB). B2C: 4 % p.a. (§1000 ABGB). Mahnspesen-Pauschale €40 ab Stufe 2 (§1333 ABGB).' },
        { heading: 'Entstehung', body: 'Mahnungen legst du auf der Rechnungs-Ansicht an oder der Hintergrund-Scanner schlägt überfällige als Entwürfe vor.' },
      ],
    },
  },
  {
    match: /^\/assets/,
    entry: {
      title: 'Anlagenverzeichnis',
      intro: 'Wirtschaftsgüter mit linearer AfA (§7 EStG).',
      sections: [
        { heading: 'GWG', body: 'Anschaffungskosten ≤ 1.000 € werden automatisch als geringwertiges Wirtschaftsgut sofort abgeschrieben (§13 EStG).' },
        { heading: 'Halbjahresregel', body: 'Anschaffung in der zweiten Jahreshälfte → nur halbe Jahres-AfA im ersten und letzten Jahr (§7 Abs. 2 EStG). Wird automatisch berücksichtigt.' },
      ],
    },
  },
  {
    match: /^\/travel/,
    entry: {
      title: 'Reisekosten',
      intro: 'Reisekostenabrechnung nach §26 EStG.',
      sections: [
        { heading: 'AT-Standardsätze 2026', body: 'Diäten 26,40 €/Tag, Nächtigung 17 €/Nacht pauschal, KM-Geld 0,50 €/km. „AT-Standardsätze übernehmen" füllt die Beträge aus Dauer/Nächtigungen/KM.' },
      ],
    },
  },
  {
    match: /^\/cashbook/,
    entry: {
      title: 'Kassabuch',
      intro: 'Chronologisches Journal von Bareinnahmen und -ausgaben.',
      sections: [
        { heading: '⚠ Nicht RKSV-konform', body: 'Nur für niedrige Bar-Umsätze (Trinkgeld, Kleinbeträge). Bei Bar-Tagesumsätzen über 7.500 €/Jahr ist eine zertifizierte Registrierkasse Pflicht.' },
        { heading: 'Vorzeichen', body: 'Positiver Betrag = Einnahme, negativer = Ausgabe. Der laufende Saldo wird pro Buchung mitgeführt.' },
      ],
    },
  },
  {
    match: /^\/at-tax\/uva/,
    entry: {
      title: 'USt-Voranmeldung',
      intro: 'Aggregierte Bemessungsgrundlagen pro Zeitraum nach UVA-Kennzahlen (FinanzOnline U30).',
      sections: [
        { heading: 'Nur festgeschrieben', body: 'Nur festgeschriebene Rechnungen fließen in die Berechnung ein — Entwürfe bleiben außen vor.' },
      ],
    },
  },
  {
    match: /^\/at-tax\/zm/,
    entry: {
      title: 'Zusammenfassende Meldung',
      intro: 'Innergemeinschaftliche Dienstleistungen mit Reverse-Charge, gruppiert pro Empfänger-UID.',
      sections: [
        { heading: 'CSV-Export', body: 'Oben rechts lädst du die ZM als CSV für den FinanzOnline-Upload herunter.' },
      ],
    },
  },
  {
    match: /^\/svs/,
    entry: {
      title: 'SVS-Vorschau',
      intro: 'Prognose deiner Sozialversicherungsbeiträge (GSVG).',
      sections: [
        { heading: 'Dritter-Jahr-Schock', body: 'Die ersten beiden Jahre zahlst du die Mindest-BGL. Die Vorschau zeigt die zu erwartende Nachbemessung, damit du eine Rückstellung bildest.' },
      ],
    },
  },
  {
    match: /^\/est/,
    entry: {
      title: 'ESt-Vorschau',
      intro: 'Einkommensteuer-Forecast nach AT-Tarif mit Gewinnfreibetrag §10 EStG.',
      sections: [
        { heading: 'SVS-Kopplung', body: 'Die SVS-Beiträge werden als Betriebsausgabe abgezogen. Aktiviere auch das SVS-Modul für die genaueste Prognose.' },
      ],
    },
  },
  {
    match: /^\/settings\/company/,
    entry: {
      title: 'Firmen-Einstellungen',
      intro: 'Stammdaten, die auf allen Rechnungen, Mahnungen und Angeboten erscheinen.',
      sections: [
        { heading: 'Kleinunternehmer', body: 'Der Toggle unter „Steuer & UID" schaltet alle Rechnungen auf USt-frei mit dem §6-Abs-1-Z-27-Vermerk.' },
        { heading: '§63 GewO', body: 'Als Gewerbetreibender brauchst du GISA-Zahl + Behörde im Footer. Die App warnt, wenn das fehlt.' },
      ],
    },
  },
  {
    match: /^\/settings\/module/,
    entry: {
      title: 'Module',
      intro: 'Funktionen ein-/ausschalten — die Sidebar zeigt nur aktive Bereiche.',
      sections: [
        { heading: 'Daten bleiben', body: 'Deaktivieren blendet ein Modul nur aus. Die Daten bleiben erhalten und sind nach Reaktivierung sofort wieder da.' },
      ],
    },
  },
  {
    match: /^\/settings\/number-ranges/,
    entry: {
      title: 'Nummernkreise',
      intro: 'Format und laufende Nummer pro Beleg-Typ.',
      sections: [
        { heading: 'Format-Template', body: 'Handlebars-Syntax: {{YYYY}} fürs Jahr, {{pad 4 NUMBER}} für vierstellig aufgefüllte Nummern. Bei festgeschriebenen Rechnungen darf die Sequenz nicht rückwärts laufen.' },
      ],
    },
  },
  {
    match: /^\/chat/,
    entry: {
      title: 'KI-Assistent',
      intro: 'Sprich mit dem Assistenten wie mit einem Mitarbeiter — fragen, buchen, anlegen.',
      sections: [
        { heading: 'Confirm-Workflow', body: 'Schreib-Aktionen (Rechnung, Kunde, Buchung) erzeugt der Assistent als Vorschlag-Karte. Erst dein „Bestätigen" schreibt sie wirklich.' },
        { heading: 'Lokal', body: 'Läuft gegen jede OpenAI-kompatible API (llama.cpp, Ollama, LM Studio). Für Self-Host empfohlen, da Kunden-/Rechnungsdaten ins Modell gehen. Konfiguration: Firma → KI-Assistent.' },
      ],
    },
  },
];

const FALLBACK: HelpEntry = {
  title: 'Hilfe',
  intro: 'Für diese Seite gibt es noch keine spezifische Kurzhilfe.',
  sections: [
    { heading: 'Anwender-Handbuch', body: 'Die vollständige Dokumentation findest du im Projekt unter docs/manual — 37 Kapitel auf Deutsch.' },
  ],
};

export function helpForUrl(url: string): HelpEntry {
  const clean = url.split('#')[0]!;
  for (const rule of RULES) {
    if (rule.match.test(clean)) return rule.entry;
  }
  return FALLBACK;
}
