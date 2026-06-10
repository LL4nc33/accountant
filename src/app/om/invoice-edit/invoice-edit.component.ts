import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ClarityModule,
  ClrButtonGroupModule,
  ClrCheckboxModule,
  ClrComboboxModule,
  ClrFormsModule,
  ClrTabsModule,
} from '@clr/angular';
import { TranslateModule } from '@ngx-translate/core'; // Import TranslateModule
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { Invoice } from '../../../shared/entities/invoice';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';
import { Address } from '../../../shared/entities/address';
import { CompanySettings } from '../../../shared/entities/company-settings';
import { isEU, countryName } from '../../../shared/entities/country';
import { AutofieldComponent } from '../../core/autofield/autofield.component';
import { EditComponent } from '../../core/edit/edit.component';
import { InvoiceItemEditComponent } from '../invoice-item/invoice-item-edit.component';

interface CustomerOption {
  id: string;
  label: string;
  type: 'person' | 'company';
}

@Component({
  selector: 'app-invoice-editor',
  imports: [
    CommonModule,
    FormsModule,
    ClrFormsModule,
    ClarityModule,
    ClrCheckboxModule,
    ClrComboboxModule,
    AutofieldComponent,
    RouterLink,
    ClrTabsModule,
    ClrButtonGroupModule,
    InvoiceItemEditComponent,
    TranslateModule, // Add TranslateModule to imports
  ],
  templateUrl: './invoice-edit.component.html',
  styleUrl: './invoice-edit.component.scss',
})
export class InvoiceEditComponent extends EditComponent<Invoice> {
  repo = remult.repo(Invoice);
  override rootPath = '/om/invoice/';

  previewInvoiceNumber: string = '';
  rcSuggestion = '';

  customers: CustomerOption[] = [];
  selectedCustomer: CustomerOption | null = null;

  constructor(router: Router, private toastr: ToastrService, private route: ActivatedRoute) {
    super(router);
    this.returnWithEntityId = true;
  }

  protected override async saveChanges() {
    const wasNew = !this.entity?.id;
    try {
      await super.saveChanges();
      this.toastr.success(
        wasNew
          ? `Rechnung ${this.entity?.invoiceNumber ?? ''} erstellt`
          : `Rechnung ${this.entity?.invoiceNumber ?? ''} gespeichert`,
      );
    } catch (err: any) {
      this.toastr.error(err?.message ?? err?.toString() ?? 'Speichern fehlgeschlagen');
    }
  }

  setVatType(vatType: 'Netto' | 'Brutto') {
    this.entity!.vatType = vatType;
  }

  // clrDate expects `string | Date | null`, but the entity stores `Date | undefined`.
  // These bridges keep the entity model intact while satisfying the directive's type.
  get performanceDateFrom(): Date | null {
    return this.entity?.performanceDateFrom ?? null;
  }
  set performanceDateFrom(v: Date | null) {
    if (this.entity) this.entity.performanceDateFrom = v ?? undefined;
  }

  get performanceDateTo(): Date | null {
    return this.entity?.performanceDateTo ?? null;
  }
  set performanceDateTo(v: Date | null) {
    if (this.entity) this.entity.performanceDateTo = v ?? undefined;
  }

  acceptRcSuggestion() {
    if (this.entity) this.entity.reverseCharge = true;
    this.rcSuggestion = '';
  }

  private async maybeSuggestReverseCharge(): Promise<void> {
    if (!this.entity?.customerId || this.entity.reverseCharge) {
      this.rcSuggestion = '';
      return;
    }
    const me = await remult.repo(CompanySettings).findFirst();
    if (!me) return;
    const personRepo = remult.repo(Person);
    const companyRepo = remult.repo(Company);
    const addressRepo = remult.repo(Address);
    const customer =
      (await personRepo.findFirst({ id: this.entity.customerId })) ??
      (await companyRepo.findFirst({ id: this.entity.customerId }));
    if (!customer) return;
    const addresses = await addressRepo.find({
      where: { customerId: customer.id },
    });
    if (addresses.length === 0) return;
    const billing =
      addresses.find((a) => a.addressType === 'Rechnungsanschrift') ??
      addresses[0];
    const cc = billing.country;
    if (!cc || cc === me.country) {
      this.rcSuggestion = '';
      return;
    }
    if (!(customer as any).vatId) {
      this.rcSuggestion = '';
      return;
    }
    if (isEU(cc)) {
      this.rcSuggestion = `Customer ist in ${countryName(cc)} (EU mit UID) — als Reverse-Charge §3a Abs. 6 UStG buchen?`;
      if (!this.entity.recipientVatId)
        this.entity.recipientVatId = (customer as any).vatId;
    } else {
      this.rcSuggestion = `Customer ist in ${countryName(cc)} (Drittland) — als nicht-steuerbare Leistung buchen?`;
      if (!this.entity.recipientVatId)
        this.entity.recipientVatId = (customer as any).vatId;
    }
  }

