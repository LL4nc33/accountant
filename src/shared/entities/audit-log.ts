import { Entity, Fields } from 'remult';

export const auditOperations = ['create', 'update', 'delete', 'finalize', 'paid'] as const;
export type AuditOperation = (typeof auditOperations)[number];

/**
 * Append-only Audit-Trail. Wird durch Lifecycle-Hooks der Domain-Entities
 * (Invoice, InvoiceItem, Customer, Project, Product) befüllt. Read nur
 * für Admins, kein Update, kein Delete — sonst ist der Schutz nur scheinbar.
 *
 * Fundament für §131 BAO (AT) / §146 AO (DE) / GeBüV Art. 958f (CH).
 */
@Entity('audit-log', {
  allowApiRead: ['admin'],
  allowApiInsert: false,
  allowApiUpdate: false,
  allowApiDelete: false,
})
export class AuditLog {
  @Fields.cuid()
  id!: string;

  @Fields.date({ caption: 'Zeitpunkt' })
  timestamp = new Date();

  @Fields.string({ caption: 'User-ID' })
  userId = '';

  @Fields.string({ caption: 'User-Name' })
  userName = '';

  @Fields.string({ caption: 'Operation' })
  operation: AuditOperation = 'update';

  @Fields.string({ caption: 'Entity-Typ' })
  entityType = '';

  @Fields.string({ caption: 'Entity-ID' })
  entityId = '';

  /** JSON-serialisierte Änderungen oder Snapshot. Multiline für die UI. */
  @Fields.string({ caption: 'Diff', inputType: 'multiline' })
  diff = '';
}
