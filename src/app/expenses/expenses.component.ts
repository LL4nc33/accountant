import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ClarityModule, ClrDatagridModule } from '@clr/angular';
import { remult } from 'remult';
import { Expense } from '../../shared/entities/expense';
import { EmptyStateComponent } from '../core/empty-state/empty-state.component';
import { archiveScope } from '../core/archive-filter';
import { KpiCardComponent } from '../core/kpi-card/kpi-card.component';

@Component({
  selector: 'app-expenses',
  imports: [CommonModule, FormsModule, ClarityModule, ClrDatagridModule, RouterLink, EmptyStateComponent, KpiCardComponent],
  templateUrl: './expenses.component.html',
  styleUrl: './expenses.component.scss',
})
export class ExpensesComponent implements OnInit {
  repo = remult.repo(Expense);
  rows: Expense[] = [];
  loading = true;

  // Period filter
  selectedYear: number = new Date().getFullYear();
  selectedMonth: 'all' | number = 'all';     // 1-12 oder 'all'
  showArchived = false;

  async ngOnInit() { await this.reload(); }

  async reload() {
    this.loading = true;
    try {
      this.rows = await this.repo.find({
        where: archiveScope(this.showArchived),
        orderBy: { date: 'desc' },
      });
    } finally {
      this.loading = false;
    }
  }

  get availableYears(): number[] {
    const years = new Set<number>();
    years.add(new Date().getFullYear());
    for (const e of this.rows) years.add(new Date(e.date).getFullYear());
    return [...years].sort((a, b) => b - a);
  }

  get filtered(): Expense[] {
    return this.rows.filter((e) => {
      const d = new Date(e.date);
      if (d.getFullYear() !== this.selectedYear) return false;
      if (this.selectedMonth !== 'all' && d.getMonth() + 1 !== this.selectedMonth) return false;
      return true;
    });
  }

  get totalNet(): number {
    return this.filtered.reduce((sum, e) => sum + (e.netTotal ?? 0), 0);
  }
  get totalVat(): number {
    return this.filtered.reduce((sum, e) => sum + (e.vatAmount ?? 0), 0);
  }
  get totalGross(): number {
    return this.filtered.reduce((sum, e) => sum + (e.grossTotal ?? 0), 0);
  }

  /** Top-Kategorie der gefilterten Belege (Brutto). */
  get topCategory(): { category: string; gross: number } | null {
    const map = new Map<string, number>();
    for (const e of this.filtered) {
      const cat = e.category || 'Sonstiges';
      map.set(cat, (map.get(cat) ?? 0) + (e.grossTotal ?? 0));
    }
    let top: { category: string; gross: number } | null = null;
    for (const [category, gross] of map.entries()) {
      if (!top || gross > top.gross) top = { category, gross };
    }
    return top;
  }

  /** Anzahl unbezahlter Belege im gefilterten Zeitraum. */
  get unpaidCount(): number {
    return this.filtered.filter((e) => e.paymentStatus !== 'bezahlt').length;
  }

  monthLabel(m: number): string {
    const names = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
                   'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    return names[m - 1];
  }
}
