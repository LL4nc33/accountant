import { Fields, Relations, Validators } from 'remult';
import { Base } from './base';
import { SearchableEntity } from './searchable-entity';
import { Customer } from './customer';
import { CountryCode } from './country';

export const addressTypes = [
  'Arbeit',
  'Privat',
  'Rechnungsanschrift',
  'Lieferanschrift',
  'Abholanschrift',
] as const;
type AddressType = (typeof addressTypes)[number];

@SearchableEntity(Address, 'addresses', {
  allowApiCrud: true,
  searchFields: ['street', 'zip', 'city', 'country'],
})
/**
 * Represents an address entity.
 */
export class Address extends Base {
  /**
   * The customer ID associated with the address.
   */
  @Fields.string({ caption: 'Kunden-ID' })
  customerId = '';

  /**
   * The street of the address.
   */
  @Fields.string({ caption: 'Straße' })
  street = '';

  /**
   * The ZIP code of the address.
   */
  @Fields.string({ caption: 'PLZ' })
  zip = '';

  /**
   * The city of the address.
   */
  @Fields.string({ caption: 'Stadt' })
  city = '';

  /**
   * The country of the address (ISO-3166-1 alpha-2 code, e.g. AT, DE, CH).
   * Empty means unset. Used by the tax-logic to decide Reverse-Charge / Drittland.
   */
  @Fields.string({ caption: 'Land' })
  country = '';

  /**
   * The type of the address.
   */
  @Fields.literal(() => addressTypes, {
    caption: 'Typ',
    allowNull: true,
    inputType: 'select-literal',
  })
  addressType?: AddressType;
}
