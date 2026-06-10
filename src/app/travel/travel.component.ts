import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { RouterLink } from '@angular/router';
import { remult } from 'remult';
import { TravelExpense } from '../../shared/entities/travel-expense';

@Component({
  selector: 'app-travel',
  imports: [CommonModule, FormsModule, ClarityModule, RouterLink],
  template: `
    <main class="travel">
      <div class="page-head">
        <div class="page-head-text">
          <h1>Reisekosten</h1>
          <p>
            §26 EStG-konforme Reisekostenabrechnung — Diäten, Nächtigung, KM-Geld als
            Betriebsausgaben. AT-Standardsätze 2026 als Helper.
          </p>
        </div>
        <div class="page-head-actions">
          <label class="checkbox-inline"><input type="checkbox" [(ngModel)]="showArchived" (ngModelChange)="refresh()" /> Archiviert anzeigen</label>
          <a class="btn btn-primary" routerLink="/travel/new/edit">+ Neue Reise</a>
        </div>
      </div>

      <section class="kpi-row" *ngIf="!loading">
        <div class="kpi"><div class="kpi-label">Reisen {{ currentYear }}</div><div class="kpi-value">{{ yearCount() }}</div></div>
        <div class="kpi"><div class="kpi-label">Summe {{ currentYear }}</div><div class="kpi-value">{{ fmt(yearTotal()) }} €</div></div>
        <div class="kpi"><div class="kpi-label">KM {{ currentYear }}</div><div class="kpi-value">{{ yearKm() }} km</div></div>
      </section>

      <p *ngIf="loading" class="muted">Lade…</p>

      <table class="travel-table" *ngIf="!loading && trips.length">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Ziel</th>
            <th>Zweck</th>
            <th class="right">Diäten</th>
            <th class="right">Nächtigung</th>
            <th class="right">KM-Geld</th>
            <th class="right">Sonst.</th>
            <th class="right">Summe</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let t of trips" [class.archived]="t.archived">
            <td>{{ t.startDate | date:'dd.MM.yyyy' }}<span *ngIf="t.endDate"> – {{ t.endDate | date:'dd.MM.yyyy' }}</span></td>
            <td><a [routerLink]="['/travel', t.id, 'edit']">{{ t.destination || '—' }}</a></td>
            <td>{{ t.purpose }}</td>
            <td class="right">{{ fmt(t.mealsAmount) }}</td>
            <td class="right">{{ fmt(t.accommodationAmount) }}</td>
            <td class="right">{{ fmt(t.kmAmount) }}<span class="muted small" *ngIf="t.kmDriven"> ({{ t.kmDriven }}km)</span></td>
            <td class="right">{{ fmt(t.publicTransportAmount + t.otherCostsAmount) }}</td>
            <td class="right total-col">{{ fmt(t.totalAmount) }}</td>
            <td><a [routerLink]="['/travel', t.id, 'edit']" class="link">bearbeiten</a></td>
          </tr>
        </tbody>
      </table>

      <p *ngIf="!loading && !trips.length" class="muted">
        Noch keine Reisen erfasst. <a routerLink="/travel/new/edit">Die erste anlegen →</a>
      </p>
    </main>
  `,
  styles: [`
    .travel { max-width: 1100px; }
    .head { margin-bottom: 1rem; h1 { margin: 0 0 0.3rem; font-size: 1.4rem; }
      p.muted { margin: 0 0 0.75rem; color: #666; font-size: 0.9rem; max-width: 720px; }
    }
    .actions { display: flex; gap: 0.75rem; align-items: center;
      label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.88rem; color: #4a4a4a; }
    }
    .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; margin: 1rem 0 1.25rem;
      .kpi { background: white; border: 1px solid #e0e0e0; border-radius: 4px; padding: 0.6rem 0.85rem; }
      .kpi-label { font-size: 0.78rem; color: #666; }
      .kpi-value { font-size: 1.3rem; font-weight: 600; margin-top: 0.25rem; font-variant-numeric: tabular-nums; }
    }
    .travel-table { width: 100%; border-collapse: collapse; font-size: 0.9rem;
      background: white; border: 1px solid #e0e0e0; border-radius: 4px;
      th, td { padding: 0.45rem 0.65rem; border-bottom: 1px solid #f0f0f0; }
      th { font-weight: 500; background: #fafafa; color: #4a4a4a; text-align: left; }
      .right { text-align: right; font-variant-numeric: tabular-nums; }
      .total-col { font-weight: 600; }
      .small { font-size: 0.75rem; margin-left: 0.25rem; }
      tr.archived { opacity: 0.5; }
      .link { color: #1c4d7c; text-decoration: none; font-size: 0.85rem; }
      .link:hover { text-decoration: underline; }
    }
    .muted { color: #666; }
  `],
})
export class TravelComponent implements OnInit {
  trips: TravelExpense[] = [];
  loading = true;
  currentYear = new Date().getFullYear();
  showArchived = false;

  async ngOnInit() { await this.refresh(); }

  async refresh() {
    this.loading = true;
    this.trips = await remult.repo(TravelExpense).find({
      where: this.showArchived ? {} : { archived: false },
      orderBy: { startDate: 'desc' as any },
    });
    this.loading = false;
  }

  yearCount(): number {
    return this.trips.filter(t => new Date(t.startDate).getFullYear() === this.currentYear).length;
  }
  yearTotal(): number {
    return Math.round(this.trips
      .filter(t => new Date(t.startDate).getFullYear() === this.currentYear)
      .reduce((s, t) => s + t.totalAmount, 0) * 100) / 100;
  }
  yearKm(): number {
    return Math.round(this.trips
      .filter(t => new Date(t.startDate).getFullYear() === this.currentYear)
      .reduce((s, t) => s + (t.kmDriven || 0), 0));
  }

  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
