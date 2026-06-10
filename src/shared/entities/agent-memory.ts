/**
 * Agent-Memory (v0.46.0)
 *
 * Persistentes Langzeitgedächtnis der KI-Agenten — destillierte, langlebige
 * Fakten über Nutzer + Betrieb, die über Konversationen hinweg gelten und in
 * jeden neuen System-Prompt injiziert werden (vgl. openclaw / hermes-agent).
 *
 * Getrennt pro Agent via `agentScope` ('accountant' = Buchhaltungs-Fakten,
 * 'support' = App-/Bedien-Präferenzen). Der Agent schreibt selbst per
 * remember-Tool (auto + auf Ansage); der User sieht + löscht alles in der
 * Memory-UI unter /settings/memory.
 */
import { Entity, Fields } from 'remult';
import { Base } from './base';

export type AgentScope = 'accountant' | 'support';

export const memoryCategories = [
  'Präferenz',
  'Kunde',
  'Betrieb',
  'Steuer',
  'Allgemein',
] as const;

@Entity<AgentMemory>('agent-memory', {
  allowApiCrud: true,
  defaultOrderBy: { createdAt: 'desc' },
})
export class AgentMemory extends Base {
  @Fields.string({ caption: 'Inhalt' })
  content = '';

  @Fields.string({ caption: 'Kategorie' })
  category = 'Allgemein';

  /** 'accountant' | 'support' — getrennte Gedächtnisse pro Agent. */
  @Fields.string({ caption: 'Agent' })
  agentScope: AgentScope = 'accountant';
}
