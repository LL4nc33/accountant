/**
 * Gemeinsame Jahres-Aggregation für Gewinn (Erlöse - Aufwand).
 * Wird von SVS-, ESt- und potentiell weiteren Forecast-Endpoints
 * konsumiert. Netto-Basis (USt durchgereicht), zusätzlich Brutto-
 * Erlöse für Umsatzgrenzen-Checks.
 */
import { repo } from 'remult';
import { Invoice } from '../shared/entities/invoice';
import { Expense } from '../shared/entities/expense';

export interface ProfitYearAggregate {
  annualRevenueNet: number;
  annualRevenueGross: number;
  annualExpenseNet: number;
  annualProfit: number;
  invoiceCount: number;
  expenseCount: number;
}

export async function aggregateProfitYear(year: number): Promise<ProfitYearAggregate> {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const [allInvoices, allExpenses] = await Promise.all([
    repo(Invoice).find({ where: { archived: false } }),
    repo(Expense).find({ where: { archived: false } }),
  ]);

  let annualRevenueNet = 0;
  let annualRevenueGross = 0;
  let invoiceCount = 0;
  for (const inv of allInvoices) {
    if (!inv.invoiceDate) continue;
    const d = new Date(inv.invoiceDate);
    if (d < yearStart || d >= yearEnd) continue;
    if (inv.correctsInvoiceId) continue; // Stornos raus
    annualRevenueNet += inv.netTotal ?? 0;
    annualRevenueGross += inv.grossTotal ?? 0;
    invoiceCount++;
  }

  let annualExpenseNet = 0;
  let expenseCount = 0;
  for (const ex of allExpenses) {
    if (!ex.date) continue;
    const d = new Date(ex.date);
    if (d < yearStart || d >= yearEnd) continue;
    annualExpenseNet += ex.netTotal ?? 0;
    expenseCount++;
  }

  return {
    annualRevenueNet: round2(annualRevenueNet),
    annualRevenueGross: round2(annualRevenueGross),
    annualExpenseNet: round2(annualExpenseNet),
    annualProfit: round2(annualRevenueNet - annualExpenseNet),
    invoiceCount,
    expenseCount,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
