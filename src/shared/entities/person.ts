import { Fields, LifecycleEvent, Validators } from 'remult';
import { SearchableEntity } from './searchable-entity';
import { Customer } from './customer';
import { auditProxy } from './audit-proxy';

export const salutations = ['Herr', 'Frau', 'divers'] as const;
type SalutationType = (typeof salutations)[number];

@SearchableEntity(Person, 'persons', {
  allowApiCrud: true,
  searchFields: ['firstname', 'lastname', 'customerNumber','position'],
  saved: async (entity, e) => {
    await auditProxy.log(e.isNew ? 'create' : 'update', 'Person', entity.id, {
      firstname: entity.firstname,
      lastname: entity.lastname,
      customerNumber: entity.customerNumber,
    });
  },
  deleted: async (person, e: LifecycleEvent<Person>) => {
    await auditProxy.log('delete', 'Person', person.id, {
      firstname: person.firstname,
      lastname: person.lastname,
    });
    await Customer.onDeleted(person, e as LifecycleEvent<Customer>);
  },
  saving: async (entity, event) => {
      if (!entity.customerNumber) {
        entity.sequenceNumber = await entity.createSequenceNumber();
        entity.customerNumber = await entity.createCustomerNumber(entity.sequenceNumber);
      }
  },
})
/**
 * Represents a person entity.
 */
export class Person extends Customer {

  /**
   * The salutation of the person.
   */
  @Fields.literal(() => salutations, {
    allowNull: true,
    caption: 'Anrede',
    inputType: 'select-literal',
  })
  salutation?: SalutationType;

  /**
   * The title of the person.
   */
  @Fields.string({ caption: 'Titel' })
  title = '';

  /**
   * The first name of the person.
   */
  @Fields.string({ caption: 'Vorname' })
  firstname = '';

  /**
   * The last name of the person.
   */
  @Fields.string({ caption: 'Nachname', validate: [Validators.required('Bitte geben Sie einen Nachnamen ein.')]})
  lastname = '';

  /**
   * The birthdate of the person.
   */
  @Fields.dateOnly({ caption: 'Geburtsdatum' })
  birthdate = new Date();

  /**
   * The name addon of the person.
   */
  @Fields.string({ caption: 'Namenszusatz' })
  nameAddon = '';

  /**
   * The position of the person.
   */
  @Fields.string({ caption: 'Position' })
  position = '';

  get displayName() {
    return this.firstname + ' ' + this.lastname;
  }

  override toString() {
    return this.displayName;
  }

  get customerType() {
    return 'Person';
  }
}
