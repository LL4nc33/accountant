import { Fields } from 'remult';
import { Base } from './base';
import { SearchableEntity } from './searchable-entity';
import { auditProxy } from './audit-proxy';

export const expenseCategories = [
  'Wareneinkauf',
  'Büromaterial',
  'Software / Lizenzen',
  'Hardware',
  'Miete',
  'Telefon / Internet',
  'Reisekosten',
  'Bewirtung',
  'Werbung',
  'Versicherungen',
  'Steuerberatung',
  'Bank / Gebühren',
  'Sonstiges',
] as const;
export type ExpenseCategory = (typeof expenseCategories)[number];

export const expensePaymentStatuses = ['offen', 'bezahlt'] as const;
export type ExpensePaymentStatus = (typeof expensePaymentStatuses)[number];

/**
 * Eingangsrechnungen / Ausgaben. Fundament für Einnahmen-Ausgaben-Rechnung,
 * Vorsteuer-Abzug, Finanzamt-Jahres-Export. MVP-Variante: ohne Beleg-File-
 * Anhang (kommt mit OCR-Phase später), ohne Bankabgleich (kommt mit
 * CAMT.053-Phase).
 *
 * §132 BAO: 7 Jahre Aufbewahrungspflicht — Hard-Delete wird im Server-Hook
 * blockiert wenn `archived=false`. Archive-Workflow analog Invoice.
 */
@SearchableEntity(Expense, 'expenses', {
  allowApiCrud: true,
  searchFields: ['vendor', 'reference', 'description'],
  saved: async (entity, e) => {
    await auditProxy.log(e.isNew ? 'create' : 'update', 'Expense', entity.id, {
      vendor: entity.vendor,
      date: entity.date,
      grossTotal: entity.grossTotal,
      category: entity.category,
    });
  },
  deleted: async (entity) => {
    if (!entity.archived) {
      throw new Error(
        'Eingangsrechnungen können nicht direkt hart gelöscht werden — ' +
        'erst archivieren (§132 BAO Aufbewahrungspflicht 7 Jahre).',
      );
    }
    await auditProxy.log('delete', 'Expense', entity.id, {
      vendor: entity.vendor,
      grossTotal: entity.grossTotal,
    });
  },
})
export class Expense extends Base {
  @Fields.dateOnly({ caption: 'Beleg-Datum' })
  date = new Date();

  @Fields.string({ caption: 'Lieferant / Vendor' })
  vendor = '';

  @Fields.string({ caption: 'Belegnummer / Referenz' })
  reference = '';

  @Fields.string({ caption: 'Beschreibung', inputType: 'multiline' })
  description = '';

  @Fields.literal(() => expenseCategories, {
    caption: 'Kategorie',
    inputType: 'select-literal',
  })
  category: ExpenseCategory = 'Sonstiges';

  @Fields.number({ caption: 'Betrag netto' })
  netTotal = 0;

  @Fields.number({ caption: 'USt-Satz (%)' })
  vatRate = 20;

  /**
   * Brutto-Betrag. Wird beim Speichern aus netTotal + vatRate berechnet,
   * kann aber manuell überschrieben werden (z.B. bei Belegen ohne klare
   * Netto-/Brutto-Trennung oder bei Rundungs-Korrekturen).
   */
  @Fields.number({ caption: 'Betrag brutto' })
  grossTotal = 0;

  @Fields.literal(() => expensePaymentStatuses, {
    caption: 'Status',
    inputType: 'select-literal',
  })
  paymentStatus: ExpensePaymentStatus = 'offen';

  /** Paperless-ngx Document-ID — Backlink zum Original-Beleg-Scan.
   *  Wenn gesetzt, zeigt die UI einen „Beleg ansehen"-Link auf Paperless. */
  @Fields.string({ caption: 'Paperless-Document-ID' })
  paperlessDocId = '';

  @Fields.dateOnly({ caption: 'Bezahlt am', allowNull: true })
  paidAt: Date | null = null;

  /** Vorsteuer (entspricht beim Vollunternehmer dem absetzbaren Anteil). */
  get vatAmount(): number {
    return this.grossTotal - this.netTotal;
  }
}
