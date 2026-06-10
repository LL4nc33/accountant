/**
 * USt-Voranmeldung-Aggregation (Phase 11, v0.13.0)
 *
 * Liefert für einen Zeitraum (Monat / Quartal / Jahr) die aggregierten
 * Bemessungsgrundlagen + Vorsteuer pro UVA-Kennzahl gemäß FinanzOnline
 * Formular U30/U1. Klartext-Summary für die Anzeige + CSV-Export.
 *
 * Hinweise:
 * - Nur festgeschriebene + nicht-archivierte Rechnungen fließen ein
 *   (Roh-Entwürfe wären für die Voranmeldung nicht maßgeblich).
 * - Stornorechnungen (Mengen negativ) reduzieren die Summen automatisch,
 *   weil deren Items negative Totale haben.
 * - Eingangsrechnungen: alle nicht-archivierten Expenses im Zeitraum.
 *   KU-Mode → kein Vorsteuerabzug (KZ 060 = 0), aber Vorsteuer wird
 *   informativ ausgewiesen.
 * - Land-Klassifikation (EU vs. Drittland) für RC-Umsätze via Customer-
 *   Billing-Address. Cache pro customerId.
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

export const uva = express.Router();
uva.use(express.json());
uva.use(api.withRemult);

type PeriodMode = 'month' | 'quarter' | 'year';

interface ParsedPeriod {
  mode: PeriodMode;
  label: string;
  from: Date;
  to: Date;
}

export function parseUvaPeriod(raw: string | undefined): ParsedPeriod | null {
  return parsePeriod(raw);
}

function parsePeriod(raw: string | undefined): ParsedPeriod | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // Jahr: YYYY
  const yMatch = /^(\d{4})$/.exec(trimmed);
  if (yMatch) {
    const y = parseInt(yMatch[1]!, 10);
    return {
      mode: 'year',
      label: `Jahr ${y}`,
      from: new Date(y, 0, 1),
      to: new Date(y + 1, 0, 1),
    };
  }

  // Quartal: YYYY-Q1..Q4
  const qMatch = /^(\d{4})-Q([1-4])$/.exec(trimmed);
  if (qMatch) {
    const y = parseInt(qMatch[1]!, 10);
    const q = parseInt(qMatch[2]!, 10);
    const startMonth = (q - 1) * 3;
    return {
      mode: 'quarter',
      label: `${q}. Quartal ${y}`,
      from: new Date(y, startMonth, 1),
      to: new Date(y, startMonth + 3, 1),
    };
  }

  // Monat: YYYY-MM
  const mMatch = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (mMatch) {
    const y = parseInt(mMatch[1]!, 10);
    const m = parseInt(mMatch[2]!, 10);
    if (m < 1 || m > 12) return null;
    const month = m - 1;
    const monthNames = [
      'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
    ];
    return {
      mode: 'month',
      label: `${monthNames[month]} ${y}`,
      from: new Date(y, month, 1),
      to: new Date(y, month + 1, 1),
    };
  }

  return null;
}

interface RateBucket {
  netto: number;
  ust: number;
}

interface UvaResult {
  period: { mode: PeriodMode; label: string; from: string; to: string };
  isKleinunternehmer: boolean;
  ausgaenge: {
    rate20: RateBucket;
    rate13: RateBucket;
    rate10: RateBucket;
    rate0: RateBucket;
    reverseChargeEU: { netto: number; count: number };
    reverseChargeDrittland: { netto: number; count: number };
    kleinunternehmerBefreit: { netto: number; count: number };
    invoiceCount: number;
  };
  eingaenge: {
    rate20: RateBucket;
    rate13: RateBucket;
    rate10: RateBucket;
    rate0: RateBucket;
    expenseCount: number;
  };
  kzFelder: {
    kz000: number; // Gesamtbetrag der Bemessungsgrundlagen
    kz022: number; // Bemessung 20%
    kz029: number; // Bemessung 10%
    kz006: number; // Bemessung 13%
    kz020: number; // Bemessung 0% (echte 0% Umsätze)
    kz011: number; // Innergemeinschaftliche Lieferungen
    kz017: number; // Ausfuhr Drittland
    kz016: number; // Kleinunternehmer (§6 Abs. 1 Z 27)
    kz060: number; // Vorsteuer (Gesamt-Vorsteuer-Abzug)
  };
  ustSumme: number;
  zahllast: number; // > 0 = Zahllast an Finanzamt, < 0 = Gutschrift
}

export async function aggregateUva(period: ParsedPeriod): Promise<UvaResult> {
  return aggregate(period);
}

async function aggregate(period: ParsedPeriod): Promise<UvaResult> {
  const settings = await repo(CompanySettings).findFirst();
  const isKlein = !!settings?.isKleinunternehmer;

  const allInvoices = await repo(Invoice).find({
    where: { archived: false, finalized: true },
  });
  const invoices = allInvoices.filter((i) => {
    const d = new Date(i.invoiceDate);
    return d >= period.from && d < period.to;
  });

  const allExpenses = await repo(Expense).find({
    where: { archived: false },
  });
  const expenses = allExpenses.filter((e) => {
    const d = new Date(e.date);
    return d >= period.from && d < period.to;
  });

  // Items pro Invoice nachladen (Relations.toMany lädt nicht automatisch
  // bei find() ohne include).
  const invoiceIds = invoices.map((i) => i.id);
  const allItems = invoiceIds.length
    ? await repo(InvoiceItem).find({ where: { invoiceId: invoiceIds } })
    : [];
  const itemsByInvoice = new Map<string, InvoiceItem[]>();
  for (const item of allItems) {
    const arr = itemsByInvoice.get(item.invoiceId) ?? [];
    arr.push(item);
    itemsByInvoice.set(item.invoiceId, arr);
  }

  // Customer-Country-Cache für RC-Klassifikation
  const countryCache = new Map<string, string>();
  async function countryOf(customerId: string): Promise<string> {
    if (!customerId) return '';
    if (countryCache.has(customerId)) return countryCache.get(customerId)!;
    const addrs = await repo(Address).find({ where: { customerId } });
    const billing =
      addrs.find((a) => a.addressType === 'Rechnungsanschrift') ?? addrs[0];
    const c = billing?.country || '';
    countryCache.set(customerId, c);
    return c;
  }

  const ausgaenge = {
    rate20: { netto: 0, ust: 0 },
    rate13: { netto: 0, ust: 0 },
    rate10: { netto: 0, ust: 0 },
    rate0: { netto: 0, ust: 0 },
    reverseChargeEU: { netto: 0, count: 0 },
    reverseChargeDrittland: { netto: 0, count: 0 },
    kleinunternehmerBefreit: { netto: 0, count: 0 },
    invoiceCount: invoices.length,
  };

  for (const inv of invoices) {
    const items = itemsByInvoice.get(inv.id) ?? [];
    // Netto + USt pro Item ermitteln (vatType Brutto/Netto beachten)
    let invNetto = 0;
    for (const item of items) {
      const vatRate = item.vat;
      let netto: number;
      let ust: number;
      if (inv.vatType === 'Brutto') {
        netto = item.total / (1 + vatRate / 100);
        ust = item.total - netto;
      } else {
        netto = item.total;
        ust = item.total * (vatRate / 100);
      }
      invNetto += netto;

      if (isKlein) {
        // KU: keine USt — egal welcher Rate-Wert am Item steht
        continue;
      }
      if (inv.reverseCharge) {
        // RC: keine USt, Klassifikation pro Invoice am Ende
        continue;
      }
      // Normalfall: Bucket nach Rate
      if (vatRate === 20) {
        ausgaenge.rate20.netto += netto;
        ausgaenge.rate20.ust += ust;
      } else if (vatRate === 13) {
        ausgaenge.rate13.netto += netto;
        ausgaenge.rate13.ust += ust;
      } else if (vatRate === 10) {
        ausgaenge.rate10.netto += netto;
        ausgaenge.rate10.ust += ust;
      } else if (vatRate === 0) {
        ausgaenge.rate0.netto += netto;
        ausgaenge.rate0.ust += 0;
      } else {
        // Unbekannte Rate → in rate0-Block ablegen (sollte praktisch nie vorkommen)
        ausgaenge.rate0.netto += netto;
      }
    }

    if (isKlein) {
      ausgaenge.kleinunternehmerBefreit.netto += invNetto;
      ausgaenge.kleinunternehmerBefreit.count += 1;
    } else if (inv.reverseCharge) {
      const country = await countryOf(inv.customerId);
      if (isEU(country) && country !== settings?.country) {
        ausgaenge.reverseChargeEU.netto += invNetto;
        ausgaenge.reverseChargeEU.count += 1;
      } else {
        // Kein Land, AT oder Nicht-EU → konservativ Drittland
        ausgaenge.reverseChargeDrittland.netto += invNetto;
        ausgaenge.reverseChargeDrittland.count += 1;
      }
    }
  }

  const eingaenge = {
    rate20: { netto: 0, ust: 0 },
    rate13: { netto: 0, ust: 0 },
    rate10: { netto: 0, ust: 0 },
    rate0: { netto: 0, ust: 0 },
    expenseCount: expenses.length,
  };
  for (const e of expenses) {
    const netto = e.netTotal ?? 0;
    const ust = e.vatAmount;
    if (e.vatRate === 20) {
      eingaenge.rate20.netto += netto;
      eingaenge.rate20.ust += ust;
    } else if (e.vatRate === 13) {
      eingaenge.rate13.netto += netto;
      eingaenge.rate13.ust += ust;
    } else if (e.vatRate === 10) {
      eingaenge.rate10.netto += netto;
      eingaenge.rate10.ust += ust;
    } else {
      eingaenge.rate0.netto += netto;
    }
  }

  // KZ-Felder
  const kz022 = round2(ausgaenge.rate20.netto);
  const kz029 = round2(ausgaenge.rate10.netto);
  const kz006 = round2(ausgaenge.rate13.netto);
  const kz020 = round2(ausgaenge.rate0.netto);
  const kz011 = round2(ausgaenge.reverseChargeEU.netto);
  const kz017 = round2(ausgaenge.reverseChargeDrittland.netto);
  const kz016 = round2(ausgaenge.kleinunternehmerBefreit.netto);
  const kz000 = round2(kz022 + kz029 + kz006 + kz020 + kz011 + kz017 + kz016);

  // Vorsteuer (KZ 060): KU darf nichts geltend machen
  const vorsteuerSum =
    eingaenge.rate20.ust + eingaenge.rate13.ust + eingaenge.rate10.ust;
  const kz060 = isKlein ? 0 : round2(vorsteuerSum);

  const ustSumme = round2(
    ausgaenge.rate20.ust + ausgaenge.rate13.ust + ausgaenge.rate10.ust,
  );
  const zahllast = round2(ustSumme - kz060);

  return {
    period: {
      mode: period.mode,
      label: period.label,
      from: isoDate(period.from),
      to: isoDate(period.to),
    },
    isKleinunternehmer: isKlein,
    ausgaenge: {
      rate20: { netto: round2(ausgaenge.rate20.netto), ust: round2(ausgaenge.rate20.ust) },
      rate13: { netto: round2(ausgaenge.rate13.netto), ust: round2(ausgaenge.rate13.ust) },
      rate10: { netto: round2(ausgaenge.rate10.netto), ust: round2(ausgaenge.rate10.ust) },
      rate0: { netto: round2(ausgaenge.rate0.netto), ust: 0 },
      reverseChargeEU: {
        netto: round2(ausgaenge.reverseChargeEU.netto),
        count: ausgaenge.reverseChargeEU.count,
      },
      reverseChargeDrittland: {
        netto: round2(ausgaenge.reverseChargeDrittland.netto),
        count: ausgaenge.reverseChargeDrittland.count,
      },
      kleinunternehmerBefreit: {
        netto: round2(ausgaenge.kleinunternehmerBefreit.netto),
        count: ausgaenge.kleinunternehmerBefreit.count,
      },
      invoiceCount: ausgaenge.invoiceCount,
    },
    eingaenge: {
      rate20: { netto: round2(eingaenge.rate20.netto), ust: round2(eingaenge.rate20.ust) },
      rate13: { netto: round2(eingaenge.rate13.netto), ust: round2(eingaenge.rate13.ust) },
      rate10: { netto: round2(eingaenge.rate10.netto), ust: round2(eingaenge.rate10.ust) },
      rate0: { netto: round2(eingaenge.rate0.netto), ust: 0 },
      expenseCount: eingaenge.expenseCount,
    },
    kzFelder: { kz000, kz022, kz029, kz006, kz020, kz011, kz017, kz016, kz060 },
    ustSumme,
    zahllast,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function requireUser(req: express.Request, res: express.Response): boolean {
  const userInfo = (req.session as any)?.['user'] as UserInfo | undefined;
  if (!userInfo) {
    res.status(401).json({ error: 'Nicht eingeloggt' });
    return false;
  }
  return true;
}

uva.get('/api/uva', async (req, res) => {
  if (!requireUser(req, res)) return;
  const period = parsePeriod(req.query['period'] as string | undefined);
  if (!period) {
    res.status(400).json({
      error: 'Ungültiger period-Parameter. Erwartet: YYYY-MM, YYYY-Q1..Q4 oder YYYY',
    });
    return;
  }
  try {
    const result = await aggregate(period);
    res.json(result);
  } catch (err) {
    console.error('[uva] aggregate failed:', err);
    res.status(500).json({ error: 'Aggregation fehlgeschlagen' });
  }
});

uva.get('/api/uva/csv', async (req, res) => {
  if (!requireUser(req, res)) return;
  const period = parsePeriod(req.query['period'] as string | undefined);
  if (!period) {
    res.status(400).send('Ungültiger period-Parameter');
    return;
  }
  const r = await aggregate(period);

  const rows: Array<[string, string, string]> = [
    ['KZ', 'Bezeichnung', 'Betrag in EUR'],
    ['000', 'Gesamtbetrag der Bemessungsgrundlagen', fmt(r.kzFelder.kz000)],
    ['022', 'Bemessungsgrundlage 20% (Normalsteuersatz)', fmt(r.kzFelder.kz022)],
    ['029', 'Bemessungsgrundlage 10% (ermäßigter Satz)', fmt(r.kzFelder.kz029)],
    ['006', 'Bemessungsgrundlage 13% (ermäßigter Satz)', fmt(r.kzFelder.kz006)],
    ['020', 'Bemessungsgrundlage 0% / steuerfrei', fmt(r.kzFelder.kz020)],
    ['011', 'Innergemeinschaftliche Lieferungen', fmt(r.kzFelder.kz011)],
    ['017', 'Ausfuhrlieferungen (Drittland)', fmt(r.kzFelder.kz017)],
    ['016', 'Kleinunternehmer-Befreiung §6/1/27', fmt(r.kzFelder.kz016)],
    ['060', 'Vorsteuer aus Eingangsrechnungen', fmt(r.kzFelder.kz060)],
    ['—', 'USt-Summe (Ausgangs-USt)', fmt(r.ustSumme)],
    ['—', 'Zahllast / Gutschrift', fmt(r.zahllast)],
  ];

  const csv = rows
    .map(([kz, label, value]) => `${kz};"${label}";${value}`)
    .join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="uva-${period.from.toISOString().slice(0, 10)}.csv"`,
  );
  res.send('﻿' + csv);
});

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',');
}
