import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { remult } from 'remult';
import { Project } from '../../shared/entities/project';
import { TimeEntry } from '../../shared/entities/time-entry';
import { Person } from '../../shared/entities/person';
import { Company } from '../../shared/entities/company';
import { EmptyStateComponent } from '../core/empty-state/empty-state.component';
import { archiveScope } from '../core/archive-filter';

interface ProjectRow {
  project: Project;
  customerName: string;
  openHours: number;
  openAmount: number;
}

@Component({
  selector: 'app-pm',
  imports: [CommonModule, FormsModule, ClarityModule, RouterLink, EmptyStateComponent],
  templateUrl: './pm.component.html',
  styleUrl: './pm.component.scss',
})
export class PmComponent implements OnInit {
  rows: ProjectRow[] = [];
  loading = true;
  showArchived = false;

  async ngOnInit() { await this.reload(); }

  async reload() {
    this.loading = true;
    // Bulk-fetch Persons + Companies once instead of two findFirst per project
    // (former N+1). TimeEntry per project still needs one query each.
    const [projects, persons, companies] = await Promise.all([
      remult.repo(Project).find({ where: archiveScope(this.showArchived) }),
      remult.repo(Person).find(),
      remult.repo(Company).find(),
    ]);
    const customerById = new Map<string, string>();
    for (const p of persons) customerById.set(p.id, p.displayName);
    for (const c of companies) customerById.set(c.id, c.displayName);

    const all = await Promise.all(projects.map(async (p) => {
      const customerName = customerById.get(p.customerId) ?? '(unbekannt)';
      const openTimeEntries = await remult.repo(TimeEntry).find({
        where: { projectId: p.id, billedInvoiceItemId: '' },
      });
      const openHours = openTimeEntries.reduce((a, b) => a + b.hours, 0);
      const openAmount = openTimeEntries.reduce((a, b) => a + b.amount, 0);
      return { project: p, customerName, openHours, openAmount };
    }));
    this.rows = all;
    this.loading = false;
  }
}
