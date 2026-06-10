import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { remult } from 'remult';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';
import { MCardComponent } from '../m-core/m-card.component';

interface ReminderRow {
  id: string;
  reminderNumber: string;
  reminderDate: string;
  dueDate: string;
  stage: 1 | 2 | 3;
  totalDue: number;
  sent: boolean;
  invoiceId: string;
  invoiceNumber: string | null;
  customerId: string | null;
  daysOverdue: number;
}

@Component({
  selector: 'm-reminders-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MCardComponent],
  template: `
    <div class="m-list-toolbar">
      <input type="search" [(ngModel)]="search" placeholder="Suchen…" class="m-search" />
      <div class="m-pills">
        <button class="m-pill" [class.active]="onlyOpen" (click)="onlyOpen = !onlyOpen">Nur Entwürfe</button>
      </div>
    </div>

    <p *ngIf="loading" class="m-muted">Lädt …</p>
    <p *ngIf="!loading && !filtered.length" class="m-muted">
      <span *ngIf="rows.length === 0">Keine Mahnungen. Solange alle Rechnungen pünktlich bezahlt werden, bleibt's leer.</span>
      <span *ngIf="rows.length > 0">Kein Treffer.</span>
    </p>

    <m-card *ngFor="let r of filtered" [link]="['/m/invoice', r.invoiceId]">
      <div card-head>
        <span>{{ stageLabel(r.stage) }} · {{ r.reminderNumber }}</span>
        <span>{{ r.totalDue | currency:'EUR':'symbol':'1.2-2':'de-AT' }}</span>
      </div>
      <div card-body>
        <span>Rechnung {{ r.invoiceNumber || '—' }}</span>
        <span *ngIf="r.customerId && customerNameById.get(r.customerId)"> · {{ customerNameById.get(r.customerId) }}</span>
        <span> · Frist: {{ r.dueDate | date:'dd.MM.yyyy' }}</span>
      </div>
      <div card-status>
        <span class="m-badge" [class.m-badge-warning]="r.stage === 2" [class.m-badge-danger]="r.stage === 3">Stufe {{ r.stage }}</span>
        <span class="m-badge" [class.m-badge-success]="r.sent">{{ r.sent ? 'Versendet' : 'Entwurf' }}</span>
        <span *ngIf="r.daysOverdue > 0" class="m-badge m-badge-danger">+{{ r.daysOverdue }} Tg</span>
      </div>
    </m-card>
  `,
  styleUrls: ['../m-crm/m-customer-list.component.scss'],
})
export class MRemindersListComponent implements OnInit {
  loading = true;
  search = '';
  onlyOpen = false;
  rows: ReminderRow[] = [];
  customerNameById = new Map<string, string>();

  constructor(private http: HttpClient) {}

  async ngOnInit() {
    try {
      const res = await firstValueFrom(
        this.http.get<{ reminders: ReminderRow[] }>('/api/reminders/overview'),
      );
      this.rows = res.reminders;
      const ids = Array.from(new Set(this.rows.map((r) => r.customerId).filter(Boolean) as string[]));
      if (ids.length) {
        const [persons, companies] = await Promise.all([
          remult.repo(Person).find({ where: { id: { $in: ids } } }),
          remult.repo(Company).find({ where: { id: { $in: ids } } }),
        ]);
        const m = new Map<string, string>();
        for (const p of persons) m.set(p.id, p.displayName);
        for (const c of companies) m.set(c.id, c.displayName);
        this.customerNameById = m;
      }
    } finally {
      this.loading = false;
    }
  }

  get filtered(): ReminderRow[] {
    const s = this.search.trim().toLowerCase();
    return this.rows.filter((r) => {
      if (this.onlyOpen && r.sent) return false;
      if (!s) return true;
      const name = r.customerId ? (this.customerNameById.get(r.customerId) ?? '') : '';
      return `${r.reminderNumber} ${r.invoiceNumber} ${name}`.toLowerCase().includes(s);
    });
  }

  stageLabel(s: 1 | 2 | 3): string {
    return s === 1 ? 'Erinnerung' : s === 2 ? 'Mahnung' : 'Letzte Mahnung';
  }
}
