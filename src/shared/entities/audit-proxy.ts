/**
 * Audit-Proxy: isomorpher Hook-Hub. Im Client sind die Funktionen No-Ops,
 * im Server überschreibt `src/server/audit.ts` sie mit echten DB-Writes.
 *
 * Gleiches Pattern wie `searchProxy` in `searchable-entity.ts`.
 */
import type { AuditOperation } from './audit-log';

export const auditProxy = {
  log: async (
    _operation: AuditOperation,
    _entityType: string,
    _entityId: string,
    _diff: unknown,
  ): Promise<void> => {
    /* no-op im Client */
  },
};
