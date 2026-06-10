import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { remult } from 'remult';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';
import { MCardComponent } from '../m-core/m-card.component';

interface Row {
  id: string;
  type: 'person' | 'company';
  name: string;
  customerNumber: string;
  meta: string;
  archived: boolean;
}

@Component({
  selector: 'm-customer-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ClarityModule, MCardComponent],
  templateUrl: './m-customer-list.component.html',
  styleUrl: './m-customer-list.component.scss',
})
export class MCustomerListComponent implements OnInit {
  loading = true;
  showArchived = false;
  search = '';
  rows: Row[] = [];

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    this.loading = true;
    const where = this.showArchived ? {} : { archived: false };
    const [persons, companies] = await Promise.all([
      remult.repo(Person).find({ where }),
      remult.repo(Company).find({ where }),
    ]);
    this.rows = [
      ...persons.map((p) => ({
        id: p.id,
        type: 'person' as const,
        name: `${p.firstname ?? ''} ${p.lastname ?? ''}`.trim() || '—',
        customerNumber: p.customerNumber || '',
        meta: p.email || '',
        archived: p.archived,
      })),
      ...companies.map((c) => ({
        id: c.id,
        type: 'company' as const,
        name: c.name || '—',
        customerNumber: c.customerNumber || '',
        meta: c.email || c.vatId || '',
        archived: c.archived,
      })),
    ].sort((a, b) => a.name.localeCompare(b.name));
    this.loading = false;
  }

  get filtered(): Row[] {
    if (!this.search.trim()) return this.rows;
    const s = this.search.toLowerCase();
    return this.rows.filter((r) =>
      r.name.toLowerCase().includes(s)
      || r.meta.toLowerCase().includes(s)
      || r.customerNumber.toLowerCase().includes(s),
    );
  }
}
