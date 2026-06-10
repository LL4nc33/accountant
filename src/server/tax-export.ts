/**
 * Finanzamt-Jahres-Paket — One-Click Export aller relevanten Daten eines
 * Steuerjahres. Liefert ZIP mit:
 *   - Übersicht.pdf (Einnahmen, Ausgaben, Saldo, KU-Schwellwert-Check)
 *   - rechnungen.csv (Ausgangsrechnungen)
 *   - ausgaben.csv (Eingangsrechnungen)
 *   - Read.txt (Beschreibung des Pakets)
 *
 * Out of Scope (kommt später): PDF-Anhänge der Original-Rechnungen + Belege.
 */
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
// archiver ist ESM — wir nutzen die ZipArchive-Klasse direkt statt der
// Factory-Funktion, weil ts-Output zu CJS sonst die Default-Export-Auflösung
// verkrümmelt.
const { ZipArchive } = require('archiver');
import { repo, type UserInfo } from 'remult';
import { api } from './api';
import { Invoice } from '../shared/entities/invoice';
import { Expense } from '../shared/entities/expense';
import { CompanySettings } from '../shared/entities/company-settings';

/** Liest VERSION aus dem Repo-Root (max. eine Verzeichnisebene aufwärts). */
function readAppVersion(): string {
  for (const candidate of [
    path.join(__dirname, '..', '..', 'VERSION'),
    path.join(process.cwd(), 'VERSION'),
  ]) {
    try {
      return fs.readFileSync(candidate, 'utf-8').trim();
    } catch {
      // try next candidate
    }
  }
  return 'unbekannt';
}
const APP_VERSION = readAppVersion();

export const taxExport = express.Router();
taxExport.use(express.json());
taxExport.use(api.withRemult);

/** Schwellwert für AT-Kleinunternehmer-Regelung ab 2025: €55.000 brutto/Jahr. */
const KU_THRESHOLD_2025 = 55000;

