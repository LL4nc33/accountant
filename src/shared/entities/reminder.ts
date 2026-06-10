import { Fields, remult } from 'remult';
import { Base } from './base';
import { SearchableEntity } from './searchable-entity';
import { NumberRange } from './number-range';
import { auditProxy } from './audit-proxy';
import Handlebars from 'handlebars';

export const reminderStages = [1, 2, 3] as const;
export type ReminderStage = (typeof reminderStages)[number];

/**
 * Mahnung zu einer überfälligen Rechnung. Eigenständige Entity mit
 * Fremdschlüssel auf Invoice. Stufen 1-3 nach Marktkonvention; Stufe 2+
 * darf Mahnspesen + Verzugszinsen verlangen (§1333 ABGB, §456 UGB).
 *
 * Keine Festschreibung wie Invoice — Mahnungen sind keine Belege im
 * UStG-Sinn, müssen aber für gerichtliches Mahnverfahren nachweisbar
 * bleiben. Audit-Log + 7-Jahre-Backup decken das ab.
 */
@SearchableEntity(Reminder, 'reminders', {
  allowApiCrud: true,
  searchFields: ['invoiceId', 'reminderNumber'],
  saved: async (entity, e) => {
    await auditProxy.log(
      e.isNew ? 'create' : 'update',
      'Reminder',
      entity.id,
      {
        reminderNumber: entity.reminderNumber,
        stage: entity.stage,
        invoiceId: entity.invoiceId,
        totalDue: entity.totalDue,
      },
    );
  },
  deleted: async (entity) => {
    await auditProxy.log('delete', 'Reminder', entity.id, {
      reminderNumber: entity.reminderNumber,
    });
  },
  saving: async (entity, event) => {
    if (!entity.reminderNumber) {
      entity.sequenceNumber = await entity.createSequenceNumber();
      entity.reminderNumber = await entity.createReminderNumber(entity.sequenceNumber);
    }
  },
})
export class Reminder extends Base {
  @Fields.number({ includeInApi: false })
  sequenceNumber: number | undefined = undefined;

  @Fields.string({ caption: 'Rechnungs-ID' })
  invoiceId = '';

  @Fields.number({ caption: 'Mahnstufe' })
  stage: ReminderStage = 1;

  @Fields.string({ caption: 'Mahnungs-Nr.' })
  reminderNumber = '';

  @Fields.dateOnly({ caption: 'Mahn-Datum' })
  reminderDate = new Date();

  /** Neue Zahlungsfrist die auf der Mahnung gedruckt wird. */
  @Fields.dateOnly({ caption: 'Neue Zahlungsfrist' })
  dueDate = new Date();

  /** Verzugszins-Betrag in EUR vom Original-Fälligkeitsdatum bis reminderDate. */
  @Fields.number({ caption: 'Verzugszinsen €' })
  interestAmount = 0;

  /** Angewendeter Jahres-Zinssatz in % (Snapshot, damit nachvollziehbar). */
  @Fields.number({ caption: 'Zinssatz % p.a.' })
  interestRate = 0;

  /** Mahnspesen (pauschal €40 nach §1333 ABGB ab Stufe 2). */
  @Fields.number({ caption: 'Mahnspesen €' })
  reminderFee = 0;

  /** Rechnungs-Brutto (Snapshot) + Verzugszinsen + Mahnspesen. */
  @Fields.number({ caption: 'Gesamtforderung €' })
  totalDue = 0;

  @Fields.string({ caption: 'Begleittext', inputType: 'multiline' })
  bodyText = '';

  @Fields.boolean({ caption: 'Versendet' })
  sent = false;

  @Fields.date({ caption: 'Versendet am', allowNull: true })
  sentAt: Date | null = null;

  async createSequenceNumber(): Promise<number> {
    const numberRange = await remult
      .repo(NumberRange)
      .findFirst({ numberRangeType: 'Mahnungsnummern' as any });
    if (!numberRange) throw new Error('Nummernkreis „Mahnungsnummern" nicht gefunden');
    const next = numberRange.nextSequenceValue;
    numberRange.nextSequenceValue += 1;
    await remult.repo(NumberRange).save(numberRange);
    return next;
  }

  async createReminderNumber(sequenceNumber: number): Promise<string> {
    const numberRange = await remult
      .repo(NumberRange)
      .findFirst({ numberRangeType: 'Mahnungsnummern' as any });
    if (!numberRange) throw new Error('Nummernkreis „Mahnungsnummern" nicht gefunden');
    const template = Handlebars.compile(numberRange.format);
    const now = new Date();
    return template({
      NUMBER: sequenceNumber,
      YYYY: now.getFullYear(),
      YY: String(now.getFullYear()).slice(-2),
      MM: String(now.getMonth() + 1).padStart(2, '0'),
    });
  }
}
