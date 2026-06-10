import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { Offer, OfferStatus, offerStatuses, OfferKind } from '../../../shared/entities/offer';
import { OfferItem } from '../../../shared/entities/offer-item';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';
import { Address } from '../../../shared/entities/address';
import { Product } from '../../../shared/entities/product';
import { amountTypes } from '../../../shared/entities/invoice-item';

@Component({
  selector: 'app-offer-edit',
  imports: [CommonModule, FormsModule, ClarityModule, RouterLink],
  templateUrl: './offer-edit.component.html',
  styleUrl: './offer-edit.component.scss',
})
export class OfferEditComponent implements OnInit {
  offer?: Offer;
  items: OfferItem[] = [];
  customers: { id: string; name: string; type: string }[] = [];
  products: Product[] = [];
  saving = false;
  isNew = false;
  readonly statuses = offerStatuses;
  readonly amountTypes = amountTypes;

  kindLabel(kind: OfferKind | undefined): string {
    switch (kind) {
      case 'order_confirmation': return 'Auftragsbestätigung';
      case 'delivery_note':      return 'Lieferschein';
      default:                   return 'Angebot';
    }
  }

  kindLabelNew(kind: OfferKind | undefined): string {
    switch (kind) {
      case 'order_confirmation': return 'Neue Auftragsbestätigung';
      case 'delivery_note':      return 'Neuer Lieferschein';
      default:                   return 'Neues Angebot';
    }
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private toastr: ToastrService,
  ) {}

  async ngOnInit() {
    const [persons, companies, products] = await Promise.all([
      remult.repo(Person).find({ where: { archived: false } }),
      remult.repo(Company).find({ where: { archived: false } }),
      remult.repo(Product).find({ where: { archived: false } }),
    ]);
    this.customers = [
      ...persons.map((p) => ({ id: p.id, name: p.displayName, type: 'Person' })),
      ...companies.map((c) => ({ id: c.id, name: c.displayName, type: 'Company' })),
    ].sort((a, b) => a.name.localeCompare(b.name));
    this.products = products;

    const id = this.route.snapshot.paramMap.get('id') ?? 'new';
    if (id === 'new') {
      this.offer = remult.repo(Offer).create();
      this.isNew = true;
    } else {
      const found = await remult.repo(Offer).findFirst({ id });
      if (!found) {
        this.toastr.error('Angebot nicht gefunden');
        this.router.navigate(['/om/offers']);
        return;
      }
      this.offer = found;
      this.items = await remult.repo(OfferItem).find({ where: { offerId: id } });
    }
  }

  get isReadonly(): boolean {
    return this.offer?.status === 'won';
  }

  async onCustomerChange() {
    if (!this.offer?.customerId) return;
    const addrs = await remult.repo(Address).find({ where: { customerId: this.offer.customerId } });
    const billing = addrs.find((a) => a.addressType === 'Rechnungsanschrift') ?? addrs[0];
    if (billing && !this.offer.address) {
      const c = this.customers.find((x) => x.id === this.offer!.customerId);
      const parts = [
        c?.name ?? '',
        billing.street,
        `${billing.zip ?? ''} ${billing.city ?? ''}`.trim(),
        billing.country,
      ].filter(Boolean);
      this.offer.address = parts.join('\n');
    }
  }

  addItem() {
    if (!this.offer) return;
    const item = remult.repo(OfferItem).create();
    item.offerId = this.offer.id;
    item.quantity = 1;
    item.vat = 20;
    this.items.push(item);
  }

  removeItem(idx: number) {
    const item = this.items[idx];
    if (item?.id) {
      // Persistierte Items werden beim Save mit gelöscht via Backend, hier nur UI-Markierung
      (item as any)._deleted = true;
    }
    this.items.splice(idx, 1);
  }

  pickProduct(item: OfferItem, productId: string) {
    const p = this.products.find((x) => x.id === productId);
    if (!p) return;
    item.name = p.name;
    item.description = p.description;
    item.price = p.defaultPrice;
    item.vat = p.defaultVat;
    // Product.unit ist enger als InvoiceItem.amountType — Mapping
    const unitMap: Record<string, string> = { h: 'Std', Stk: 'Stk', Pauschal: 'pauschal', Monat: 'Stk', Jahr: 'Stk', km: 'km' };
    item.amountType = (unitMap[p.unit] ?? 'Stk') as any;
    item.productId = p.id;
  }

  itemTotal(item: OfferItem): number {
    const dm = item.discountType === '%' ? 1 - (item.discount || 0) / 100 : 1;
    const t = item.quantity * item.price * dm;
    return item.discountType === '%' ? t : t - (item.discount || 0);
  }

  get netTotal(): number {
    if (!this.offer) return 0;
    const sum = this.items.reduce((s, it) => s + this.itemTotal(it), 0);
    if (this.offer.vatType === 'Brutto') {
      // Brutto-Modus: items.total ist brutto, netto = sum / (1 + vat/100)
      return this.items.reduce((s, it) => s + this.itemTotal(it) / (1 + (it.vat || 0) / 100), 0);
    }
    return sum;
  }

  get grossTotal(): number {
    if (!this.offer) return 0;
    if (this.offer.vatType === 'Brutto') {
      return this.items.reduce((s, it) => s + this.itemTotal(it), 0);
    }
    return this.items.reduce((s, it) => s + this.itemTotal(it) * (1 + (it.vat || 0) / 100), 0);
  }

  async save() {
    if (!this.offer || this.saving) return;
    this.saving = true;
    try {
      const savedOffer = await remult.repo(Offer).save(this.offer);
      // Items mit offerId verknüpfen + speichern
      for (const item of this.items) {
        item.offerId = savedOffer.id;
        if (!(item as any)._deleted) {
          await remult.repo(OfferItem).save(item);
        } else if (item.id) {
          await remult.repo(OfferItem).delete(item);
        }
      }
      this.toastr.success(`${this.kindLabel(savedOffer.kind)} ${savedOffer.offerNumber} gespeichert`);
      this.router.navigate(['/om/offers']);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }

  openPdf() {
    if (!this.offer?.id) return;
    window.open(`/api/offer/pdf?id=${this.offer.id}`, '_blank');
  }

  setOfferDate(iso: string) {
    if (this.offer && iso) this.offer.offerDate = new Date(iso);
  }
  setValidUntil(iso: string) {
    if (this.offer && iso) this.offer.validUntil = new Date(iso);
  }
  setDeliveryDate(iso: string) {
    if (this.offer) this.offer.deliveryDate = iso ? new Date(iso) : null;
  }

  async convert() {
    if (!this.offer) return;
    if (!confirm('Angebot jetzt in eine Rechnung umwandeln?')) return;
    try {
      const resp = await fetch(`/api/offer/${this.offer.id}/convert`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
      this.toastr.success(`Rechnung ${j.invoiceNumber} erzeugt`);
      this.router.navigate(['/om/invoice', j.invoiceId]);
    } catch (e: any) {
      this.toastr.error(e?.message || 'Konvertierung fehlgeschlagen');
    }
  }
}
