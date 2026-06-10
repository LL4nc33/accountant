import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';

type PeriodMode = 'month' | 'quarter' | 'year';

interface ZmEntry {
  recipientVatId: string;
  country: string;
  sumNet: number;
  invoiceNumbers: string[];
  invoiceCount: number;
}

interface ZmResult {
  period: { mode: PeriodMode; label: string; from: string; to: string };
  entries: ZmEntry[];
  totalSum: number;
  invoiceCount: number;
  skippedMissingVatId: { invoiceNumber: string; reason: string }[];
  drittlandCount: number;
}

@Component({
  selector: 'app-zm',
  imports: [CommonModule, FormsModule, ClarityModule],
  templateUrl: './zm.component.html',
  styleUrl: './zm.component.scss',
})
export class ZmComponent implements OnInit {
  mode: PeriodMode = 'month';
  year = new Date().getFullYear();
  month = new Date().getMonth() + 1;
  quarter = Math.floor(new Date().getMonth() / 3) + 1;
  result: ZmResult | null = null;
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
    const c = new Date().getFullYear();
    return [c, c - 1, c - 2, c - 3];
  })();

  constructor(private toastr: ToastrService) {}

  async ngOnInit() { await this.load(); }

  periodParam(): string {
    if (this.mode === 'year') return String(this.year);
    if (this.mode === 'quarter') return `${this.year}-Q${this.quarter}`;
    return `${this.year}-${String(this.month).padStart(2, '0')}`;
  }

  private loadGen = 0;
  async load() {
    const gen = ++this.loadGen;
    this.loading = true;
    this.error = '';
    try {
      const r = await fetch(`/api/zm?period=${this.periodParam()}`, { credentials: 'include' });
      if (gen !== this.loadGen) return; // stale Response verwerfen
      if (!r.ok) throw new Error(await r.text() || `HTTP ${r.status}`);
      this.result = (await r.json()) as ZmResult;
    } catch (e: any) {
      if (gen !== this.loadGen) return;
      this.error = e?.message || 'Konnte ZM nicht laden';
      this.result = null;
    } finally {
      if (gen === this.loadGen) this.loading = false;
    }
  }

  downloadCsv() {
    // Über versteckten Anchor + .click() — verhindert dass die SPA unloaded
    // und macht den Toast in jedem Browser sichtbar.
    const a = document.createElement('a');
    a.href = `/api/zm/csv?period=${this.periodParam()}`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    this.toastr.info(`CSV für ${this.periodLabel()} wird heruntergeladen…`);
  }

  periodLabel(): string { return this.result?.period.label ?? this.periodParam(); }

  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
