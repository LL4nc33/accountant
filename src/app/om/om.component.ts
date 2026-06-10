import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  ClarityModule,
  ClrComboboxModule,
  ClrDatagridModule,
  ClrDatagridSortOrder,
  ClrDropdownModule,
} from '@clr/angular';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { Invoice } from '../../shared/entities/invoice';
import { Person } from '../../shared/entities/person';
import { Company } from '../../shared/entities/company';
import { featureFlags } from '../feature-flags';
import { EmptyStateComponent } from '../core/empty-state/empty-state.component';
import { archiveScope } from '../core/archive-filter';

@Component({
  selector: 'app-om',
  imports: [
    CommonModule,
    FormsModule,
    ClarityModule,
    ClrComboboxModule,
    ClrDatagridModule,
    RouterLink,
    ClrDropdownModule,
    TranslateModule,
    EmptyStateComponent,
  ],
  templateUrl: './om.component.html',
  styleUrl: './om.component.scss',
})
export class OmComponent implements OnInit {
  invoiceRepo = remult.repo(Invoice);
  invoices: Invoice[] = [];
  customerNameById = new Map<string, string>();
  featureFlags = featureFlags.omOverview;
  loading = true;
  showArchived = false;
  onlyOpen = false;

  sortOrder: ClrDatagridSortOrder = ClrDatagridSortOrder.DESC;
  constructor(
    private router: Router,
    private translate: TranslateService,
    private toastr: ToastrService
  ) {} // Initialize the 'router', 'translate', and 'toastr' variables

  async ngOnInit() { await this.reload(); }

  async reload() {
    this.loading = true;
    try {
      const where: any = { ...archiveScope(this.showArchived) };
      if (this.onlyOpen) {
        where.paid = false;
        where.correctsInvoiceId = '';
      }
      const invoices = this.featureFlags.includeInvoices
        ? await this.invoiceRepo.find({ where })
        : [];
      this.invoices = [...invoices];
      // Kunde-Auflösung für die „Kunde"-Spalte. Eine Query pro Typ statt N pro Zeile.
      const ids = Array.from(new Set(invoices.map((i) => i.customerId).filter(Boolean)));
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

  copyInvoiceId(id: string) {
    navigator.clipboard.writeText(id);
    this.toastr.success(this.translate.instant('clipboardSuccess'));
  }

  openInvoice(entity: Invoice) {
    this.router.navigateByUrl('/om/invoice/' + entity.id); // Use 'this.router' to navigate
  }
}
