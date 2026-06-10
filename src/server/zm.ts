/**
 * Zusammenfassende Meldung (ZM) — Phase 34, v0.36.0
 *
 * Aggregiert die innergemeinschaftlichen Dienstleistungen (Reverse-Charge
 * nach §3a Abs. 6 UStG / Art. 196 MwStSyst-RL) pro Empfänger-UID für die
 * Meldung an FinanzOnline.
 *
 * Pflichtig wenn der Empfänger in einem EU-Mitgliedstaat ansässig ist
 * (nicht Drittland) und USt-Schuldnerschaft auf den Empfänger übergeht.
 * Frist: Monatsmeldung bis Letzter des Folgemonats, Quartalsmeldung bis
 * Letzter des dem Quartal folgenden Monats.
 *
 * Lese-Operation, admin-only. Reuses parseUvaPeriod aus uva.ts.
 */
import express from 'express';
import { repo, type UserInfo } from 'remult';
import { api } from './api';
import { Invoice } from '../shared/entities/invoice';
import { Address } from '../shared/entities/address';
import { isEU } from '../shared/entities/country';
import { parseUvaPeriod } from './uva';

export const zm = express.Router();
zm.use(express.json());
zm.use(api.withRemult);

function requireAdmin(req: express.Request, res: express.Response): UserInfo | null {
  const u = (req.session as any)?.['user'] as UserInfo | undefined;
  if (!u) { res.status(401).json({ error: 'Nicht eingeloggt' }); return null; }
  if (!u.roles?.includes('admin')) {
    res.status(403).json({ error: 'Admin-Recht erforderlich' });
    return null;
  }
  return u;
}

interface ZmEntry {
  recipientVatId: string;
  /** Land-Code (alpha-2) — abgeleitet aus den ersten 2 Zeichen der UID */
  country: string;
  /** Summe der Netto-Beträge in EUR */
  sumNet: number;
  invoiceNumbers: string[];
  invoiceCount: number;
}

interface ZmResult {
  period: { mode: 'month' | 'quarter' | 'year'; label: string; from: string; to: string };
  entries: ZmEntry[];
  totalSum: number;
  invoiceCount: number;
  /** Rechnungen die Reverse-Charge sind aber wegen fehlender UID NICHT in
   *  der ZM landen — User-Warning. */
  skippedMissingVatId: { invoiceNumber: string; reason: string }[];
  /** Drittland-RC: keine ZM-Pflicht, aber zur Info angezeigt */
  drittlandCount: number;
}

