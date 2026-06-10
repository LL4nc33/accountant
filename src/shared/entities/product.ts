import { Fields } from 'remult';
import { Base } from './base';
import { SearchableEntity } from './searchable-entity';
import { auditProxy } from './audit-proxy';

export const productUnits = ['h', 'Stk', 'Pauschal', 'Monat', 'Jahr', 'km'] as const;
export type ProductUnit = typeof productUnits[number];

/**
 * Stammdaten für wiederkehrende Rechnungs-Positionen. Bei der Position-
 * Bearbeitung wählt der User ein Produkt aus dem Katalog → Name,
 * Beschreibung, Preis und USt werden vorbefüllt. Alles bleibt pro
 * Rechnung überschreibbar.
 */
@SearchableEntity(Product, 'products', {
  allowApiCrud: true,
  searchFields: ['name', 'description'],
  saved: async (entity, e) => {
    await auditProxy.log(e.isNew ? 'create' : 'update', 'Product', entity.id, {
      name: entity.name,
      defaultPrice: entity.defaultPrice,
    });
  },
  deleted: async (entity) => {
    await auditProxy.log('delete', 'Product', entity.id, { name: entity.name });
  },
})
export class Product extends Base {
  @Fields.string({
    caption: 'Name',
    validate: [(entity: Product) => {
      if (!entity.name?.trim()) throw 'Name ist Pflicht';
    }],
  })
  name = '';

  @Fields.string({ caption: 'Beschreibung', inputType: 'multiline' })
  description = '';

  @Fields.literal(() => productUnits, {
    caption: 'Einheit',
    inputType: 'select-literal',
  })
  unit: ProductUnit = 'Stk';

  @Fields.number({ caption: 'Standard-Preis (netto)' })
  defaultPrice = 0;

  @Fields.number({ caption: 'Standard-USt-Satz (%)' })
  defaultVat = 20;
}
