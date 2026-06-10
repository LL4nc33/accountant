import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { RouterLink } from '@angular/router';
import { remult } from 'remult';
import { CashbookEntry } from '../../shared/entities/cashbook-entry';

interface RowWithBalance {
  entry: CashbookEntry;
  runningBalance: number;
}

@Component({
  selector: 'app-cashbook',
  imports: [CommonModule, FormsModule, ClarityModule, RouterLink],
  template: `
    <main class="cashbook">
      <div class="page-head">
        <div class="page-head-text">
          <h1>Kassabuch</h1>
          <p>
            Bareinnahmen + Barausgaben chronologisch.
            §131 BAO: zeitnah, vollständig, geordnet, unveränderlich.
            <strong>Nicht RKSV-konform</strong> — bei Bar-Umsätzen über
            7.500 €/Jahr ist eine Registrierkasse Pflicht.
          </p>
        </div>
        <div class="page-head-actions">
          <select [(ngModel)]="yearFilter" (ngModelChange)="refresh()">
            <option [ngValue]="0">Alle Jahre</option>
            <option *ngFor="let y of years" [ngValue]="y">{{ y }}</option>
          </select>
          <a class="btn btn-primary" routerLink="/cashbook/new/edit">+ Neuer Eintrag</a>
        </div>
      </div>

      <section class="kpi-row" *ngIf="!loading">
        <div class="kpi">
          <div class="kpi-label">{{ yearFilter > 0 ? 'Saldo ' + yearFilter + ' (Ende)' : 'Saldo gesamt' }}</div>
          <div class="kpi-value" [class.positive]="currentBalance >= 0" [class.negative]="currentBalance < 0">
            {{ fmt(currentBalance) }} €
          </div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Einnahmen</div>
          <div class="kpi-value positive">{{ fmt(income) }} €</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Ausgaben</div>
          <div class="kpi-value negative">{{ fmt(expense) }} €</div>
        </div>
      </section>

      <p *ngIf="loading" class="muted">Lade…</p>

      <table class="cashbook-table" *ngIf="!loading && rows.length">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Beleg-Nr.</th>
            <th>Beschreibung</th>
            <th>Kategorie</th>
            <th class="right">USt</th>
            <th class="right">Betrag</th>
            <th class="right">Saldo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let r of rows" [class.income]="r.entry.amount > 0" [class.expense]="r.entry.amount < 0">
            <td>{{ r.entry.entryDate | date:'dd.MM.yyyy' }}</td>
            <td class="mono">{{ r.entry.documentNumber || '—' }}</td>
            <td><a [routerLink]="['/cashbook', r.entry.id, 'edit']">{{ r.entry.description || '—' }}</a></td>
            <td>{{ r.entry.category }}</td>
            <td class="right">{{ r.entry.vatRate > 0 ? r.entry.vatRate + '%' : '—' }}</td>
            <td class="right amount" [class.positive]="r.entry.amount > 0" [class.negative]="r.entry.amount < 0">
              {{ fmt(r.entry.amount) }}
            </td>
            <td class="right balance">{{ fmt(r.runningBalance) }}</td>
            <td><a [routerLink]="['/cashbook', r.entry.id, 'edit']" class="link">edit</a></td>
          </tr>
        </tbody>
      </table>

      <p *ngIf="!loading && !rows.length" class="muted">
        Noch keine Einträge im Kassabuch. <a routerLink="/cashbook/new/edit">Den ersten anlegen →</a>
      </p>
    </main>
  `,
  styles: [`
    .cashbook { max-width: 1100px; }
    .head { margin-bottom: 1rem;
      h1 { margin: 0 0 0.3rem; font-size: 1.4rem; }
      p.muted { margin: 0 0 0.75rem; color: #666; font-size: 0.9rem; max-width: 720px; }
    }
    .actions { display: flex; gap: 0.75rem; align-items: center;
      select { padding: 4px 10px; border: 1px solid #ccc; border-radius: 3px; }
    }
    .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin: 1rem 0 1.25rem;
      .kpi { background: white; border: 1px solid #e0e0e0; border-radius: 4px; padding: 0.7rem 1rem; }
      .kpi-label { font-size: 0.78rem; color: #666; }
      .kpi-value { font-size: 1.4rem; font-weight: 600; margin-top: 0.3rem; font-variant-numeric: tabular-nums;
        &.positive { color: #266100; }
        &.negative { color: #8b0000; }
      }
    }
    .cashbook-table { width: 100%; border-collapse: collapse; font-size: 0.9rem;
      background: white; border: 1px solid #e0e0e0; border-radius: 4px;
      th, td { padding: 0.45rem 0.65rem; border-bottom: 1px solid #f0f0f0; }
      th { font-weight: 500; background: #fafafa; color: #4a4a4a; text-align: left; }
      .right { text-align: right; font-variant-numeric: tabular-nums; }
      .mono { font-family: monospace; font-size: 0.85rem; }
      .amount.positive { color: #266100; font-weight: 500; }
      .amount.negative { color: #8b0000; font-weight: 500; }
      .balance { font-weight: 600; }
      .link { color: #1c4d7c; text-decoration: none; font-size: 0.85rem; }
      .link:hover { text-decoration: underline; }
    }
    .muted { color: #666; }
  `],
})
export class CashbookComponent implements OnInit {
  entries: CashbookEntry[] = [];
  rows: RowWithBalance[] = [];
  loading = true;
  yearFilter = new Date().getFullYear();
  years: number[] = [new Date().getFullYear()];

  income = 0;
  expense = 0;
  currentBalance = 0;

  async ngOnInit() { await this.refresh(); }

  async refresh() {
    this.loading = true;
    this.entries = await remult.repo(CashbookEntry).find({
      where: { archived: false },
      orderBy: { entryDate: 'asc' as any },
    });

    // Years
    const yearsSet = new Set<number>();
    for (const e of this.entries) yearsSet.add(new Date(e.entryDate).getFullYear());
    yearsSet.add(new Date().getFullYear());
    this.years = Array.from(yearsSet).sort((a, b) => b - a);

    // Filter + Running Balance über ALLEN Entries; aber Tabelle nur Filter-Jahr
    let runningBalance = 0;
    const allRows: RowWithBalance[] = [];
    for (const e of this.entries) {
      runningBalance += e.amount;
      allRows.push({ entry: e, runningBalance });
    }

    const filtered = this.yearFilter > 0
      ? allRows.filter(r => new Date(r.entry.entryDate).getFullYear() === this.yearFilter)
      : allRows;

    // Sortierung descending für Anzeige
    this.rows = filtered.slice().reverse();

    this.income = Math.round(filtered.filter(r => r.entry.amount > 0).reduce((s, r) => s + r.entry.amount, 0) * 100) / 100;
    this.expense = Math.round(filtered.filter(r => r.entry.amount < 0).reduce((s, r) => s + r.entry.amount, 0) * 100) / 100;
    // Saldo: bei „Alle Jahre" = Gesamt-Saldo; bei Filter = Saldo am Ende des
    // gefilterten Jahres (chronologisch letzter Eintrag des Jahres).
    this.currentBalance = filtered.length
      ? filtered[filtered.length - 1]!.runningBalance
      : 0;

    this.loading = false;
  }

  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
