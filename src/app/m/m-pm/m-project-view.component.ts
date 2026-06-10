import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import { remult } from 'remult';
import { Project } from '../../../shared/entities/project';
import { TimeEntry } from '../../../shared/entities/time-entry';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';
import { MCardComponent } from '../m-core/m-card.component';
import { MFormSectionComponent } from '../m-core/m-form-section.component';
import { MFormModalComponent } from '../m-core/m-form-modal.component';

@Component({
  selector: 'm-project-view',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ClarityModule, MCardComponent, MFormSectionComponent, MFormModalComponent],
  template: `
    <p *ngIf="loading" class="m-muted">Lädt …</p>

    <ng-container *ngIf="!loading && project">
      <div class="m-customer-head">
        <h1 class="m-customer-name">{{ project.name }}</h1>
        <div class="m-customer-meta">
          Projekt
          <span *ngIf="customerName"> · {{ customerName }}</span>
          <span *ngIf="project.archived" class="m-badge m-badge-warning">archiviert</span>
        </div>
      </div>

      <div class="m-customer-actions">
        <a class="m-pill" [routerLink]="['/m/project', project.id, 'edit']">Bearbeiten</a>
        <a class="m-pill m-pill-add" [routerLink]="['/m/time-entry/new/edit']" [queryParams]="{projectId: project.id}">+ Stunden</a>
        <button class="m-pill m-pill-primary" type="button" [disabled]="openEntries.length === 0 || generating" (click)="showGenerateModal = true">Rechnung erzeugen</button>
      </div>

      <m-form-section title="Übersicht">
        <dl class="m-kv">
          <dt>Status</dt><dd>{{ project.status === 'active' ? 'Aktiv' : 'Geschlossen' }}</dd>
          <dt>Stundensatz</dt><dd>{{ project.hourlyRate | currency:'EUR':'symbol':'1.2-2':'de-AT' }}</dd>
          <dt>Offene Stunden</dt><dd>{{ totalOpenHours | number:'1.1-2':'de-AT' }} h</dd>
          <dt>Offener Betrag</dt><dd>{{ totalOpenAmount | currency:'EUR':'symbol':'1.2-2':'de-AT' }}</dd>
        </dl>
        <p *ngIf="project.description" class="m-desc">{{ project.description }}</p>
      </m-form-section>

      <m-form-section [title]="'Zeitbuchungen (' + filteredEntries.length + ')'">
        <label class="m-filter-row">
          <input type="checkbox" [(ngModel)]="showOnlyOpen" />
          Nur offene
        </label>
        <p *ngIf="!filteredEntries.length" class="m-muted-small">Keine Einträge.</p>
        <m-card *ngFor="let e of filteredEntries" [link]="e.billedInvoiceItemId ? null : ['/m/time-entry', e.id, 'edit']">
          <div card-head>
            <span>{{ e.date | date:'dd.MM.yyyy' }}</span>
            <span>{{ e.amount | currency:'EUR':'symbol':'1.2-2':'de-AT' }}</span>
          </div>
          <div card-body>
            <span>{{ e.hours | number:'1.1-2':'de-AT' }} h · {{ e.hourlyRate | currency:'EUR':'symbol':'1.2-2':'de-AT' }}/h</span>
          </div>
          <div card-status>
            <span *ngIf="e.billedInvoiceItemId" class="m-badge m-badge-info">Abgerechnet</span>
            <span *ngIf="!e.billedInvoiceItemId" class="m-badge">Offen</span>
          </div>
        </m-card>
      </m-form-section>
    </ng-container>

    <m-form-modal [(open)]="showGenerateModal" title="Rechnung aus Stunden">
      <p>Folgende offene Zeitbuchungen werden in eine neue Rechnung umgewandelt:</p>
      <dl class="m-kv">
        <dt>Einträge</dt><dd>{{ openEntries.length }}</dd>
        <dt>Stunden</dt><dd>{{ totalOpenHours | number:'1.1-2':'de-AT' }} h</dd>
        <dt>Netto</dt><dd>{{ totalOpenAmount | currency:'EUR':'symbol':'1.2-2':'de-AT' }}</dd>
      </dl>
      <p class="m-modal-hint">Pro Eintrag eine Position. Die Zeitbuchungen werden als „abgerechnet" markiert und können danach nicht mehr bearbeitet werden.</p>
      <div modal-foot>
        <button type="button" class="m-pill" (click)="showGenerateModal = false" [disabled]="generating">Abbrechen</button>
        <button type="button" class="m-pill m-pill-primary" (click)="generateInvoice()" [disabled]="generating">{{ generating ? 'Erzeuge…' : 'Bestätigen' }}</button>
      </div>
    </m-form-modal>
  `,
  styles: [`
    .m-desc {
      margin: 0.75rem 0 0;
      color: #444;
      font-size: 0.95rem;
    }
    .m-filter-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      font-size: 0.9rem;
      color: #444;
    }
    :host ::ng-deep .m-modal-hint {
      color: #666;
      font-size: 0.85rem;
      margin-top: 0.75rem;
    }
  `],
  styleUrls: ['../m-crm/m-customer-view.component.scss'],
})
export class MProjectViewComponent implements OnInit {
  @Input() id!: string;
  loading = true;
  project?: Project;
  customerName = '';
  entries: TimeEntry[] = [];
  showOnlyOpen = true;
  showGenerateModal = false;
  generating = false;

  constructor(private router: Router, private http: HttpClient, private toastr: ToastrService) {}

  async ngOnInit() {
    const found = await remult.repo(Project).findFirst({ id: this.id });
    if (!found) {
      this.toastr.error('Projekt nicht gefunden');
      this.router.navigate(['/m/projects']);
      return;
    }
    this.project = found;
    const c = (await remult.repo(Person).findFirst({ id: this.project.customerId }))
      ?? (await remult.repo(Company).findFirst({ id: this.project.customerId }));
    this.customerName = c?.displayName ?? '';
    this.entries = await remult.repo(TimeEntry).find({
      where: { projectId: this.project.id },
      orderBy: { date: 'desc' as any },
    });
    this.loading = false;
  }

  get filteredEntries(): TimeEntry[] {
    return this.showOnlyOpen ? this.entries.filter(e => !e.billedInvoiceItemId) : this.entries;
  }

  get openEntries(): TimeEntry[] {
    return this.entries.filter(e => !e.billedInvoiceItemId);
  }

  get totalOpenHours(): number {
    return this.openEntries.reduce((a, b) => a + b.hours, 0);
  }

  get totalOpenAmount(): number {
    return this.openEntries.reduce((a, b) => a + b.amount, 0);
  }

  async generateInvoice() {
    if (!this.project) return;
    this.generating = true;
    try {
      const result = await firstValueFrom(this.http.post<{
        invoiceId: string;
        invoiceNumber: string;
        itemCount: number;
        totalNet: number;
      }>(`/api/projects/${this.project.id}/generate-invoice`, {}));
      this.toastr.success(`Rechnung ${result.invoiceNumber} erzeugt`);
      this.showGenerateModal = false;
      this.router.navigate(['/m/invoice', result.invoiceId]);
    } catch (e: any) {
      this.toastr.error(e?.error?.error ?? 'Fehler beim Erzeugen');
    } finally {
      this.generating = false;
    }
  }
}
