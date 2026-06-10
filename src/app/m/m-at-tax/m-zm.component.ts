import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

type PeriodMode = 'month' | 'quarter' | 'year';

interface ZmEntry { recipientVatId: string; country: string; sumNet: number; invoiceNumbers: string[]; invoiceCount: number; }
interface ZmResult {
  period: { label: string; from: string; to: string };
  entries: ZmEntry[];
  totalSum: number;
  invoiceCount: number;
  skippedMissingVatId: { invoiceNumber: string; reason: string }[];
  drittlandCount: number;
}

@Component({
  selector: 'm-zm',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, MFormSectionComponent],
  template: `
    <div class="head">
      <h2>ZM</h2>
      <select [(ngModel)]="mode" (ngModelChange)="load()">
        <option value="month">Monat</option><option value="quarter">Quartal</option><option value="year">Jahr</option>
      </select>
    </div>
    <div class="period-row">
      <select [(ngModel)]="year" (ngModelChange)="load()">
        <option *ngFor="let y of years" [ngValue]="y">{{ y }}</option>
      </select>
      <select *ngIf="mode === 'month'" [(ngModel)]="month" (ngModelChange)="load()">
        <option *ngFor="let m of months" [ngValue]="m.v">{{ m.l }}</option>
      </select>
      <select *ngIf="mode === 'quarter'" [(ngModel)]="quarter" (ngModelChange)="load()">
        <option *ngFor="let q of [1,2,3,4]" [ngValue]="q">Q{{ q }}</option>
      </select>
    </div>

    <div *ngIf="error" class="m-error">{{ error }}</div>

    <ng-container *ngIf="result && !loading">
      <p class="summary">
        <strong>{{ result.entries.length }}</strong> Empfänger · <strong>{{ result.invoiceCount }}</strong> Rg ·
        <strong>{{ fmt(result.totalSum) }} €</strong>
      </p>

      <clr-alert clrAlertType="warning" [clrAlertClosable]="false" *ngIf="result.skippedMissingVatId.length">
        <clr-alert-item>
          <span class="alert-text">{{ result.skippedMissingVatId.length }} RC-Rg ohne UID — vor Meldung nachtragen.</span>
        </clr-alert-item>
      </clr-alert>

      <m-form-section title="Empfänger" *ngIf="result.entries.length; else noEntries">
        <table class="zm-table">
          <tr *ngFor="let e of result.entries">
            <td>
              <div class="mono">{{ e.recipientVatId }}</div>
              <div class="small">{{ e.invoiceCount }} Rg</div>
            </td>
            <td class="right">{{ fmt(e.sumNet) }} €</td>
          </tr>
          <tr class="total"><td>Gesamt</td><td class="right">{{ fmt(result.totalSum) }} €</td></tr>
        </table>
      </m-form-section>
      <ng-template #noEntries>
        <p class="muted">Keine ZM-pflichtigen Rechnungen.</p>
      </ng-template>

      <button class="m-pill m-pill-primary" (click)="downloadCsv()" [disabled]="!result.entries.length">CSV herunterladen</button>

      <p class="muted footer-hint">Meldung in FinanzOnline. Frist: Letzter des Folgemonats.</p>
    </ng-container>
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;
      h2 { margin: 0; font-size: 1.1rem; } select { padding: 4px 8px; border: 1px solid #ccc; border-radius: 3px; }
    }
    .period-row { display: flex; gap: 0.5rem; margin-bottom: 1rem;
      select { flex: 1; padding: 6px 8px; border: 1px solid #ccc; border-radius: 3px; }
    }
    .summary { font-size: 0.95rem; margin: 0.5rem 0 1rem;
      strong { font-variant-numeric: tabular-nums; }
    }
    .m-error { padding: 0.75rem; background: #fbeaea; border-left: 3px solid #c92100; color: #8b0000; margin: 1rem 0; }
    .alert-text { font-size: 0.85rem; line-height: 1.4; }
    .zm-table { width: 100%; border-collapse: collapse; font-size: 0.85rem;
      td { padding: 0.4rem 0.5rem; border-bottom: 1px solid #f0f0f0; }
      .right { text-align: right; font-variant-numeric: tabular-nums; }
      .mono { font-family: monospace; }
      .small { font-size: 0.78rem; color: #666; }
      tr.total td { font-weight: 700; border-top: 2px solid #888; padding-top: 0.55rem; background: #fafafa; }
    }
    .m-pill { display: block; width: 100%; padding: 0.8rem 1rem; background: white; border: 1px solid #DCDCDC;
      border-radius: 999px; font-size: 0.95rem; color: #1A1A1A; cursor: pointer; min-height: 48px;
      margin-top: 1rem;
      &.m-pill-primary { background: #1A1A1A; color: white; border-color: #1A1A1A; }
      &:disabled { opacity: 0.5; }
    }
    .footer-hint { font-size: 0.78rem; color: #666; margin-top: 1.5rem; line-height: 1.4; }
    .muted { color: #666; }
  `],
})
export class MZmComponent implements OnInit {
  mode: PeriodMode = 'month';
  year = new Date().getFullYear();
  month = new Date().getMonth() + 1;
  quarter = Math.floor(new Date().getMonth() / 3) + 1;
  result: ZmResult | null = null;
  loading = false;
  error = '';

  readonly months = [
    { v: 1, l: 'Jänner' }, { v: 2, l: 'Februar' }, { v: 3, l: 'März' }, { v: 4, l: 'April' },
    { v: 5, l: 'Mai' }, { v: 6, l: 'Juni' }, { v: 7, l: 'Juli' }, { v: 8, l: 'August' },
    { v: 9, l: 'September' }, { v: 10, l: 'Oktober' }, { v: 11, l: 'November' }, { v: 12, l: 'Dezember' },
  ];
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

  async load() {
    this.loading = true;
    this.error = '';
    try {
      const r = await fetch(`/api/zm?period=${this.periodParam()}`, { credentials: 'include' });
      if (!r.ok) throw new Error(await r.text() || `HTTP ${r.status}`);
      this.result = (await r.json()) as ZmResult;
    } catch (e: any) {
      this.error = e?.message || 'Konnte ZM nicht laden';
      this.result = null;
    } finally { this.loading = false; }
  }

  downloadCsv() {
    const a = document.createElement('a');
    a.href = `/api/zm/csv?period=${this.periodParam()}`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    this.toastr.info('CSV wird heruntergeladen…');
  }

  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
