import { Fields, LifecycleEvent, Relations, Validators, remult } from 'remult';
import { Base } from './base';
import { InvoiceItem } from './invoice-item';
import { SearchableEntity } from './searchable-entity';
import { NumberRange } from './number-range';
import { Person } from './person';
import { Company } from './company';
import { auditProxy } from './audit-proxy';

export const vatTypes = ['Brutto', 'Netto'] as const;
type VatType = (typeof vatTypes)[number];

@SearchableEntity(Invoice, 'invoices', {
  allowApiCrud: true,
  searchFields: [
    'customerId',
    'address',
    'subject',
    'invoiceNumber',
    'reference',
  ],
  saved: async (entity, e) => {
    await auditProxy.log(
      e.isNew ? 'create' : 'update',
      'Invoice',
      entity.id,
      { invoiceNumber: entity.invoiceNumber, customerId: entity.customerId, subject: entity.subject },
    );
  },
  deleted: async (person, e) => {
    if (person.finalized) {
      throw new Error(
        'Festgeschriebene Rechnungen können nicht gelöscht werden — §132 BAO ' +
        '(7 Jahre Aufbewahrungspflicht). Verwende stattdessen eine Storno-Rechnung.',
      );
    }
    await auditProxy.log('delete', 'Invoice', person.id, {
      invoiceNumber: person.invoiceNumber,
    });
    await Invoice.onDeleted(person, e);
  },
  saving: async (entity, event) => {
    // Festschreibung-Schutz: einmal `finalized=true` werden nur noch
    // dieselben paar Felder zugelassen, alles andere wird abgelehnt.
    if (!event.isNew) {
      const orig = await remult.repo(Invoice).findFirst({ id: entity.id });
      if (orig?.finalized) {
        const allowed: ReadonlyArray<keyof Invoice> = [
          'finalized',
          'finalizedAt',
          'updatedAt',
          // Zahlungs-Status ist eine separate Dimension — eine festgeschriebene
          // Rechnung muss als bezahlt vermerkbar bleiben (sonst gehts nicht).
          'paid',
          'paidAt',
          // Archivieren bleibt unabhängig zugelassen (Aufbewahrung läuft trotzdem).
          'archived',
        ];
        for (const key of Object.keys(entity) as (keyof Invoice)[]) {
          if (allowed.includes(key)) continue;
          if (JSON.stringify((entity as any)[key]) !== JSON.stringify((orig as any)[key])) {
            throw new Error(
              'Diese Rechnung ist festgeschrieben (§131 BAO) und kann inhaltlich ' +
              'nicht mehr geändert werden. Für Korrekturen Storno- oder Korrektur-' +
              'Rechnung anlegen.',
            );
          }
        }
      }
      // Festschreibungs-Validierung: eine Rechnung darf nicht festgeschrieben
      // werden ohne Kunde + ohne mindestens eine Position mit Inhalt.
      // §11 UStG fordert konkrete Angaben — Festschreiben einer leeren Hülle
      // wäre §131-konformer Müll im System.
      if (entity.finalized && !orig?.finalized) {
        if (!entity.customerId) {
          throw new Error(
            'Festschreiben nicht möglich: kein Kunde gewählt. ' +
            '§11 UStG verlangt Name und Anschrift des Empfängers.',
          );
        }
        const { InvoiceItem } = await import('./invoice-item');
        const items = await remult.repo(InvoiceItem).find({
          where: { invoiceId: entity.id },
        });
        const hasContent = items.some(
          (it) => (it.name?.trim() || it.description?.trim()) && it.quantity > 0 && it.price !== 0,
        );
        if (!hasContent) {
          throw new Error(
            'Festschreiben nicht möglich: keine Position mit Bezeichnung und ' +
            'Einzelpreis > 0. Mindestens eine echte Rechnungsposition pflegen.',
          );
        }
      }
      // Setze finalizedAt automatisch wenn finalized erstmals auf true wechselt
      if (entity.finalized && !orig?.finalized && !entity.finalizedAt) {
        entity.finalizedAt = new Date();
        await auditProxy.log('finalize', 'Invoice', entity.id, {
          invoiceNumber: entity.invoiceNumber,
          finalizedAt: entity.finalizedAt,
        });
      }
      // Wenn paid erstmals auf true wechselt: paidAt sicherstellen + immer audit-loggen
      if (entity.paid && !orig?.paid) {
        if (!entity.paidAt) entity.paidAt = new Date();
        await auditProxy.log('paid', 'Invoice', entity.id, {
          invoiceNumber: entity.invoiceNumber,
          paidAt: entity.paidAt,
        });
      }
      // Setze paidAt zurück wenn paid auf false geschoben wird
      if (!entity.paid && orig?.paid) {
        entity.paidAt = null;
      }
    }
    if (!entity.invoiceNumber) {
      entity.sequenceNumber = await entity.createSequenceNumber();
      entity.invoiceNumber = await entity.createInvoiceNumber(
        entity.sequenceNumber
      );
    }
    // Currency-Default: bei neuen Rechnungen Sitz-Land-Default greifen lassen
    // (CH-Sitz → CHF). User kann pro Rechnung übersteuern.
    if (event.isNew && !entity.currency) {
      try {
        const { CompanySettings } = await import('./company-settings');
        const { defaultCurrencyFor } = await import('./currency');
        const settings = await remult.repo(CompanySettings).findFirst();
        entity.currency = defaultCurrencyFor(settings?.country ?? 'AT');
      } catch {
        entity.currency = 'EUR';
      }
    }
    // Snapshot paymentTermsDays + isB2B vom Customer wenn neu (oder wenn
    // Customer wechselt und User die Werte nicht überschrieben hat). So
    // bleiben Mahn-Berechnungen stabil auch wenn Customer.paymentTermsDays
    // später geändert wird (Compliance-Bedenken nach §131 BAO).
    if (event.isNew && entity.customerId) {
      try {
        const person = await remult.repo(Person).findFirst({ id: entity.customerId });
        const company = !person ? await remult.repo(Company).findFirst({ id: entity.customerId }) : null;
        const customer = person ?? company;
        if (customer) {
          if (entity.paymentTermsDays === 14 && (customer as any).paymentTermsDays) {
            entity.paymentTermsDays = (customer as any).paymentTermsDays;
          }
          // Default-Annahme: Companies = B2B, Personen = B2C
          entity.isB2B = customer.customerType === 'Company';
        }
      } catch { /* silent — UI kann später manuell setzen */ }
    }
    // Skonto-Defaults aus CompanySettings übernehmen — nur bei neuer
    // Rechnung und nur wenn User die Werte nicht schon overrided hat.
    if (event.isNew && entity.skontoPercent === 0 && entity.skontoDays === 7) {
      try {
        const { CompanySettings } = await import('./company-settings');
        const settings = await remult.repo(CompanySettings).findFirst();
        if (settings) {
          if (settings.defaultSkontoPercent > 0) {
            entity.skontoPercent = settings.defaultSkontoPercent;
          }
          if (settings.defaultSkontoDays > 0) {
            entity.skontoDays = settings.defaultSkontoDays;
          }
        }
      } catch { /* silent */ }
    }
    if (entity.reverseCharge && !entity.recipientVatId) {
      // Fall back to the customer's stored vatId if present.
      let customerVatId = '';
      if (entity.customerId) {
        const person = await remult
          .repo(Person)
          .findFirst({ id: entity.customerId });
        const company = !person
          ? await remult.repo(Company).findFirst({ id: entity.customerId })
          : null;
        const customer = person ?? company;
        if (customer) customerVatId = customer.vatId || '';
      }
      if (!customerVatId) {
        throw new Error(
          'Reverse-Charge benötigt Empfänger-UID — leer ist §11-widrig'
        );
      }
    }
  },
})
/**
 * Represents an invoice entity.
 */
