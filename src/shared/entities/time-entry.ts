import { Entity, Fields } from 'remult';
import { Base } from './base';

@Entity('time-entry', { allowApiCrud: true })
export class TimeEntry extends Base {
  @Fields.string({ caption: 'Projekt-ID' })
  projectId = '';

  @Fields.dateOnly({ caption: 'Datum' })
  date = new Date();

  @Fields.number({ caption: 'Stunden' })
  hours = 0;

  @Fields.string({ caption: 'Beschreibung', inputType: 'multiline' })
  description = '';

  @Fields.number({ caption: 'Stundensatz (€)' })
  hourlyRate = 0;

  @Fields.string({ caption: 'InvoiceItem-ID', allowApiUpdate: ['admin'] })
  billedInvoiceItemId = '';

  get amount(): number { return this.hours * this.hourlyRate; }
}
