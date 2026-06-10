import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { remult } from 'remult';
import { Invoice } from '../../../shared/entities/invoice';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';
import { Expense } from '../../../shared/entities/expense';
import { ModulesService } from '../../core/modules.service';

@Component({
  selector: 'm-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './m-dashboard.component.html',
  styleUrl: './m-dashboard.component.scss',
})
export class MDashboardComponent implements OnInit {
  userName = '';
  today = new Date();
  loading = true;

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
  customerCount = 0;
  expensesThisMonth = 0;
  saldoThisMonth = 0;
  outstandingTotal = 0;
  outstandingCount = 0;
  overdueCount = 0;

  svsAnnualTotal = 0;
  svsIsVorlaeufig = false;
  svsRueckstellung = 0;

  estAnnual = 0;
  estMarginalRate = 0;
  estSvsCoupled = false;

  recent: { id: string; number: string; date: Date; gross: number; paid: boolean; finalized: boolean }[] = [];

  constructor(public modules: ModulesService) {}

  async ngOnInit() {
    this.userName = (remult.user?.name ?? '').trim();
    const [invs, persons, companies, expenses] = await Promise.all([
      remult.repo(Invoice).find({ where: { archived: false }, orderBy: { invoiceDate: 'desc' }, limit: 200 }),
      remult.repo(Person).find({ where: { archived: false } }),
      remult.repo(Company).find({ where: { archived: false } }),
      this.modules.isEnabled('expenses')
        ? remult.repo(Expense).find({ where: { archived: false }, limit: 200 })
        : Promise.resolve([]),
    ]);

    const monthStart = new Date(this.today.getFullYear(), this.today.getMonth(), 1);
    const monthInvs = invs.filter((i) => i.invoiceDate && new Date(i.invoiceDate) >= monthStart);
    this.invoiceCountThisMonth = monthInvs.length;
    this.invoicedThisMonth = monthInvs.reduce((s, i) => s + (i.grossTotal ?? 0), 0);

    const monthExp = expenses.filter((e) => e.date && new Date(e.date) >= monthStart);
    this.expensesThisMonth = monthExp.reduce((s, e) => s + (e.grossTotal ?? 0), 0);
    this.saldoThisMonth = this.invoicedThisMonth - this.expensesThisMonth;

    const todayMs = this.today.getTime();
    const outstanding = invs.filter((i) => i.finalized && !i.paid && !i.correctsInvoiceId);
    this.outstandingCount = outstanding.length;
    this.outstandingTotal = outstanding.reduce((s, i) => s + (i.grossTotal ?? 0), 0);
    this.overdueCount = outstanding.filter((i) => {
      const due = i.invoiceDate ? new Date(i.invoiceDate).getTime() + 14 * 24 * 3600 * 1000 : todayMs;
      return due < todayMs;
    }).length;

    this.customerCount = persons.length + companies.length;

    if (this.modules.isEnabled('svs')) {
      try {
        const r = await fetch(`/api/svs?year=${this.today.getFullYear()}`, { credentials: 'include' });
        if (r.ok) {
          const j = await r.json();
          this.svsAnnualTotal = j?.svs?.total ?? 0;
          this.svsIsVorlaeufig = j?.svs?.isVorlaeufig ?? false;
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

    this.recent = invs.slice(0, 5).map((i) => ({
      id: i.id,
      number: i.invoiceNumber || '—',
      date: i.invoiceDate ? new Date(i.invoiceDate) : new Date(),
      gross: i.grossTotal ?? 0,
      paid: i.paid,
      finalized: i.finalized,
    }));

    this.loading = false;
  }
}
