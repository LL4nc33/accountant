import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { remult } from 'remult';
import { AnalyticsComponent } from '../analytics/analytics.component';
import { KpiCardComponent } from '../core/kpi-card/kpi-card.component';
import { Invoice } from '../../shared/entities/invoice';
import { TimeEntry } from '../../shared/entities/time-entry';
import { Person } from '../../shared/entities/person';
import { Company } from '../../shared/entities/company';
import { Expense } from '../../shared/entities/expense';
import { CompanySettings } from '../../shared/entities/company-settings';
import { ModulesService } from '../core/modules.service';

interface InvoiceRow {
  id: string;
  number: string;
  customerLabel: string;
  date: Date;
  gross: number;
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterLink, ClarityModule, AnalyticsComponent, KpiCardComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  userName = '';
  today = new Date();

  get greeting(): string {
    const h = this.today.getHours();
    if (h < 5) return 'Schöne Nachtschicht';
    if (h < 11) return 'Guten Morgen';
    if (h < 14) return 'Servus';
    if (h < 18) return 'Guten Tag';
    return 'Guten Abend';
  }

  invoicedThisMonth = 0;
  invoiceCountThisMonth = 0;

  unbilledHours = 0;
  unbilledProjectCount = 0;

  customerCount = 0;

  expensesThisMonth = 0;
  expenseCountThisMonth = 0;
  saldoThisMonth = 0;

  outstandingTotal = 0;
  outstandingCount = 0;
  overdueCount = 0;

  svsAnnualTotal = 0;
  svsIsVorlaeufig = false;
  svsCapped: 'min' | 'max' | 'none' = 'none';
  svsRueckstellung = 0;

  estAnnual = 0;
  estMarginalRate = 0;
  estSvsCoupled = false;

  recentInvoices: InvoiceRow[] = [];
  loading = true;

  showOnboardingHint = false;

  constructor(public modules: ModulesService) {}

  async ngOnInit() {
    this.userName = (remult.user?.name ?? '').trim();

    const settingsRepo = remult.repo(CompanySettings);
    const settings = await settingsRepo.findFirst();
    if (settings) {
      const incomplete =
        !settings.name?.trim() ||
        !settings.addressStreet?.trim() ||
        !settings.addressZip?.trim() ||
        !settings.addressCity?.trim();
      this.showOnboardingHint = incomplete && !settings.onboardingDismissed;
    }

    const [invoices, persons, companies, timeEntries, expenses] = await Promise.all([
      remult.repo(Invoice).find({ where: { archived: false }, orderBy: { invoiceDate: 'desc' }, limit: 200 }),
      remult.repo(Person).find({ where: { archived: false } }),
      remult.repo(Company).find({ where: { archived: false } }),
      remult.repo(TimeEntry).find(),
      this.modules.isEnabled('expenses')
        ? remult.repo(Expense).find({ where: { archived: false }, orderBy: { date: 'desc' }, limit: 200 })
        : Promise.resolve([]),
    ]);

    const monthStart = new Date(this.today.getFullYear(), this.today.getMonth(), 1);
    const monthInvoices = invoices.filter(
      (inv) => inv.invoiceDate && new Date(inv.invoiceDate) >= monthStart
    );
    this.invoiceCountThisMonth = monthInvoices.length;
    this.invoicedThisMonth = monthInvoices.reduce((sum, inv) => sum + (inv.grossTotal ?? 0), 0);

    const monthExpenses = expenses.filter(
      (e) => e.date && new Date(e.date) >= monthStart,
    );
    this.expenseCountThisMonth = monthExpenses.length;
    this.expensesThisMonth = monthExpenses.reduce((sum, e) => sum + (e.grossTotal ?? 0), 0);
    this.saldoThisMonth = this.invoicedThisMonth - this.expensesThisMonth;

    // Außenstände: alle finalisierten + nicht-bezahlten + nicht-storno Rechnungen
    const todayMs = this.today.getTime();
    const outstanding = invoices.filter(
      (inv) => inv.finalized && !inv.paid && !inv.correctsInvoiceId,
    );
    this.outstandingCount = outstanding.length;
    this.outstandingTotal = outstanding.reduce((sum, inv) => sum + (inv.grossTotal ?? 0), 0);
    this.overdueCount = outstanding.filter((inv) => {
      const due = inv.invoiceDate ? new Date(inv.invoiceDate).getTime() + 14 * 24 * 3600 * 1000 : todayMs;
      return due < todayMs;
    }).length;

    const unbilled = timeEntries.filter((t) => !t.billedInvoiceItemId);
    this.unbilledHours = unbilled.reduce((sum, t) => sum + (t.hours ?? 0), 0);
    this.unbilledProjectCount = new Set(unbilled.map((t) => t.projectId).filter(Boolean)).size;

    this.customerCount = persons.length + companies.length;

    // SVS-Vorschau für aktuelles Jahr — nur laden wenn Modul aktiv.
    // Silent fail (falls Endpoint nicht erreichbar oder Daten fehlen)
    // damit das Dashboard nicht hängt.
    if (this.modules.isEnabled('svs')) {
      try {
        const r = await fetch(`/api/svs?year=${this.today.getFullYear()}`, { credentials: 'include' });
        if (r.ok) {
          const j = await r.json();
          this.svsAnnualTotal = j?.svs?.total ?? 0;
          this.svsIsVorlaeufig = j?.svs?.isVorlaeufig ?? false;
          this.svsCapped = j?.svs?.capped ?? 'none';
          this.svsRueckstellung = j?.rueckstellung?.expectedNachzahlung ?? 0;
        }
      } catch { /* silent */ }
    }

    if (this.modules.isEnabled('est')) {
      try {
        const r = await fetch(`/api/est?year=${this.today.getFullYear()}`, { credentials: 'include' });
        if (r.ok) {
          const j = await r.json();
          this.estAnnual = j?.est?.est ?? 0;
          this.estMarginalRate = j?.est?.marginalRate ?? 0;
          this.estSvsCoupled = j?.svsCoupled ?? false;
        }
      } catch { /* silent */ }
    }

    const customerLabelById = new Map<string, string>();
    for (const p of persons) {
      customerLabelById.set(p.id, `${p.firstname ?? ''} ${p.lastname ?? ''}`.trim() || '—');
    }
    for (const c of companies) {
      customerLabelById.set(c.id, c.name ?? '—');
    }

    this.recentInvoices = invoices.slice(0, 5).map((inv) => ({
      id: inv.id,
      number: inv.invoiceNumber || '—',
      customerLabel: customerLabelById.get(inv.customerId ?? '') ?? '—',
      date: inv.invoiceDate ? new Date(inv.invoiceDate) : new Date(),
      gross: inv.grossTotal ?? 0,
    }));

    this.loading = false;
  }
}
