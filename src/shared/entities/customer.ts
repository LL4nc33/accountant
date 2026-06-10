import { Fields, LifecycleEvent, Relations, Validators, remult } from 'remult';
import { Base } from './base';
import { Address } from './address';
import { NumberRange } from './number-range';
import { validateVatId } from './vat-id';

/**
 * Represents a customer entity.
 */
export abstract class Customer extends Base {
  /**
   * The customer number.
   */
  @Fields.string({ caption: 'Kunden-Nr.', validate: Validators.unique() })
  customerNumber = '';

  /**
   * The sequence number.
   */
  @Fields.number({ includeInApi: false })
  sequenceNumber: number | undefined = undefined;

  /**
   * The addresses associated with the customer.
   */
  @Relations.toMany(() => Address, {
    field: 'customerId',
    defaultIncluded: true,
  })
  addresses?: Address[] = [];

  /**
   * VAT-ID / UID / USt-ID / MWST-Nr. Optional. Format-validated on save against
   * customer's billing-address country, but stored as-entered.
   */
  @Fields.string({
    caption: 'UID / USt-ID / MWST-Nr.',
    validate: [(entity: Customer) => {
      if (!entity.vatId || !entity.vatId.trim()) return;
      const country = entity.addresses?.[0]?.country;
      if (!country) return; // skip if no country yet
      const result = validateVatId(entity.vatId, country);
      if (!result.ok) return result.reason ?? 'Ungültiges UID-Format';
      return;
    }],
  })
  vatId = '';

  /**
   * Timestamp of last successful VIES validation, if any. Null when never checked
   * or last check returned invalid.
   */
  @Fields.date({ caption: 'UID zuletzt VIES-geprüft', allowApiUpdate: ['admin'] })
  vatIdVerifiedAt?: Date;

  /**
   * Name returned by VIES when last validated. Used as audit-trail in PDF footers
   * of Reverse-Charge invoices.
   */
  @Fields.string({ caption: 'UID-Inhaber laut VIES', allowApiUpdate: ['admin'] })
  vatIdVerifiedName = '';

  // Kontaktdetails (Tab 2)
  @Fields.string({ caption: 'E-Mail' })
  email = '';

  @Fields.string({ caption: 'Telefon' })
  phone = '';

  @Fields.string({ caption: 'Mobil' })
  mobile = '';

  @Fields.string({ caption: 'Fax' })
  fax = '';

  @Fields.string({ caption: 'Website' })
  website = '';

  // Zahlungsinformation (Tab 3) — Customer-Bankdaten (für Notfälle/Rückerstattungen)
  @Fields.string({ caption: 'IBAN (Kunde)' })
  iban = '';

  @Fields.string({ caption: 'BIC' })
  bic = '';

  @Fields.string({ caption: 'Bankname' })
  bankName = '';

  // Konditionen (Tab 4)
  @Fields.number({ caption: 'Zahlungsziel (Tage)' })
  paymentTermsDays = 14;

  @Fields.number({ caption: 'Skonto-Satz (%)' })
  discountPercent = 0;

  @Fields.number({ caption: 'Skonto-Frist (Tage)' })
  discountDays = 0;

  @Fields.number({ caption: 'Standard-Stundensatz (€)' })
  defaultHourlyRate = 0;

  // Weiteres (Tab 5) — freier Notiz-Bereich + interne Felder
  @Fields.string({ caption: 'Notizen', inputType: 'multiline' })
  notes = '';

  @Fields.string({ caption: 'Interne Referenz' })
  internalReference = '';

  /**
   * Tags als Semikolon-getrennte Tag.id-Liste (z.B. `id1;id2;id3`).
   * Vermeidet Many-to-Many-Tabelle für v1 — bei klein/mittleren Datenmengen
   * günstiger zu lesen/serialisieren. Die UI splittet beim Anzeigen und joint
   * beim Speichern.
   */
  @Fields.string({ caption: 'Tags' })
  tagIds = '';

  /**
   * Custom Fields als JSON-Object — frei definierbare Key/Value-Paare
   * für Branchen-spezifische Daten („Lieferanten-Konto-Nr.", „Vertragsende",
   * „LinkedIn-Profil", …). Werte werden als String gespeichert; Schema
   * wird vom User über die UI gepflegt, kein zentrales Schema-Management.
   *
   * Format: `{"key1":"value1","key2":"value2"}` — leeres Object `{}` für
   * Neu-Anlage. UI rendert als sortierte Liste von Zeilen.
   */
  @Fields.string({ caption: 'Custom Fields', inputType: 'multiline' })
  customFields = '{}';

  abstract get displayName(): string;

  abstract get customerType(): string;

  static async onDeleted(entity: Customer, e: LifecycleEvent<Customer>) {
    await e.relations.addresses.deleteMany({
      where: { customerId: entity.id },
    });
  }

  async previewCustomerNumber() {
    const repo = remult.repo(NumberRange);
    const numberRange = await repo.findOne({
      where: { numberRangeType: 'Kundennummern' },
    });
    const customerNumber = numberRange!.formatNextSequenceValue();
    return customerNumber;
  }

  async createSequenceNumber() {
    const repo = remult.repo(NumberRange);
    const numberRange = await repo.findOne({
      where: { numberRangeType: 'Kundennummern' },
    });
    const sequenceNumber = numberRange!.nextSequenceValue;
    numberRange!.nextSequenceValue++;
    await repo.save(numberRange!);
    return sequenceNumber;
  }

  async createCustomerNumber(sequenceNumber: number) {
    const repo = remult.repo(NumberRange);
    const numberRange = await repo.findOne({
      where: { numberRangeType: 'Kundennummern' },
    });
    const customerNumber = numberRange!.formatSequenceValue(sequenceNumber);
    return customerNumber;
  }
}
