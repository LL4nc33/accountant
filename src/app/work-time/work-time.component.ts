import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule, ClrDatagridModule } from '@clr/angular';
import { remult } from 'remult';
import { TimeEntry } from '../../shared/entities/time-entry';
import { Project } from '../../shared/entities/project';

interface MonthRow {
  year: number;
  month: number;  // 1-12
  label: string;
  totalHours: number;
  billedHours: number;
  unbilledHours: number;
  byProject: { projectName: string; hours: number; billed: boolean }[];
}

@Component({
  selector: 'app-work-time',
  imports: [CommonModule, FormsModule, ClarityModule, ClrDatagridModule],
  templateUrl: './work-time.component.html',
  styleUrl: './work-time.component.scss',
})
export class WorkTimeComponent implements OnInit {
  monthRows: MonthRow[] = [];
  selectedYear = new Date().getFullYear();
  availableYears: number[] = [];
  loading = true;

  async ngOnInit() {
    const [entries, projects] = await Promise.all([
      remult.repo(TimeEntry).find({ orderBy: { date: 'desc' } }),
      remult.repo(Project).find(),
    ]);
    const projectById = new Map(projects.map((p) => [p.id, p.name]));

    const years = new Set<number>([new Date().getFullYear()]);
    for (const e of entries) years.add(new Date(e.date).getFullYear());
    this.availableYears = [...years].sort((a, b) => b - a);

    this.recompute(entries, projectById);
    this.loading = false;
  }

  recompute(entries: TimeEntry[], projectById: Map<string, string>) {
    const yearEntries = entries.filter((e) => new Date(e.date).getFullYear() === this.selectedYear);
    const months = new Map<number, MonthRow>();
    for (let m = 1; m <= 12; m++) {
      months.set(m, {
        year: this.selectedYear,
        month: m,
        label: this.monthLabel(m),
        totalHours: 0, billedHours: 0, unbilledHours: 0,
        byProject: [],
      });
    }
    for (const e of yearEntries) {
      const m = new Date(e.date).getMonth() + 1;
      const row = months.get(m)!;
      row.totalHours += e.hours;
      if (e.billedInvoiceItemId) row.billedHours += e.hours;
      else row.unbilledHours += e.hours;

      const pName = projectById.get(e.projectId) ?? '(unbekannt)';
      const existing = row.byProject.find((p) => p.projectName === pName);
      if (existing) existing.hours += e.hours;
      else row.byProject.push({ projectName: pName, hours: e.hours, billed: !!e.billedInvoiceItemId });
    }
    this.monthRows = [...months.values()].filter((r) => r.totalHours > 0);
  }

  async onYearChange() {
    this.loading = true;
    const [entries, projects] = await Promise.all([
      remult.repo(TimeEntry).find({ orderBy: { date: 'desc' } }),
      remult.repo(Project).find(),
    ]);
    const projectById = new Map(projects.map((p) => [p.id, p.name]));
    this.recompute(entries, projectById);
    this.loading = false;
  }

  monthLabel(m: number): string {
    return ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
            'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'][m - 1];
  }

  get yearTotal(): number {
    return this.monthRows.reduce((s, r) => s + r.totalHours, 0);
  }
  get yearBilled(): number {
    return this.monthRows.reduce((s, r) => s + r.billedHours, 0);
  }
  get yearUnbilled(): number {
    return this.monthRows.reduce((s, r) => s + r.unbilledHours, 0);
  }
}
