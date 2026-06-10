import { Entity, Fields } from 'remult';
import { Base } from './base';
import { auditProxy } from './audit-proxy';

export const recurringIntervals = ['monatlich', 'quartalsweise', 'halbjährlich', 'jährlich'] as const;
export type RecurringInterval = (typeof recurringIntervals)[number];

/**
 * Definition einer wiederkehrenden Rechnung. Verweist auf eine Template-
 * Rechnung (mit Items), die Server-side im Background-Loop in Kopien
 * vervielfältigt wird wenn `nextRunDate` erreicht ist. Die Kopien sind
 * normale Invoice-Entries (Entwurf) — der User reviewt und schreibt selbst fest.
 *
 * Pattern: gleiche Mechanik wie der Duplicate-Endpoint, nur automatisiert.
 */
@Entity<RecurringInvoice>('recurring-invoice', {
  allowApiCrud: true,
  saved: async (entity, e) => {
    await auditProxy.log(e.isNew ? 'create' : 'update', 'RecurringInvoice', entity.id, {
      title: entity.title,
      interval: entity.interval,
      nextRunDate: entity.nextRunDate,
      active: entity.active,
    });
  },
  deleted: async (entity) => {
    await auditProxy.log('delete', 'RecurringInvoice', entity.id, { title: entity.title });
  },
})
export class RecurringInvoice extends Base {
  @Fields.string({ caption: 'Bezeichnung (intern)' })
  title = '';

  /** Template-Rechnung deren Items kopiert werden. */
  @Fields.string({ caption: 'Vorlage-Rechnungs-ID' })
  templateInvoiceId = '';

  @Fields.literal(() => recurringIntervals, {
    caption: 'Intervall',
    inputType: 'select-literal',
  })
  interval: RecurringInterval = 'monatlich';

  @Fields.dateOnly({ caption: 'Nächste Ausführung' })
  nextRunDate = new Date();

  @Fields.dateOnly({ caption: 'Letzte Ausführung', allowNull: true })
  lastRunDate: Date | null = null;

  @Fields.boolean({ caption: 'Aktiv' })
  active = true;
}
