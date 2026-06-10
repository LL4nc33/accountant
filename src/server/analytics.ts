/**
 * Analytics-Aggregator (Phase 17, v0.20.0)
 *
 * Liefert konsolidierte Stats für die /analytics-Page:
 *   - Granularität year: 12 Monate des Kalenderjahres
 *   - Granularität month: ausgewählter Monat + 12 trailing Monate als Trend
 *   - Topcustomers / Aufwand pro Kategorie auf das Period-Fenster bezogen
 *     (Year = Kalenderjahr, Month = trailing-12-Monate, damit Rankings
 *     auch bei wenigen Belegen pro Monat aussagekräftig bleiben).
 *   - Period-Totals + Vergleich gegen Vorperiode
 *     (Year vs Vorjahr, Month vs gleicher Monat im Vorjahr)
 *   - Status-Counts (Entwürfe, festgeschriebene-offen, bezahlt, überfällig)
 *
 * Lese-Operation, Auth admin-only. Cached nichts — bei wenigen tausend Rows
 * ist es schnell genug.
 */
import express from 'express';
import { repo, type UserInfo } from 'remult';
import { api } from './api';
import { Invoice } from '../shared/entities/invoice';
import { Expense } from '../shared/entities/expense';
import { Person } from '../shared/entities/person';
import { Company } from '../shared/entities/company';

export const analytics = express.Router();
analytics.use(express.json());
analytics.use(api.withRemult);

function requireAdmin(req: express.Request, res: express.Response): UserInfo | null {
  const u = (req.session as any)?.['user'] as UserInfo | undefined;
  if (!u) {
    res.status(401).json({ error: 'Nicht eingeloggt' });
    return null;
  }
  if (!u.roles?.includes('admin')) {
    res.status(403).json({ error: 'Admin-Recht erforderlich' });
    return null;
  }
  return u;
}

interface MonthBucket {
  year: number;
  month: number; // 1-12
  label: string;
  invoiced: number;
  paid: number;
  expense: number;
}

interface CustomerBucket {
  id: string;
  name: string;
  gross: number;
  invoiceCount: number;
}

interface CategoryBucket {
  category: string;
  net: number;
  gross: number;
  count: number;
}