async function aggregateZm(from: Date, to: Date, mode: 'month' | 'quarter' | 'year', label: string): Promise<ZmResult> {
  const allInvoices = await repo(Invoice).find({
    where: { archived: false, finalized: true, reverseCharge: true },
  });

  // Country-Cache: aus erster Address pro Customer (Person/Company).
  // Address.customerId verbindet Address mit Person- bzw. Company-ID.
  const addressByCustomer = new Map<string, string>(); // customerId -> country
  const addresses = await repo(Address).find({ where: { archived: false } });
  for (const a of addresses) {
    if (a.customerId && a.country && !addressByCustomer.has(a.customerId)) {
      addressByCustomer.set(a.customerId, a.country);
    }
  }

  const entriesMap = new Map<string, ZmEntry>();
  const skipped: ZmResult['skippedMissingVatId'] = [];
  let drittlandCount = 0;
  let countedInvoices = 0;

  for (const inv of allInvoices) {
    if (!inv.invoiceDate) continue;
    const d = new Date(inv.invoiceDate);
    if (d < from || d >= to) continue;
    if (inv.correctsInvoiceId) continue; // Stornos raus — ZM-Meldung wird durch separate Korrektur erledigt

    // Land aus Customer-Billing-Address. Fallback: erste 2 Zeichen der UID.
    let country = '';
    if (inv.customerId) {
      country = addressByCustomer.get(inv.customerId) ?? '';
    }
    if (!country && inv.recipientVatId && inv.recipientVatId.length >= 2) {
      country = inv.recipientVatId.substring(0, 2).toUpperCase();
    }

    // Drittland zählt nicht in ZM. AT ist auch nicht ZM-relevant (selbe
    // Steuerschuld). Nur EU-Empfänger != AT.
    if (!country || country === 'AT' || !isEU(country)) {
      if (country && !isEU(country)) drittlandCount++;
      continue;
    }

    if (!inv.recipientVatId || inv.recipientVatId.trim() === '') {
      skipped.push({
        invoiceNumber: inv.invoiceNumber || '(ohne Nummer)',
        reason: 'Reverse-Charge gegen EU-Empfänger ohne UID — vor ZM-Meldung UID nachtragen',
      });
      continue;
    }

    const vatId = inv.recipientVatId.replace(/\s+/g, '').toUpperCase();
    const entry = entriesMap.get(vatId) ?? {
      recipientVatId: vatId,
      country,
      sumNet: 0,
      invoiceNumbers: [],
      invoiceCount: 0,
    };
    entry.sumNet += inv.netTotal ?? 0;
    if (inv.invoiceNumber) entry.invoiceNumbers.push(inv.invoiceNumber);
    entry.invoiceCount++;
    entriesMap.set(vatId, entry);
    countedInvoices++;
  }

  const entries = Array.from(entriesMap.values())
    .map(e => ({ ...e, sumNet: round2(e.sumNet) }))
    .sort((a, b) => b.sumNet - a.sumNet);

  return {
    period: { mode, label, from: from.toISOString().substring(0, 10), to: to.toISOString().substring(0, 10) },
    entries,
    totalSum: round2(entries.reduce((s, e) => s + e.sumNet, 0)),
    invoiceCount: countedInvoices,
    skippedMissingVatId: skipped,
    drittlandCount,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

zm.get('/api/zm', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const period = parseUvaPeriod(String(req.query['period'] ?? ''));
  if (!period) {
    res.status(400).json({ error: 'Ungültiger Zeitraum (erwarte YYYY-MM, YYYY-Qx oder YYYY)' });
    return;
  }
  try {
    const result = await aggregateZm(period.from, period.to, period.mode, period.label);
    res.json(result);
  } catch (e: any) {
    console.error('[zm] aggregate failed', e);
    res.status(500).json({ error: e?.message ?? 'ZM-Aggregation fehlgeschlagen' });
  }
});

zm.get('/api/zm/csv', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const period = parseUvaPeriod(String(req.query['period'] ?? ''));
  if (!period) {
    res.status(400).json({ error: 'Ungültiger Zeitraum' });
    return;
  }
  try {
    const result = await aggregateZm(period.from, period.to, period.mode, period.label);
    // FinanzOnline akzeptiert CSV im Format: UID;Betrag;Dreiecksgeschäft;
    // Für reine Dienstleistungen lassen wir Dreieck=0. Header informativ.
    const lines: string[] = [];
    lines.push(`# Zusammenfassende Meldung — ${result.period.label}`);
    lines.push(`# Periode: ${result.period.from} bis ${result.period.to}`);
    lines.push(`# Erstellt am: ${new Date().toISOString().substring(0, 10)}`);
    lines.push('UID;Betrag (EUR);Dreiecksgeschaeft;Rechnungs-Nr.');
    for (const e of result.entries) {
      const invNumbers = e.invoiceNumbers.join(',');
      lines.push(`${e.recipientVatId};${e.sumNet.toFixed(2).replace('.', ',')};nein;${invNumbers}`);
    }
    lines.push('');
    lines.push(`# Summe: ${result.totalSum.toFixed(2).replace('.', ',')} EUR ueber ${result.invoiceCount} Rechnungen an ${result.entries.length} Empfaenger`);
    const csv = lines.join('\n') + '\n';

    const filename = `ZM-${result.period.label.replace(/\s+/g, '-').replace(/\./g, '')}.csv`;
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e: any) {
    console.error('[zm/csv] failed', e);
    res.status(500).json({ error: e?.message ?? 'CSV-Export fehlgeschlagen' });
  }
});
