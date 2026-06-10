import { Fields, remult } from 'remult';
import { Base } from './base';
import { SearchableEntity } from './searchable-entity';
import { Offer } from './offer';
import { amountTypes } from './invoice-item';

type AmountType = (typeof amountTypes)[number];

@SearchableEntity(OfferItem, 'offer-items', {
  allowApiCrud: true,
  searchFields: ['offerId', 'name', 'description'],
  saving: async (entity, event) => {
    if (!event.isNew && entity.offerId) {
      const parent = await remult.repo(Offer).findFirst({ id: entity.offerId });
      // won-Angebote sind „eingefroren" — Items dürfen nicht mehr verändert werden,
      // weil sie schon konvertiert wurden.
      if (parent?.status === 'won') {
        throw new Error(
          'Dieses Angebot wurde bereits angenommen und in eine Rechnung konvertiert — ' +
          'Positionen können nicht mehr verändert werden.',
        );
      }
    }
  },
  deleted: async (entity) => {
    if (entity.offerId) {
      const parent = await remult.repo(Offer).findFirst({ id: entity.offerId });
      if (parent?.status === 'won') {
        throw new Error(
          'Positionen eines angenommenen Angebots können nicht entfernt werden.',
        );
      }
    }
  },
})
export class OfferItem extends Base {
  @Fields.string({ caption: 'Offer-ID' })
  offerId = '';

  @Fields.string({ caption: 'Produkt oder Dienstleistung' })
  name = '';

  @Fields.string({ caption: 'Beschreibung' })
  description = '';

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
  vat = 20;

  @Fields.number({ caption: 'Rabatt' })
  discount = 0;

  @Fields.string({ caption: 'Rabatt-Typ' })
  discountType: '%' | 'Euro' = '%';

  get total() {
    const discountMultiplier = this.discountType === '%' ? 1 - this.discount / 100 : 1;
    const t = this.quantity * this.price * discountMultiplier;
    return this.discountType === '%' ? t : t - this.discount;
  }
}
