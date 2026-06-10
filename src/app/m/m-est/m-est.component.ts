import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

interface EstResponse {
  year: number;
  annualProfit: number;
  invoiceCount: number;
  expenseCount: number;
  svsCoupled: boolean;
  applyInvestitionsbedingtGfb: boolean;
  est: {
    profit: number; svsAnnual: number;
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
  selector: 'm-est',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, MFormSectionComponent],
  template: `
    <div class="head">
      <h2>ESt-Vorschau</h2>
      <select [(ngModel)]="year" (ngModelChange)="load()">
        <option *ngFor="let y of years" [ngValue]="y">{{ y }}</option>
      </select>
    </div>

    <label class="invest-toggle">
      <input type="checkbox" [(ngModel)]="applyInvestGfb" (ngModelChange)="load()" />
      investitionsbedingten GFB ansetzen
    </label>

    <div *ngIf="error" class="m-error">{{ error }}</div>

    <ng-container *ngIf="data && !loading">
      <m-form-section title="Einkommensteuer {{ data.year }}">
        <div class="kpi-stack">
          <div class="kpi"><span>ESt-Jahresbetrag</span><strong>{{ fmt(data.est.est) }} €</strong>
            <small>Grenzsatz {{ fmtPct(data.est.marginalRate) }} · Durchschnitt {{ fmtPct(data.est.effectiveRate) }}</small>
          </div>
          <div class="kpi"><span>Gewinn</span><strong>{{ fmt(data.annualProfit) }} €</strong>
            <small>{{ data.invoiceCount }} Rg · {{ data.expenseCount }} Belege</small>
          </div>
          <div class="kpi"><span>zu versteuerndes Einkommen</span><strong>{{ fmt(data.est.taxableIncome) }} €</strong></div>
        </div>
      </m-form-section>

      <clr-alert clrAlertType="info" [clrAlertClosable]="false" *ngIf="data.svsCoupled">
        <clr-alert-item>
          <span class="alert-text">SVS ({{ fmt(data.est.svsAnnual) }} €) als Betriebsausgabe abgezogen.</span>
        </clr-alert-item>
      </clr-alert>

      <clr-alert clrAlertType="warning" [clrAlertClosable]="false" *ngIf="!data.svsCoupled">
        <clr-alert-item>
          <span class="alert-text">Modul „SVS-Vorschau" nicht aktiv — ESt ist ohne SVS-Abzug, daher überzeichnet.</span>
        </clr-alert-item>
      </clr-alert>

      <m-form-section title="Berechnung">
        <table class="cascade">
          <tr><td>Gewinn</td><td class="num">{{ fmt(data.est.profit) }} €</td></tr>
          <tr *ngIf="data.svsCoupled"><td class="indent">− SVS</td><td class="num">−{{ fmt(data.est.svsAnnual) }} €</td></tr>
          <tr class="subtotal"><td>Bemessungsgrundlage</td><td class="num">{{ fmt(data.est.bemessungsgrundlage) }} €</td></tr>
          <tr><td class="indent">− GFB Grund</td><td class="num">−{{ fmt(data.est.gewinnfreibetrag.grund) }} €</td></tr>
          <tr *ngIf="data.applyInvestitionsbedingtGfb"><td class="indent">− GFB invest.</td><td class="num">−{{ fmt(data.est.gewinnfreibetrag.investitionsbedingt) }} €</td></tr>
          <tr class="total"><td>zu versteuern</td><td class="num">{{ fmt(data.est.taxableIncome) }} €</td></tr>
        </table>
      </m-form-section>

      <m-form-section title="Tarifstufen" *ngIf="data.est.bracketBreakdown.length">
        <table class="brackets">
          <tr *ngFor="let b of data.est.bracketBreakdown">
            <td>{{ fmtPct(b.rate) }}</td>
            <td class="num">{{ fmt(b.amountInBracket) }} €</td>
            <td class="num">→ {{ fmt(b.taxOnBracket) }} €</td>
          </tr>
        </table>
      </m-form-section>

      <p class="muted footer-hint">
        Tarif 2026 (BGBl. II 191/2025). Pauschalierungen + Verlustvortrag nicht einbezogen.
      </p>
    </ng-container>
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;
      h2 { margin: 0; font-size: 1.1rem; }
      select { padding: 4px 8px; border: 1px solid #ccc; border-radius: 3px; }
    }
    .invest-toggle { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: #4a4a4a; margin-bottom: 1rem; }
    .m-error { padding: 0.75rem; background: #fbeaea; border-left: 3px solid #c92100; color: #8b0000; margin: 1rem 0; }
    .alert-text { font-size: 0.85rem; line-height: 1.4; }
    .kpi-stack { display: flex; flex-direction: column; gap: 0.5rem;
      .kpi { display: flex; flex-direction: column; padding: 0.5rem 0.75rem; background: #FAFAFA; border-left: 4px solid #2f2f2f; border-radius: 2px;
        span { font-size: 0.78rem; color: #4a4a4a; text-transform: uppercase; }
        strong { font-size: 1.4rem; font-family: Georgia, serif; font-variant-numeric: tabular-nums; color: #1A1A1A; }
        small { font-size: 0.78rem; color: #666; margin-top: 0.2rem; }
      }
    }
    .cascade, .brackets { width: 100%; border-collapse: collapse; font-size: 0.85rem;
      td { padding: 0.4rem 0.5rem; border-bottom: 1px solid #f0f0f0; }
      .num { text-align: right; font-variant-numeric: tabular-nums; }
      .indent { padding-left: 1.2rem; color: #4a4a4a; }
      .subtotal td { font-weight: 500; border-top: 1px solid #ccc; background: #fafafa; }
      .total td { font-weight: 700; border-top: 2px solid #888; padding-top: 0.55rem; background: #fafafa; }
    }
    .footer-hint { font-size: 0.78rem; color: #666; margin-top: 1.5rem; line-height: 1.45; }
    .muted { color: #666; }
  `],
})
export class MEstComponent implements OnInit {
  year = new Date().getFullYear();
  applyInvestGfb = false;
  data: EstResponse | null = null;
  loading = false;
  error = '';

  readonly years: number[] = (() => {
    const c = new Date().getFullYear();
    return [c, c - 1, c - 2, c - 3];
  })();

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      const r = await fetch(`/api/est?year=${this.year}&investGfb=${this.applyInvestGfb}`, { credentials: 'include' });
      if (!r.ok) throw new Error(await r.text() || `HTTP ${r.status}`);
      this.data = (await r.json()) as EstResponse;
    } catch (e: any) {
      this.error = e?.message || 'Konnte ESt nicht laden';
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
}
