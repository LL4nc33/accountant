import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { remult } from 'remult';
import { TravelExpense } from '../../../shared/entities/travel-expense';
import { MCardComponent } from '../m-core/m-card.component';

@Component({
  selector: 'm-travel',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MCardComponent],
  template: `
    <div class="head">
      <h2>Reisekosten</h2>
      <a class="m-pill m-pill-primary" routerLink="/m/travel/new/edit">+ Neu</a>
    </div>

    <p *ngIf="loading" class="muted">Lädt…</p>

    <p class="summary" *ngIf="!loading && trips.length">
      {{ currentYear }}: <strong>{{ yearCount() }}</strong> Reisen ·
      <strong>{{ fmt(yearTotal()) }} €</strong> · <strong>{{ yearKm() }}</strong> km
    </p>

    <m-card *ngFor="let t of trips" (click)="open(t)" style="cursor:pointer">
      <div card-head>
        <span>{{ t.destination || '—' }}</span>
        <span>{{ fmt(t.totalAmount) }} €</span>
      </div>
      <div card-body>
        <span>{{ t.startDate | date:'dd.MM.yyyy' }} · {{ t.purpose }}</span>
        <span *ngIf="t.kmDriven">{{ t.kmDriven }} km</span>
      </div>
    </m-card>

    <p *ngIf="!loading && !trips.length" class="muted">
      Noch keine Reisen. <a routerLink="/m/travel/new/edit">Anlegen →</a>
    </p>
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;
      h2 { margin: 0; font-size: 1.1rem; }
      .m-pill { padding: 0.4rem 0.9rem; background: #1A1A1A; color: white; border-radius: 999px; text-decoration: none; font-size: 0.88rem; }
    }
    .summary { font-size: 0.9rem; margin: 0.5rem 0 1rem; strong { font-variant-numeric: tabular-nums; } }
    .muted { color: #666; }
  `],
})
export class MTravelComponent implements OnInit {
  trips: TravelExpense[] = [];
  loading = true;
  currentYear = new Date().getFullYear();

  constructor(private router: Router) {}

  async ngOnInit() {
    this.trips = await remult.repo(TravelExpense).find({
      where: { archived: false },
      orderBy: { startDate: 'desc' as any },
    });
    this.loading = false;
  }

  open(t: TravelExpense) { this.router.navigate(['/m/travel', t.id, 'edit']); }

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
