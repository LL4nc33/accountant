import { Fields, Relations, Validators, remult } from 'remult';
import { Base } from './base';
import { SearchableEntity } from './searchable-entity';
import { Invoice } from './invoice';

export const amountTypes = [
  'Stk',
  'Std',
  'm',
  'm²',
  'm³',
  'kg',
  't',
  'lfm',
  'pauschal',
  'km',
  '%',
  'Tag(e)',
  'L',
] as const;
type AmountType = (typeof amountTypes)[number];

@SearchableEntity(InvoiceItem, 'invoice-items', {
  allowApiCrud: true,
  searchFields: ['invoiceId', 'name', 'description'],
  saving: async (entity, event) => {
    // Wenn die Parent-Rechnung festgeschrieben ist, sind ihre Positionen tabu.
    if (!event.isNew && entity.invoiceId) {
      const parent = await remult.repo(Invoice).findFirst({ id: entity.invoiceId });
      if (parent?.finalized) {
        throw new Error(
          'Diese Position gehört zu einer festgeschriebenen Rechnung (§131 BAO) ' +
          'und kann nicht mehr verändert werden.',
        );
      }
    }
  },
  deleted: async (entity) => {
    if (entity.invoiceId) {
      const parent = await remult.repo(Invoice).findFirst({ id: entity.invoiceId });
      if (parent?.finalized) {
        throw new Error(
          'Positionen einer festgeschriebenen Rechnung können nicht entfernt werden.',
        );
      }
    }
  },
})
/**
 * Represents an invoice entity.
 */
export class InvoiceItem extends Base {
  @Fields.string({ caption: 'Invoice-ID' })
  invoiceId = '';

  @Fields.string({ caption: 'Produkt oder Dienstleistung' })
  name = '';

  @Fields.string({ caption: 'Beschreibung' })
  description = '';

  /**
   * Optional Link auf den Eintrag im Produkt-Katalog, aus dem die Position
   * ursprünglich angelegt wurde. Wird nur für spätere Analytics genutzt;
   * Felder selbst sind denormalisiert, d.h. Preisänderungen am Katalog
   * berühren bestehende Rechnungen nicht.
   */
  @Fields.string({ caption: 'Produkt-ID', allowApiUpdate: true })
  productId = '';

  @Fields.number({ caption: 'Menge' })
  quantity = 1;

  @Fields.literal(() => amountTypes, {
    caption: 'Mengentyp',
    allowNull: true,
    inputType: 'select-literal',
  })
  amountType?: AmountType;

  @Fields.number({ caption: 'Preis' })
  price = 0;

  @Fields.number({ caption: 'USt.' })
  vat = 19;

  @Fields.number({ caption: 'Rabatt' })
  discount = 0;

  @Fields.string({ caption: 'Rabatt-Typ' })
  discountType: '%' | 'Euro' = '%';

  get total() {
    const quantity = this.quantity;
    const price = this.price;
    const discount = this.discount;
    const discountType = this.discountType;
    const discountMultiplier = discountType === '%' ? 1 - discount / 100 : 1;
    const total = quantity * price * discountMultiplier;
    return discountType === '%' ? total : total - discount;
  }
}
