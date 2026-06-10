import { Fields, LifecycleEvent, Relations, remult } from 'remult';
import { Base } from './base';
import { OfferItem } from './offer-item';
import { SearchableEntity } from './searchable-entity';
import { NumberRange } from './number-range';
import { auditProxy } from './audit-proxy';

export const offerStatuses = ['draft', 'sent', 'won', 'lost', 'expired'] as const;
export type OfferStatus = (typeof offerStatuses)[number];

export const vatTypes = ['Brutto', 'Netto'] as const;
type VatType = (typeof vatTypes)[number];

/**
 * Dokumenttyp: bestimmt die PDF-Überschrift und semantische Bedeutung.
 *   - 'offer'                — Angebot, unverbindlich, Gültig-bis-Datum
 *   - 'order_confirmation'   — Auftragsbestätigung, verbindlich, Liefer-
 *                              termin statt Gültigkeit, optional Bezug
 *                              zum ursprünglichen Angebot
 *   - 'delivery_note'        — Lieferschein, mit Lieferdatum + Empfangs-
 *                              bestätigungszeile, Preise optional
 */
export const offerKinds = ['offer', 'order_confirmation', 'delivery_note'] as const;
export type OfferKind = (typeof offerKinds)[number];

/**
 * Angebot (Offer). Vor-Stufe zur Rechnung — Kunde bekommt eine
 * unverbindliche Auflistung von Leistungen mit Preis und
 * Gültigkeitsdatum.
 *
 * Status-Flow:
 *   draft → sent → won  → konvertiert in Invoice
 *                → lost (Kunde lehnt ab)
 *                → expired (Gültigkeit überschritten)
 *
 * Angebote sind KEINE §11-UStG-Belege — sie unterliegen nicht der
 * 7-Jahre-Aufbewahrungspflicht und sind nicht festgeschrieben.
 * Werden aber für CRM-Tracking und ggf. Vertragsbeweise aufbewahrt.
 */
@SearchableEntity(Offer, 'offers', {
  allowApiCrud: true,
  searchFields: ['customerId', 'address', 'subject', 'offerNumber', 'reference'],
  saved: async (entity, e) => {
    await auditProxy.log(
      e.isNew ? 'create' : 'update',
      'Offer',
      entity.id,
      { offerNumber: entity.offerNumber, customerId: entity.customerId, status: entity.status },
    );
  },
  deleted: async (entity, e) => {
    await auditProxy.log('delete', 'Offer', entity.id, {
      offerNumber: entity.offerNumber,
    });
    await Offer.onDeleted(entity, e);
  },
  saving: async (entity, event) => {
    if (!entity.offerNumber) {
      entity.sequenceNumber = await entity.createSequenceNumber();
      entity.offerNumber = await entity.createOfferNumber(entity.sequenceNumber);
    }
  },
})
export class Offer extends Base {
  @Fields.number({ includeInApi: false })
  sequenceNumber: number | undefined = undefined;

  @Fields.string({ caption: 'Kunden-ID' })
  customerId = '';

  @Fields.string({ caption: 'Anschrift', inputType: 'multiline' })
  address = '';

  @Fields.string({ caption: 'Betreff' })
  subject = '';

  @Fields.string({ caption: 'Angebots-Nr.' })
  offerNumber = '';

  @Fields.dateOnly({ caption: 'Angebotsdatum' })
  offerDate = new Date();

  @Fields.dateOnly({ caption: 'Gültig bis' })
  validUntil = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  })();

  @Fields.literal(() => offerStatuses, {
    caption: 'Status',
    allowNull: false,
    inputType: 'select-literal',
  })
  status: OfferStatus = 'draft';

  @Fields.literal(() => offerKinds, {
    caption: 'Dokumenttyp',
    allowNull: false,
    inputType: 'select-literal',
  })
  kind: OfferKind = 'offer';

  /** Lieferdatum / Liefertermin — nur relevant für AB und Lieferschein. */
  @Fields.dateOnly({ caption: 'Lieferdatum', allowNull: true })
  deliveryDate: Date | null = null;

  /** Bei Auftragsbestätigung: ID des ursprünglichen Angebots (optional Trace). */
  @Fields.string({ caption: 'Bezug Angebots-ID' })
  sourceOfferId = '';

  @Fields.string({ caption: 'Referenz' })
  reference = '';

  @Fields.string({ caption: 'Kopf-Text', inputType: 'multiline' })
  headerText = '';

  @Fields.string({ caption: 'Fuß-Text', inputType: 'multiline' })
  footerText = '';

  @Fields.literal(() => vatTypes, {
    caption: 'Typ',
    allowNull: true,
    inputType: 'select-literal',
  })
  vatType?: VatType = 'Netto';

  /** Tracking: wenn aus diesem Angebot eine Rechnung erzeugt wurde, hier deren ID. */
  @Fields.string({ caption: 'Konvertiert in Rechnung-ID' })
  convertedInvoiceId = '';

  @Fields.date({ caption: 'Konvertiert am', allowNull: true })
  convertedAt: Date | null = null;

  @Relations.toMany(() => OfferItem, {
    field: 'offerId',
    defaultIncluded: true,
  })
  items?: OfferItem[] = [];

  get displayName() {
    return `${this.offerNumber} ${this.subject}`;
  }

  get netTotal() {
    if (this.vatType === 'Netto') {
      return this.items!.reduce((sum, item) => sum + item.total, 0);
    } else {
      return this.items!.reduce(
        (sum, item) => sum + item.total / (1 + item.vat / 100),
        0,
      );
    }
  }

  get grossTotal() {
    if (this.vatType === 'Brutto') {
      return this.items!.reduce((sum, item) => sum + item.total, 0);
    } else {
      return this.items!.reduce(
        (sum, item) => sum + item.total * (1 + item.vat / 100),
        0,
      );
    }
  }

  get vatTotals(): { vat: number; total: number }[] {
    const map = new Map<number, number>();
    this.items!.forEach((item) => {
      const vat = item.vat;
      const totalVat =
        this.vatType === 'Brutto'
          ? item.total * (vat / (100 + vat))
          : item.total * (vat / 100);
      map.set(vat, (map.get(vat) || 0) + totalVat);
    });
    return Array.from(map.entries()).map(([vat, total]) => ({ vat, total }));
  }

  static async onDeleted(entity: Offer, e: LifecycleEvent<Offer>) {
    await e.relations.items.deleteMany({ where: { offerId: entity.id } });
  }

  async createSequenceNumber() {
    const repo = remult.repo(NumberRange);
    const nr = await repo.findOne({ where: { numberRangeType: 'Angebotsnummern' } });
    const seq = nr!.nextSequenceValue;
    nr!.nextSequenceValue++;
    await repo.save(nr!);
    return seq;
  }

  async createOfferNumber(sequenceNumber: number) {
    const repo = remult.repo(NumberRange);
    const nr = await repo.findOne({ where: { numberRangeType: 'Angebotsnummern' } });
    return nr!.formatSequenceValue(sequenceNumber);
  }
}
