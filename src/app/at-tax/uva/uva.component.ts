import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';

type PeriodMode = 'month' | 'quarter' | 'year';

interface RateBucket {
  netto: number;
  ust: number;
}

interface UvaResult {
  period: { mode: PeriodMode; label: string; from: string; to: string };
  isKleinunternehmer: boolean;
  ausgaenge: {
    rate20: RateBucket;
    rate13: RateBucket;
    rate10: RateBucket;
    rate0: RateBucket;
    reverseChargeEU: { netto: number; count: number };
    reverseChargeDrittland: { netto: number; count: number };
    kleinunternehmerBefreit: { netto: number; count: number };
    invoiceCount: number;
  };
  eingaenge: {
    rate20: RateBucket;
    rate13: RateBucket;
    rate10: RateBucket;
    rate0: RateBucket;
    expenseCount: number;
  };
  kzFelder: {
    kz000: number;
    kz022: number;
    kz029: number;
    kz006: number;
    kz020: number;
    kz011: number;
    kz017: number;
    kz016: number;
    kz060: number;
  };
  ustSumme: number;
  zahllast: number;
}

@Component({
  selector: 'app-uva',
  imports: [CommonModule, FormsModule, ClarityModule],
  templateUrl: './uva.component.html',
  styleUrl: './uva.component.scss',
})
export class UvaComponent implements OnInit {
  mode: PeriodMode = 'month';
  year = new Date().getFullYear();
  month = new Date().getMonth() + 1;
  quarter = Math.floor(new Date().getMonth() / 3) + 1;

  result: UvaResult | null = null;
  loading = false;
  error = '';

  readonly months = [
    { v: 1, l: 'Jänner' }, { v: 2, l: 'Februar' }, { v: 3, l: 'März' },
    { v: 4, l: 'April' }, { v: 5, l: 'Mai' }, { v: 6, l: 'Juni' },
    { v: 7, l: 'Juli' }, { v: 8, l: 'August' }, { v: 9, l: 'September' },
    { v: 10, l: 'Oktober' }, { v: 11, l: 'November' }, { v: 12, l: 'Dezember' },
  ];
  readonly quarters = [1, 2, 3, 4];
  readonly years: number[] = (() => {
    const current = new Date().getFullYear();
    return [current, current - 1, current - 2, current - 3];
  })();

  constructor(private toastr: ToastrService) {}

  async ngOnInit() {
    await this.load();
  }

  periodParam(): string {
    if (this.mode === 'year') return String(this.year);
    if (this.mode === 'quarter') return `${this.year}-Q${this.quarter}`;
    return `${this.year}-${String(this.month).padStart(2, '0')}`;
  }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      const resp = await fetch(`/api/uva?period=${this.periodParam()}`, {
        credentials: 'include',
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || `HTTP ${resp.status}`);
      }
      this.result = (await resp.json()) as UvaResult;
    } catch (e: any) {
      this.error = e?.message || 'Konnte UVA nicht laden';
      this.result = null;
    } finally {
      this.loading = false;
    }
  }

  downloadCsv() {
    window.location.href = `/api/uva/csv?period=${this.periodParam()}`;
    this.toastr.info(`CSV für ${this.periodLabel()} wird heruntergeladen…`);
  }

  print() {
    window.print();
  }

  periodLabel(): string {
    return this.result?.period.label ?? this.periodParam();
  }

  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  zahllastClass(): string {
    if (!this.result) return '';
    if (this.result.zahllast > 0.005) return 'is-zahllast';
    if (this.result.zahllast < -0.005) return 'is-gutschrift';
    return 'is-null';
  }

  zahllastLabel(): string {
    if (!this.result) return '';
    if (this.result.zahllast > 0.005) return 'Zahllast an Finanzamt';
    if (this.result.zahllast < -0.005) return 'Gutschrift vom Finanzamt';
    return 'Ausgeglichen';
  }
}
