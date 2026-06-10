import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { remult } from 'remult';
import { RecurringInvoice } from '../../../shared/entities/recurring-invoice';
import { MCardComponent } from '../m-core/m-card.component';

@Component({
  selector: 'm-recurring-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MCardComponent],
  template: `
    <div class="m-list-toolbar">
      <input type="search" [(ngModel)]="search" placeholder="Suchen…" class="m-search" />
      <div class="m-pills">
        <a class="m-pill m-pill-add" routerLink="/recurring/new/edit">+ Neue Vorlage</a>
      </div>
    </div>
    <p *ngIf="loading" class="m-muted">Lädt …</p>
    <p *ngIf="!loading && !filtered.length" class="m-muted">Keine wiederkehrenden Rechnungen.</p>
    <m-card *ngFor="let r of filtered">
      <div card-head>
        <span>{{ r.title }}</span>
        <span>{{ r.interval }}</span>
      </div>
      <div card-body>
        <span>Nächste Ausführung: {{ r.nextRunDate | date:'dd.MM.yyyy' }}</span>
        <span *ngIf="r.lastRunDate"> · Zuletzt: {{ r.lastRunDate | date:'dd.MM.yyyy' }}</span>
      </div>
      <div card-status>
        <span *ngIf="r.active" class="m-badge m-badge-success">aktiv</span>
        <span *ngIf="!r.active" class="m-badge m-badge-warning">pausiert</span>
      </div>
    </m-card>
    <p class="m-muted-small" style="margin-top: 1rem;">
      Bearbeitung der Vorlagen aktuell nur am Desktop unter <a routerLink="/recurring">/recurring</a>.
    </p>
  `,
  styleUrls: ['../m-crm/m-customer-list.component.scss'],
})
export class MRecurringListComponent implements OnInit {
  loading = true;
  search = '';
  rows: RecurringInvoice[] = [];

  async ngOnInit() {
    this.rows = await remult.repo(RecurringInvoice).find({ orderBy: { nextRunDate: 'asc' as any } });
    this.loading = false;
  }

  get filtered(): RecurringInvoice[] {
    const s = this.search.trim().toLowerCase();
    if (!s) return this.rows;
    return this.rows.filter((r) => r.title.toLowerCase().includes(s));
  }
}
