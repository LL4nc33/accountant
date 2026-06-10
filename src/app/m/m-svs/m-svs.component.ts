import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

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
    total: number; bgMonthly: number;
    capped: 'min' | 'max' | 'none';
    isVorlaeufig: boolean;
  };
  quarters: { dueDate: string; amount: number; label: string }[];
  rueckstellung?: { expectedNachzahlung: number; explanation: string };
  versicherungsgrenze?: { eligible: boolean; explanation: string };
}

@Component({
  selector: 'm-svs',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, MFormSectionComponent],
  template: `
    <div class="head">
      <h2>SVS-Vorschau</h2>
      <select [(ngModel)]="year" (ngModelChange)="load()">
        <option *ngFor="let y of years" [ngValue]="y">{{ y }}</option>
      </select>
    </div>

    <div *ngIf="loading" class="m-muted">Lade SVS-Vorschau…</div>
    <div *ngIf="error" class="m-error">{{ error }}</div>

    <ng-container *ngIf="data && !loading">
      <p class="period-meta">
        {{ data.yearsAsSelfEmployed }}. Jahr selbständig<ng-container *ngIf="data.svs.isVorlaeufig"> — vorläufig</ng-container>
      </p>

      <m-form-section title="Beitrag {{ data.year }}">
        <div class="kpi-stack">
          <div class="kpi"><span>Jahresbeitrag</span><strong>{{ fmt(data.svs.total) }} €</strong>
            <small>monatlich ~{{ fmt(data.svs.total / 12) }} €</small>
          </div>
          <div class="kpi"><span>Gewinn-Basis</span><strong>{{ fmt(data.annualProfit) }} €</strong>
            <small>{{ data.invoiceCount }} Rg · {{ data.expenseCount }} Belege</small>
          </div>
          <div class="kpi"><span>Beitragsgrundlage</span><strong>{{ fmt(data.svs.bgMonthly) }} €/Mo</strong>
            <small>{{ bgCappedLabel(data.svs.capped) }}</small>
          </div>
        </div>
      </m-form-section>

      <clr-alert clrAlertType="info" [clrAlertClosable]="false" *ngIf="data.svs.isVorlaeufig">
        <clr-alert-item>
          <span class="alert-text">
            Jahr 1+2: vorläufige Vorschreibung auf Mindest-BGL. Empfehlung: monatlich rückstellen für die Nachbemessung in Jahr 3.
          </span>
        </clr-alert-item>
      </clr-alert>

      <clr-alert clrAlertType="warning" [clrAlertClosable]="false" *ngIf="data.rueckstellung">
        <clr-alert-item>
          <span class="alert-text">
            <strong>Rückstellung: ~{{ fmt(data.rueckstellung.expectedNachzahlung) }} €</strong> — {{ data.rueckstellung.explanation }}
          </span>
        </clr-alert-item>
      </clr-alert>

      <clr-alert clrAlertType="warning" [clrAlertClosable]="false" *ngIf="data.svs.capped === 'max'">
        <clr-alert-item>
          <span class="alert-text">Höchst-BGL erreicht — Beiträge gedeckelt.</span>
        </clr-alert-item>
      </clr-alert>

      <m-form-section title="Aufschlüsselung">
        <table class="breakdown">
          <tr><td>Krankenversicherung 6,80 %</td><td class="num">{{ fmt(data.svs.kv) }} €</td></tr>
          <tr><td>Pensionsversicherung 18,50 %</td><td class="num">{{ fmt(data.svs.pv) }} €</td></tr>
          <tr><td>Unfallversicherung fix</td><td class="num">{{ fmt(data.svs.uv) }} €</td></tr>
          <tr><td>Selbständigenvorsorge 1,53 %</td><td class="num">{{ fmt(data.svs.sv) }} €</td></tr>
          <tr class="total"><td>Summe</td><td class="num">{{ fmt(data.svs.total) }} €</td></tr>
        </table>
      </m-form-section>

      <m-form-section title="Quartalsraten">
        <div class="quarters">
          <div class="q" *ngFor="let q of data.quarters">
            <div class="q-label">{{ q.label }} · {{ fmtDate(q.dueDate) }}</div>
            <div class="q-amount">{{ fmt(q.amount) }} €</div>
          </div>
        </div>
      </m-form-section>

      <p class="muted footer-hint">
        Schätzung. Verbindlich ist die SVS-Vorschreibung. Sätze nach Stand 2026-06 (Quelle: WKO/SVS).
      </p>
    </ng-container>
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;
      h2 { margin: 0; font-size: 1.1rem; }
      select { padding: 4px 8px; border: 1px solid #ccc; border-radius: 3px; }
    }
    .period-meta { font-size: 0.85rem; color: #666; margin: 0 0 1rem; }
    .m-error { padding: 0.75rem; background: #fbeaea; border-left: 3px solid #c92100; color: #8b0000; margin: 1rem 0; }
    .alert-text { font-size: 0.85rem; line-height: 1.4; }
    .kpi-stack { display: flex; flex-direction: column; gap: 0.5rem;
      .kpi { display: flex; flex-direction: column; padding: 0.5rem 0.75rem; background: #FAFAFA; border-left: 4px solid #2f2f2f; border-radius: 2px;
        span { font-size: 0.78rem; color: #4a4a4a; text-transform: uppercase; }
        strong { font-size: 1.4rem; font-family: Georgia, serif; font-variant-numeric: tabular-nums; color: #1A1A1A; }
        small { font-size: 0.78rem; color: #666; margin-top: 0.2rem; }
      }
    }
    .breakdown { width: 100%; border-collapse: collapse; font-size: 0.88rem;
      td { padding: 0.45rem 0.6rem; border-bottom: 1px solid #f0f0f0; }
      .num { text-align: right; font-variant-numeric: tabular-nums; }
      tr.total td { font-weight: 600; border-top: 2px solid #ccc; padding-top: 0.6rem; }
    }
    .quarters { display: flex; flex-direction: column; gap: 0.4rem;
      .q { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; background: #fafafa; border-left: 3px solid #2f2f2f; border-radius: 2px;
        .q-label { font-size: 0.78rem; color: #4a4a4a; }
        .q-amount { font-size: 1.0rem; font-weight: 600; font-variant-numeric: tabular-nums; }
      }
    }
    .footer-hint { font-size: 0.78rem; color: #666; margin-top: 1.5rem; line-height: 1.45; }
    .muted { color: #666; }
  `],
})
export class MSvsComponent implements OnInit {
  year = new Date().getFullYear();
  data: SvsResponse | null = null;
  loading = false;
  error = '';

  readonly years: number[] = (() => {
    const c = new Date().getFullYear();
    return [c, c - 1, c - 2, c - 3];
  })();

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      const resp = await fetch(`/api/svs?year=${this.year}`, { credentials: 'include' });
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
    if (capped === 'min') return 'Mindest-BGL';
    if (capped === 'max') return 'Höchst-BGL gedeckelt';
    return 'auf Gewinn-Basis';
  }
}
