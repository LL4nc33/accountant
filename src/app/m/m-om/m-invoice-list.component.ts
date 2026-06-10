import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { remult } from 'remult';
import { Invoice } from '../../../shared/entities/invoice';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';
import { MCardComponent } from '../m-core/m-card.component';

interface Row {
  id: string;
  number: string;
  customer: string;
  subject: string;
  date: Date | null;
  gross: number;
  finalized: boolean;
  paid: boolean;
  archived: boolean;
  isStorno: boolean;
}

@Component({
  selector: 'm-invoice-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MCardComponent],
  templateUrl: './m-invoice-list.component.html',
  styleUrls: ['../m-crm/m-customer-list.component.scss'],
})
export class MInvoiceListComponent implements OnInit {
  loading = true;
  onlyOpen = false;
  showArchived = false;
  search = '';
  rows: Row[] = [];

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    this.loading = true;
    const where: any = this.showArchived ? {} : { archived: false };
    if (this.onlyOpen) { where.paid = false; where.correctsInvoiceId = ''; }
    const invs = await remult.repo(Invoice).find({ where, orderBy: { invoiceDate: 'desc' } });

    const customerIds = Array.from(new Set(invs.map((i) => i.customerId).filter(Boolean)));
    const [persons, companies] = await Promise.all([
      customerIds.length ? remult.repo(Person).find({ where: { id: { $in: customerIds } } }) : Promise.resolve([] as Person[]),
      customerIds.length ? remult.repo(Company).find({ where: { id: { $in: customerIds } } }) : Promise.resolve([] as Company[]),
    ]);
    const labelById = new Map<string, string>();
    for (const p of persons) labelById.set(p.id, `${p.firstname ?? ''} ${p.lastname ?? ''}`.trim() || '—');
    for (const c of companies) labelById.set(c.id, c.name ?? '—');

    this.rows = invs.map((i) => ({
      id: i.id,
      number: i.invoiceNumber || '—',
      customer: labelById.get(i.customerId ?? '') ?? '—',
      subject: i.subject || '',
      date: i.invoiceDate ? new Date(i.invoiceDate) : null,
      gross: i.grossTotal ?? 0,
      finalized: i.finalized,
      paid: i.paid,
      archived: i.archived,
      isStorno: !!i.correctsInvoiceId,
    }));
    this.loading = false;
  }

  get filtered(): Row[] {
    if (!this.search.trim()) return this.rows;
    const s = this.search.toLowerCase();
    return this.rows.filter((r) =>
      r.number.toLowerCase().includes(s) ||
      r.customer.toLowerCase().includes(s) ||
      r.subject.toLowerCase().includes(s),
    );
  }
}
