/**
 * BMD/RZL-Kontorahmen-CSV-Export (Phase 12, v0.14.0)
 *
 * Steuerberater-Übergabe-Format: pro Buchungssatz eine Zeile mit
 * Sollkonto / Habenkonto / Betrag / Steuercode. BMD und RZL können
 * dieses generische CSV einlesen (ggf. mit Mapping-Definition beim
 * Import). Auch dvo / SBS / KSP akzeptieren das Format.
 *
 * Sicht je Beleg:
 *  Ausgangsrechnung (Brutto-Methode):
 *    Soll: Forderungen          Haben: Erlöse (Rate)          Betrag: netto
 *    Soll: Forderungen          Haben: USt (Rate)             Betrag: USt-Betrag
 *  RC/Drittland:
 *    Soll: Forderungen          Haben: Erlöse RC bzw. DL      Betrag: netto
 *  Eingangsrechnung:
 *    Soll: Aufwand              Haben: Verbindlichkeiten      Betrag: netto
 *    Soll: Vorsteuer            Haben: Verbindlichkeiten      Betrag: USt-Betrag
 *
 * Konten kommen aus CompanySettings → editierbar pro Steuerberater.
 */
import express from 'express';
import { repo, type UserInfo } from 'remult';
import { api } from './api';
import { Invoice } from '../shared/entities/invoice';
import { InvoiceItem } from '../shared/entities/invoice-item';
import { Expense } from '../shared/entities/expense';
import { CompanySettings } from '../shared/entities/company-settings';
import { Person } from '../shared/entities/person';
import { Company } from '../shared/entities/company';
import { Address } from '../shared/entities/address';
import { isEU } from '../shared/entities/country';
import { parseUvaPeriod } from './uva';

const { ZipArchive } = require('archiver');

export const bmdExport = express.Router();
bmdExport.use(express.json());
bmdExport.use(api.withRemult);

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = dt.getFullYear();
  return `${dd}.${mm}.${yy}`;
}

function fmtAmount(n: number): string {
  // BMD/RZL erwarten Komma als Dezimaltrenner
  return n.toFixed(2).replace('.', ',');
}

