import { remult } from 'remult';
import { AuditLog, AuditOperation } from '../shared/entities/audit-log';
import { auditProxy } from '../shared/entities/audit-proxy';

/**
 * Im Server-Start einmalig auf den echten Writer zeigen lassen.
 * Verdrahtet aus `src/server/index.ts` (oder hier am Modul-Ende).
 */
auditProxy.log = logAudit;

/**
 * Schreibt einen Audit-Eintrag. Wird aus den `saved`/`deleted`-Hooks der
 * Domain-Entities aufgerufen. Schlägt das Schreiben fehl, wird der Fehler
 * geloggt — wir wollen aber den eigentlichen Save nicht zurückrollen, weil
 * der Audit-Log eine Nachsorge ist, nicht eine Vorbedingung für die Domain-Op.
 *
 * Limit: Wir nutzen `remult.repo(AuditLog).insert()`. Da AuditLog
 * `allowApiInsert: false` hat, müssen wir mit einer System-Identität schreiben.
 * Der `remult.user` ist bei Server-Hooks gesetzt — Remult prüft die ACL
 * server-side aber unter dem Hook ist `remult.user` vorhanden und die
 * Insert läuft als Backend-Operation (nicht via API), also kein Conflict.
 */
export async function logAudit(
  operation: AuditOperation,
  entityType: string,
  entityId: string,
  diff: unknown,
): Promise<void> {
  const user = remult.user;
  try {
    const entry = new AuditLog();
    entry.timestamp = new Date();
    entry.userId = user?.id ?? 'system';
    entry.userName = user?.name ?? 'system';
    entry.operation = operation;
    entry.entityType = entityType;
    entry.entityId = entityId;
    entry.diff = safeStringify(diff);
    // Wir nutzen .insert() statt .save() weil .save() bei Entities ohne
    // @Fields.cuid()-Decorator anders behandelt wird. AuditLog hat cuid.
    await remult.repo(AuditLog).insert(entry);
  } catch (e) {
    console.error('[audit] Eintrag konnte nicht geschrieben werden:', e);
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => {
      if (v instanceof Date) return v.toISOString();
      return v;
    });
  } catch {
    return '<unserializable>';
  }
}

/**
 * Reduziert ein Entity-Objekt auf die geänderten Felder gegenüber einem
 * Original. Hilft beim Loggen kompakter Diffs statt voller Snapshots.
 */
export function computeDiff(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  if (!before) {
    // Create: gesamte Felder als „to" loggen
    for (const [key, value] of Object.entries(after)) {
      if (value !== undefined) diff[key] = { from: null, to: value };
    }
    return diff;
  }
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const fromVal = before[key];
    const toVal = after[key];
    if (JSON.stringify(fromVal) !== JSON.stringify(toVal)) {
      diff[key] = { from: fromVal, to: toVal };
    }
  }
  return diff;
}
