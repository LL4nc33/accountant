import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { remult } from 'remult';
import { TimeEntry } from '../../../shared/entities/time-entry';
import { Project } from '../../../shared/entities/project';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

interface MonthRow {
  month: number;
  label: string;
  total: number;
  billed: number;
  unbilled: number;
  byProject: { projectName: string; hours: number; billed: boolean }[];
}

@Component({
  selector: 'm-work-time',
  standalone: true,
  imports: [CommonModule, FormsModule, MFormSectionComponent],
  template: `
    <p *ngIf="loading" class="m-muted">Lädt …</p>
    <ng-container *ngIf="!loading">
      <div class="m-list-toolbar">
        <select [(ngModel)]="selectedYear" (ngModelChange)="recompute()" class="m-search">
          <option *ngFor="let y of availableYears" [ngValue]="y">{{ y }}</option>
        </select>
      </div>

      <m-form-section [title]="selectedYear + ' Gesamt'">
        <dl class="m-kv">
          <dt>Stunden gesamt</dt><dd>{{ yearTotal | number:'1.1-2':'de-AT' }} h</dd>
          <dt>Abgerechnet</dt><dd>{{ yearBilled | number:'1.1-2':'de-AT' }} h</dd>
          <dt>Noch offen</dt><dd>{{ yearUnbilled | number:'1.1-2':'de-AT' }} h</dd>
        </dl>
      </m-form-section>

      <m-form-section *ngFor="let m of monthRows" [title]="m.label + ' — ' + (m.total | number:'1.1-2':'de-AT') + ' h'">
        <dl class="m-kv">
          <dt>Abgerechnet</dt><dd>{{ m.billed | number:'1.1-2':'de-AT' }} h</dd>
          <dt>Offen</dt><dd>{{ m.unbilled | number:'1.1-2':'de-AT' }} h</dd>
        </dl>
        <div class="m-chips">
          <span *ngFor="let p of m.byProject" class="m-chip" [class.billed]="p.billed">
            {{ p.projectName }}: {{ p.hours | number:'1.1-2':'de-AT' }} h
          </span>
        </div>
      </m-form-section>

      <p *ngIf="!monthRows.length" class="m-muted-small">Keine Buchungen in {{ selectedYear }}.</p>
    </ng-container>
  `,
  styles: [`
    .m-chips {
      display: flex;
      gap: 0.35rem;
      flex-wrap: wrap;
      margin-top: 0.5rem;
    }
    .m-chip {
      background: #E8E8E8;
      color: #333;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 0.78rem;
      &.billed { background: #D4EAFF; color: #0072a3; }
    }
  `],
  styleUrls: ['../m-crm/m-customer-view.component.scss', '../m-crm/m-customer-list.component.scss'],
})
export class MWorkTimeComponent implements OnInit {
  loading = true;
  selectedYear = new Date().getFullYear();
  availableYears: number[] = [];
  monthRows: MonthRow[] = [];

  private entries: TimeEntry[] = [];
  private projectNameById = new Map<string, string>();

  async ngOnInit() {
    const [entries, projects] = await Promise.all([
      remult.repo(TimeEntry).find({ orderBy: { date: 'desc' as any } }),
      remult.repo(Project).find(),
    ]);
    this.entries = entries;
    this.projectNameById = new Map(projects.map((p) => [p.id, p.name]));

    const years = new Set<number>([new Date().getFullYear()]);
    for (const e of entries) years.add(new Date(e.date).getFullYear());
    this.availableYears = [...years].sort((a, b) => b - a);

    this.recompute();
    this.loading = false;
  }

  recompute() {
    const yearEntries = this.entries.filter((e) => new Date(e.date).getFullYear() === this.selectedYear);
    const monthLabels = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
                         'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    const months = new Map<number, MonthRow>();
    for (let m = 1; m <= 12; m++) {
      months.set(m, { month: m, label: monthLabels[m - 1], total: 0, billed: 0, unbilled: 0, byProject: [] });
    }
    for (const e of yearEntries) {
      const m = new Date(e.date).getMonth() + 1;
      const row = months.get(m)!;
      row.total += e.hours;
      if (e.billedInvoiceItemId) row.billed += e.hours;
      else row.unbilled += e.hours;
      const name = this.projectNameById.get(e.projectId) ?? '(unbekannt)';
      const existing = row.byProject.find((p) => p.projectName === name);
      if (existing) existing.hours += e.hours;
      else row.byProject.push({ projectName: name, hours: e.hours, billed: !!e.billedInvoiceItemId });
    }
    this.monthRows = [...months.values()].filter((r) => r.total > 0);
  }

  get yearTotal(): number {
    return this.monthRows.reduce((s, r) => s + r.total, 0);
  }
  get yearBilled(): number {
    return this.monthRows.reduce((s, r) => s + r.billed, 0);
  }
  get yearUnbilled(): number {
    return this.monthRows.reduce((s, r) => s + r.unbilled, 0);
  }
}