const MONTH_LABELS = [
  'Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];

function emptyYearMonthly(year: number): MonthBucket[] {
  return Array.from({ length: 12 }, (_, i) => ({
    year,
    month: i + 1,
    label: MONTH_LABELS[i]!,
    invoiced: 0,
    paid: 0,
    expense: 0,
  }));
}

function emptyTrailingMonthly(endYear: number, endMonth: number): MonthBucket[] {
  // Liefert 12 Buckets, ältester zuerst, endet inkl. (endYear, endMonth).
  // Beispiel: endYear=2026, endMonth=6 → Jul 2025 … Jun 2026.
  // Wenn die Window-Periode zwei Kalenderjahre überspannt, hängen wir
  // ein '25/'26-Suffix an die Labels, damit der User die Achse versteht.
  const buckets: MonthBucket[] = [];
  for (let offset = 11; offset >= 0; offset--) {
    const d = new Date(endYear, endMonth - 1 - offset, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    buckets.push({
      year: y,
      month: m + 1,
      label: MONTH_LABELS[m]!,
      invoiced: 0,
      paid: 0,
      expense: 0,
    });
  }
  const crossYear = buckets[0]!.year !== buckets[11]!.year;
  if (crossYear) {
    for (const b of buckets) {
      b.label = `${b.label} '${String(b.year).slice(-2)}`;
    }
  }
  return buckets;
}

async function fetchAll() {
  return Promise.all([
    repo(Invoice).find({ where: { archived: false } }),
    repo(Expense).find({ where: { archived: false } }),
    repo(Person).find({ where: { archived: false } }),
    repo(Company).find({ where: { archived: false } }),
  ]);
}

function nameCustomerBuckets(
  customerMap: Map<string, CustomerBucket>,
  persons: Person[],
  companies: Company[],
): CustomerBucket[] {
  for (const p of persons) {
    const b = customerMap.get(p.id);
    if (b) b.name = p.displayName;
  }
  for (const c of companies) {
    const b = customerMap.get(c.id);
    if (b) b.name = c.displayName;
  }
  return Array.from(customerMap.values())
    .sort((a, b) => b.gross - a.gross)
    .slice(0, 10);
}

async function aggregateYear(year: number) {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const [allInvoices, allExpenses, persons, companies] = await fetchAll();

  const invoices = allInvoices.filter((i) => {
    const d = new Date(i.invoiceDate);
    return d >= yearStart && d < yearEnd;
  });
  const expenses = allExpenses.filter((e) => {
    const d = new Date(e.date);
    return d >= yearStart && d < yearEnd;
  });

  const monthly = emptyYearMonthly(year);

  let draftCount = 0, finalOpenCount = 0, paidCount = 0, overdueCount = 0;
  let totalInvoicedGross = 0, totalPaidGross = 0;
  const todayMs = Date.now();

  for (const inv of invoices) {
    if (inv.correctsInvoiceId) continue;
    const m = new Date(inv.invoiceDate).getMonth();
    const gross = inv.grossTotal ?? 0;
    monthly[m]!.invoiced += gross;
    totalInvoicedGross += gross;

    if (!inv.finalized) {
      draftCount++;
    } else if (inv.paid) {
      paidCount++;
      totalPaidGross += gross;
      if (inv.paidAt) {
        const pm = new Date(inv.paidAt).getMonth();
        if (pm >= 0 && pm < 12) monthly[pm]!.paid += gross;
      }
    } else {
      finalOpenCount++;
      const dueMs = new Date(inv.invoiceDate).getTime() + (inv.paymentTermsDays ?? 14) * 86400000;
      if (dueMs < todayMs) overdueCount++;
    }
  }

  const categoryMap = new Map<string, CategoryBucket>();
  let totalExpenseGross = 0;
  for (const ex of expenses) {
    const m = new Date(ex.date).getMonth();
    const gross = ex.grossTotal ?? 0;
    const net = ex.netTotal ?? 0;
    monthly[m]!.expense += gross;
    totalExpenseGross += gross;
    const cat = ex.category || 'Sonstiges';
    const bucket = categoryMap.get(cat) ?? { category: cat, net: 0, gross: 0, count: 0 };
    bucket.net += net;
    bucket.gross += gross;
    bucket.count++;
    categoryMap.set(cat, bucket);
  }
  const categories = Array.from(categoryMap.values()).sort((a, b) => b.gross - a.gross);

  const customerMap = new Map<string, CustomerBucket>();
  for (const inv of invoices) {
    if (inv.correctsInvoiceId || !inv.finalized || !inv.customerId) continue;
    const gross = inv.grossTotal ?? 0;
    const bucket = customerMap.get(inv.customerId) ?? {
      id: inv.customerId, name: '—', gross: 0, invoiceCount: 0,
    };
    bucket.gross += gross;
    bucket.invoiceCount++;
    customerMap.set(inv.customerId, bucket);
  }
  const topCustomers = nameCustomerBuckets(customerMap, persons, companies);

  return {
    year,
    month: null as number | null,
    periodLabel: String(year),
    monthly,
    topCustomers,
    categories,
    periodTotal: {
      invoicedGross: round2(totalInvoicedGross),
      paidGross: round2(totalPaidGross),
      expenseGross: round2(totalExpenseGross),
      saldo: round2(totalInvoicedGross - totalExpenseGross),
    },
    counts: {
      drafts: draftCount,
      finalOpen: finalOpenCount,
      paid: paidCount,
      overdue: overdueCount,
      invoicesTotal: invoices.filter((i) => !i.correctsInvoiceId).length,
      expensesTotal: expenses.length,
    },
  };
}

/**
 * Aggregiert den ausgewählten Monat als KPIs + die letzten 12 Monate als Trend.
 * Customers/Categories werden über das Trailing-Window aggregiert, damit Rankings
 * auch bei Solo-EPUs mit wenigen Belegen pro Einzelmonat aussagekräftig bleiben.
 */
async function aggregateMonth(year: number, month: number) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const trailStart = new Date(year, month - 12, 1);
  const trailEnd = monthEnd;

  const [allInvoices, allExpenses, persons, companies] = await fetchAll();

  const inTrailInvoice = (i: Invoice) => {
    const d = new Date(i.invoiceDate);
    return d >= trailStart && d < trailEnd;
  };
  const inTrailExpense = (e: Expense) => {
    const d = new Date(e.date);
    return d >= trailStart && d < trailEnd;
  };

  const invoicesTrail = allInvoices.filter(inTrailInvoice);
  const expensesTrail = allExpenses.filter(inTrailExpense);

  const monthly = emptyTrailingMonthly(year, month);

  // Trend-Buckets befüllen
  const bucketIdxFor = (d: Date) => {
    const monthsBack = (year - d.getFullYear()) * 12 + (month - 1 - d.getMonth());
    return 11 - monthsBack; // 0..11, sonst out-of-range
  };

  for (const inv of invoicesTrail) {
    if (inv.correctsInvoiceId) continue;
    const idx = bucketIdxFor(new Date(inv.invoiceDate));
    if (idx >= 0 && idx < 12) {
      monthly[idx]!.invoiced += inv.grossTotal ?? 0;
    }
    if (inv.finalized && inv.paid && inv.paidAt) {
      const pidx = bucketIdxFor(new Date(inv.paidAt));
      if (pidx >= 0 && pidx < 12) monthly[pidx]!.paid += inv.grossTotal ?? 0;
    }
  }
  for (const ex of expensesTrail) {
    const idx = bucketIdxFor(new Date(ex.date));
    if (idx >= 0 && idx < 12) {
      monthly[idx]!.expense += ex.grossTotal ?? 0;
    }
  }

  // Selected-Month KPIs + Counts
  const invoicesMonth = invoicesTrail.filter((i) => {
    const d = new Date(i.invoiceDate);
    return d >= monthStart && d < monthEnd;
  });
  const expensesMonth = expensesTrail.filter((e) => {
    const d = new Date(e.date);
    return d >= monthStart && d < monthEnd;
  });

  let totalInvoicedGross = 0, totalPaidGross = 0, totalExpenseGross = 0;
  let draftCount = 0, finalOpenCount = 0, paidCount = 0, overdueCount = 0;
  const todayMs = Date.now();

  for (const inv of invoicesMonth) {
    if (inv.correctsInvoiceId) continue;
    const gross = inv.grossTotal ?? 0;
    totalInvoicedGross += gross;
    if (!inv.finalized) {
      draftCount++;
    } else if (inv.paid) {
      paidCount++;
      totalPaidGross += gross;
    } else {
      finalOpenCount++;
      const dueMs = new Date(inv.invoiceDate).getTime() + (inv.paymentTermsDays ?? 14) * 86400000;
      if (dueMs < todayMs) overdueCount++;
    }
  }
  for (const ex of expensesMonth) {
    totalExpenseGross += ex.grossTotal ?? 0;
  }

  // Customers + Categories über Trailing-Window
  const customerMap = new Map<string, CustomerBucket>();
  for (const inv of invoicesTrail) {
    if (inv.correctsInvoiceId || !inv.finalized || !inv.customerId) continue;
    const gross = inv.grossTotal ?? 0;
    const bucket = customerMap.get(inv.customerId) ?? {
      id: inv.customerId, name: '—', gross: 0, invoiceCount: 0,
    };
    bucket.gross += gross;
    bucket.invoiceCount++;
    customerMap.set(inv.customerId, bucket);
  }
  const topCustomers = nameCustomerBuckets(customerMap, persons, companies);

  const categoryMap = new Map<string, CategoryBucket>();
  for (const ex of expensesTrail) {
    const cat = ex.category || 'Sonstiges';
    const bucket = categoryMap.get(cat) ?? { category: cat, net: 0, gross: 0, count: 0 };
    bucket.net += ex.netTotal ?? 0;
    bucket.gross += ex.grossTotal ?? 0;
    bucket.count++;
    categoryMap.set(cat, bucket);
  }
  const categories = Array.from(categoryMap.values()).sort((a, b) => b.gross - a.gross);

  return {
    year,
    month,
    periodLabel: `${MONTH_LABELS[month - 1]} ${year}`,
    monthly,
    topCustomers,
    categories,
    periodTotal: {
      invoicedGross: round2(totalInvoicedGross),
      paidGross: round2(totalPaidGross),
      expenseGross: round2(totalExpenseGross),
      saldo: round2(totalInvoicedGross - totalExpenseGross),
    },
    counts: {
      drafts: draftCount,
      finalOpen: finalOpenCount,
      paid: paidCount,
      overdue: overdueCount,
      invoicesTotal: invoicesMonth.filter((i) => !i.correctsInvoiceId).length,
      expensesTotal: expensesMonth.length,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

analytics.get('/api/analytics/years', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const [invs, exps] = await Promise.all([
      repo(Invoice).find({ where: { archived: false } }),
      repo(Expense).find({ where: { archived: false } }),
    ]);
    const years = new Set<number>();
    for (const i of invs) {
      const y = new Date(i.invoiceDate).getFullYear();
      if (y > 1900 && y < 2200) years.add(y);
    }
    for (const e of exps) {
      const y = new Date(e.date).getFullYear();
      if (y > 1900 && y < 2200) years.add(y);
    }
    years.add(new Date().getFullYear());
    res.json({ years: Array.from(years).sort((a, b) => b - a) });
  } catch (e: any) {
    console.error('[analytics/years] failed', e);
    res.status(500).json({ error: e?.message ?? 'Failed' });
  }
});

analytics.get('/api/analytics', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const now = new Date();
  const year = parseInt(String(req.query['year'] ?? now.getFullYear()), 10);
  const granularity = String(req.query['granularity'] ?? 'year');
  const month = parseInt(String(req.query['month'] ?? (now.getMonth() + 1)), 10);

  if (isNaN(year) || year < 2000 || year > 2099) {
    res.status(400).json({ error: 'Ungültiges Jahr' });
    return;
  }
  if (granularity !== 'year' && granularity !== 'month') {
    res.status(400).json({ error: 'Ungültige Granularität' });
    return;
  }
  if (granularity === 'month' && (isNaN(month) || month < 1 || month > 12)) {
    res.status(400).json({ error: 'Ungültiger Monat' });
    return;
  }

  try {
    let current, previous;
    if (granularity === 'year') {
      [current, previous] = await Promise.all([
        aggregateYear(year),
        aggregateYear(year - 1),
      ]);
    } else {
      [current, previous] = await Promise.all([
        aggregateMonth(year, month),
        aggregateMonth(year - 1, month),
      ]);
    }
    res.json({
      granularity,
      current,
      previous: {
        year: previous.year,
        month: previous.month,
        periodLabel: previous.periodLabel,
        periodTotal: previous.periodTotal,
        counts: previous.counts,
      },
      deltas: {
        invoicedGross: round2(current.periodTotal.invoicedGross - previous.periodTotal.invoicedGross),
        expenseGross: round2(current.periodTotal.expenseGross - previous.periodTotal.expenseGross),
        saldo: round2(current.periodTotal.saldo - previous.periodTotal.saldo),
      },
    });
  } catch (e: any) {
    console.error('[analytics] aggregate failed', e);
    res.status(500).json({ error: e?.message ?? 'Aggregation fehlgeschlagen' });
  }
});