function csvEscape(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return '';
  const str = String(s);
  if (/[";\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

interface Buchungssatz {
  datum: string;
  belegart: string;
  belegnr: string;
  buchungstext: string;
  sollkonto: string;
  habenkonto: string;
  betrag: string;
  steuercode: string;
  steuersatz: string;
}

const HEADER: Array<keyof Buchungssatz> = [
  'datum', 'belegart', 'belegnr', 'buchungstext',
  'sollkonto', 'habenkonto', 'betrag', 'steuercode', 'steuersatz',
];

const HEADER_LABELS: Record<keyof Buchungssatz, string> = {
  datum: 'Datum',
  belegart: 'Belegart',
  belegnr: 'Belegnummer',
  buchungstext: 'Buchungstext',
  sollkonto: 'Sollkonto',
  habenkonto: 'Habenkonto',
  betrag: 'Betrag',
  steuercode: 'Steuercode',
  steuersatz: 'Steuersatz',
};

function rowToCsv(row: Buchungssatz): string {
  return HEADER.map((k) => csvEscape(row[k])).join(';');
}

function buildCsv(rows: Buchungssatz[]): string {
  const headerLine = HEADER.map((k) => HEADER_LABELS[k]).join(';');
  return '﻿' + headerLine + '\n' + rows.map(rowToCsv).join('\n') + '\n';
}

function ustKontoFor(rate: number, s: CompanySettings): string {
  if (rate === 20) return s.kontoUst20;
  if (rate === 10) return s.kontoUst10;
  if (rate === 13) return s.kontoUst13;
  return '';
}

function erloesKontoFor(rate: number, s: CompanySettings): string {
  if (rate === 20) return s.kontoErloese20;
  if (rate === 10) return s.kontoErloese10;
  if (rate === 13) return s.kontoErloese13;
  if (rate === 0) return s.kontoErloese0;
  return s.kontoErloese0;
}

function steuercodeFor(rate: number): string {
  if (rate === 20) return 'USt20';
  if (rate === 10) return 'USt10';
  if (rate === 13) return 'USt13';
  if (rate === 0) return 'USt0';
  return '';
}

async function lookupCustomerName(customerId: string): Promise<string> {
  if (!customerId) return '';
  const p = await repo(Person).findFirst({ id: customerId });
  if (p) return p.displayName;
  const c = await repo(Company).findFirst({ id: customerId });
  return c?.displayName ?? '';
}

async function lookupCountry(customerId: string, cache: Map<string, string>): Promise<string> {
  if (!customerId) return '';
  if (cache.has(customerId)) return cache.get(customerId)!;
  const addrs = await repo(Address).find({ where: { customerId } });
  const billing = addrs.find((a) => a.addressType === 'Rechnungsanschrift') ?? addrs[0];
  const c = billing?.country || '';
  cache.set(customerId, c);
  return c;
}

async function buildUmsaetzeCsv(
  from: Date,
  to: Date,
  settings: CompanySettings,
): Promise<{ csv: string; count: number }> {
  const all = await repo(Invoice).find({ where: { archived: false, finalized: true } });
  const invoices = all.filter((i) => {
    const d = new Date(i.invoiceDate);
    return d >= from && d < to;
  });

  const invIds = invoices.map((i) => i.id);
  const items = invIds.length
    ? await repo(InvoiceItem).find({ where: { invoiceId: invIds } })
    : [];
  const itemsByInvoice = new Map<string, InvoiceItem[]>();
  for (const item of items) {
    const arr = itemsByInvoice.get(item.invoiceId) ?? [];
    arr.push(item);
    itemsByInvoice.set(item.invoiceId, arr);
  }

  const countryCache = new Map<string, string>();
  const rows: Buchungssatz[] = [];
  const isKlein = !!settings.isKleinunternehmer;

  for (const inv of invoices) {
    const customerName = await lookupCustomerName(inv.customerId);
    const country = await lookupCountry(inv.customerId, countryCache);
    const datum = fmtDate(inv.invoiceDate);
    const belegart = inv.correctsInvoiceId ? 'AR-Storno' : 'AR';
    const belegnr = inv.invoiceNumber || inv.id;

    // Pro Rate-Bucket aggregieren
    const perRate = new Map<number, { netto: number; ust: number }>();
    for (const item of itemsByInvoice.get(inv.id) ?? []) {
      const rate = item.vat;
      let netto: number;
      let ust: number;
      if (inv.vatType === 'Brutto') {
        netto = item.total / (1 + rate / 100);
        ust = item.total - netto;
      } else {
        netto = item.total;
        ust = item.total * (rate / 100);
      }
      const b = perRate.get(rate) ?? { netto: 0, ust: 0 };
      b.netto += netto;
      b.ust += ust;
      perRate.set(rate, b);
    }

    const baseText = `${customerName || 'Kunde'} — ${inv.subject || belegnr}`.slice(0, 120);

    if (isKlein) {
      // KU: alles auf Erlöse 0% (befreit), keine USt
      let totalNetto = 0;
      for (const b of perRate.values()) totalNetto += b.netto;
      rows.push({
        datum, belegart, belegnr,
        buchungstext: `${baseText} (Kleinunternehmer §6/1/27)`,
        sollkonto: settings.kontoForderungen,
        habenkonto: settings.kontoErloese0,
        betrag: fmtAmount(totalNetto),
        steuercode: 'KU',
        steuersatz: '0',
      });
      continue;
    }

    if (inv.reverseCharge) {
      // RC EU vs Drittland
      const isEu = isEU(country) && country !== settings.country;
      const habenkonto = isEu ? settings.kontoErloeseRC : settings.kontoErloeseDrittland;
      const code = isEu ? 'RC-EU' : 'DL';
      const txt = isEu
        ? `${baseText} (Reverse-Charge §3a Abs. 6 UStG)`
        : `${baseText} (Drittland — nicht steuerbar AT)`;
      let totalNetto = 0;
      for (const b of perRate.values()) totalNetto += b.netto;
      rows.push({
        datum, belegart, belegnr,
        buchungstext: txt,
        sollkonto: settings.kontoForderungen,
        habenkonto,
        betrag: fmtAmount(totalNetto),
        steuercode: code,
        steuersatz: '0',
      });
      continue;
    }

    // Normalfall: pro Rate Netto-Erlös + USt
    for (const [rate, bucket] of perRate.entries()) {
      const erloesKonto = erloesKontoFor(rate, settings);
      rows.push({
        datum, belegart, belegnr,
        buchungstext: `${baseText} — Netto ${rate}%`,
        sollkonto: settings.kontoForderungen,
        habenkonto: erloesKonto,
        betrag: fmtAmount(bucket.netto),
        steuercode: steuercodeFor(rate),
        steuersatz: String(rate),
      });
      if (bucket.ust > 0.005 && rate > 0) {
        const ustKonto = ustKontoFor(rate, settings);
        if (ustKonto) {
          rows.push({
            datum, belegart, belegnr,
            buchungstext: `${baseText} — USt ${rate}%`,
            sollkonto: settings.kontoForderungen,
            habenkonto: ustKonto,
            betrag: fmtAmount(bucket.ust),
            steuercode: steuercodeFor(rate),
            steuersatz: String(rate),
          });
        }
      }
    }
  }

  return { csv: buildCsv(rows), count: invoices.length };
}

async function buildVorsteuerCsv(
  from: Date,
  to: Date,
  settings: CompanySettings,
): Promise<{ csv: string; count: number }> {
  const all = await repo(Expense).find({ where: { archived: false } });
  const expenses = all.filter((e) => {
    const d = new Date(e.date);
    return d >= from && d < to;
  });

  const rows: Buchungssatz[] = [];
  const isKlein = !!settings.isKleinunternehmer;

  for (const ex of expenses) {
    const datum = fmtDate(ex.date);
    const belegnr = ex.reference || ex.id;
    const text = `${ex.vendor || 'Lieferant'} — ${ex.description || ex.category || 'Beleg'}`.slice(0, 120);
    const netto = ex.netTotal ?? 0;
    const ust = ex.vatAmount;

    rows.push({
      datum,
      belegart: 'ER',
      belegnr,
      buchungstext: `${text} — Netto`,
      sollkonto: settings.kontoAufwand,
      habenkonto: settings.kontoVerbindlichkeiten,
      betrag: fmtAmount(netto),
      steuercode: ex.vatRate > 0 ? steuercodeFor(ex.vatRate) : '',
      steuersatz: String(ex.vatRate),
    });

    if (!isKlein && ust > 0.005 && ex.vatRate > 0) {
      // Vorsteuerabzug nur bei Regelbesteuerung
      rows.push({
        datum,
        belegart: 'ER',
        belegnr,
        buchungstext: `${text} — Vorsteuer ${ex.vatRate}%`,
        sollkonto: settings.kontoVorsteuer,
        habenkonto: settings.kontoVerbindlichkeiten,
        betrag: fmtAmount(ust),
        steuercode: steuercodeFor(ex.vatRate),
        steuersatz: String(ex.vatRate),
      });
    }
  }

  return { csv: buildCsv(rows), count: expenses.length };
}

function buildReadme(
  periodLabel: string,
  from: Date,
  to: Date,
  settings: CompanySettings,
  umsaetzeCount: number,
  vorsteuerCount: number,
): string {
  return `BMD/RZL-EXPORT — ${periodLabel}
═══════════════════════════════════════════════════
Zeitraum:     ${fmtDate(from)} bis ${fmtDate(new Date(to.getTime() - 86400000))}
Firma:        ${settings.name || '—'}
UID:          ${settings.vatId || '—'}
KU-Modus:     ${settings.isKleinunternehmer ? 'JA (§6/1/27)' : 'NEIN (Regelbesteuerung)'}

DATEIEN IM PAKET
───────────────────────────────────────────────────
  umsaetze.csv   — ${umsaetzeCount} Ausgangsrechnungen → Buchungssätze
  vorsteuer.csv  — ${vorsteuerCount} Eingangsrechnungen → Buchungssätze
  README.txt     — Diese Beschreibung

CSV-FORMAT
───────────────────────────────────────────────────
Trennzeichen:    Semikolon (;)
Dezimaltrenner:  Komma (,)
Encoding:        UTF-8 mit BOM (Excel-AT kompatibel)
Datumsformat:    DD.MM.YYYY

SPALTEN
  Datum         — Buchungsdatum (= Rechnungsdatum/Belegdatum)
  Belegart      — AR (Ausgangsrechnung), AR-Storno, ER (Eingangsrechnung)
  Belegnummer   — Rechnungs-/Belegnummer
  Buchungstext  — Kunde/Lieferant + Betreff
  Sollkonto     — Konto im Soll
  Habenkonto    — Konto im Haben
  Betrag        — Buchungs-Betrag (positiv)
  Steuercode    — USt20 / USt13 / USt10 / USt0 / RC-EU / DL / KU
  Steuersatz    — Numerischer Satz (0/10/13/20)

KONTORAHMEN (aus Einstellungen)
───────────────────────────────────────────────────
  Forderungen:           ${settings.kontoForderungen}
  Verbindlichkeiten:     ${settings.kontoVerbindlichkeiten}
  Erlöse 20%:            ${settings.kontoErloese20}
  Erlöse 10%:            ${settings.kontoErloese10}
  Erlöse 13%:            ${settings.kontoErloese13}
  Erlöse 0%/steuerfrei:  ${settings.kontoErloese0}
  Erlöse RC EU:          ${settings.kontoErloeseRC}
  Erlöse Drittland:      ${settings.kontoErloeseDrittland}
  USt 20%:               ${settings.kontoUst20}
  USt 10%:               ${settings.kontoUst10}
  USt 13%:               ${settings.kontoUst13}
  Vorsteuer:             ${settings.kontoVorsteuer}
  Aufwand-Sammel:        ${settings.kontoAufwand}

BUCHUNGS-LOGIK
───────────────────────────────────────────────────
Ausgangsrechnung (Regelbesteuerung):
  Forderungen   AN   Erlöse (Rate)          [netto]
  Forderungen   AN   USt (Rate)             [USt-Betrag]

Reverse-Charge EU:
  Forderungen   AN   Erlöse RC EU           [netto]  (kein USt)

Drittland:
  Forderungen   AN   Erlöse Drittland       [netto]  (nicht steuerbar)

Kleinunternehmer:
  Forderungen   AN   Erlöse 0%              [netto]  (§6/1/27 UStG)

Eingangsrechnung:
  Aufwand       AN   Verbindlichkeiten      [netto]
  Vorsteuer     AN   Verbindlichkeiten      [USt-Betrag]   (nur Regelbest.)

HINWEISE FÜR DEN IMPORT
───────────────────────────────────────────────────
- BMD-NTCS: CSV-Import → Mapping einmalig definieren, dann immer wiederverwendbar.
- RZL: CSV-Import → Spalten der Header-Zeile entnehmen.
- Andere Steuerberater-Software: Spalten meist automatisch erkannt durch
  die deutschen Header.
- Bei abweichendem Kontorahmen: Konten in accountant unter
  /settings/company anpassen, dann erneut exportieren.
- §132 BAO: 7 Jahre Aufbewahrungspflicht. Diese CSVs sind kein Ersatz für
  die Original-Rechnungen — exportiere die PDFs zusätzlich (Phase 5.1
  Finanzamt-Jahres-Paket).
`;
}

bmdExport.get('/api/bmd-export', async (req, res) => {
  const userInfo = (req.session as any)?.['user'] as UserInfo | undefined;
  if (!userInfo) {
    res.status(401).send('Nicht eingeloggt');
    return;
  }

  const period = parseUvaPeriod(req.query['period'] as string | undefined);
  if (!period) {
    res.status(400).send('Ungültiger period-Parameter. Erwartet: YYYY-MM, YYYY-Q1..Q4 oder YYYY');
    return;
  }

  const settings = await repo(CompanySettings).findFirst();
  if (!settings) {
    res.status(500).send('CompanySettings nicht initialisiert');
    return;
  }

  const [{ csv: umsaetzeCsv, count: umsaetzeCount }, { csv: vorsteuerCsv, count: vorsteuerCount }] =
    await Promise.all([
      buildUmsaetzeCsv(period.from, period.to, settings),
      buildVorsteuerCsv(period.from, period.to, settings),
    ]);

  const readme = buildReadme(
    period.label,
    period.from,
    period.to,
    settings,
    umsaetzeCount,
    vorsteuerCount,
  );

  const safeLabel = period.label.replace(/[^\w-]+/g, '_');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="bmd-export-${safeLabel}.zip"`,
  );

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('error', (err: Error) => {
    console.error('[bmd-export] archiver error:', err);
    try { res.status(500).end(); } catch {}
  });
  archive.pipe(res);
  archive.append(umsaetzeCsv, { name: 'umsaetze.csv' });
  archive.append(vorsteuerCsv, { name: 'vorsteuer.csv' });
  archive.append(readme, { name: 'README.txt' });
  await archive.finalize();
});
