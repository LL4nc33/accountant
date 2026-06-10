import Handlebars from 'handlebars';
import { Entity, Fields, remult } from 'remult';
import { Base } from './base';

Handlebars.registerHelper('pad', function (arg1, arg2, options) {
  if (options) {
    const minLength = arg1.toString();
    const stringValue = arg2.toString();
    return stringValue.toString().padStart(minLength, '0');
  } else {
    const minLength = 4;
    return arg1.toString().padStart(minLength, '0');
  }
});

export const numberRangeTypes = [
  'Rechnungsnummern',
  'Angebotsnummern',
  'Auftragsnummern',
  'Lieferscheinnummern',
  'Rechnungskorrekturnummern',
  'Mahnungsnummern',
  'Kundennummern',
  'Lieferantennummern',
] as const;
export type NumberRangeType = (typeof numberRangeTypes)[number];

export async function bootstrapNumberRanges() {
  await bootstrapNumberRange('Angebotsnummern', 1, 'AG{{pad 4 NUMBER}}');
  await bootstrapNumberRange('Auftragsnummern', 1, 'AB{{pad 4 NUMBER}}');
  await bootstrapNumberRange('Kundennummern', 10000, '{{NUMBER}}');
  await bootstrapNumberRange('Lieferantennummern', 70000, '{{NUMBER}}');
  await bootstrapNumberRange('Lieferscheinnummern', 1, 'LS{{pad 4 NUMBER}}');
  await bootstrapNumberRange('Mahnungsnummern', 1, 'M{{YY}}{{pad 4 NUMBER}}');
  await bootstrapNumberRange('Rechnungsnummern', 1, '{{pad 4 NUMBER}}');
  await bootstrapNumberRange(
    'Rechnungskorrekturnummern',
    1,
    'GS{{pad 4 NUMBER}}'
  );
}

/**
 * Represents an number range entity.
 */
@Entity('numberrange', {
  allowApiCrud: true,
  saved(entity: NumberRange, e) {
      if (entity?.numberRangeType === 'Kundennummern') {
      }
  },
})
export class NumberRange extends Base {
  /**
   * The type of the number range.
   */
  @Fields.literal(() => numberRangeTypes, {
    caption: 'Typ',
    allowNull: false,
    inputType: 'select-literal',
  })
  numberRangeType?: NumberRangeType;

  /**
   * The next sequence number of the number range.
   */
  @Fields.number({ caption: 'Nächste Sequenznummer' })
  nextSequenceValue = 1;

  /**
   * The format of the number range.
   */
  @Fields.string({
    caption: 'Format',
    validate: [
      (entity: NumberRange) => {
        try {
          entity.formatNextSequenceValue();
        } catch (err) {
          return 'Ungültiges Format';
        }
        return true;
      },
    ],
  })
  format = '';

  formatNextSequenceValue() {
    const template = Handlebars.compile(this.format);

    const variables = this.getFormatVariables(this.nextSequenceValue);
    return template(variables);
  }

  formatSequenceValue(sequenceNumber: number) {
    const template = Handlebars.compile(this.format);

    const variables = this.getFormatVariables(sequenceNumber);
    return template(variables);
  }

  getFormatVariables(sequenceNumber: number) {
    const now = new Date();
    return {
      NUMBER: sequenceNumber,
      YYYY: now.getFullYear(),
      YY: now.getFullYear() % 100,
      MM: (now.getMonth() + 1).toString().padStart(2, '0'),
      M: now.getMonth() + 1,
      DD: now.getDate().toString().padStart(2, '0'),
      D: now.getDate(),
    };
  }
}

async function bootstrapNumberRange(
  numberRangeType: NumberRangeType,
  nextSequenceValue: number,
  format: string
) {
  const repo = remult.repo(NumberRange);
  if (
    !(await repo.findOne({
      where: { numberRangeType: numberRangeType as unknown as NumberRangeType },
    }))
  ) {
    const numberRange = repo.create();
    numberRange.numberRangeType = numberRangeType;
    numberRange.nextSequenceValue = nextSequenceValue;
    numberRange.format = format;
    await repo.save(numberRange);
  }
}
