import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { remult } from 'remult';
import { Project } from '../../../shared/entities/project';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';
import { TimeEntry } from '../../../shared/entities/time-entry';
import { MCardComponent } from '../m-core/m-card.component';

interface Row {
  id: string;
  name: string;
  customer: string;
  status: string;
  openHours: number;
  archived: boolean;
}

@Component({
  selector: 'm-project-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MCardComponent],
  template: `
    <div class="m-list-toolbar">
      <input type="search" [(ngModel)]="search" placeholder="Suchen…" class="m-search" />
      <div class="m-pills">
        <button class="m-pill" [class.active]="showArchived" (click)="showArchived = !showArchived; reload()">Archiv</button>
        <a class="m-pill m-pill-add" routerLink="/m/project/new/edit">+ Neues Projekt</a>
      </div>
    </div>
    <p *ngIf="loading" class="m-muted">Lädt …</p>
    <p *ngIf="!loading && filtered.length === 0" class="m-muted">Keine Projekte.</p>
    <m-card *ngFor="let r of filtered" [link]="['/m/project', r.id]">
      <div card-head>
        <span>{{ r.name }}</span>
        <span>{{ r.openHours | number:'1.1-1':'de-AT' }} h offen</span>
      </div>
      <div card-body>{{ r.customer }}</div>
      <div card-status>
        <span class="m-badge" [class.m-badge-success]="r.status === 'active'">{{ r.status === 'active' ? 'Aktiv' : 'Geschlossen' }}</span>
        <span *ngIf="r.archived" class="m-badge m-badge-warning">Archiviert</span>
      </div>
    </m-card>
  `,
  styleUrls: ['../m-crm/m-customer-list.component.scss'],
})
export class MProjectListComponent implements OnInit {
  loading = true;
  showArchived = false;
  search = '';
  rows: Row[] = [];

  async ngOnInit() { await this.reload(); }

  async reload() {
    this.loading = true;
    const where = this.showArchived ? {} : { archived: false };
    const projs = await remult.repo(Project).find({ where });
    const customerIds = Array.from(new Set(projs.map((p) => p.customerId).filter(Boolean)));
    const [persons, companies, tes] = await Promise.all([
      customerIds.length ? remult.repo(Person).find({ where: { id: { $in: customerIds } } }) : Promise.resolve([] as Person[]),
      customerIds.length ? remult.repo(Company).find({ where: { id: { $in: customerIds } } }) : Promise.resolve([] as Company[]),
      projs.length ? remult.repo(TimeEntry).find({ where: { projectId: { $in: projs.map((p) => p.id) } } }) : Promise.resolve([] as TimeEntry[]),
    ]);
    const labelById = new Map<string, string>();
    for (const p of persons) labelById.set(p.id, `${p.firstname ?? ''} ${p.lastname ?? ''}`.trim() || '—');
    for (const c of companies) labelById.set(c.id, c.name ?? '—');
    const openByProject = new Map<string, number>();
    for (const t of tes) {
      if (t.billedInvoiceItemId) continue;
      openByProject.set(t.projectId, (openByProject.get(t.projectId) ?? 0) + (t.hours ?? 0));
    }
    this.rows = projs.map((p) => ({
      id: p.id,
      name: p.name || '—',
      customer: labelById.get(p.customerId ?? '') ?? '—',
      status: p.status,
      openHours: openByProject.get(p.id) ?? 0,
      archived: p.archived,
    }));
    this.loading = false;
  }

  get filtered(): Row[] {
    if (!this.search.trim()) return this.rows;
    const s = this.search.toLowerCase();
    return this.rows.filter((r) => r.name.toLowerCase().includes(s) || r.customer.toLowerCase().includes(s));
  }
}
