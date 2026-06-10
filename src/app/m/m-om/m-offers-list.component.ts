import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { remult } from 'remult';
import { Offer, OfferStatus } from '../../../shared/entities/offer';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';

@Component({
  selector: 'm-offers-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, RouterLink],
  template: `
    <div class="m-list-head">
      <h2>Angebote</h2>
      <a routerLink="/m/offer/new/edit" class="m-pill m-pill-primary">
        <cds-icon shape="plus" size="14"></cds-icon> Neu
      </a>
    </div>

    <p *ngIf="loading" class="m-muted-small">Lade…</p>
    <p *ngIf="!loading && !offers.length" class="m-muted-small">
      Keine Angebote. Lege ein neues an.
    </p>

    <div *ngFor="let o of offers" class="m-card">
      <a [routerLink]="['/m/offer', o.id, 'edit']" class="m-card-link">
        <div class="card-head">
          <div class="num">{{ o.offerNumber }}</div>
          <span class="status-pill" [ngClass]="'status-' + o.status">{{ statusLabel(o.status) }}</span>
        </div>
        <div class="card-meta">
          {{ customerName(o) }} · {{ fmtDate(o.offerDate) }}
        </div>
        <div class="card-subject">{{ o.subject || '—' }}</div>
        <div class="card-total">{{ fmt(o.grossTotal) }} € brutto · gültig bis {{ fmtDate(o.validUntil) }}</div>
      </a>
    </div>
  `,
  styles: [`
    .m-list-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;
      h2 { font-size: 1.1rem; margin: 0; }
    }
    .m-muted-small { color: #666; font-size: 0.9rem; padding: 0.5rem 0; }
    .m-pill { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.85rem; background: white; border: 1px solid #DCDCDC; border-radius: 999px; font-size: 0.88rem; color: #1A1A1A; text-decoration: none; min-height: 40px;
      &.m-pill-primary { background: #1A1A1A; color: white; border-color: #1A1A1A; }
    }
    .m-card { background: white; border: 1px solid #e0e0e0; border-radius: 4px; margin-bottom: 0.5rem; overflow: hidden;
      .m-card-link { display: block; padding: 0.75rem; text-decoration: none; color: inherit; }
      .card-head { display: flex; justify-content: space-between; align-items: center;
        .num { font-weight: 600; font-family: Georgia, serif; }
      }
      .card-meta { font-size: 0.85rem; color: #666; margin-top: 0.2rem; }
      .card-subject { font-size: 0.92rem; margin-top: 0.3rem; }
      .card-total { font-size: 0.85rem; color: #4a4a4a; margin-top: 0.3rem; font-variant-numeric: tabular-nums; }
    }
    .status-pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 0.72rem; font-weight: 600; background: #e0e0e0;
      &.status-draft { background: #e0e0e0; }
      &.status-sent { background: #e3edf9; color: #1c4d7c; }
      &.status-won { background: #dff4d5; color: #266100; }
      &.status-lost { background: #fbeaea; color: #8b0000; }
      &.status-expired { background: #fdf6e3; color: #7d5100; }
    }
  `],
})
export class MOffersListComponent implements OnInit {
  offers: Offer[] = [];
  customerNameById = new Map<string, string>();
  loading = true;

  async ngOnInit() {
    try {
      this.offers = await remult.repo(Offer).find({
        where: { archived: false },
        orderBy: { offerDate: 'desc' as any },
      });
      const ids = Array.from(new Set(this.offers.map((o) => o.customerId).filter(Boolean)));
      if (ids.length) {
        const [persons, companies] = await Promise.all([
          remult.repo(Person).find({ where: { id: ids } }),
          remult.repo(Company).find({ where: { id: ids } }),
        ]);
        for (const p of persons) this.customerNameById.set(p.id, p.displayName);
        for (const c of companies) this.customerNameById.set(c.id, c.displayName);
      }
    } finally {
      this.loading = false;
    }
  }

  customerName(o: Offer): string {
    return this.customerNameById.get(o.customerId) ?? '—';
  }

  statusLabel(s: OfferStatus): string {
    switch (s) {
      case 'draft': return 'Entwurf';
      case 'sent': return 'Versendet';
      case 'won': return 'Angenommen';
      case 'lost': return 'Abgelehnt';
      case 'expired': return 'Abgelaufen';
    }
  }

  fmt(n: number): string {
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  fmtDate(d: Date | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-AT');
  }
}
