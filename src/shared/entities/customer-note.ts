import { Fields } from 'remult';
import { Base } from './base';
import { SearchableEntity } from './searchable-entity';
import { auditProxy } from './audit-proxy';

export const customerNoteKinds = ['note', 'call', 'meeting', 'email', 'visit'] as const;
export type CustomerNoteKind = (typeof customerNoteKinds)[number];

/**
 * CustomerNote — Activity-Timeline-Eintrag pro Customer.
 *
 * Verwendung: jede Interaktion mit dem Kunden, die nicht direkt aus einer
 * Rechnung/Mahnung/Bank-Tx hervorgeht — z.B. Telefonate, Vor-Ort-Termine,
 * E-Mail-Erinnerungen, einfache Notizen. Wird auf Person+Company-View als
 * chronologische Timeline angezeigt.
 *
 * `occurredAt` ist der Anlasszeitpunkt (vom User editierbar — z.B. wenn
 * du eine Note über ein gestriges Telefonat nachträglich anlegst).
 * `createdAt` aus Base ist der Eingabe-Zeitpunkt — bleibt fix.
 */
@SearchableEntity(CustomerNote, 'customer-notes', {
  allowApiCrud: true,
  searchFields: ['customerId', 'title', 'body', 'kind'],
  saved: async (entity, e) => {
    await auditProxy.log(
      e.isNew ? 'create' : 'update',
      'CustomerNote',
      entity.id,
      {
        customerId: entity.customerId,
        kind: entity.kind,
        title: entity.title,
      },
    );
  },
  deleted: async (entity) => {
    await auditProxy.log('delete', 'CustomerNote', entity.id, {
      customerId: entity.customerId,
      title: entity.title,
    });
  },
})
export class CustomerNote extends Base {
  @Fields.string({ caption: 'Kunden-ID' })
  customerId = '';

  @Fields.literal(() => customerNoteKinds, {
    caption: 'Art',
    allowNull: false,
    inputType: 'select-literal',
  })
  kind: CustomerNoteKind = 'note';

  @Fields.string({ caption: 'Titel' })
  title = '';

  @Fields.string({ caption: 'Beschreibung', inputType: 'multiline' })
  body = '';

  @Fields.date({ caption: 'Anlasszeitpunkt' })
  occurredAt: Date = new Date();
}
