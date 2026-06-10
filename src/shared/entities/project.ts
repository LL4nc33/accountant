import { Entity, Fields } from 'remult';
import { Base } from './base';
import { auditProxy } from './audit-proxy';

export const projectStatuses = ['active', 'closed'] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

@Entity<Project>('project', {
  allowApiCrud: true,
  saved: async (entity, e) => {
    await auditProxy.log(e.isNew ? 'create' : 'update', 'Project', entity.id, {
      name: entity.name,
      customerId: entity.customerId,
      status: entity.status,
    });
  },
  deleted: async (entity) => {
    await auditProxy.log('delete', 'Project', entity.id, { name: entity.name });
  },
})
export class Project extends Base {
  @Fields.string({ caption: 'Kunden-ID' })
  customerId = '';

  @Fields.string({ caption: 'Projektname' })
  name = '';

  @Fields.string({ caption: 'Beschreibung', inputType: 'multiline' })
  description = '';

  @Fields.literal(() => projectStatuses, {
    caption: 'Status',
    allowNull: false,
    inputType: 'select-literal',
  })
  status: ProjectStatus = 'active';

  @Fields.number({ caption: 'Stundensatz (€)' })
  hourlyRate = 0;

  get displayName() { return this.name; }
}
