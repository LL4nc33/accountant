import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { remult } from 'remult';
import { CashbookEntry } from '../../../shared/entities/cashbook-entry';
import { MCardComponent } from '../m-core/m-card.component';

@Component({
  selector: 'm-cashbook',
  standalone: true,
  imports: [CommonModule, RouterLink, MCardComponent],
  template: `
    <div class="head">
      <h2>Kassabuch</h2>
      <a class="m-pill m-pill-primary" routerLink="/m/cashbook/new/edit">+ Neu</a>
    </div>

    <p class="warning-rkvs" *ngIf="!loading">
      Nicht RKSV-konform — über 7.500 € Bar/Jahr Registrierkasse Pflicht.
    </p>

    <p *ngIf="loading" class="muted">Lädt…</p>

    <p class="summary" *ngIf="!loading && entries.length">
      Saldo: <strong [class.positive]="balance >= 0" [class.negative]="balance < 0">{{ fmt(balance) }} €</strong>
    </p>

    <m-card *ngFor="let e of entries" (click)="open(e)" style="cursor:pointer">
      <div card-head>
        <span>{{ e.description || '—' }}</span>
        <span [class.positive]="e.amount > 0" [class.negative]="e.amount < 0">{{ fmt(e.amount) }} €</span>
      </div>
      <div card-body>
        <span>{{ e.entryDate | date:'dd.MM.yyyy' }} · {{ e.category }}</span>
        <span *ngIf="e.documentNumber" class="mono">{{ e.documentNumber }}</span>
      </div>
    </m-card>

    <p *ngIf="!loading && !entries.length" class="muted">
      Noch keine Einträge. <a routerLink="/m/cashbook/new/edit">Den ersten anlegen →</a>
    </p>
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;
      h2 { margin: 0; font-size: 1.1rem; }
      .m-pill { padding: 0.4rem 0.9rem; background: #1A1A1A; color: white; border-radius: 999px; text-decoration: none; font-size: 0.88rem; }
    }
    .warning-rkvs { font-size: 0.78rem; padding: 0.5rem; background: #fff4d6; border-left: 3px solid #b97500; color: #7d5100; margin-bottom: 1rem; }
    .summary { font-size: 0.95rem; margin: 0.5rem 0 1rem;
      strong { font-variant-numeric: tabular-nums;
        &.positive { color: #266100; }
        &.negative { color: #8b0000; }
      }
    }
    .mono { font-family: monospace; font-size: 0.78rem; }
    .positive { color: #266100; }
    .negative { color: #8b0000; }
    .muted { color: #666; }
  `],
})
export class MCashbookComponent implements OnInit {
  entries: CashbookEntry[] = [];
  loading = true;
  balance = 0;

  constructor(private router: Router) {}

  async ngOnInit() {
    const all = await remult.repo(CashbookEntry).find({
      where: { archived: false },
      orderBy: { entryDate: 'asc' as any },
    });
    this.balance = Math.round(all.reduce((s, e) => s + e.amount, 0) * 100) / 100;
    this.entries = all.slice().reverse(); // newest first für UI
    this.loading = false;
  }

  open(e: CashbookEntry) { this.router.navigate(['/m/cashbook', e.id, 'edit']); }

  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
