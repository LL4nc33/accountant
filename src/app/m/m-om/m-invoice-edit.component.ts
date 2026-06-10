import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { Invoice } from '../../../shared/entities/invoice';
import { InvoiceItem } from '../../../shared/entities/invoice-item';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';
import { Address } from '../../../shared/entities/address';
import { MFormSectionComponent } from '../m-core/m-form-section.component';
import { MFormModalComponent } from '../m-core/m-form-modal.component';
import { MCardComponent } from '../m-core/m-card.component';

interface CustomerOption { id: string; label: string }

@Component({
  selector: 'm-invoice-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, MFormSectionComponent, MFormModalComponent, MCardComponent],
  templateUrl: './m-invoice-edit.component.html',
  styleUrls: ['../m-expenses/m-expense-edit.component.scss', './m-invoice-edit.component.scss'],
})
export class MInvoiceEditComponent implements OnInit {
  @Input() id!: string;
  loading = true;
  saving = false;
  isNew = false;
  entity!: Invoice;
  items: InvoiceItem[] = [];
  customers: CustomerOption[] = [];
  dateStr = '';

  // Item-Modal
  showItemModal = false;
  editingItem: InvoiceItem | null = null;
  editingIsNew = false;

  constructor(
    private router: Router,
    private toastr: ToastrService,
    private route: ActivatedRoute,
  ) {}

  async ngOnInit() {
    if (this.id === 'new') {
      this.isNew = true;
      this.entity = remult.repo(Invoice).create();
      this.entity.invoiceDate = new Date();
      this.dateStr = new Date().toISOString().substring(0, 10);
      this.entity.vatType = 'Netto';
      const preselect = this.route.snapshot.queryParamMap.get('customerId');
      if (preselect) {
        this.entity.customerId = preselect;
        // Mobile-Variant lädt Adresse onCustomerChange/loadAddress später
      }
    } else {
      const found = await remult.repo(Invoice).findFirst({ id: this.id });
      if (!found) {
        this.toastr.error('Rechnung nicht gefunden');
        this.router.navigate(['/m/invoices']);
        return;
      }
      this.entity = found;
      if (this.entity.finalized) {
        this.toastr.warning('Festgeschrieben — nicht bearbeitbar');
        this.router.navigate(['/m/invoice', this.entity.id]);
        return;
      }
      if (this.entity.invoiceDate) this.dateStr = new Date(this.entity.invoiceDate).toISOString().substring(0, 10);
      this.items = await remult.repo(InvoiceItem).find({ where: { invoiceId: this.entity.id } });
    }

    const [persons, companies] = await Promise.all([
      remult.repo(Person).find({ where: { archived: false } }),
      remult.repo(Company).find({ where: { archived: false } }),
    ]);
    this.customers = [
      ...persons.map((p) => ({ id: p.id, label: `${p.firstname ?? ''} ${p.lastname ?? ''}`.trim() || '—' })),
      ...companies.map((c) => ({ id: c.id, label: c.name ?? '—' })),
    ].sort((a, b) => a.label.localeCompare(b.label));

    this.loading = false;
  }

  async onCustomerChange() {
    if (!this.entity.customerId) return;
    const addrs = await remult.repo(Address).find({ where: { customerId: this.entity.customerId } });
    const main = addrs[0];
    if (main && !this.entity.address) {
      this.entity.address = `${main.street ?? ''}\n${main.zip ?? ''} ${main.city ?? ''}\n${main.country ?? ''}`.trim();
    }
  }

  get netTotal(): number {
    return this.items.reduce((s, i) => s + (i.quantity ?? 0) * (i.price ?? 0), 0);
  }
  get grossTotal(): number {
    return this.items.reduce((s, i) => s + (i.quantity ?? 0) * (i.price ?? 0) * (1 + (i.vat ?? 0) / 100), 0);
  }

  openNewItem() {
    this.editingItem = remult.repo(InvoiceItem).create();
    this.editingItem.quantity = 1;
    this.editingItem.vat = 20;
    this.editingIsNew = true;
    this.showItemModal = true;
  }

  openItem(item: InvoiceItem) {
    this.editingItem = item;
    this.editingIsNew = false;
    this.showItemModal = true;
  }

  async saveItem() {
    if (!this.editingItem || !this.entity) return;
    // Wenn Invoice neu, müssen wir sie erst speichern um eine ID zu bekommen
    if (!this.entity.id) {
      this.entity = await remult.repo(Invoice).save(this.entity);
    }
    this.editingItem.invoiceId = this.entity.id;
    const saved = await remult.repo(InvoiceItem).save(this.editingItem);
    if (this.editingIsNew) {
      this.items = [...this.items, saved];
    } else {
      this.items = this.items.map((i) => i.id === saved.id ? saved : i);
    }
    this.showItemModal = false;
    this.editingItem = null;
  }

  async deleteItem(item: InvoiceItem) {
    if (!confirm(`Position „${item.name}" löschen?`)) return;
    await remult.repo(InvoiceItem).delete(item.id);
    this.items = this.items.filter((i) => i.id !== item.id);
    this.showItemModal = false;
    this.editingItem = null;
  }

  async save() {
    this.saving = true;
    try {
      if (this.dateStr) this.entity.invoiceDate = new Date(this.dateStr);
      this.entity = await remult.repo(Invoice).save(this.entity);
      this.toastr.success(this.isNew ? 'Rechnung angelegt' : 'Rechnung gespeichert');
      this.router.navigate(['/m/invoice', this.entity.id]);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }

  cancel() {
    this.router.navigate(this.isNew ? ['/m/invoices'] : ['/m/invoice', this.entity.id]);
  }
}