export class Invoice extends Base {
  /**
   * The sequence number.
   */
  @Fields.number({ includeInApi: false })
  sequenceNumber: number | undefined = undefined;

  /**
   * Festschreibungs-Flag (§131 BAO / GoBD / GeBüV). Einmal `true` wird die
   * Rechnung unveränderlich — Server-Hook lehnt Edits und Deletes ab.
   * Setzt sich automatisch über die UI-Aktion „Festschreiben" auf der
   * Invoice-View-Seite.
   */
  @Fields.boolean({ caption: 'Festgeschrieben' })
  finalized = false;

  /** Zeitpunkt der Festschreibung. Wird vom saving-Hook automatisch gesetzt. */
  @Fields.date({ caption: 'Festgeschrieben am', allowNull: true })
  finalizedAt: Date | null = null;

  /**
   * Verweis auf die Original-Rechnung wenn diese Rechnung eine Storno- oder
   * Korrektur-Rechnung ist. Wird gesetzt beim „Storno anlegen"-Button.
   * Leer bei normaler Rechnung.
   */
  @Fields.string({ caption: 'Storno zu Rechnung-ID' })
  correctsInvoiceId = '';

  /**
   * Zahlungs-Status. `paid=true` wird via UI-Button „Bezahlt markieren"
   * gesetzt; das Datum landet in `paidAt`. Festschreibung-unabhängig — auch
   * eine festgeschriebene Rechnung darf nachträglich als bezahlt vermerkt
   * werden (saving-Hook lässt diese beiden Felder explizit zu).
   */
  @Fields.boolean({ caption: 'Bezahlt' })
  paid = false;

