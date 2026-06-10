import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { remult } from 'remult';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';
import { Address } from '../../../shared/entities/address';
import { Invoice } from '../../../shared/entities/invoice';
import { InvoiceItem } from '../../../shared/entities/invoice-item';
import { Project } from '../../../shared/entities/project';
import { TimeEntry } from '../../../shared/entities/time-entry';
import { Product } from '../../../shared/entities/product';
import { ModulesService } from '../../core/modules.service';
import { MCardComponent } from '../m-core/m-card.component';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

type CustomerType = 'person' | 'company';

@Component({
  selector: 'm-customer-view',
  standalone: true,
  imports: [CommonModule, RouterLink, ClarityModule, MCardComponent, MFormSectionComponent],
  templateUrl: './m-customer-view.component.html',
  styleUrl: './m-customer-view.component.scss',
})
export class MCustomerViewComponent implements OnInit {
  @Input() id!: string;

  type: CustomerType | null = null;
  displayName = '';
  customerNumber = '';
  email = '';
  phone = '';
  vatId = '';
  archived = false;

  addresses: Address[] = [];
  invoices: { id: string; number: string; date: Date | null; gross: number; finalized: boolean; paid: boolean; isStorno: boolean }[] = [];
  projects: { id: string; name: string; status: string; openHours: number }[] = [];
  products: { name: string; count: number; lastDate: Date | null }[] = [];

  loading = true;

  constructor(public modules: ModulesService) {}

  async ngOnInit() {
    const person = await remult.repo(Person).findFirst({ id: this.id });
    if (person) {
      this.type = 'person';
      this.displayName = `${person.firstname ?? ''} ${person.lastname ?? ''}`.trim() || '—';
      this.customerNumber = person.customerNumber || '';
      this.email = person.email || '';
      this.phone = person.phone || '';
      this.vatId = person.vatId || '';
      this.archived = person.archived;
    } else {
      const company = await remult.repo(Company).findFirst({ id: this.id });
      if (company) {
        this.type = 'company';
        this.displayName = company.name || '—';
        this.customerNumber = company.customerNumber || '';
        this.email = company.email || '';
        this.phone = company.phone || '';
        this.vatId = company.vatId || '';
        this.archived = company.archived;
      }
    }

    const [addresses, invs, projs] = await Promise.all([
      remult.repo(Address).find({ where: { customerId: this.id } }),
      remult.repo(Invoice).find({ where: { customerId: this.id }, orderBy: { invoiceDate: 'desc' } }),
      this.modules.isEnabled('projects')
        ? remult.repo(Project).find({ where: { customerId: this.id } })
        : Promise.resolve([] as Project[]),
    ]);

    this.addresses = addresses;
    this.invoices = invs.map((i) => ({
      id: i.id,
      number: i.invoiceNumber || '—',
      date: i.invoiceDate ? new Date(i.invoiceDate) : null,
      gross: i.grossTotal ?? 0,
      finalized: i.finalized,
      paid: i.paid,
      isStorno: !!i.correctsInvoiceId,
    }));

    const projectIds = projs.map((p) => p.id);
    const tes = projectIds.length
      ? await remult.repo(TimeEntry).find({ where: { projectId: { $in: projectIds } } })
      : [];
    const openByProject = new Map<string, number>();
    for (const t of tes) {
      if (t.billedInvoiceItemId) continue;
      openByProject.set(t.projectId, (openByProject.get(t.projectId) ?? 0) + (t.hours ?? 0));
    }
    this.projects = projs.map((p) => ({
      id: p.id,
      name: p.name || '—',
      status: p.status,
      openHours: openByProject.get(p.id) ?? 0,
    }));

    if (invs.length && this.modules.isEnabled('products')) {
      const invIds = invs.map((i) => i.id);
      const items = await remult.repo(InvoiceItem).find({ where: { invoiceId: { $in: invIds } } });
      const productIds = Array.from(new Set(items.map((i) => i.productId).filter(Boolean) as string[]));
      const prodMap = new Map<string, Product>();
      if (productIds.length) {
        const prods = await remult.repo(Product).find({ where: { id: { $in: productIds } } });
        prods.forEach((p) => prodMap.set(p.id, p));
      }
      const dateById = new Map<string, Date | null>();
      invs.forEach((i) => dateById.set(i.id, i.invoiceDate ? new Date(i.invoiceDate) : null));

      const agg = new Map<string, { name: string; count: number; lastDate: Date | null }>();
      for (const item of items) {
        if (!item.productId) continue;
        const name = prodMap.get(item.productId)?.name || item.name || '—';
        const date = dateById.get(item.invoiceId) ?? null;
        const existing = agg.get(item.productId) ?? { name, count: 0, lastDate: null };
        existing.count += 1;
        if (date && (!existing.lastDate || date > existing.lastDate)) existing.lastDate = date;
        agg.set(item.productId, existing);
      }
      this.products = Array.from(agg.values()).sort((a, b) => {
        const ta = a.lastDate?.getTime() ?? 0;
        const tb = b.lastDate?.getTime() ?? 0;
        return tb - ta;
      });
    }

    this.loading = false;
  }
}
