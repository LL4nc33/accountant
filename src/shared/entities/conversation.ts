import { Fields } from 'remult';
import { Base } from './base';

/**
 * Conversation — persistierter LLM-Chat-Verlauf pro User.
 *
 * V1: Single-Thread per User (eine aktive Conversation). Multi-Thread
 * (Branching, Switch zwischen Themen) ist später möglich.
 *
 * `turns` ist ein JSON-Array. Jedes Element entspricht 1:1 einer
 * OpenAI-kompatiblen Message: {role, content, tool_calls?, tool_call_id?, name?}.
 * Wir speichern nicht das SystemPrompt — das wird beim Senden frisch aus dem
 * aktiven Skill berechnet. Tool-Messages werden mitgespeichert, damit der
 * Verlauf nach Reload nachvollziehbar ist (für Audit + UI-Render).
 *
 * Privacy-Note: turns kann sensible Customer-Daten enthalten. Deshalb
 * allowApiCrud=admin und kein cross-user-Zugriff (Server filtert per userId).
 */
import { SearchableEntity } from './searchable-entity';

@SearchableEntity(Conversation, 'conversations', {
  allowApiCrud: ['admin'],
  searchFields: ['userId', 'title'],
})
export class Conversation extends Base {
  /** Owner — referenz auf User.id. Server filtert hart, kein cross-user-read. */
  @Fields.string({ caption: 'User-ID' })
  userId = '';

  /** Kurz-Label für UI-Liste (optional). Default leer. */
  @Fields.string({ caption: 'Titel' })
  title = '';

  /**
   * Serialisierter Turn-Array als JSON-String. SQLite/better-sqlite3 hat
   * kein natives JSON, daher Stringify/Parse rund um den Save.
   * Format: Array<{role, content, tool_calls?, tool_call_id?, name?}>
   */
  @Fields.string({ caption: 'Turns (JSON)', inputType: 'multiline' })
  turnsJson = '[]';

  /** Anzahl Turns im JSON — Cache, vermeidet Parse für die UI-Liste. */
  @Fields.number({ caption: 'Turn-Anzahl' })
  turnCount = 0;
}
