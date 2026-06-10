import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { remult } from 'remult';
import { Expense } from '../../../shared/entities/expense';
import { MCardComponent } from '../m-core/m-card.component';

@Component({
  selector: 'm-expense-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MCardComponent],
  templateUrl: './m-expense-list.component.html',
  styleUrls: ['../m-crm/m-customer-list.component.scss'],
})
export class MExpenseListComponent implements OnInit {
  loading = true;
  showArchived = false;
  search = '';
  year = new Date().getFullYear();
  month: number | null = null; // null = alle
  rows: Expense[] = [];

  years: number[] = [];
  months: { value: number | null; label: string }[] = [
    { value: null, label: '— alle —' },
    ...Array.from({ length: 12 }, (_, i) => ({ value: i, label: new Date(2026, i, 1).toLocaleString('de-AT', { month: 'long' }) })),
  ];

  async ngOnInit() {
    const all = await remult.repo(Expense).find({});
    this.years = Array.from(new Set(all.map((e) => e.date ? new Date(e.date).getFullYear() : new Date().getFullYear()))).sort((a, b) => b - a);
    if (!this.years.length) this.years = [new Date().getFullYear()];
    if (!this.years.includes(this.year)) this.year = this.years[0];
    await this.reload();
  }

  async reload() {
    this.loading = true;
    const where: any = this.showArchived ? {} : { archived: false };
    const all = await remult.repo(Expense).find({ where, orderBy: { date: 'desc' } });
    this.rows = all.filter((e) => {
      if (!e.date) return false;
      const d = new Date(e.date);
      if (d.getFullYear() !== this.year) return false;
      if (this.month !== null && d.getMonth() !== this.month) return false;
      return true;
    });
    this.loading = false;
  }

  get filtered(): Expense[] {
    if (!this.search.trim()) return this.rows;
    const s = this.search.toLowerCase();
    return this.rows.filter((r) =>
      (r.vendor || '').toLowerCase().includes(s) ||
      (r.reference || '').toLowerCase().includes(s) ||
      (r.description || '').toLowerCase().includes(s),
    );
  }

  get totalNet(): number {
    return this.filtered.reduce((s, e) => s + (e.netTotal ?? 0), 0);
  }

  get totalGross(): number {
    return this.filtered.reduce((s, e) => s + (e.grossTotal ?? 0), 0);
  }
}
