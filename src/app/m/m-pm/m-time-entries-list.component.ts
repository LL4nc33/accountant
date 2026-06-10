import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { remult } from 'remult';
import { TimeEntry } from '../../../shared/entities/time-entry';
import { Project } from '../../../shared/entities/project';
import { MCardComponent } from '../m-core/m-card.component';

interface Row {
  id: string;
  date: Date;
  projectName: string;
  hours: number;
  amount: number;
  description: string;
  billed: boolean;
}

@Component({
  selector: 'm-time-entries-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MCardComponent],
  template: `
    <div class="m-list-toolbar">
      <input type="search" [(ngModel)]="search" placeholder="Suchen…" class="m-search" />
      <div class="m-pills">
        <button class="m-pill" [class.active]="showOnlyOpen" (click)="showOnlyOpen = !showOnlyOpen">Nur offene</button>
        <a class="m-pill m-pill-add" routerLink="/m/time-entry/new/edit">+ Buchung</a>
      </div>
    </div>
    <p *ngIf="loading" class="m-muted">Lädt …</p>
    <p *ngIf="!loading && !filtered.length" class="m-muted">Keine Buchungen.</p>
    <m-card *ngFor="let r of filtered" [link]="r.billed ? null : ['/m/time-entry', r.id, 'edit']">
      <div card-head>
        <span>{{ r.date | date:'dd.MM.yyyy' }} · {{ r.projectName }}</span>
        <span>{{ r.amount | currency:'EUR':'symbol':'1.2-2':'de-AT' }}</span>
      </div>
      <div card-body>
        <span>{{ r.hours | number:'1.1-2':'de-AT' }} h</span>
        <span *ngIf="r.description"> · {{ r.description }}</span>
      </div>
      <div card-status>
        <span *ngIf="r.billed" class="m-badge m-badge-info">Abgerechnet</span>
        <span *ngIf="!r.billed" class="m-badge">Offen</span>
      </div>
    </m-card>
  `,
  styleUrls: ['../m-crm/m-customer-list.component.scss'],
})
export class MTimeEntriesListComponent implements OnInit {
  loading = true;
  showOnlyOpen = false;
  search = '';
  rows: Row[] = [];

  async ngOnInit() {
    const [entries, projects] = await Promise.all([
      remult.repo(TimeEntry).find({ orderBy: { date: 'desc' as any } }),
      remult.repo(Project).find(),
    ]);
    const nameById = new Map(projects.map((p) => [p.id, p.name]));
    this.rows = entries.map((e) => ({
      id: e.id,
      date: new Date(e.date),
      projectName: nameById.get(e.projectId) ?? '(unbekannt)',
      hours: e.hours ?? 0,
      amount: e.amount ?? 0,
      description: e.description ?? '',
      billed: !!e.billedInvoiceItemId,
    }));
    this.loading = false;
  }

  get filtered(): Row[] {
    const s = this.search.trim().toLowerCase();
    return this.rows.filter((r) => {
      if (this.showOnlyOpen && r.billed) return false;
      if (s && !`${r.projectName} ${r.description}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }
}
