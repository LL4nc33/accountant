import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

type PeriodMode = 'month' | 'quarter' | 'year';

interface UvaResult {
  period: { mode: PeriodMode; label: string; from: string; to: string };
  isKleinunternehmer: boolean;
  ausgaenge: {
    rate20: { netto: number; ust: number };
    rate13: { netto: number; ust: number };
    rate10: { netto: number; ust: number };
    rate0: { netto: number; ust: number };
    reverseChargeEU: { netto: number; count: number };
    reverseChargeDrittland: { netto: number; count: number };
    kleinunternehmerBefreit: { netto: number; count: number };
    invoiceCount: number;
  };
  eingaenge: {
    rate20: { netto: number; ust: number };
    rate13: { netto: number; ust: number };
    rate10: { netto: number; ust: number };
    rate0: { netto: number; ust: number };
    expenseCount: number;
  };
  kzFelder: {
    kz000: number; kz022: number; kz029: number; kz006: number; kz020: number;
    kz011: number; kz017: number; kz016: number; kz060: number;
  };
  ustSumme: number;
  zahllast: number;
}

@Component({
  selector: 'm-uva',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, MFormSectionComponent],
  template: `
    <p class="m-muted-small">
      USt-Voranmeldung — Bemessungsgrundlagen und Vorsteuer pro Zeitraum
      gemäß UVA-Kennzahlen (FinanzOnline U30).
    </p>

    <m-form-section title="Zeitraum">
      <div class="m-mode-toggle">
        <button [class.active]="mode === 'month'" (click)="setMode('month')">Monat</button>
        <button [class.active]="mode === 'quarter'" (click)="setMode('quarter')">Quartal</button>
        <button [class.active]="mode === 'year'" (click)="setMode('year')">Jahr</button>
      </div>

      <label *ngIf="mode === 'month'" class="m-field">
        <span>Monat</span>
        <select [(ngModel)]="month" (ngModelChange)="load()">
          <option *ngFor="let m of months" [ngValue]="m.v">{{ m.l }}</option>
        </select>
      </label>
      <label *ngIf="mode === 'quarter'" class="m-field">
        <span>Quartal</span>
        <select [(ngModel)]="quarter" (ngModelChange)="load()">
          <option *ngFor="let q of quarters" [ngValue]="q">{{ q }}. Quartal</option>
        </select>
      </label>
      <label class="m-field">
        <span>Jahr</span>
        <select [(ngModel)]="year" (ngModelChange)="load()">
          <option *ngFor="let y of years" [ngValue]="y">{{ y }}</option>
        </select>
      </label>
    </m-form-section>

    <div *ngIf="loading" class="m-muted-small">Lade…</div>
    <div *ngIf="error" class="m-error">{{ error }}</div>

    <ng-container *ngIf="result && !loading">
      <m-form-section [title]="result.period.label">
        <div *ngIf="result.isKleinunternehmer" class="m-ku-hint">
          Kleinunternehmer-Modus — keine USt, kein Vorsteuerabzug.
        </div>

        <div class="m-zahllast" [class.is-zahllast]="result.zahllast > 0.005" [class.is-gutschrift]="result.zahllast < -0.005">
          <div class="zahllast-label">{{ zahllastLabel() }}</div>
          <div class="zahllast-value">{{ fmtAbs(result.zahllast) }} €</div>
        </div>

        <div class="m-stat-row">
          <div><span>USt-Summe</span><strong>{{ fmt(result.ustSumme) }} €</strong></div>
          <div><span>Vorsteuer</span><strong>{{ fmt(result.kzFelder.kz060) }} €</strong></div>
        </div>
      </m-form-section>

      <m-form-section title="UVA-Kennzahlen U30">
        <div class="m-kz">
          <div class="kz-row kz-row-strong">
            <div class="kz-code">000</div>
            <div class="kz-label">Bemessungsgrundlagen</div>
            <div class="kz-value">{{ fmt(result.kzFelder.kz000) }} €</div>
          </div>
          <div class="kz-row">
            <div class="kz-code">022</div>
            <div class="kz-label">Bemessung 20%</div>
            <div class="kz-value">{{ fmt(result.kzFelder.kz022) }} €</div>
          </div>
          <div class="kz-row">
            <div class="kz-code">029</div>
            <div class="kz-label">Bemessung 10%</div>
            <div class="kz-value">{{ fmt(result.kzFelder.kz029) }} €</div>
          </div>
          <div class="kz-row">
            <div class="kz-code">006</div>
            <div class="kz-label">Bemessung 13%</div>
            <div class="kz-value">{{ fmt(result.kzFelder.kz006) }} €</div>
          </div>
          <div class="kz-row">
            <div class="kz-code">020</div>
            <div class="kz-label">Bemessung 0% / steuerfrei</div>
            <div class="kz-value">{{ fmt(result.kzFelder.kz020) }} €</div>
          </div>
          <div class="kz-row">
            <div class="kz-code">011</div>
            <div class="kz-label">Ig. Lieferungen (EU)</div>
            <div class="kz-value">{{ fmt(result.kzFelder.kz011) }} €</div>
          </div>
          <div class="kz-row">
            <div class="kz-code">017</div>
            <div class="kz-label">Drittland</div>
            <div class="kz-value">{{ fmt(result.kzFelder.kz017) }} €</div>
          </div>
          <div class="kz-row" *ngIf="result.isKleinunternehmer">
            <div class="kz-code">016</div>
            <div class="kz-label">KU-Befreiung</div>
            <div class="kz-value">{{ fmt(result.kzFelder.kz016) }} €</div>
          </div>
          <div class="kz-row kz-row-strong">
            <div class="kz-code">060</div>
            <div class="kz-label">Vorsteuer</div>
            <div class="kz-value">{{ fmt(result.kzFelder.kz060) }} €</div>
          </div>
        </div>
      </m-form-section>

      <m-form-section title="Export">
        <a class="m-pill m-pill-primary" [href]="csvUrl()" download>
          <cds-icon shape="download" size="16"></cds-icon>
          CSV herunterladen
        </a>
        <p class="m-muted-small" style="margin-top: 0.75rem;">
          Werte 1:1 in FinanzOnline U30 übertragen. §132 BAO: 7 Jahre aufbewahren.
        </p>
      </m-form-section>
    </ng-container>
  `,
  styles: [`
    .m-muted-small { color: #666; font-size: 0.85rem; margin-bottom: 1rem; }
    .m-error { padding: 0.75rem; background: #fbeaea; border-left: 3px solid #c92100; color: #8b0000; font-size: 0.9rem; margin: 1rem 0; }
    .m-field { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 1rem;
      span { font-size: 0.85rem; font-weight: 600; }
      select { padding: 0.6rem 0.85rem; font-size: 1rem; border: 1px solid #DCDCDC; border-radius: 6px; min-height: 44px; }
    }
    .m-mode-toggle { display: flex; border: 1px solid #DCDCDC; border-radius: 6px; overflow: hidden; margin-bottom: 1rem;
      button { flex: 1; background: white; border: none; padding: 0.6rem 0.4rem; font-size: 0.92rem; cursor: pointer; color: #4a4a4a; min-height: 44px;
        &.active { background: #1A1A1A; color: white; }
      }
      button + button { border-left: 1px solid #DCDCDC; }
    }
    .m-ku-hint { padding: 0.5rem 0.75rem; background: #fdf6e3; border-left: 3px solid #b97500; color: #7d5100; font-size: 0.85rem; margin-bottom: 0.75rem; }
    .m-zahllast { padding: 1rem; border-radius: 6px; background: #FAFAFA; border-left: 4px solid #ccc; margin-bottom: 0.75rem;
      .zahllast-label { font-size: 0.85rem; color: #4a4a4a; text-transform: uppercase; letter-spacing: 0.05em; }
      .zahllast-value { font-size: 1.6rem; font-weight: 600; font-family: Georgia, serif; }
      &.is-zahllast { border-left-color: #c92100; .zahllast-value { color: #8b0000; } }
      &.is-gutschrift { border-left-color: #318700; .zahllast-value { color: #266100; } }
    }
    .m-stat-row { display: flex; gap: 1rem; font-size: 0.9rem;
      > div { flex: 1; display: flex; flex-direction: column; gap: 0.2rem; }
      span { color: #666; }
      strong { font-size: 1.1rem; font-family: Georgia, serif; }
    }
    .m-kz { display: flex; flex-direction: column; }
    .kz-row { display: grid; grid-template-columns: 50px 1fr auto; gap: 0.5rem; padding: 0.5rem 0; border-bottom: 1px solid #eee; align-items: center;
      .kz-code { font-family: 'Source Code Pro', ui-monospace, monospace; font-weight: 600; color: #2f2f2f; font-size: 0.92rem; }
      .kz-label { font-size: 0.9rem; }
      .kz-value { font-size: 0.95rem; font-variant-numeric: tabular-nums; }
    }
    .kz-row-strong { background: #fafafa;
      .kz-label, .kz-value { font-weight: 700; }
    }
    .m-pill { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1rem; background: white; border: 1px solid #DCDCDC; border-radius: 999px; font-size: 0.95rem; color: #1A1A1A; text-decoration: none; min-height: 48px;
      &.m-pill-primary { background: #1A1A1A; color: white; border-color: #1A1A1A; }
    }
  `],
})
export class MUvaComponent implements OnInit {
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
    const c = new Date().getFullYear();
    return [c, c - 1, c - 2, c - 3];
  })();

  async ngOnInit() {
    await this.load();
  }

  setMode(m: PeriodMode) {
    this.mode = m;
    this.load();
  }

  periodParam(): string {
    if (this.mode === 'year') return String(this.year);
    if (this.mode === 'quarter') return `${this.year}-Q${this.quarter}`;
    return `${this.year}-${String(this.month).padStart(2, '0')}`;
  }

  csvUrl(): string {
    return `/api/uva/csv?period=${this.periodParam()}`;
  }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      const resp = await fetch(`/api/uva?period=${this.periodParam()}`, {
        credentials: 'include',
      });
      if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
      this.result = (await resp.json()) as UvaResult;
    } catch (e: any) {
      this.error = e?.message || 'Konnte UVA nicht laden';
      this.result = null;
    } finally {
      this.loading = false;
    }
  }

  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  fmtAbs(n: number): string {
    return this.fmt(Math.abs(n));
  }

  zahllastLabel(): string {
    if (!this.result) return '';
    if (this.result.zahllast > 0.005) return 'Zahllast ans Finanzamt';
    if (this.result.zahllast < -0.005) return 'Gutschrift vom Finanzamt';
    return 'Ausgeglichen';
  }
}
