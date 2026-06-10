import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { KpiCardComponent } from '../core/kpi-card/kpi-card.component';

interface EstResponse {
  year: number;
  annualRevenueNet: number;
  annualExpenseNet: number;
  annualProfit: number;
  invoiceCount: number;
  expenseCount: number;
  svsCoupled: boolean;
  applyInvestitionsbedingtGfb: boolean;
  est: {
    profit: number;
    svsAnnual: number;
    bemessungsgrundlage: number;
    gewinnfreibetrag: { grund: number; investitionsbedingt: number; total: number };
    taxableIncome: number;
    est: number;
    effectiveRate: number;
    marginalRate: number;
    bracketBreakdown: {
      from: number; to: number; rate: number;
      amountInBracket: number; taxOnBracket: number;
    }[];
  };
}

@Component({
  selector: 'app-est',
  imports: [CommonModule, FormsModule, ClarityModule, KpiCardComponent],
  templateUrl: './est.component.html',
  styleUrl: './est.component.scss',
})
export class EstComponent implements OnInit {
  selectedYear = new Date().getFullYear();
  years: number[] = [];
  applyInvestGfb = false;
  data: EstResponse | null = null;
  loading = false;
  error = '';

  async ngOnInit() {
    await this.loadYears();
    await this.load();
  }

  private async loadYears() {
    try {
      const resp = await fetch('/api/analytics/years', { credentials: 'include' });
      if (resp.ok) {
        const j = await resp.json();
        if (Array.isArray(j?.years) && j.years.length) {
          this.years = j.years;
          if (!this.years.includes(this.selectedYear)) {
            this.selectedYear = this.years[0]!;
          }
          return;
        }
      }
    } catch { /* silent */ }
    this.years = [this.selectedYear];
  }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      const url = `/api/est?year=${this.selectedYear}&investGfb=${this.applyInvestGfb}`;
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
      this.data = (await resp.json()) as EstResponse;
    } catch (e: any) {
      this.error = e?.message || 'Konnte ESt-Vorschau nicht laden';
      this.data = null;
    } finally {
      this.loading = false;
    }
  }

  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  fmtPct(n: number | undefined): string {
    if (n === undefined || n === null) return '0 %';
    return (n * 100).toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
  }

  bracketLabel(from: number, to: number): string {
    if (!isFinite(to)) return `über ${this.fmt(from)} €`;
    return `${this.fmt(from)} – ${this.fmt(to)} €`;
  }
}
