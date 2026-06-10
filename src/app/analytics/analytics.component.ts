import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { KpiCardComponent, KpiDeltaDirection } from '../core/kpi-card/kpi-card.component';

interface MonthBucket {
  year: number;
  month: number;
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

type Granularity = 'year' | 'month';

interface PeriodTotal {
  invoicedGross: number;
  paidGross: number;
  expenseGross: number;
  saldo: number;
}

interface Counts {
  drafts: number;
  finalOpen: number;
  paid: number;
  overdue: number;
  invoicesTotal: number;
  expensesTotal: number;
}

interface AnalyticsResponse {
  granularity: Granularity;
  current: {
    year: number;
    month: number | null;
    periodLabel: string;
    monthly: MonthBucket[];
    topCustomers: CustomerBucket[];
    categories: CategoryBucket[];
    periodTotal: PeriodTotal;
    counts: Counts;
  };
  previous: {
    year: number;
    month: number | null;
    periodLabel: string;
    periodTotal: PeriodTotal;
    counts: Counts;
  };
  deltas: { invoicedGross: number; expenseGross: number; saldo: number };
}

const MONTH_LABELS = [
  'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

@Component({
  selector: 'app-analytics',
  imports: [CommonModule, FormsModule, ClarityModule, KpiCardComponent],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
})
export class AnalyticsComponent implements OnInit {
  granularity: Granularity = 'year';
  selectedYear = new Date().getFullYear();
  selectedMonth = new Date().getMonth() + 1; // 1-12
  monthLabels = MONTH_LABELS;
  data: AnalyticsResponse | null = null;
  loading = false;
  error = '';

  years: number[] = [new Date().getFullYear()];

  /** Hovered Chart-Bucket für Tooltip-Anzeige. null = nichts gehovert. */
  hoveredBucket: MonthBucket | null = null;
  hoveredIndex = -1;

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
        }
      }
    } catch { /* silent — Fallback auf aktuelles Jahr */ }
  }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      const params = new URLSearchParams({
        granularity: this.granularity,
        year: String(this.selectedYear),
      });
      if (this.granularity === 'month') {
        params.set('month', String(this.selectedMonth));
      }
      const resp = await fetch(`/api/analytics?${params}`, { credentials: 'include' });
      if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
      this.data = (await resp.json()) as AnalyticsResponse;
    } catch (e: any) {
      this.error = e?.message || 'Konnte Analyse nicht laden';
      this.data = null;
    } finally {
      this.loading = false;
    }
  }

  // ── Chart-Helpers ────────────────────────────────────────────────────
  get monthlyMax(): number {
    if (!this.data) return 1;
    return Math.max(
      ...this.data.current.monthly.map((m) => Math.max(m.invoiced, m.expense)),
      1,
    );
  }

  barHeight(value: number, maxPx: number): number {
    if (!this.monthlyMax) return 0;
    return (value / this.monthlyMax) * maxPx;
  }

  topCustomerMax(): number {
    if (!this.data || !this.data.current.topCustomers.length) return 1;
    return this.data.current.topCustomers[0]!.gross || 1;
  }

  categoryMax(): number {
    if (!this.data || !this.data.current.categories.length) return 1;
    return this.data.current.categories[0]!.gross || 1;
  }

  onHoverBucket(bucket: MonthBucket, i: number) {
    this.hoveredBucket = bucket;
    this.hoveredIndex = i;
  }
  onLeaveBucket() {
    this.hoveredBucket = null;
    this.hoveredIndex = -1;
  }

  // ── Labels ───────────────────────────────────────────────────────────
  get trendHeading(): string {
    return this.granularity === 'year' ? 'Monatlicher Verlauf' : 'Verlauf (letzte 12 Monate)';
  }
  get rankingScope(): string {
    return this.granularity === 'year' ? '' : ' (letzte 12 Monate)';
  }

  // ── Format ───────────────────────────────────────────────────────────
  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  fmtCompact(n: number | undefined): string {
    if (n === undefined || n === null) return '0';
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toFixed(0);
  }

  fmtDelta(n: number | undefined): string {
    if (n === undefined || n === null) return '±0';
    if (n > 0) return '+' + this.fmt(n);
    return this.fmt(n);
  }

  deltaClass(n: number | undefined): string {
    if (!n || Math.abs(n) < 0.01) return 'delta-zero';
    return n > 0 ? 'delta-up' : 'delta-down';
  }

  deltaDir(n: number | undefined): KpiDeltaDirection {
    if (!n || Math.abs(n) < 0.01) return 'zero';
    return n > 0 ? 'up' : 'down';
  }
}