function csvEscape(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  if (/[",;\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function csvRow(values: Array<string | number | Date | null | undefined>): string {
  return values.map(csvEscape).join(';') + '\n';
}

taxExport.get('/api/tax-export/:year', async (req, res) => {
  const userInfo = (req.session as any)?.['user'] as UserInfo | undefined;
  if (!userInfo) {
    res.status(401).send('Nicht eingeloggt');
    return;
  }

  const year = parseInt(req.params['year']!, 10);
  if (isNaN(year) || year < 2000 || year > 2099) {
    res.status(400).send('Ungültiges Jahr');
    return;
  }

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const settings = await repo(CompanySettings).findFirst();
  const [allInvoices, allExpenses] = await Promise.all([
    repo(Invoice).find({ where: { archived: false } }),
    repo(Expense).find({ where: { archived: false } }),
  ]);

  const invoices = allInvoices.filter((i) => {
    const d = new Date(i.invoiceDate);
    return d >= yearStart && d < yearEnd;
  });
  const expenses = allExpenses.filter((e) => {
    const d = new Date(e.date);
    return d >= yearStart && d < yearEnd;
  });

  // Aggregate
  const totalInvoicedNet = invoices.reduce((s, i) => s + (i.netTotal ?? 0), 0);
  const totalInvoicedGross = invoices.reduce((s, i) => s + (i.grossTotal ?? 0), 0);
  const totalExpenseNet = expenses.reduce((s, e) => s + (e.netTotal ?? 0), 0);
  const totalExpenseVat = expenses.reduce((s, e) => s + (e.vatAmount ?? 0), 0);
  const totalExpenseGross = expenses.reduce((s, e) => s + (e.grossTotal ?? 0), 0);
  const saldo = totalInvoicedNet - totalExpenseNet;

  // KU-Schwellwert-Check (nur informativ wenn KU gesetzt)
  const isKU = !!settings?.isKleinunternehmer;
  const overThreshold = totalInvoicedGross > KU_THRESHOLD_2025;

  // CSV Rechnungen
  let invoicesCsv = csvRow([
    'Rechnungs-Nr', 'Datum', 'Kunden-ID', 'Anschrift', 'Betreff',
    'Netto', 'Brutto', 'Festgeschrieben', 'Festgeschrieben am',
  ]);
  for (const inv of invoices) {
    invoicesCsv += csvRow([
      inv.invoiceNumber,
      inv.invoiceDate,
      inv.customerId,
      (inv.address ?? '').replace(/\n/g, ' / '),
      inv.subject,
      (inv.netTotal ?? 0).toFixed(2),
      (inv.grossTotal ?? 0).toFixed(2),
      inv.finalized ? 'Ja' : 'Nein',
      inv.finalizedAt ?? '',
    ]);
  }

  // CSV Ausgaben
  let expensesCsv = csvRow([
    'Datum', 'Lieferant', 'Belegnr', 'Kategorie', 'Beschreibung',
    'Netto', 'USt-Satz', 'USt-Betrag', 'Brutto', 'Zahlungsstatus', 'Bezahlt am',
  ]);
  for (const ex of expenses) {
    expensesCsv += csvRow([
      ex.date,
      ex.vendor,
      ex.reference,
      ex.category,
      (ex.description ?? '').replace(/\n/g, ' / '),
      (ex.netTotal ?? 0).toFixed(2),
      ex.vatRate.toString() + '%',
      (ex.vatAmount ?? 0).toFixed(2),
      (ex.grossTotal ?? 0).toFixed(2),
      ex.paymentStatus,
      ex.paidAt ?? '',
    ]);
  }

  // Übersicht als formatierter Text (PDF wäre netter, hier bleiben wir bei TXT)
  const summary = `
FINANZAMT-JAHRES-PAKET ${year}
═══════════════════════════════════════════════════

Erstellt am: ${new Date().toLocaleDateString('de-AT')} ${new Date().toLocaleTimeString('de-AT')}
User:        ${userInfo.name}

Firma:       ${settings?.name ?? '—'}
Adresse:     ${settings?.addressStreet}, ${settings?.addressZip} ${settings?.addressCity}, ${settings?.country}
UID:         ${settings?.vatId || '—'}
GISA-Zahl:   ${settings?.gisaZahl || '—'}
Steuernummer: ${settings?.taxNumber || '—'}

EINNAHMEN-AUSGABEN-RECHNUNG ${year}
───────────────────────────────────────────────────

EINNAHMEN
  Ausgangsrechnungen: ${invoices.length} Stück
  Summe netto:        € ${totalInvoicedNet.toFixed(2)}
  Summe brutto:       € ${totalInvoicedGross.toFixed(2)}

AUSGABEN
  Eingangsrechnungen: ${expenses.length} Stück
  Summe netto:        € ${totalExpenseNet.toFixed(2)}
  Summe USt:          € ${totalExpenseVat.toFixed(2)}
  Summe brutto:       € ${totalExpenseGross.toFixed(2)}

SALDO (Netto)        € ${saldo.toFixed(2)}

${isKU ? `KLEINUNTERNEHMER-CHECK ${year}
───────────────────────────────────────────────────
Status:          Kleinunternehmer (§6 Abs. 1 Z 27 UStG)
Schwellwert:     € ${KU_THRESHOLD_2025.toLocaleString('de-AT')} (Brutto, ab 2025)
Aktuell:         € ${totalInvoicedGross.toFixed(2)}
${overThreshold
  ? '🔴 ÜBERSCHRITTEN — Mit nächster Rechnung wechselst du in die Regelbesteuerung.'
  : '🟢 unterhalb Schwellwert — KU-Status bleibt erhalten.'}
` : ''}

DATEIEN IM PAKET
───────────────────────────────────────────────────
  uebersicht.txt    — Dieses Dokument
  rechnungen.csv    — Alle Ausgangsrechnungen ${year}
  ausgaben.csv      — Alle Eingangsrechnungen ${year}

HINWEISE
───────────────────────────────────────────────────
• Diese Aufstellung ersetzt keine Steuerberatung. Sie ist ein
  Hilfsmittel zur Erleichterung der Jahresabrechnung.
• §132 BAO: 7 Jahre Aufbewahrungspflicht für Rechnungen und Belege.
• Original-Rechnungs-PDFs liegen in accountant unter
  http://<deine-url>/om/invoice/<id> — können auf Anfrage einzeln
  exportiert werden.

Generiert von accountant v${APP_VERSION}
`;

  // ZIP zusammenbauen
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="oa-finanzamt-${year}.zip"`,
  );

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('error', (err: Error) => {
    console.error('[tax-export] archiver error:', err);
    try { res.status(500).end(); } catch {}
  });
  archive.pipe(res);
  archive.append(summary, { name: 'uebersicht.txt' });
  archive.append(invoicesCsv, { name: 'rechnungen.csv' });
  archive.append(expensesCsv, { name: 'ausgaben.csv' });
  await archive.finalize();
});