  @Fields.date({ caption: 'Bezahlt am', allowNull: true })
  paidAt: Date | null = null;

  /**
   * The customer ID associated with this invoice.
   */
  @Fields.string({ caption: 'Kunden-ID' })
  customerId = '';

  @Fields.string({ caption: 'Anschrift', inputType: 'multiline' })
  address = '';

  @Fields.string({ caption: 'Betreff' })
  subject = '';

  @Fields.string({ caption: 'Rechnungs-Nr.' })
  invoiceNumber = '';

  @Fields.dateOnly({ caption: 'Rechnungsdatum' })
  invoiceDate = new Date();

  /** Start of the performance period. Empty → falls back to invoiceDate in PDF. */
  @Fields.dateOnly({ caption: 'Leistungsdatum von' })
  performanceDateFrom?: Date;

  /** End of the performance period. Empty + From set → single date; both empty → invoiceDate. */
  @Fields.dateOnly({
    caption: 'Leistungsdatum bis',
    validate: [(entity: Invoice) => {
      if (
        entity.performanceDateFrom &&
        entity.performanceDateTo &&
        entity.performanceDateFrom > entity.performanceDateTo
      ) {
        return 'Leistungsdatum bis muss nach Leistungsdatum von liegen';
      }
      return;
    }],
  })
  performanceDateTo?: Date;

  /**
   * True for Reverse-Charge §3a Abs. 6 UStG (B2B EU service) or Drittland-Leistung
   * (B2B service to non-EU). PDF suppresses USt rows and adds the appropriate
   * legal-text vermerk in the summary block.
   */
  @Fields.boolean({ caption: 'Reverse-Charge / Drittland (kein USt)' })
  reverseCharge = false;

  /**
   * UID of the recipient. Required for Reverse-Charge. PDF prints this when set
   * (regardless of RC, so the >€10k §11 rule is satisfied as a side-effect).
   */
  @Fields.string({ caption: 'Empfänger UID' })
  recipientVatId = '';

  /**
   * Zahlungsziel in Tagen — Snapshot vom Customer beim Anlegen. Bleibt fix,
   * auch wenn Customer.paymentTermsDays später geändert wird. Default 14.
   * Wird in Mahnberechnung für Fälligkeit + Verzugszinsen genutzt.
   */
  @Fields.number({ caption: 'Zahlungsziel (Tage)' })
  paymentTermsDays = 14;

  /**
   * Skonto (Zahlungsabschlag): X % Abzug wenn die Rechnung innerhalb
   * von Y Tagen ab Rechnungsdatum bezahlt wird.
   *
   * Beispiel: skontoPercent=2, skontoDays=7 → „2 % Skonto bei Zahlung
   * innerhalb 7 Tagen". skontoPercent=0 schaltet Skonto komplett aus
   * (Default).
   *
   * Berechnung: Skonto wird auf den Brutto-Gesamtbetrag angewendet —
   * das ist die übliche AT/DE-Konvention (Kunde zieht beim Zahlen
   * direkt vom Brutto ab). Bei USt-pflichtigen Rechnungen ist nach
   * §16 UStG eine entsprechende USt-Korrektur erforderlich; das passiert
   * außerhalb dieser Software über die Korrektur-/Stornorechnung.
   */
  @Fields.number({ caption: 'Skonto-Satz (%)' })
  skontoPercent = 0;

  @Fields.number({ caption: 'Skonto-Frist (Tage)' })
  skontoDays = 7;

  /**
   * Kundenklasse für Verzugszinsen-Berechnung. B2B = §456 UGB (Basiszinssatz
   * + 9,2 %), B2C = §1000 ABGB (4 %). Default true (typische EPU-Klientel).
   * Snapshot — bleibt fix.
   */
  @Fields.boolean({ caption: 'Kunde ist B2B' })
  isB2B = true;

  @Fields.string({ caption: 'Referenz' })
  reference = '';

  @Fields.string({ caption: 'Kopf-Text', inputType: 'multiline' })
  headerText = '';

  @Fields.string({ caption: 'Fuß-Text', inputType: 'multiline' })
  footerText = '';

