/**
 * Kassabuch-Eintrag (Phase 38, v0.40.0)
 *
 * Chronologisches Journal aller Bareinnahmen und -ausgaben.
 * §131 BAO: zeitnah, vollständig, geordnet, unveränderlich nach Erfassung.
 *
 * Ohne RKSV-Signing: dieses Kassabuch ist NICHT als Registrierkasse im
 * Sinne der RKSV (Registrierkassensicherheitsverordnung) konzipiert.
 * Für Bar-Tagesumsätze > 7.500 €/Jahr ist eine RKSV-konforme Kasse
 * Pflicht — siehe externe Tools (hellocash, Re-7 etc.).
 *
 * Verwendung: für niedrige Bar-Umsätze (Trinkgeld, Auslagen-Erstattung,
 * Kleinbeträge unter der Pflichtgrenze) als rechtssicheres Journal.
 */
import { Entity, Fields } from 'remult';
import { Base } from './base';

export const cashbookCategories = [
  'Bareinnahme Kunde',
  'Trinkgeld',
  'Spesen / Auslagen',
  'Einlage Privat',
  'Entnahme Privat',
  'Kassendifferenz',
  'Sonstiges',
] as const;
export type CashbookCategory = (typeof cashbookCategories)[number];

@Entity<CashbookEntry>('cashbook-entry', {
  allowApiCrud: true,
  defaultOrderBy: { entryDate: 'desc' },
})
export class CashbookEntry extends Base {
  @Fields.dateOnly({ caption: 'Datum' })
  entryDate: Date = new Date();

  @Fields.string({ caption: 'Beleg-Nr.' })
  documentNumber = '';

  @Fields.string({ caption: 'Beschreibung' })
  description = '';

  /**
   * Betrag positiv = Einnahme (Geld kommt rein), negativ = Ausgabe.
   * Brutto-Betrag (inkl. USt wenn anwendbar).
   */
  @Fields.number({ caption: 'Betrag brutto (EUR, +/-)' })
  amount = 0;

  @Fields.literal(() => cashbookCategories, {
    caption: 'Kategorie',
    inputType: 'select-literal',
    allowNull: false,
  })
  category: CashbookCategory = 'Bareinnahme Kunde';

  /**
   * USt-Satz. 0 für umsatzsteuerfreie Vorgänge (Trinkgeld, Privatentnahmen).
   */
  @Fields.number({ caption: 'USt-Satz (%)' })
  vatRate = 0;

  @Fields.string({ caption: 'Bemerkungen', inputType: 'multiline' })
  notes = '';

  /**
   * Optionale Verknüpfung zu einer Rechnung (wenn Bar-Bezahlung)
   * oder Eingangsrechnung (wenn Bar-Beleg).
   */
  @Fields.string({ caption: 'Verknüpfte Rechnung-ID' })
  linkedInvoiceId = '';

  @Fields.string({ caption: 'Verknüpfte Expense-ID' })
  linkedExpenseId = '';

  /**
   * Berechnete Felder.
   */
  get amountNet(): number {
    if (this.vatRate <= 0) return this.amount;
    return Math.round((this.amount / (1 + this.vatRate / 100)) * 100) / 100;
  }
  get vatAmount(): number {
    return Math.round((this.amount - this.amountNet) * 100) / 100;
  }
}
