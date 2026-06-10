import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { KpiCardComponent } from '../core/kpi-card/kpi-card.component';

interface SvsResponse {
  year: number;
  svsStartYear: number;
  yearsAsSelfEmployed: number;
  annualRevenueNet: number;
  annualExpenseNet: number;
  annualProfit: number;
  invoiceCount: number;
  expenseCount: number;
  svs: {
    kv: number; pv: number; uv: number; sv: number;
    total: number;
    bgMonthly: number;
    capped: 'min' | 'max' | 'none';
    isVorlaeufig: boolean;
  };
  quarters: { dueDate: string; amount: number; label: string }[];
  rueckstellung?: { expectedNachzahlung: number; explanation: string };
  versicherungsgrenze?: { eligible: boolean; explanation: string };
}

@Component({
  selector: 'app-svs',
  imports: [CommonModule, FormsModule, ClarityModule, KpiCardComponent],
  templateUrl: './svs.component.html',
  styleUrl: './svs.component.scss',
})
export class SvsComponent implements OnInit {
  selectedYear = new Date().getFullYear();
  years: number[] = [];
  data: SvsResponse | null = null;
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
      const resp = await fetch(`/api/svs?year=${this.selectedYear}`, { credentials: 'include' });
      if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
      this.data = (await resp.json()) as SvsResponse;
    } catch (e: any) {
      this.error = e?.message || 'Konnte SVS-Vorschau nicht laden';
      this.data = null;
    } finally {
      this.loading = false;
    }
  }

  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  fmtDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }

  bgCappedLabel(capped: 'min' | 'max' | 'none'): string {
    if (capped === 'min') return 'Mindest-BGL greift';
    if (capped === 'max') return 'Höchst-BGL gedeckelt';
    return 'auf Gewinn-Basis';
  }

  cappedVariant(): 'default' | 'warning' | 'danger' {
    if (!this.data) return 'default';
    if (this.data.svs.capped === 'max') return 'warning';
    if (this.data.rueckstellung && this.data.rueckstellung.expectedNachzahlung > 5000) return 'warning';
    return 'default';
  }
}