  @Fields.literal(() => vatTypes, {
    caption: 'Typ',
    allowNull: true,
    inputType: 'select-literal',
  })
  vatType?: VatType = 'Netto';

  /**
   * Währungs-Code nach ISO 4217. Default EUR — kann pro Rechnung auf
   * CHF gestellt werden (für AT-EPUs die Schweizer Kunden haben oder
   * für CH-Sitz-Setup). PDF + XRechnung + Mahnung respektieren das
   * Feld. UVA/BMD aggregieren weiter pro Währung getrennt.
   *
   * Snapshot — bleibt fix auch wenn CompanySettings.country später
   * wechselt. §131 BAO.
   */
  @Fields.string({ caption: 'Währung' })
  currency = 'EUR';

  /**
   * The invoice items associated with the invoice.
   */
  @Relations.toMany(() => InvoiceItem, {
    field: 'invoiceId',
    defaultIncluded: true,
  })
  items?: InvoiceItem[] = [];

  get displayName() {
    return `${this.invoiceNumber} ${this.subject}`;
  }

  get netTotal() {
    if (this.vatType === 'Netto') {
      return this.items!.reduce((sum, item) => sum + item.total, 0);
    } else {
      return this.items!.reduce(
        (sum, item) => sum + item.total / (1 + item.vat / 100),
        0
      );
    }
  }

  get grossTotal() {
    if (this.vatType === 'Brutto') {
      return this.items!.reduce((sum, item) => sum + item.total, 0);
    } else {
      return this.items!.reduce(
        (sum, item) => sum + item.total * (1 + item.vat / 100),
        0
      );
    }
  }

  /**
   * Skonto-Betrag in absoluten Werten. Wird auf den Brutto-Gesamtbetrag
   * angewendet (AT/DE-Konvention). 0 wenn skontoPercent=0.
   */
  get skontoAmount(): number {
    if (!this.skontoPercent || this.skontoPercent <= 0) return 0;
    return Math.round(this.grossTotal * (this.skontoPercent / 100) * 100) / 100;
  }

  /**
   * Brutto-Gesamtbetrag abzüglich Skonto (= was der Kunde tatsächlich
   * überweist, wenn er Skonto zieht).
   */
  get grossTotalWithSkonto(): number {
    return Math.round((this.grossTotal - this.skontoAmount) * 100) / 100;
  }

  /**
   * Skonto-Frist als absolutes Datum (invoiceDate + skontoDays).
   * Null wenn kein Skonto aktiv.
   */
  get skontoDeadline(): Date | null {
    if (!this.skontoPercent || this.skontoPercent <= 0 || !this.invoiceDate) return null;
    const d = new Date(this.invoiceDate);
    d.setDate(d.getDate() + (this.skontoDays || 0));
    return d;
  }

  get vatTotals(): { vat: number; total: number }[] {
    const vatTotals = new Map<number, number>();
    this.items!.forEach((item) => {
      const vat = item.vat;
      let total;
      if (this.vatType === 'Brutto') {
        total = item.total * (vat / (100 + vat));
      } else {
        total = item.total * (vat / 100);
      }
      vatTotals.set(vat, (vatTotals.get(vat) || 0) + total);
    });
    return Array.from(vatTotals.entries()).map(([vat, total]) => ({
      vat,
      total,
    }));
  }

  static async onDeleted(entity: Invoice, e: LifecycleEvent<Invoice>) {
    await e.relations.items.deleteMany({
      where: { invoiceId: entity.id },
    });
  }

  async previewInvoiceNumber() {
    const repo = remult.repo(NumberRange);
    const numberRange = await repo.findOne({
      where: { numberRangeType: 'Rechnungsnummern' },
    });
    const invoiceNumber = numberRange!.formatNextSequenceValue();
    return invoiceNumber;
  }

  async createSequenceNumber() {
    const repo = remult.repo(NumberRange);
    const numberRange = await repo.findOne({
      where: { numberRangeType: 'Rechnungsnummern' },
    });
    const sequenceNumber = numberRange!.nextSequenceValue;
    numberRange!.nextSequenceValue++;
    await repo.save(numberRange!);
    return sequenceNumber;
  }

  async createInvoiceNumber(sequenceNumber: number) {
    const repo = remult.repo(NumberRange);
    const numberRange = await repo.findOne({
      where: { numberRangeType: 'Rechnungsnummern' },
    });
    const invoiceNumber = numberRange!.formatSequenceValue(sequenceNumber);
    return invoiceNumber;
  }
}
