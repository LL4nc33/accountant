import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { remult } from 'remult';
import { TimeEntry } from '../../../shared/entities/time-entry';
import { Project } from '../../../shared/entities/project';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';
import { EmptyStateComponent } from '../../core/empty-state/empty-state.component';

interface TimeEntryRow {
  entry: TimeEntry;
  projectId: string;
  projectName: string;
  customerName: string;
}

@Component({
  selector: 'app-time-entries-overview',
  imports: [CommonModule, FormsModule, ClarityModule, RouterLink, EmptyStateComponent],
  templateUrl: './time-entries-overview.component.html',
  styleUrl: './time-entries-overview.component.scss',
})
export class TimeEntriesOverviewComponent implements OnInit {
  rows: TimeEntryRow[] = [];
  loading = true;
  showOnlyOpen = false;

  async ngOnInit() {
    const entries = await remult.repo(TimeEntry).find({
      orderBy: { date: 'desc' as any },
    });

    // Resolve projects + customers once (avoid N+1 lookups)
    const projects = await remult.repo(Project).find();
    const persons = await remult.repo(Person).find();
    const companies = await remult.repo(Company).find();

    const projectMap = new Map(projects.map(p => [p.id, p]));
    const customerMap = new Map<string, string>();
    for (const p of persons) customerMap.set(p.id, p.displayName);
    for (const c of companies) customerMap.set(c.id, c.displayName);

    this.rows = entries.map(e => {
      const proj = projectMap.get(e.projectId);
      const projectName = proj?.name ?? '(unbekannt)';
      const customerName = proj ? (customerMap.get(proj.customerId) ?? '(unbekannt)') : '(unbekannt)';
      return {
        entry: e,
        projectId: e.projectId,
        projectName,
        customerName,
      };
    });
    this.loading = false;
  }

  get filteredRows(): TimeEntryRow[] {
    return this.showOnlyOpen ? this.rows.filter(r => !r.entry.billedInvoiceItemId) : this.rows;
  }

  get totalHours(): number {
    return this.filteredRows.reduce((a, b) => a + b.entry.hours, 0);
  }

  get totalAmount(): number {
    return this.filteredRows.reduce((a, b) => a + b.entry.amount, 0);
  }
}
