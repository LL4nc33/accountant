import { Entity, Fields } from 'remult';
import { Base } from './base';

/**
 * Cached result of a VIES API check for a given UID. Persisted so repeated
 * checks within ~30 days don't hammer the EU VIES service (which has soft
 * rate limits and occasional outages).
 */
@Entity('vat-id-check', { allowApiCrud: ['admin'] })
export class VatIdCheck extends Base {
  @Fields.string({ caption: 'UID' })
  vatId = '';

  @Fields.date({ caption: 'Geprüft am' })
  checkedAt = new Date();

  @Fields.boolean({ caption: 'Gültig' })
  valid = false;

  @Fields.string({ caption: 'Name laut VIES' })
  returnedName = '';

  @Fields.string({ caption: 'Adresse laut VIES' })
  returnedAddress = '';

  @Fields.string({ caption: 'Raw VIES Response' })
  rawResponse = '';
}