  /**
   * Loads all Persons + Companies into a flat picker-friendly list.
   * Sorted alphabetically by label for human-friendly browsing.
   */
  async loadCustomers(): Promise<void> {
    // Archivierte filtern: nicht mehr im Picker zur Auswahl.
    const [persons, companies] = await Promise.all([
      remult.repo(Person).find({ where: { archived: false } }),
      remult.repo(Company).find({ where: { archived: false } }),
    ]);
    this.customers = [
      ...persons.map<CustomerOption>((p) => ({
        id: p.id,
        label: `${p.displayName}${
          p.customerNumber ? ` (Person ${p.customerNumber})` : ''
        }`,
        type: 'person',
      })),
      ...companies.map<CustomerOption>((c) => ({
        id: c.id,
        label: `${c.displayName}${
          c.customerNumber ? ` (Firma ${c.customerNumber})` : ''
        }`,
        type: 'company',
      })),
    ].sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Triggered when the user picks a customer in the combobox.
   * Sets invoice.customerId, composes a default address block from the
   * customer's billing address (Rechnungsanschrift preferred, else first),
   * and re-evaluates the reverse-charge suggestion.
   *
   * The composed address overwrites any prior `entity.address` value — the
   * field remains user-editable afterwards, so manual tweaks are preserved
   * across the save.
   */
  async onCustomerSelected(selection: CustomerOption | null): Promise<void> {
    if (!this.entity) return;
    this.selectedCustomer = selection;
    if (!selection) {
      this.entity.customerId = '';
      this.rcSuggestion = '';
      return;
    }
    this.entity.customerId = selection.id;
    const customer =
      (await remult.repo(Person).findFirst({ id: selection.id })) ??
      (await remult.repo(Company).findFirst({ id: selection.id }));
    if (!customer) return;
    const addresses = await remult
      .repo(Address)
      .find({ where: { customerId: selection.id } });
    const billing =
      addresses.find((a) => a.addressType === 'Rechnungsanschrift') ??
      addresses[0];
    const lines: string[] = [customer.displayName];
    if (billing) {
      if (billing.street) lines.push(billing.street);
      const zipCity = `${billing.zip ?? ''} ${billing.city ?? ''}`.trim();
      if (zipCity) lines.push(zipCity);
      if (billing.country) lines.push(countryName(billing.country));
    }
    this.entity.address = lines.join('\n');
    await this.maybeSuggestReverseCharge();
  }

  override async ngOnInit(): Promise<void> {
    await super.ngOnInit();
    if (this.entity?.items?.length == 0) {
      await this.createRelationItem('items');
    }
    this.repo.relations(this.entity!);
    this.previewInvoiceNumber = await this.entity!.previewInvoiceNumber();
    await this.loadCustomers();

    // Convenience: ?customerId=... pre-selects the customer (e.g. when
    // coming from Customer-360's "Neue Rechnung"-Button).
    if (this.entity && !this.entity.customerId) {
      const preselect = this.route.snapshot.queryParamMap.get('customerId');
      if (preselect) {
        const match = this.customers.find((c) => c.id === preselect);
        if (match) {
          await this.onCustomerSelected(match);
        }
      }
    }

    if (this.entity?.customerId) {
      this.selectedCustomer =
        this.customers.find((c) => c.id === this.entity!.customerId) ?? null;
    }
    await this.maybeSuggestReverseCharge();
  }
}
