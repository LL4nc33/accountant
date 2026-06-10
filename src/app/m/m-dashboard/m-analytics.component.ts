import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

interface AnalyticsResponse {
  current: {
    year: number;
    monthly: { month: number; label: string; invoiced: number; paid: number; expense: number }[];
    topCustomers: { id: string; name: string; gross: number; invoiceCount: number }[];
    categories: { category: string; gross: number; net: number; count: number }[];
    yearTotal: { invoicedGross: number; paidGross: number; expenseGross: number; saldo: number };
    counts: { drafts: number; finalOpen: number; paid: number; overdue: number; invoicesTotal: number; expensesTotal: number };
  };
  previous: { year: number; yearTotal: { invoicedGross: number; expenseGross: number; saldo: number } };
  deltas: { invoicedGross: number; expenseGross: number; saldo: number };
}

@Component({
  selector: 'm-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, MFormSectionComponent],
  template: `
    <div class="head">
      <h2>Analyse</h2>
      <select [(ngModel)]="year" (ngModelChange)="load()">
        <option *ngFor="let y of years" [ngValue]="y">{{ y }}</option>
      </select>
    </div>

    <div *ngIf="error" class="m-error">{{ error }}</div>

    <ng-container *ngIf="data && !loading">
      <m-form-section title="Jahresübersicht">
        <div class="kpi-stack">
          <div class="kpi"><span>Rechnungssumme</span><strong>{{ fmt(data.current.yearTotal.invoicedGross) }} €</strong>
            <small [class.up]="data.deltas.invoicedGross > 0" [class.down]="data.deltas.invoicedGross < 0">
              {{ fmtDelta(data.deltas.invoicedGross) }} € vs. {{ data.previous.year }}
            </small>
          </div>
          <div class="kpi"><span>Eingegangen</span><strong>{{ fmt(data.current.yearTotal.paidGross) }} €</strong></div>
          <div class="kpi"><span>Aufwand</span><strong>{{ fmt(data.current.yearTotal.expenseGross) }} €</strong></div>
          <div class="kpi kpi-saldo"><span>Saldo</span><strong [class.up]="data.current.yearTotal.saldo >= 0" [class.down]="data.current.yearTotal.saldo < 0">
            {{ fmt(data.current.yearTotal.saldo) }} €
          </strong></div>
        </div>
      </m-form-section>

      <m-form-section title="Status">
        <div class="status-row">
          <div class="sp draft"><span>{{ data.current.counts.drafts }}</span><label>Entwürfe</label></div>
          <div class="sp open"><span>{{ data.current.counts.finalOpen }}</span><label>offen</label></div>
          <div class="sp paid"><span>{{ data.current.counts.paid }}</span><label>bezahlt</label></div>
          <div class="sp over"><span>{{ data.current.counts.overdue }}</span><label>überfällig</label></div>
        </div>
      </m-form-section>

      <m-form-section title="Monatlicher Verlauf">
        <svg viewBox="0 0 360 140" preserveAspectRatio="none" class="chart">
          <g *ngFor="let m of data.current.monthly; let i = index">
            <rect [attr.x]="i * 30 + 4" [attr.y]="120 - barH(m.invoiced)" width="11" [attr.height]="barH(m.invoiced)" class="b1" />
            <rect [attr.x]="i * 30 + 16" [attr.y]="120 - barH(m.expense)" width="11" [attr.height]="barH(m.expense)" class="b2" />
            <text [attr.x]="i * 30 + 15" y="135" text-anchor="middle">{{ m.label }}</text>
          </g>
        </svg>
        <div class="legend">
          <span><i class="b1"></i> Umsatz</span>
          <span><i class="b2"></i> Aufwand</span>
        </div>
      </m-form-section>

      <m-form-section title="Top-Kunden">
        <p *ngIf="!data.current.topCustomers.length" class="muted">Noch keine.</p>
        <div *ngFor="let c of data.current.topCustomers.slice(0, 5)" class="row">
          <div class="head"><span>{{ c.name }}</span><strong>{{ fmt(c.gross) }} €</strong></div>
          <div class="track"><div class="bar" [style.width.%]="(c.gross / topMax()) * 100"></div></div>
        </div>
      </m-form-section>

      <m-form-section title="Aufwand pro Kategorie">
        <p *ngIf="!data.current.categories.length" class="muted">Noch keine.</p>
        <div *ngFor="let cat of data.current.categories.slice(0, 8)" class="row">
          <div class="head"><span>{{ cat.category }}</span><strong>{{ fmt(cat.gross) }} €</strong></div>
          <div class="track"><div class="bar bar-exp" [style.width.%]="(cat.gross / catMax()) * 100"></div></div>
        </div>
      </m-form-section>
    </ng-container>
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;
      h2 { margin: 0; font-size: 1.1rem; }
      select { padding: 4px 8px; border: 1px solid #ccc; border-radius: 3px; }
    }
    .m-error { padding: 0.75rem; background: #fbeaea; border-left: 3px solid #c92100; color: #8b0000; margin: 1rem 0; }
    .kpi-stack { display: flex; flex-direction: column; gap: 0.5rem;
      .kpi { display: flex; flex-direction: column; padding: 0.5rem 0.75rem; background: #FAFAFA; border-left: 4px solid #2f2f2f; border-radius: 2px;
        span { font-size: 0.78rem; color: #4a4a4a; text-transform: uppercase; }
        strong { font-size: 1.4rem; font-family: Georgia, serif; font-variant-numeric: tabular-nums;
          &.up { color: #266100; } &.down { color: #8b0000; }
        }
        small { font-size: 0.78rem; color: #666; margin-top: 0.2rem;
          &.up { color: #266100; } &.down { color: #8b0000; }
        }
      }
      .kpi-saldo { border-left-color: #1c4d7c; background: #f4f8fd; }
    }
    .status-row { display: flex; gap: 0.4rem; flex-wrap: wrap;
      .sp { display: flex; flex-direction: column; align-items: center; padding: 0.4rem 0.6rem; background: #fafafa; border-left: 3px solid #888; flex: 1; min-width: 70px;
        span { font-size: 1.1rem; font-weight: 700; font-family: Georgia, serif; }
        label { font-size: 0.7rem; color: #4a4a4a; }
        &.open { border-left-color: #b97500; span { color: #7d5100; } }
        &.paid { border-left-color: #318700; span { color: #266100; } }
        &.over { border-left-color: #c92100; span { color: #8b0000; } }
      }
    }
    .chart { width: 100%; height: 140px;
      rect.b1 { fill: #2f2f2f; }
      rect.b2 { fill: #b97500; }
      text { font-size: 9px; fill: #4a4a4a; }
    }
    .legend { display: flex; gap: 1rem; font-size: 0.78rem; color: #666; margin-top: 0.4rem;
      i { display: inline-block; width: 9px; height: 9px; margin-right: 4px; vertical-align: middle; }
      i.b1 { background: #2f2f2f; } i.b2 { background: #b97500; }
    }
    .row { margin-bottom: 0.5rem;
      .head { display: flex; justify-content: space-between; font-size: 0.85rem;
        strong { font-variant-numeric: tabular-nums; }
      }
      .track { height: 5px; background: #f0f0f0; border-radius: 3px; overflow: hidden; margin-top: 2px; }
      .bar { height: 100%; background: #2f2f2f; }
      .bar.bar-exp { background: #b97500; }
    }
    .muted { color: #666; font-size: 0.85rem; }
  `],
})
export class MAnalyticsComponent implements OnInit {
  year = new Date().getFullYear();
  data: AnalyticsResponse | null = null;
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
      const resp = await fetch(`/api/analytics?year=${this.year}`, { credentials: 'include' });
      if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
      this.data = (await resp.json()) as AnalyticsResponse;
    } catch (e: any) {
      this.error = e?.message || 'Konnte Analyse nicht laden';
      this.data = null;
    } finally {
      this.loading = false;
    }
  }

  monthlyMax(): number {
    if (!this.data) return 1;
    return Math.max(...this.data.current.monthly.map((m) => Math.max(m.invoiced, m.expense)), 1);
  }
  barH(v: number): number {
    return (v / this.monthlyMax()) * 110;
  }
  topMax(): number {
    return this.data?.current.topCustomers[0]?.gross ?? 1;
  }
  catMax(): number {
    return this.data?.current.categories[0]?.gross ?? 1;
  }
  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  fmtDelta(n: number): string {
    if (n > 0) return '+' + this.fmt(n);
    return this.fmt(n);
  }
}
