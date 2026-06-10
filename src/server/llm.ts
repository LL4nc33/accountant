import express from 'express';
import { remult } from 'remult';
import { api } from './api';
import { CompanySettings } from '../shared/entities/company-settings';
import { Person } from '../shared/entities/person';
import { Company } from '../shared/entities/company';
import { Invoice } from '../shared/entities/invoice';
import { InvoiceItem, amountTypes } from '../shared/entities/invoice-item';
import { Project } from '../shared/entities/project';
import { TimeEntry } from '../shared/entities/time-entry';
import { Expense, expenseCategories } from '../shared/entities/expense';
import { Address } from '../shared/entities/address';
import { AgentMemory } from '../shared/entities/agent-memory';
import { bootstrapAgentSkills, loadSkills, quickRouteByTrigger, loadAgent, renderTemplate, Skill } from './agent-loader';

bootstrapAgentSkills();

// ───────────────────────────────────────────────────────────────────────
// Agent-Memory: persistentes Langzeitgedächtnis, getrennt pro Agent.
// Beide Agenten bekommen remember/forget; ihre Memories werden in den
// System-Prompt injiziert (vgl. openclaw/hermes).
// ───────────────────────────────────────────────────────────────────────

const MEMORY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'remember',
      description: 'Merke dir einen langlebigen Fakt über den Nutzer oder Betrieb für künftige Gespräche. Nutze das, wenn du eine dauerhafte Präferenz/Gewohnheit/wichtige Tatsache lernst ODER wenn der User „merk dir …" sagt. Keine flüchtigen Details, nur was über das aktuelle Gespräch hinaus relevant ist.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Der Fakt, knapp formuliert. z.B. "Standard-Stundensatz Beratung ist 90 €".' },
          category: { type: 'string', description: 'Eine von: Präferenz, Kunde, Betrieb, Steuer, Allgemein' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'forget',
      description: 'Vergiss einen gemerkten Fakt anhand seiner ID (siehe [id:…] im Memory-Block).',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
];

async function loadAgentMemories(scope: string): Promise<AgentMemory[]> {
  try {
    return await remult.repo(AgentMemory).find({
      where: { agentScope: scope, archived: false } as any,
      orderBy: { createdAt: 'desc' } as any,
      limit: 100,
    });
  } catch {
    return [];
  }
}

/** Baut den Memory-Block für den System-Prompt (mit IDs fürs Vergessen). */
function renderMemoryBlock(memories: AgentMemory[]): string {
  let block = `\n\n═══ DEIN LANGZEITGEDÄCHTNIS ═══\nDu hast ein persistentes Gedächtnis. Lernst du eine dauerhafte Tatsache/Präferenz über Nutzer oder Betrieb, ODER sagt der User „merk dir …" → nutze remember. Veraltetes löschst du mit forget(id). Erwähne das Merken beiläufig, mach kein Theater draus.`;
  if (memories.length) {
    block += `\n\nWAS DU DIR BEREITS GEMERKT HAST:\n` +
      memories.map((m) => `- [id:${m.id}] [${m.category}] ${m.content}`).join('\n');
  }
  return block;
}

async function execMemoryTool(name: string, args: any, scope: string): Promise<any> {
  if (name === 'remember') {
    const content = String(args?.content ?? '').trim();
    if (!content) return { error: 'content fehlt' };
    const cat = String(args?.category ?? 'Allgemein').trim() || 'Allgemein';
    const m = remult.repo(AgentMemory).create();
    m.content = content;
    m.category = cat;
    m.agentScope = (scope === 'support' ? 'support' : 'accountant');
    await remult.repo(AgentMemory).save(m);
    return { ok: true, remembered: content };
  }
  if (name === 'forget') {
    const id = String(args?.id ?? '').trim();
    if (!id) return { error: 'id fehlt' };
    try {
      const m = await remult.repo(AgentMemory).findId(id);
      if (m) await remult.repo(AgentMemory).delete(m);
      return { ok: true };
    } catch (e: any) {
      return { error: e?.message ?? 'forget fehlgeschlagen' };
    }
  }
  return { error: `Unbekanntes Memory-Tool: ${name}` };
}

function formatDateDe(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

/**
 * LLM-Bridge — spricht jede OpenAI-kompatible Inference-API
 * (llama.cpp `llama-server`, Ollama, LM Studio, vLLM, LocalAI, Hosted).
 *
 * Endpunkte:
 *   GET  /api/llm/ping     — testet Connection + listet Modelle vom Backend
 *   POST /api/llm/chat     — Multi-Turn-Chat mit Tool-Use-Loop
 *
 * Tools sind read-only (v0.8.0-a). Write-Tools kommen in v0.8.0-b mit
 * Confirm-Modal vor jedem Schreibvorgang.
 */
export const llm = express.Router();

llm.use(express.json({ limit: '1mb' }));

// ───────────────────────────────────────────────────────────────────────
// Tool-Definitionen (OpenAI Tool-Format)
// ───────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'find_customer',
      description: 'Sucht einen KUNDEN (Person/Firma) anhand des NAMENS, der E-Mail oder Kundennummer. NUR zur Kundensuche, wenn ein konkreter Kundenname genannt ist. NICHT verwenden für Rechnungs-Status (offen/bezahlt/überfällig) — dafür get_outstanding bzw. list_invoices. Der query muss ein Name sein, kein Wort wie „offen" oder „Rechnung".',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Kundenname (Teil davon), E-Mail oder Kundennummer — KEINE Status-Wörter wie „offen"/„unbezahlt"' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_invoices',
      description: 'Listet Rechnungen, optional gefiltert nach Kunde, Status (paid/unpaid/overdue/draft) oder Jahr. Default: letzte 20 Einträge absteigend nach Datum.',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'string', description: 'Kunden-ID aus find_customer' },
          status: { type: 'string', enum: ['paid', 'unpaid', 'overdue', 'draft', 'all'], description: 'Filter nach Status' },
          year: { type: 'number', description: 'Filter nach Jahr (z.B. 2026)' },
          limit: { type: 'number', description: 'Max. Treffer (Default 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_outstanding',
      description: 'DAS Tool für „welche Rechnungen sind (noch) offen", „Außenstände", „was schuldet man mir", „offene/unbezahlte Rechnungen", „überfällige Rechnungen". Gibt alle offenen (nicht bezahlten, festgeschriebenen) Rechnungen zurück mit Summe, ältestes/jüngstes Datum, Anzahl überfälliger. Kein Argument nötig.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'summarize_year',
      description: 'Aggregiert ein Jahr: Brutto-Umsatz, Anzahl Rechnungen, Top-5-Kunden nach Umsatz, Summe Ausgaben (falls aktiviert), Saldo.',
      parameters: {
        type: 'object',
        properties: {
          year: { type: 'number', description: 'Jahr (z.B. 2026). Default: aktuelles Jahr.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_period_summary',
      description: 'Einnahmen, Ausgaben, Saldo und Rechnungsanzahl fuer einen BESTIMMTEN Zeitraum: Monat (period "2026-05"), Quartal (period "2026-Q2") oder Jahr (period "2026"). DAS Tool fuer „wieviel hab ich diesen monat/quartal eingenommen/gemacht", „saldo im mai", „einnahmen maerz". Fuer Jahres-Auswertung MIT Top-Kunden nutze stattdessen summarize_year.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'YYYY-MM (Monat), YYYY-Qn (Quartal) oder YYYY (Jahr). Fuer „diesen monat" das heutige Datum aus dem Prompt nutzen.' },
        },
        required: ['period'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_expense_breakdown',
      description: 'Ausgaben nach Kategorie aufgeschluesselt fuer einen Zeitraum. DAS Tool fuer „wofuer geb ich am meisten aus", „ausgaben nach kategorie", „groesster kostenblock". Default: aktuelles Jahr.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'YYYY, YYYY-Qn oder YYYY-MM. Default aktuelles Jahr.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_detail',
      description: 'Komplette 360-Grad-Uebersicht zu EINEM Kunden: Stammdaten, Gesamtumsatz, offener Betrag, Anzahl Rechnungen, aktive Projekte, letzte Notiz. DAS Tool fuer „alles ueber Kunde X", „wie steht X bei mir", „kundenakte X". Argument: Name oder Teil davon.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Kundenname oder Teil davon' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_invoice_detail',
      description: 'Details zu EINER bestimmten Rechnung anhand ihrer Nummer: Kunde, Datum, Faelligkeit, Betrag (netto/brutto), Status (bezahlt/offen/Entwurf), Betreff. Fuer „zeig mir rechnung 0029", „was steht auf rechnung X".',
      parameters: {
        type: 'object',
        properties: { number: { type: 'string', description: 'Rechnungsnummer (z.B. „0029" oder „2026-0029")' } },
        required: ['number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_offers',
      description: 'Listet Angebote, optional gefiltert nach Status (offen=sent, angenommen=won, abgelehnt=lost, entwurf=draft, abgelaufen=expired). Fuer „welche angebote sind offen", „meine angebote", „angenommene angebote".',
      parameters: {
        type: 'object',
        properties: { status: { type: 'string', description: 'optional: offen/sent, angenommen/won, abgelehnt/lost, entwurf/draft, abgelaufen/expired' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_bank_status',
      description: 'Status des Bank-Abgleichs: wie viele Umsaetze noch nicht zugeordnet (offen) sind, Summe Eingang/Ausgang. Fuer „was ist noch nicht zugeordnet", „bank-abgleich status", „offene buchungen".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_assets',
      description: 'Listet das Anlagenverzeichnis (Wirtschaftsgueter): Name, Kategorie, Anschaffungskosten, Nutzungsdauer/GWG. Fuer „meine anlagen", „anlagenverzeichnis", „afa", „abschreibungen".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_travel',
      description: 'Listet Reisekosten (Dienstreisen) mit Ziel, Zweck, Datum, Betrag. Optional nach Zeitraum (period YYYY / YYYY-Qn / YYYY-MM). Fuer „reisekosten heuer", „meine dienstreisen", „diaeten".',
      parameters: {
        type: 'object',
        properties: { period: { type: 'string', description: 'optional YYYY, YYYY-Qn oder YYYY-MM' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_unbilled_time',
      description: 'Noch nicht abgerechnete (unverrechnete) Zeitbuchungen je Projekt: Stunden + abrechenbarer Betrag (Satz: Eintrag → Projekt → Default). Fuer „wie viel kann ich noch abrechnen", „unverrechnete stunden", „offene leistungen".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_capabilities',
      description: 'Erklaert dem User was der Assistent alles kann und weiss. Fuer „was kannst du", „was kannst du alles", „wobei kannst du helfen", „was geht".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_invoices',
      description: 'Listet ALLE Rechnungen EINES Kunden mit Nummer, Datum, Brutto, Status (offen/bezahlt/ueberfaellig). Fuer „rechnungen von Kunde X", „was hab ich X gestellt/verrechnet". Argument: Kundenname.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Kundenname oder Teil davon' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_open_payables',
      description: 'Offene Eingangsrechnungen/Ausgaben, die DU noch zahlen musst (Gegenstueck zu get_outstanding). Summe + groesste Posten. Fuer „was muss ich noch zahlen", „offene ausgaben", „was schulde ich", „meine verbindlichkeiten". (NICHT fuer Finanzamt/USt — dafuer get_uva.)',
      parameters: { type: 'object', properties: {} },
    },
  },

  // ── Write-Tools — erzeugen NUR Proposals, kein DB-Schreiben.
  //    Der User bestätigt im UI explizit, dann erfolgt der Write
  //    via POST /api/llm/execute mit Audit-Log-Eintrag (source='llm').
  {
    type: 'function',
    function: {
      name: 'draft_invoice',
      description: 'Erstellt einen RECHNUNGS-ENTWURF (nicht festgeschrieben, nicht gespeichert). Gibt einen Vorschlag zurück, den der User im UI bestätigen muss bevor er angelegt wird. Nutze find_customer um die customerId zu finden.',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'string', description: 'Kunden-ID (aus find_customer)' },
          subject: { type: 'string', description: 'Betreff der Rechnung' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Positions-Bezeichnung' },
                description: { type: 'string', description: 'Optionale Detail-Beschreibung' },
                quantity: { type: 'number', description: 'Menge' },
                amountType: { type: 'string', enum: [...amountTypes], description: 'Einheit (Stk, Std, m, m², m³, kg, …)' },
                price: { type: 'number', description: 'Einzelpreis netto in EUR' },
              },
              required: ['name', 'quantity', 'price'],
            },
            description: 'Mindestens eine Position',
          },
        },
        required: ['customerId', 'items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_time_entry',
      description: 'Erstellt einen ZEITBUCHUNGS-ENTWURF (noch nicht gespeichert). Gibt einen Vorschlag zurück, den der User bestätigen muss. Nutze find_customer + list_projects falls projectId unklar.',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Projekt-ID' },
          hours: { type: 'number', description: 'Stunden (z.B. 2.5)' },
          date: { type: 'string', description: 'Datum YYYY-MM-DD (Default: heute)' },
          description: { type: 'string', description: 'Was wurde gearbeitet' },
        },
        required: ['projectId', 'hours'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_expense',
      description: 'Erstellt einen AUSGABEN-ENTWURF (noch nicht gespeichert). Gibt einen Vorschlag zurück, den der User bestätigen muss.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Beleg-Datum YYYY-MM-DD' },
          netTotal: { type: 'number', description: 'Netto-Betrag in EUR' },
          vatRate: { type: 'number', description: 'USt-Satz (0, 10, 13, 20)' },
          category: { type: 'string', enum: [...expenseCategories], description: 'Kategorie' },
          vendor: { type: 'string', description: 'Lieferant / Vendor' },
          description: { type: 'string', description: 'Beschreibung' },
        },
        required: ['netTotal', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_projects',
      description: 'Listet aktive Projekte. Nutze das wenn der User „buch Stunden auf Projekt X" sagt und du die projectId brauchst.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Optionaler Filter auf Projekt-Name' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_expenses',
      description: 'Listet Ausgaben (Eingangsrechnungen), optional gefiltert nach Jahr, Monat oder Kategorie. Default: aktuelles Jahr, alle Kategorien, max. 20 Treffer.',
      parameters: {
        type: 'object',
        properties: {
          year: { type: 'number', description: 'Jahr (z.B. 2026)' },
          month: { type: 'number', description: 'Monat 1-12' },
          category: { type: 'string', description: 'Kategorie-Filter (genauer String)' },
          limit: { type: 'number', description: 'Max. Treffer (Default 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_recurring',
      description: 'Listet wiederkehrende Rechnungs-Vorlagen mit Intervall + nächster Ausführung.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_uva',
      description: 'USt-Voranmeldung-Aggregation für einen Zeitraum. Liefert die UVA-Kennzahlen (000/022/029/006/011/017/060) + Zahllast oder Gutschrift. Nutze das bei Fragen wie „wie viel USt für Mai", „Zahllast Q2 2026", „UVA-Werte für 2025".',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            description: 'Zeitraum: YYYY-MM (Monat), YYYY-Q1..Q4 (Quartal) oder YYYY (Jahr). Beispiel: „2026-05" oder „2026-Q2" oder „2025".',
          },
        },
        required: ['period'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_reminders',
      description: 'Listet Mahnungen (Entwürfe + versendete) mit Stufe, Mahnstand-Tage, Gesamtforderung. Nutze bei Fragen wie „welche Mahnungen sind offen", „wer steht auf Stufe 3", „aktuelle Mahnstand-Übersicht".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_reminder',
      description: 'Erstellt einen MAHNUNGS-ENTWURF für eine überfällige Rechnung. Liefert einen Vorschlag mit berechneten Verzugszinsen + Mahnspesen, den der User bestätigen muss. Die Rechnung muss bereits festgeschrieben und überfällig sein.',
      parameters: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string', description: 'Rechnungs-ID (aus list_invoices oder find_customer → list_invoices)' },
          stage: { type: 'number', enum: [1, 2, 3], description: 'Mahnstufe 1 (Erinnerung), 2 (Mahnung), 3 (Letzte Mahnung). Default: nächste freie Stufe für diese Rechnung.' },
        },
        required: ['invoiceId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'count_entities',
      description: 'Zählt Entitäten im System. Nutze das bei Fragen wie „wie viele Kunden habe ich", „wieviele Rechnungen", „Anzahl Projekte". Liefert pro Entity die Gesamtzahl + Aufschlüsselung.',
      parameters: {
        type: 'object',
        properties: {
          what: {
            type: 'string',
            enum: ['customers', 'invoices', 'projects', 'expenses', 'all'],
            description: 'Welche Entity zählen. „customers" = Personen + Firmen. „all" = alles zusammen.',
          },
          includeArchived: {
            type: 'boolean',
            description: 'Archivierte mitzählen (Default: nein)',
          },
        },
        required: ['what'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_person',
      description: 'Erstellt einen PERSONEN-KUNDEN-ENTWURF (Privatperson oder Einzelperson). Gibt einen Vorschlag zurück, den der User bestätigen muss. Adresse optional inline mitgeben.',
      parameters: {
        type: 'object',
        properties: {
          firstname: { type: 'string', description: 'Vorname' },
          lastname: { type: 'string', description: 'Nachname' },
          salutation: { type: 'string', enum: ['Herr', 'Frau'], description: 'Anrede (optional)' },
          email: { type: 'string' },
          phone: { type: 'string' },
          vatId: { type: 'string', description: 'UID, falls vorhanden' },
          street: { type: 'string', description: 'Straße + Hausnummer' },
          zip: { type: 'string', description: 'PLZ' },
          city: { type: 'string', description: 'Stadt' },
          country: { type: 'string', enum: ['AT', 'DE', 'CH'], description: 'ISO-Country-Code (Default AT)' },
        },
        required: ['firstname', 'lastname'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_company',
      description: 'Erstellt einen FIRMEN-KUNDEN-ENTWURF (GmbH, OG, e.U., …). Gibt einen Vorschlag zurück, den der User bestätigen muss. Adresse optional inline.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Firmenname' },
          nameAddon: { type: 'string', description: 'Rechtsform / Zusatz: e.U., GmbH, OG, KG, …' },
          email: { type: 'string' },
          phone: { type: 'string' },
          vatId: { type: 'string', description: 'UID' },
          street: { type: 'string' },
          zip: { type: 'string' },
          city: { type: 'string' },
          country: { type: 'string', enum: ['AT', 'DE', 'CH'] },
        },
        required: ['name'],
      },
    },
  },
];

// ───────────────────────────────────────────────────────────────────────
// Support-Agent: kennt die APP (Navigation + Einstellungen), nicht die Buchhaltung.
// ───────────────────────────────────────────────────────────────────────

/** Whitelist der Settings, die der Support-Agent setzen darf. Pro Key der
 *  Typ + ein menschenlesbares Label. Alles andere lehnt update_setting ab. */
const SUPPORT_SETTABLE: Record<string, { type: 'boolean' | 'string' | 'number'; label: string; enum?: string[] }> = {
  isKleinunternehmer: { type: 'boolean', label: 'Kleinunternehmer-Status (§6 Abs. 1 Z 27 UStG)' },
  country: { type: 'string', label: 'Land', enum: ['AT', 'DE', 'CH'] },
  defaultSkontoPercent: { type: 'number', label: 'Standard-Skonto-Satz (%)' },
  defaultSkontoDays: { type: 'number', label: 'Standard-Skonto-Frist (Tage)' },
  daysUntilFirstReminder: { type: 'number', label: 'Tage bis 1. Mahnung' },
  daysBetweenReminders: { type: 'number', label: 'Tage zwischen Mahnungen' },
  defaultReminderFee: { type: 'number', label: 'Mahnspesen ab Stufe 2 (€)' },
  defaultInterestRateB2B: { type: 'number', label: 'Verzugszinssatz B2B (% p.a.)' },
  defaultInterestRateB2C: { type: 'number', label: 'Verzugszinssatz B2C (% p.a.)' },
  defaultHourlyRate: { type: 'number', label: 'Standard-Stundensatz (€)' },
  svsStartYear: { type: 'number', label: 'Erstes Selbständigkeits-Jahr (SVS-Vorschau)' },
  // Modul-Toggles
  moduleProjects: { type: 'boolean', label: 'Modul Projekte + Zeiterfassung' },
  moduleProducts: { type: 'boolean', label: 'Modul Produkt-Katalog' },
  moduleExpenses: { type: 'boolean', label: 'Modul Ausgaben' },
  moduleReminder: { type: 'boolean', label: 'Modul Mahnwesen' },
  moduleSvs: { type: 'boolean', label: 'Modul SVS-Vorschau' },
  moduleEst: { type: 'boolean', label: 'Modul ESt-Vorschau' },
  moduleAssets: { type: 'boolean', label: 'Modul Anlagenverzeichnis' },
  moduleTravel: { type: 'boolean', label: 'Modul Reisekosten' },
  moduleCashbook: { type: 'boolean', label: 'Modul Kassabuch' },
  moduleTaxExport: { type: 'boolean', label: 'Modul Finanzamt-Export' },
  moduleWorkHours: { type: 'boolean', label: 'Modul Eigene Arbeitszeit' },
  // moduleLlm bewusst NICHT setzbar — sonst könnte der Assistent sich selbst abschalten.
};

const SUPPORT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'navigate_to',
      description: 'Navigiert den User direkt zu einer Seite der App. Nutze das wenn der User irgendwo hin will oder du ihm zeigst wo etwas eingestellt wird.',
      parameters: {
        type: 'object',
        properties: {
          route: { type: 'string', description: 'Pfad, z.B. /settings/company, /om/invoice, /crm/overview, /settings/module, /assets, /svs' },
          label: { type: 'string', description: 'Kurzes Label wohin es geht, z.B. "Firmen-Einstellungen"' },
        },
        required: ['route', 'label'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_setting',
      description: 'Ändert eine App-Einstellung. Nur erlaubte Keys. Je nach Berechtigung wird der Wert direkt gesetzt, als Vorschlag angeboten oder abgelehnt (dann erklärst du dem User den manuellen Weg).',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Setting-Key, z.B. isKleinunternehmer, country, moduleReminder, defaultSkontoPercent' },
          value: { description: 'Neuer Wert (boolean, string oder Zahl je nach Key)' },
        },
        required: ['key', 'value'],
      },
    },
  },
];

function buildSupportSystemPrompt(settings: CompanySettings | null, permission: string): string {
  const today = new Date();
  const todayIso = today.toISOString().substring(0, 10);
  const permLine =
    permission === 'auto'
      ? 'Du DARFST Einstellungen direkt ändern (update_setting setzt sofort). Sei trotzdem vorsichtig bei isKleinunternehmer (wirkt auf alle Rechnungen) — frag im Zweifel kurz nach.'
      : permission === 'confirm'
        ? 'Du darfst Änderungen VORSCHLAGEN — update_setting erzeugt eine Bestätigungs-Karte, der User bestätigt selbst.'
        : 'Du darfst Einstellungen NICHT ändern. update_setting wird abgelehnt — erkläre dem User stattdessen Schritt für Schritt, wo er es selbst einstellt, und navigiere ihn mit navigate_to hin.';

  return `Du bist der SUPPORT-AGENT von accountant — einer Buchhaltungs-Software (DACH, primär Österreich).
Heute ist ${todayIso}.

Deine Rolle: Du kennst die APP selbst. Du hilfst dem User sich zurechtzufinden — wo Dinge eingestellt werden, wie Features funktionieren, wie der Workflow geht. Du bist NICHT der Buchhalter (für „schreib eine Rechnung", „wie viele Kunden" → sag dem User, er soll oben auf „Buchhalter" umschalten).

Sprache: Deutsch, du-Form, knapp und freundlich. Format: Markdown.

BERECHTIGUNG: ${permLine}

═══ APP-STRUKTUR (Routen für navigate_to — erfinde keine IDs, nutze Listen-Routen) ═══
- / — Dashboard (KPIs, Tab „Analyse") · /analytics — Auswertungen (Vollansicht)
- /crm/overview — Kunden (Personen + Firmen)
- /om/invoice — Rechnungen · /om/offers — Angebote · /reminders — Mahnungen
- /pm/overview — Projekte · /pm/time-entries — Zeitbuchungen · /work-time — Eigene Arbeitszeit
- /products — Produkte · /expenses — Ausgaben · /recurring — Wiederkehrend
- /assets — Anlagen · /travel — Reisekosten · /cashbook — Kassabuch
- /at-tax/uva — USt-Voranmeldung · /at-tax/zm — Zusammenfassende Meldung
- /svs — SVS-Vorschau · /est — ESt-Vorschau
- /at-tax/bmd-export — BMD-Export (Steuerberater) · /admin/tax-export — Finanzamt-Jahres-ZIP
- /bank/abgleich — Bank-Abgleich · /admin/audit-log — Audit-Log · /admin/backups — Backups
- /onboarding — Einrichtungs-Assistent · /change-password — Passwort ändern · /about — Version & Lizenz
- /settings/company — Firma (Tabs: Stammdaten/Steuer&UID/Bank&Kontakt/Rechnungs-Layout/Mahnwesen/KI-Assistent)
- /settings/module — Module ein/aus · /settings/number-ranges — Nummernkreise · /settings/memory — KI-Gedächtnis
- /chat — der KI-Assistent (du)

═══ WO LIEGT WAS (Settings) — die Firma-Seite hat Tabs, öffne den richtigen per ?tab= ═══
- Stammdaten (Name, Adresse) → /settings/company?tab=Stammdaten
- Kleinunternehmer, UID, GISA-Zahl, Steuernummer → /settings/company?tab=Steuer (Key isKleinunternehmer, country)
- IBAN/BIC/Bank, Kontaktdaten → /settings/company?tab=Bank
- Logo, Skonto-Defaults → /settings/company?tab=Rechnungs-Layout (defaultSkontoPercent, defaultSkontoDays)
- Mahn-Defaults, Verzugszinsen, Mahntexte → /settings/company?tab=Mahnwesen (daysUntilFirstReminder, daysBetweenReminders, defaultReminderFee)
- KI-Assistent-Verbindung + Support-Berechtigung → /settings/company?tab=KI
- Module an/aus → /settings/module (moduleProjects, moduleProducts, moduleExpenses, moduleWorkHours, moduleReminder, moduleSvs, moduleEst, moduleAssets, moduleTravel, moduleCashbook, moduleTaxExport)
- Nummernkreise/Rechnungsnummern-Format → /settings/number-ranges
- SMTP/E-Mail-Versand: aktuell NUR in der Mobile-Ansicht (Firma-Einstellungen) pflegbar — auf dem Desktop gibt es dafür noch kein Formular. NICHT behaupten, das ginge unter /settings/company.
- BMD-Kontorahmen + Paperless-Anbindung: read-only bzw. ohne Desktop-Edit-Formular — nicht als einstellbar versprechen.

═══ WAS JEDES FEATURE TUT (1 Zeile) ═══
- Rechnungen: §11-UStG-konform, Entwurf→Festschreiben (§131 BAO, dann unveränderlich), PDF + XRechnung-XML + E-Mail-Versand, Storno/Korrektur.
- Angebote: Angebot/Auftragsbestätigung/Lieferschein; angenommenes Angebot 1-Klick in Rechnung umwandeln.
- Mahnwesen: 3 Stufen, Verzugszinsen + Mahnspesen automatisch, PDF. Modul „Mahnwesen".
- Projekte+Zeit: Stunden buchen, Stundensatz pro Projekt, „aus offenen Stunden → Rechnung". Modul „Projekte".
- Produkte: Katalog wiederkehrender Positionen für schnelles Rechnung-Schreiben. Modul „Produkte".
- Ausgaben: Eingangsrechnungen + Belege, Beleg-OCR (Foto→Felder), Netto/Brutto gekoppelt. Modul „Ausgaben".
- Wiederkehrend: Vorlage-Rechnung + Intervall → automatische Entwürfe im Hintergrund.
- Anlagen: AfA §7 EStG, GWG-Sofortabschreibung ≤1.000€, Halbjahresregel. Modul „Anlagen".
- Reisekosten: Diäten/Nächtigung/KM-Geld §26 EStG, AT-Sätze 2026. Modul „Reisekosten".
- Kassabuch: Bar-Journal mit laufendem Saldo. NICHT RKSV — nur Kleinbeträge. Modul „Kassabuch".
- UVA: USt-Voranmeldung pro Zeitraum (FinanzOnline U30), nur festgeschriebene Rechnungen.
- ZM: Zusammenfassende Meldung für IG-Reverse-Charge-Dienstleistungen, CSV-Export.
- SVS-Vorschau: Sozialversicherungs-Prognose (GSVG), warnt vor Nachbemessung. Modul „SVS".
- ESt-Vorschau: Einkommensteuer-Forecast, Gewinnfreibetrag §10. Modul „ESt".
- BMD-Export: CSV-Paket für den Steuerberater. Finanzamt-Export: Jahres-ZIP. Modul „Finanzamt-Export".
- Bank-Abgleich: CAMT.053-XML hochladen, Matches zu offenen Rechnungen vorgeschlagen.
- Audit-Log: unveränderliches Änderungs-Protokoll (§131 BAO). Backups: Auto-SQLite-Snapshots.

═══ HÄUFIGE WORKFLOWS (knappe Schritte) ═══
- Ersteinrichtung: /onboarding startet den Setup-Assistenten (Firma, Steuer-Status, Module). Danach Default-Passwort unter /change-password ändern.
- Rechnung schreiben: /om/invoice → „Neue Rechnung" → Kunde wählen, Positionen, speichern (Entwurf) → prüfen → „Festschreiben".
- Rechnung versenden: Rechnungs-Ansicht → „Per E-Mail senden" (SMTP-Zugang nötig, s. Troubleshooting) oder „PDF herunterladen".
- Rechnung stornieren: festgeschriebene Rechnung öffnen → „Storno" → erzeugt Storno-Rechnung mit Negativbetrag; Original bleibt erhalten.
- Ausgabe mit Beleg: /expenses → „Neue Ausgabe" → Beleg fotografieren (OCR füllt Felder) → prüfen → speichern.
- Stunden abrechnen: Projekt öffnen → „Rechnung erzeugen" (aus offenen Stunden).
- Bankdaten importieren: /bank/abgleich → CAMT.053-XML aus dem Online-Banking exportieren → hochladen → vorgeschlagene Matches zu offenen Rechnungen bestätigen.
- UVA machen: /at-tax/uva → Zeitraum wählen → Kennzahlen ablesen → in FinanzOnline U30 übertragen.
- Daten sichern/zurückspielen: /admin/backups — Auto-Snapshots; Restore über die Backup-Seite (überschreibt aktuellen Stand). Zusätzlich DATA_DIR off-site sichern.

═══ ABGRENZUNGEN (X vs. Y) ═══
- Angebot / Auftragsbestätigung / Lieferschein: alle unter /om/offers, nur anderer Dokument-Typ (Lieferschein ohne Preise).
- UVA vs. ZM: UVA = USt-Voranmeldung aller Umsätze (FinanzOnline U30). ZM = nur innergemeinschaftliche Reverse-Charge-Dienstleistungen, separat.
- BMD-Export vs. Finanzamt-Export: BMD (/at-tax/bmd-export) = Buchungssätze fürs Steuerberater-Programm. Finanzamt-Export (/admin/tax-export) = Jahres-ZIP fürs Amt.
- Person vs. Firma: B2C-Person bzw. B2B-Firma — relevant für Verzugszinsen + Reverse-Charge.

═══ AT-STEUER-KONZEPTE (kurz erklären, nicht beraten) ═══
- Kleinunternehmer (§6 Abs.1 Z27 UStG): Umsatz unter Grenze → keine USt ausweisen. Toggle aktiviert No-USt-Modus + Pflichtvermerk im PDF.
- Festschreiben (§131 BAO): macht eine Rechnung unveränderlich. Danach nur Storno/Korrektur, kein Edit. Pflicht für die ordnungsgemäße Buchführung.
- Reverse-Charge (§3a Abs.6 UStG): bei EU-B2B-Kunden mit UID geht die Steuerschuld auf den Empfänger über. App schlägt es automatisch vor.
- GWG (§13 EStG): geringwertige Wirtschaftsgüter ≤1.000€ sofort voll absetzbar statt über AfA.
- SVS-Nachbemessung: erste 2 Jahre Mindestbeiträge, später Nachzahlung auf Basis echten Gewinns — die Vorschau hilft Rückstellung bilden.

═══ TROUBLESHOOTING ═══
- „Ich sehe Mahnungen/Projekte/Anlagen/… nicht" → Modul ist aus. /settings/module aktivieren.
- „Ich kann die Rechnung nicht bearbeiten" → sie ist festgeschrieben. Für Änderungen Storno + neue Rechnung.
- „Kein E-Mail-Versand / kein Senden-Button" → SMTP-Zugangsdaten nötig. Die werden aktuell NUR in der Mobile-Ansicht (Firma-Einstellungen) gepflegt; auf dem Desktop fehlt das Formular noch. Bis dahin per Mobile-App setzen.
- „GISA-Warnung im PDF" → als Gewerbetreibender GISA-Zahl + Behörde unter /settings/company?tab=Steuer eintragen.
- „Rechnung fehlt in der UVA" → nur festgeschriebene Rechnungen zählen; Entwürfe nicht.
- „Auf dem Handy sieht alles anders aus / Feature fehlt mobil" → die Mobile-Ansicht (/m/…) ist eine schlanke Variante; manche Settings sind nur dort oder noch ohne UI.
- „SVS-Prognose wirkt falsch" → erstes Selbständigkeits-Jahr unter /settings/company?tab=Steuer prüfen (svsStartYear).

REGELN:
1. Erfinde keine Routen, Einstellungen oder Features die oben nicht stehen. Wenn du etwas nicht sicher weißt, sag das ehrlich.
2. Wenn der User etwas eingestellt haben will: erkläre kurz + navigiere mit navigate_to dorthin — bei Settings IMMER mit ?tab=, damit der richtige Tab gleich offen ist. Bei Berechtigung confirm/auto kannst du zusätzlich update_setting nutzen.
3. Du darfst im Text auch Markdown-Links setzen, z.B. [zu den Steuer-Einstellungen](/settings/company?tab=Steuer). Interne Links (/…) navigieren per Klick direkt. Nutze sie großzügig, wenn du auf eine Seite verweist.
4. Bei Buchhaltungs-Aktionen (Rechnung schreiben, Kunde anlegen, Zahlen abfragen) → verweis auf den „Buchhalter"-Agenten (oben im Eingabefeld umschalten).
5. Steuerthemen: erklär das Konzept + wo es in der App sitzt, aber gib KEINE verbindliche Steuerberatung — bei Detailfragen auf Steuerberater verweisen.
6. Halte dich kurz und konkret. Lieber 2 Sätze + ein Link als ein Absatz.`;
}

function buildSystemPrompt(settings: CompanySettings | null): string {
  const today = new Date();
  const todayIso = today.toISOString().substring(0, 10);
  const weekdayDe = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][today.getDay()];

  // Erste Wahl: agent.md aus $DATA_DIR (Power-User-editierbar).
  // Fällt zurück auf den hardcoded String unten falls Datei fehlt.
  const agent = loadAgent();
  if (agent) {
    const modules: string[] = [];
    if (settings?.moduleProjects) modules.push('Projekte');
    if (settings?.moduleProducts) modules.push('Produkte');
    if (settings?.moduleExpenses) modules.push('Ausgaben');
    if (settings?.moduleWorkHours) modules.push('Arbeitszeit');
    if (settings?.moduleTaxExport) modules.push('Steuer-Export');
    return renderTemplate(agent.body, {
      today: formatDateDe(today),
      todayIso,
      weekday: weekdayDe,
      company: {
        name: settings?.name || 'deine Firma',
        nameAddon: settings?.nameAddon ? ` ${settings.nameAddon}` : '',
        country: settings?.country ?? 'AT',
        isKleinunternehmer: settings?.isKleinunternehmer ? ' — Kleinunternehmer' : '',
        modules: modules.length ? modules.join(', ') : 'nur Kern (Kunden + Rechnungen)',
      },
    });
  }

  const company = settings?.name ? `Firma: ${settings.name} (${settings.country ?? 'AT'})${settings.isKleinunternehmer ? ' — Kleinunternehmer' : ''}.` : '';
  return `Du bist der KI-Assistent von accountant — einer Buchhaltungs- und Rechnungssoftware mit DACH-Fokus (primär Österreich).

Heute ist ${weekdayDe}, ${todayIso}. Nutze dieses Datum wenn der User "heute", "gestern", "letzten Donnerstag" o.ä. sagt — nicht dein Trainings-Wissen.
${company}

Sprache: Antworte auf Deutsch.
Stil: Knapp, sachlich, geschäftlich. Keine Floskeln.
Format: Zahlen mit deutschem Tausender- und Dezimaltrennzeichen (1.234,56 €). Datum als DD.MM.YYYY.

═══════════════════════════════════════════════════════════
ABSOLUTE REGELN — Buchhaltung ist sensitiv, Halluzination ist verboten:
═══════════════════════════════════════════════════════════

1. NIEMALS Daten erfinden. Wenn etwas fehlt → frag den User nach. Beispiele für was du NICHT erfinden darfst:
   - Kunden-IDs, Projekt-IDs, Rechnungs-IDs (niemals raten — IMMER zuerst find_customer/list_projects/list_invoices)
   - Kundennamen (wenn User „Mayer" sagt aber find_customer „Maier" findet → frag nach, nicht annehmen)
   - Beträge (User sagt „etwa 3h" → frag „exakt wieviele Stunden?")
   - USt-Sätze (wenn unklar → frag nach, niemals 20% silent annehmen)
   - Datum (wenn User nichts sagt → frag „für welches Datum?")
   - E-Mail/Telefon/Adresse (nur eintragen wenn User explizit nennt)

2. Wenn ein Read-Tool nichts findet (count: 0) → sag das ehrlich. NIEMALS so tun als hätte es Treffer gegeben.

3. Wenn ein Write-Tool nicht in der Liste oben steht → sag „Das kann ich nicht". Erfinde keine Tools die nicht existieren.

4. Nach einem erfolgreichen Write-Vorschlag: STOP. Antworte EINEN Satz „Vorschlag erstellt: ..., bitte bestätigen." Mache nichts weiteres bis der User reagiert.

5. Bei Zweifel oder mehrdeutigen Anfragen → IMMER zurückfragen statt raten.

═══════════════════════════════════════════════════════════
TOOLS:
═══════════════════════════════════════════════════════════

Read-Tools: find_customer, list_invoices, get_outstanding, summarize_year, list_projects
Write-Tools (Proposal-only, User bestätigt im UI):
  - create_person, create_company (neue Kunden)
  - draft_invoice (Rechnungs-Entwurf)
  - book_time_entry (Zeitbuchung)
  - draft_expense (Ausgabe)

Datum-Auflösung: „heute" → heutiges Datum aus System-Prompt. „gestern" → -1 Tag. „letzten Donnerstag" → relativ zum heutigen Wochentag. Niemals Trainings-Wissen für Datum nutzen.

Antwortformat: Wenn User nach Zahl fragt, gib die Zahl. Liste → Liste. Keine Meta-Kommentare.`;
}

// ───────────────────────────────────────────────────────────────────────
// Tool-Implementations
// ───────────────────────────────────────────────────────────────────────

async function execTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'find_customer': {
      const q = String(args?.query ?? '').toLowerCase().trim();
      if (!q) return { error: 'query fehlt' };
      const [persons, companies] = await Promise.all([
        remult.repo(Person).find({ where: { archived: false } }),
        remult.repo(Company).find({ where: { archived: false } }),
      ]);
      const hits: any[] = [];
      for (const p of persons) {
        const hay = `${p.firstname} ${p.lastname} ${p.email} ${p.customerNumber}`.toLowerCase();
        if (hay.includes(q)) {
          hits.push({ id: p.id, type: 'person', name: `${p.firstname} ${p.lastname}`.trim(), customerNumber: p.customerNumber, email: p.email, vatId: p.vatId });
        }
      }
      for (const c of companies) {
        const hay = `${c.name} ${c.email} ${c.customerNumber} ${c.vatId}`.toLowerCase();
        if (hay.includes(q)) {
          hits.push({ id: c.id, type: 'company', name: c.name, customerNumber: c.customerNumber, email: c.email, vatId: c.vatId });
        }
      }
      return { count: hits.length, hits: hits.slice(0, 10) };
    }

    case 'list_invoices': {
      const customerId = args?.customerId ? String(args.customerId) : null;
      const status = String(args?.status ?? 'all');
      const year = args?.year ? Number(args.year) : null;
      const limit = Math.min(Number(args?.limit ?? 20), 50);
      const where: any = {};
      if (customerId) where.customerId = customerId;
      let invs = await remult.repo(Invoice).find({ where, orderBy: { invoiceDate: 'desc' as any } });
      if (year) invs = invs.filter((i) => i.invoiceDate && new Date(i.invoiceDate).getFullYear() === year);
      const today = new Date();
      if (status === 'paid') invs = invs.filter((i) => i.paid);
      else if (status === 'unpaid') invs = invs.filter((i) => !i.paid && i.finalized);
      else if (status === 'draft') invs = invs.filter((i) => !i.finalized);
      else if (status === 'overdue') {
        invs = invs.filter((i) => {
          if (!i.finalized || i.paid || !i.invoiceDate) return false;
          const due = new Date(i.invoiceDate);
          due.setDate(due.getDate() + 14);
          return due < today;
        });
      }
      const slice = invs.slice(0, limit);
      // Kunden-Namen mitliefern damit das Modell nicht nochmal find_customer aufrufen muss.
      const custIds = Array.from(new Set(slice.map((i) => i.customerId).filter(Boolean)));
      const nameById = new Map<string, string>();
      if (custIds.length) {
        const [persons, companies] = await Promise.all([
          remult.repo(Person).find({ where: { id: { $in: custIds } } }),
          remult.repo(Company).find({ where: { id: { $in: custIds } } }),
        ]);
        for (const p of persons) nameById.set(p.id, p.displayName);
        for (const c of companies) nameById.set(c.id, c.displayName);
      }
      return {
        count: invs.length,
        rows: slice.map((i) => ({
          id: i.id,
          number: i.invoiceNumber,
          date: i.invoiceDate ? new Date(i.invoiceDate).toISOString().substring(0, 10) : null,
          customerId: i.customerId,
          customerName: nameById.get(i.customerId) ?? '(unbekannt)',
          gross: i.grossTotal ?? 0,
          paid: i.paid,
          finalized: i.finalized,
          isStorno: !!i.correctsInvoiceId,
        })),
      };
    }

    case 'get_outstanding': {
      const invs = await remult.repo(Invoice).find({ where: { paid: false, finalized: true, archived: false } });
      if (!invs.length) return { count: 0, totalGross: 0, oldestDate: null, overdueCount: 0, byCustomer: [] };
      const today = new Date();
      let oldest: Date | null = null;
      let overdueCount = 0;
      for (const i of invs) {
        if (!i.invoiceDate) continue;
        const d = new Date(i.invoiceDate);
        if (!oldest || d < oldest) oldest = d;
        const due = new Date(d);
        due.setDate(due.getDate() + 14);
        if (due < today) overdueCount++;
      }
      const total = invs.reduce((s, i) => s + (i.grossTotal ?? 0), 0);
      // Aufschlüsselung pro Schuldner — Mitarbeiter-Frage „wer schuldet noch?"
      const sumByCustomer = new Map<string, number>();
      for (const i of invs) sumByCustomer.set(i.customerId, (sumByCustomer.get(i.customerId) ?? 0) + (i.grossTotal ?? 0));
      const custIds = [...sumByCustomer.keys()];
      const [persons, companies] = await Promise.all([
        custIds.length ? remult.repo(Person).find({ where: { id: { $in: custIds } } }) : Promise.resolve([] as Person[]),
        custIds.length ? remult.repo(Company).find({ where: { id: { $in: custIds } } }) : Promise.resolve([] as Company[]),
      ]);
      const nameById = new Map<string, string>();
      for (const p of persons) nameById.set(p.id, p.displayName);
      for (const c of companies) nameById.set(c.id, c.displayName);
      const byCustomer = [...sumByCustomer.entries()]
        .map(([id, sum]) => ({ name: nameById.get(id) ?? '(unbekannt)', total: Number(sum.toFixed(2)) }))
        .sort((a, b) => b.total - a.total);
      return {
        count: invs.length,
        byCustomer,
        totalGross: Number(total.toFixed(2)),
        oldestDate: oldest ? oldest.toISOString().substring(0, 10) : null,
        overdueCount,
      };
    }

    case 'summarize_year': {
      const year = args?.year ? Number(args.year) : new Date().getFullYear();
      const allInvs = await remult.repo(Invoice).find({ where: { archived: false } });
      const yearInvs = allInvs.filter((i) => i.invoiceDate && new Date(i.invoiceDate).getFullYear() === year && i.finalized);
      const byCustomer = new Map<string, number>();
      for (const i of yearInvs) byCustomer.set(i.customerId, (byCustomer.get(i.customerId) ?? 0) + (i.grossTotal ?? 0));
      const customerIds = [...byCustomer.keys()];
      const [persons, companies] = await Promise.all([
        customerIds.length ? remult.repo(Person).find({ where: { id: { $in: customerIds } } }) : Promise.resolve([] as Person[]),
        customerIds.length ? remult.repo(Company).find({ where: { id: { $in: customerIds } } }) : Promise.resolve([] as Company[]),
      ]);
      const nameById = new Map<string, string>();
      for (const p of persons) nameById.set(p.id, `${p.firstname} ${p.lastname}`.trim());
      for (const c of companies) nameById.set(c.id, c.name);
      const top5 = [...byCustomer.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, gross]) => ({ name: nameById.get(id) ?? '(unbekannt)', gross: Number(gross.toFixed(2)) }));
      const grossRevenue = yearInvs.reduce((s, i) => s + (i.grossTotal ?? 0), 0);

      let totalExpenses = 0;
      let expenseCount = 0;
      try {
        const exps = await remult.repo(Expense).find({ where: { archived: false } });
        const yearExps = exps.filter((e) => e.date && new Date(e.date).getFullYear() === year);
        totalExpenses = yearExps.reduce((s, e) => s + (e.grossTotal ?? 0), 0);
        expenseCount = yearExps.length;
      } catch {
        // Expenses-Modul evtl. nicht aktiv
      }

      return {
        year,
        invoiceCount: yearInvs.length,
        grossRevenue: Number(grossRevenue.toFixed(2)),
        expenseCount,
        totalExpenses: Number(totalExpenses.toFixed(2)),
        balance: Number((grossRevenue - totalExpenses).toFixed(2)),
        top5Customers: top5,
      };
    }

    case 'get_period_summary': {
      const { parseUvaPeriod } = await import('./uva');
      const periodArg = String(args?.period ?? '').trim() || String(new Date().getFullYear());
      const period = parseUvaPeriod(periodArg);
      if (!period) return { error: `Ungültiger Zeitraum „${periodArg}". Format: YYYY-MM, YYYY-Qn oder YYYY.` };
      const inRange = (d: any) => { if (!d) return false; const x = new Date(d); return x >= period.from && x < period.to; };
      const allInvs = await remult.repo(Invoice).find({ where: { archived: false } });
      const invs = allInvs.filter((i) => i.finalized && inRange(i.invoiceDate));
      const grossRevenue = invs.reduce((s, i) => s + (i.grossTotal ?? 0), 0);
      let totalExpenses = 0, expenseCount = 0;
      try {
        const exps = await remult.repo(Expense).find({ where: { archived: false } });
        const pe = exps.filter((e) => inRange(e.date));
        totalExpenses = pe.reduce((s, e) => s + (e.grossTotal ?? 0), 0);
        expenseCount = pe.length;
      } catch { /* Ausgaben-Modul evtl. inaktiv */ }
      return {
        period: period.label,
        grossRevenue: Number(grossRevenue.toFixed(2)),
        totalExpenses: Number(totalExpenses.toFixed(2)),
        balance: Number((grossRevenue - totalExpenses).toFixed(2)),
        invoiceCount: invs.length,
        expenseCount,
      };
    }

    case 'get_expense_breakdown': {
      const { parseUvaPeriod } = await import('./uva');
      const periodArg = String(args?.period ?? '').trim() || String(new Date().getFullYear());
      const period = parseUvaPeriod(periodArg);
      if (!period) return { error: `Ungültiger Zeitraum „${periodArg}".` };
      const exps = await remult.repo(Expense).find({ where: { archived: false } });
      const pe = exps.filter((e) => { if (!e.date) return false; const x = new Date(e.date); return x >= period.from && x < period.to; });
      const byCat = new Map<string, { gross: number; count: number }>();
      for (const e of pe) {
        const cat = String((e as any).category ?? 'Sonstiges');
        const cur = byCat.get(cat) ?? { gross: 0, count: 0 };
        cur.gross += (e.grossTotal ?? 0); cur.count += 1;
        byCat.set(cat, cur);
      }
      const byCategory = [...byCat.entries()]
        .map(([category, v]) => ({ category, gross: Number(v.gross.toFixed(2)), count: v.count }))
        .sort((a, b) => b.gross - a.gross);
      const totalGross = pe.reduce((s, e) => s + (e.grossTotal ?? 0), 0);
      return { period: period.label, totalGross: Number(totalGross.toFixed(2)), count: pe.length, byCategory };
    }

    case 'get_customer_detail': {
      const q = String(args?.query ?? '').toLowerCase().trim();
      if (!q) return { error: 'Kundenname fehlt' };
      const [persons, companies] = await Promise.all([
        remult.repo(Person).find({ where: { archived: false } }),
        remult.repo(Company).find({ where: { archived: false } }),
      ]);
      const allCust = [
        ...persons.map((p) => ({ id: p.id, name: p.displayName, type: 'Person', vatId: (p as any).vatId })),
        ...companies.map((c) => ({ id: c.id, name: c.displayName, type: 'Firma', vatId: (c as any).vatId })),
      ];
      const match = allCust.find((c) => c.name?.toLowerCase().includes(q));
      if (!match) return { error: `Kein Kunde gefunden zu „${args?.query}".` };
      const allInvs = await remult.repo(Invoice).find({ where: { archived: false } });
      const custInvs = allInvs.filter((i) => i.customerId === match.id && i.finalized);
      const totalRevenue = custInvs.reduce((s, i) => s + (i.grossTotal ?? 0), 0);
      const openInvs = custInvs.filter((i) => !i.paid);
      const openAmount = openInvs.reduce((s, i) => s + (i.grossTotal ?? 0), 0);
      let activeProjects = 0;
      try {
        const projs = await remult.repo(Project).find({ where: { archived: false, status: 'active' } });
        activeProjects = projs.filter((p) => p.customerId === match.id).length;
      } catch { /* PM evtl. inaktiv */ }
      let lastNote: string | null = null;
      try {
        const { CustomerNote } = await import('../shared/entities/customer-note');
        const notes = await remult.repo(CustomerNote).find({ where: { customerId: match.id } as any, orderBy: { createdAt: 'desc' as any } });
        if (notes.length) lastNote = (notes[0] as any).title || (notes[0] as any).body || null;
      } catch { /* Notizen evtl. inaktiv */ }
      return {
        id: match.id, name: match.name, type: match.type, vatId: match.vatId || null,
        invoiceCount: custInvs.length,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        openCount: openInvs.length,
        openAmount: Number(openAmount.toFixed(2)),
        activeProjects,
        lastNote,
      };
    }

    case 'get_invoice_detail': {
      const numQ = String(args?.number ?? '').trim().toLowerCase();
      if (!numQ) return { error: 'Rechnungsnummer fehlt' };
      const all = await remult.repo(Invoice).find({ where: { archived: false } });
      const inv = all.find((i) => (i.invoiceNumber ?? '').toLowerCase() === numQ)
        ?? all.find((i) => (i.invoiceNumber ?? '').toLowerCase().includes(numQ));
      if (!inv) return { error: `Keine Rechnung „${args?.number}" gefunden.` };
      const cust = (await remult.repo(Person).findFirst({ id: inv.customerId }))
        ?? (await remult.repo(Company).findFirst({ id: inv.customerId }));
      const due = inv.invoiceDate
        ? new Date(new Date(inv.invoiceDate).getTime() + ((inv as any).paymentTermsDays ?? 14) * 86400000)
        : null;
      return {
        number: inv.invoiceNumber,
        customer: cust?.displayName ?? '(unbekannt)',
        date: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().substring(0, 10) : null,
        dueDate: due ? due.toISOString().substring(0, 10) : null,
        subject: inv.subject || null,
        netTotal: Number((inv.netTotal ?? 0).toFixed(2)),
        grossTotal: Number((inv.grossTotal ?? 0).toFixed(2)),
        status: !inv.finalized ? 'Entwurf' : inv.paid ? 'bezahlt' : 'offen',
        reverseCharge: !!inv.reverseCharge,
      };
    }

    case 'list_offers': {
      const { Offer } = await import('../shared/entities/offer');
      const statusMap: Record<string, string> = {
        offen: 'sent', sent: 'sent', angenommen: 'won', won: 'won', gewonnen: 'won',
        abgelehnt: 'lost', lost: 'lost', verloren: 'lost', entwurf: 'draft', draft: 'draft',
        abgelaufen: 'expired', expired: 'expired',
      };
      const rawS = String(args?.status ?? '').toLowerCase().trim();
      const wantStatus = statusMap[rawS] ?? null;
      let offers = await remult.repo(Offer).find({ where: { archived: false } as any, orderBy: { offerDate: 'desc' as any } });
      if (wantStatus) offers = offers.filter((o) => o.status === wantStatus);
      const ids = [...new Set(offers.map((o) => o.customerId).filter(Boolean))];
      const nameById = new Map<string, string>();
      if (ids.length) {
        const [ps, cs] = await Promise.all([
          remult.repo(Person).find({ where: { id: { $in: ids } } }),
          remult.repo(Company).find({ where: { id: { $in: ids } } }),
        ]);
        for (const p of ps) nameById.set(p.id, p.displayName);
        for (const c of cs) nameById.set(c.id, c.displayName);
      }
      const statusDe: Record<string, string> = { draft: 'Entwurf', sent: 'offen', won: 'angenommen', lost: 'abgelehnt', expired: 'abgelaufen' };
      return {
        count: offers.length,
        filter: wantStatus ? statusDe[wantStatus] : null,
        rows: offers.slice(0, 20).map((o) => ({
          number: o.offerNumber,
          customer: nameById.get(o.customerId) ?? '(unbekannt)',
          status: statusDe[o.status] ?? o.status,
          gross: Number(((o as any).grossTotal ?? 0).toFixed(2)),
          validUntil: o.validUntil ? new Date(o.validUntil).toISOString().substring(0, 10) : null,
        })),
      };
    }

    case 'get_bank_status': {
      const { BankTransaction } = await import('../shared/entities/bank-transaction');
      const txs = await remult.repo(BankTransaction).find({ where: {} as any });
      const open = txs.filter((t) => (t as any).status === 'open');
      const openCredit = open.filter((t) => t.direction === 'credit').reduce((s, t) => s + (t.amount ?? 0), 0);
      const openDebit = open.filter((t) => t.direction === 'debit').reduce((s, t) => s + (t.amount ?? 0), 0);
      return {
        total: txs.length,
        openCount: open.length,
        matchedCount: txs.filter((t) => (t as any).status === 'matched').length,
        ignoredCount: txs.filter((t) => (t as any).status === 'ignored').length,
        openCredit: Number(openCredit.toFixed(2)),
        openDebit: Number(openDebit.toFixed(2)),
      };
    }

    case 'list_assets': {
      const { Asset } = await import('../shared/entities/asset');
      const assets = await remult.repo(Asset).find({ where: { archived: false } as any, orderBy: { acquisitionDate: 'desc' as any } });
      const totalCost = assets.reduce((s, a) => s + ((a as any).acquisitionCost ?? 0), 0);
      return {
        count: assets.length,
        totalCost: Number(totalCost.toFixed(2)),
        rows: assets.slice(0, 20).map((a) => ({
          name: a.name,
          category: (a as any).category,
          cost: Number(((a as any).acquisitionCost ?? 0).toFixed(2)),
          date: (a as any).acquisitionDate ? new Date((a as any).acquisitionDate).toISOString().substring(0, 10) : null,
          usefulLife: (a as any).usefulLifeYears,
          gwg: !!(a as any).isGwg,
        })),
      };
    }

    case 'list_travel': {
      const { TravelExpense } = await import('../shared/entities/travel-expense');
      const { parseUvaPeriod } = await import('./uva');
      const periodArg = String(args?.period ?? '').trim();
      const period = periodArg ? parseUvaPeriod(periodArg) : null;
      let trips = await remult.repo(TravelExpense).find({ where: { archived: false } as any, orderBy: { startDate: 'desc' as any } });
      if (period) trips = trips.filter((tr) => { const d = (tr as any).startDate; if (!d) return false; const x = new Date(d); return x >= period.from && x < period.to; });
      const total = trips.reduce((s, tr) => s + ((tr as any).totalAmount ?? 0), 0);
      return {
        count: trips.length,
        period: period ? period.label : 'gesamt',
        totalAmount: Number(total.toFixed(2)),
        rows: trips.slice(0, 20).map((tr) => ({
          destination: (tr as any).destination,
          purpose: (tr as any).purpose,
          date: (tr as any).startDate ? new Date((tr as any).startDate).toISOString().substring(0, 10) : null,
          amount: Number(((tr as any).totalAmount ?? 0).toFixed(2)),
        })),
      };
    }

    case 'get_unbilled_time': {
      const { TimeEntry } = await import('../shared/entities/time-entry');
      const settings = await remult.repo(CompanySettings).findFirst();
      const defRate = (settings as any)?.defaultHourlyRate ?? 0;
      const projs = await remult.repo(Project).find({ where: {} as any });
      const projName = new Map(projs.map((p) => [p.id, p.name]));
      const projRate = new Map(projs.map((p) => [p.id, (p as any).hourlyRate || 0]));
      const entries = await remult.repo(TimeEntry).find({ where: { archived: false } as any });
      const unbilled = entries.filter((e) => !(e as any).billedInvoiceItemId);
      const byProj = new Map<string, { hours: number; amount: number }>();
      let totalHours = 0, totalAmount = 0;
      for (const e of unbilled) {
        const h = (e as any).hours ?? 0;
        // Effektiver Satz wie in projects.ts: Eintrag → Projekt → Default.
        const rate = (e as any).hourlyRate || projRate.get((e as any).projectId) || defRate || 0;
        const amt = h * rate;
        totalHours += h; totalAmount += amt;
        const key = (e as any).projectId || '—';
        const cur = byProj.get(key) ?? { hours: 0, amount: 0 };
        cur.hours += h; cur.amount += amt;
        byProj.set(key, cur);
      }
      const byProject = [...byProj.entries()]
        .map(([pid, v]) => ({ project: projName.get(pid) ?? '(ohne Projekt)', hours: Number(v.hours.toFixed(2)), amount: Number(v.amount.toFixed(2)) }))
        .sort((a, b) => b.amount - a.amount);
      return { count: unbilled.length, totalHours: Number(totalHours.toFixed(2)), totalAmount: Number(totalAmount.toFixed(2)), byProject };
    }

    case 'list_capabilities':
      // Inhalt liegt deterministisch im Formatter — kein DB-Zugriff nötig.
      return { ok: true };

    case 'get_customer_invoices': {
      const q = String(args?.query ?? '').toLowerCase().trim();
      if (!q) return { error: 'Kundenname fehlt' };
      const [persons, companies] = await Promise.all([
        remult.repo(Person).find({ where: { archived: false } }),
        remult.repo(Company).find({ where: { archived: false } }),
      ]);
      const all = [
        ...persons.map((p) => ({ id: p.id, name: p.displayName })),
        ...companies.map((c) => ({ id: c.id, name: c.displayName })),
      ];
      const match = all.find((c) => c.name?.toLowerCase().includes(q));
      if (!match) return { error: `Kein Kunde gefunden zu „${args?.query}".` };
      const allInvs = await remult.repo(Invoice).find({ where: { archived: false }, orderBy: { invoiceDate: 'desc' as any } });
      const custInvs = allInvs.filter((i) => i.customerId === match.id && i.finalized);
      const today = new Date();
      const rows = custInvs.map((i) => {
        const due = i.invoiceDate ? new Date(new Date(i.invoiceDate).getTime() + ((i as any).paymentTermsDays ?? 14) * 86400000) : null;
        const overdue = !i.paid && due && due < today;
        return {
          number: i.invoiceNumber,
          date: i.invoiceDate ? new Date(i.invoiceDate).toISOString().substring(0, 10) : null,
          gross: Number((i.grossTotal ?? 0).toFixed(2)),
          status: !i.paid ? (overdue ? 'überfällig' : 'offen') : 'bezahlt',
        };
      });
      const totalGross = custInvs.reduce((s, i) => s + (i.grossTotal ?? 0), 0);
      const openGross = custInvs.filter((i) => !i.paid).reduce((s, i) => s + (i.grossTotal ?? 0), 0);
      return {
        customer: match.name,
        count: custInvs.length,
        totalGross: Number(totalGross.toFixed(2)),
        openGross: Number(openGross.toFixed(2)),
        rows,
      };
    }

    case 'get_open_payables': {
      const exps = await remult.repo(Expense).find({ where: { archived: false } });
      const open = exps.filter((e) => String((e as any).paymentStatus ?? 'offen') === 'offen');
      const totalGross = open.reduce((s, e) => s + (e.grossTotal ?? 0), 0);
      const sorted = [...open].sort((a, b) => (b.grossTotal ?? 0) - (a.grossTotal ?? 0)).slice(0, 12);
      return {
        count: open.length,
        totalGross: Number(totalGross.toFixed(2)),
        rows: sorted.map((e) => ({
          vendor: (e as any).vendor || '(ohne Lieferant)',
          category: (e as any).category,
          date: (e as any).date ? new Date((e as any).date).toISOString().substring(0, 10) : null,
          gross: Number((e.grossTotal ?? 0).toFixed(2)),
        })),
      };
    }

    case 'list_expenses': {
      const year = args?.year ? Number(args.year) : new Date().getFullYear();
      const month = args?.month ? Number(args.month) : null;
      const categoryFilter = String(args?.category ?? '');
      const limit = Math.min(Number(args?.limit ?? 20), 50);
      const where: any = { archived: false };
      let exps = await remult.repo(Expense).find({ where, orderBy: { date: 'desc' as any } });
      exps = exps.filter((e) => {
        if (!e.date) return false;
        const d = new Date(e.date);
        if (d.getFullYear() !== year) return false;
        if (month !== null && d.getMonth() + 1 !== month) return false;
        if (categoryFilter && (e as any).category !== categoryFilter) return false;
        return true;
      });
      const totalNet = exps.reduce((s, e) => s + (e.netTotal ?? 0), 0);
      const totalGross = exps.reduce((s, e) => s + (e.grossTotal ?? 0), 0);
      return {
        count: exps.length,
        totalNet: Number(totalNet.toFixed(2)),
        totalGross: Number(totalGross.toFixed(2)),
        rows: exps.slice(0, limit).map((e) => ({
          id: e.id,
          date: e.date ? new Date(e.date).toISOString().substring(0, 10) : null,
          vendor: e.vendor,
          category: (e as any).category,
          netTotal: e.netTotal,
          grossTotal: e.grossTotal,
          status: (e as any).paymentStatus,
        })),
      };
    }

    case 'list_recurring': {
      const { RecurringInvoice } = await import('../shared/entities/recurring-invoice');
      const all = await remult.repo(RecurringInvoice).find({ orderBy: { nextRunDate: 'asc' as any } });
      return {
        count: all.length,
        rows: all.map((r) => ({
          id: r.id,
          title: r.title,
          interval: r.interval,
          nextRunDate: r.nextRunDate ? new Date(r.nextRunDate).toISOString().substring(0, 10) : null,
          lastRunDate: r.lastRunDate ? new Date(r.lastRunDate).toISOString().substring(0, 10) : null,
          active: r.active,
        })),
      };
    }

    case 'get_uva': {
      const periodArg = String(args['period'] ?? '').trim();
      if (!periodArg) {
        return { error: 'period (z.B. „2026-05") muss angegeben werden.' };
      }
      // Inline-Aggregation: gleiche Logik wie /api/uva, kompaktes Result.
      const { aggregateUva, parseUvaPeriod } = await import('./uva');
      const period = parseUvaPeriod(periodArg);
      if (!period) {
        return {
          error: `Ungültiger Zeitraum „${periodArg}". Format: YYYY-MM, YYYY-Q1..Q4 oder YYYY.`,
        };
      }
      const r = await aggregateUva(period);
      return {
        period: r.period.label,
        from: r.period.from,
        to: r.period.to,
        isKleinunternehmer: r.isKleinunternehmer,
        kz: {
          kz000_bemessungen: r.kzFelder.kz000,
          kz022_bemessung_20: r.kzFelder.kz022,
          kz029_bemessung_10: r.kzFelder.kz029,
          kz006_bemessung_13: r.kzFelder.kz006,
          kz011_ig_lieferungen: r.kzFelder.kz011,
          kz017_drittland: r.kzFelder.kz017,
          kz016_kleinunternehmer: r.kzFelder.kz016,
          kz060_vorsteuer: r.kzFelder.kz060,
        },
        ustSumme: r.ustSumme,
        zahllast: r.zahllast,
        zahllastLabel: r.zahllast > 0.005
          ? 'Zahllast ans Finanzamt'
          : r.zahllast < -0.005
            ? 'Gutschrift vom Finanzamt'
            : 'Ausgeglichen',
        invoiceCount: r.ausgaenge.invoiceCount,
        expenseCount: r.eingaenge.expenseCount,
      };
    }
    case 'list_reminders': {
      const { Reminder } = await import('../shared/entities/reminder');
      const { daysOverdueOf } = await import('./reminder');
      const all = await remult.repo(Reminder).find({ orderBy: { reminderDate: 'desc' as any } });
      const invIds = Array.from(new Set(all.map((r) => r.invoiceId)));
      const invs = invIds.length ? await remult.repo(Invoice).find({ where: { id: { $in: invIds } } }) : [];
      const byId = new Map(invs.map((i) => [i.id, i]));
      const custIds = Array.from(new Set(invs.map((i) => i.customerId).filter(Boolean)));
      const [persons, companies] = await Promise.all([
        custIds.length ? remult.repo(Person).find({ where: { id: { $in: custIds } } }) : Promise.resolve([] as Person[]),
        custIds.length ? remult.repo(Company).find({ where: { id: { $in: custIds } } }) : Promise.resolve([] as Company[]),
      ]);
      const nameById = new Map<string, string>();
      for (const p of persons) nameById.set(p.id, p.displayName);
      for (const c of companies) nameById.set(c.id, c.displayName);
      const today = new Date();
      return {
        count: all.length,
        rows: all.map((r) => {
          const inv = byId.get(r.invoiceId);
          return {
            id: r.id,
            reminderNumber: r.reminderNumber,
            stage: r.stage,
            reminderDate: r.reminderDate ? new Date(r.reminderDate).toISOString().substring(0, 10) : null,
            dueDate: r.dueDate ? new Date(r.dueDate).toISOString().substring(0, 10) : null,
            totalDue: r.totalDue,
            sent: r.sent,
            invoiceNumber: inv?.invoiceNumber ?? null,
            customerName: inv?.customerId ? (nameById.get(inv.customerId) ?? '(unbekannt)') : null,
            daysOverdue: inv ? daysOverdueOf(inv, today) : 0,
          };
        }),
      };
    }

    case 'draft_reminder': {
      const { Reminder } = await import('../shared/entities/reminder');
      const { calculateReminder } = await import('./reminder');
      const invoiceId = String(args?.invoiceId ?? '');
      if (!invoiceId) return { error: 'invoiceId fehlt' };
      const inv = await remult.repo(Invoice).findFirst({ id: invoiceId });
      if (!inv) return { error: 'Rechnung nicht gefunden' };
      if (!inv.finalized) return { error: 'Nur festgeschriebene Rechnungen können gemahnt werden' };
      if (inv.paid) return { error: 'Diese Rechnung ist bereits bezahlt' };
      const existing = await remult.repo(Reminder).find({ where: { invoiceId } });
      const maxExisting = existing.reduce((m, r) => Math.max(m, r.stage), 0);
      const stage = (Number(args?.stage) || maxExisting + 1) as 1 | 2 | 3;
      if (stage < 1 || stage > 3) return { error: 'Stufe muss 1, 2 oder 3 sein' };
      if (stage <= maxExisting) return { error: `Stufe ${stage} bereits angelegt — nächste freie Stufe ist ${maxExisting + 1}` };

      const today = new Date();
      const calc = await calculateReminder(inv, stage, today);
      const settings = await remult.repo(CompanySettings).findFirst();
      const due = new Date(today);
      due.setDate(due.getDate() + (settings?.daysBetweenReminders ?? 14));

      // Kundenname für Vorschlagskarte
      const person = await remult.repo(Person).findFirst({ id: inv.customerId });
      const company = !person ? await remult.repo(Company).findFirst({ id: inv.customerId }) : null;
      const customerName = (person ?? company)?.displayName ?? '(unbekannt)';

      return {
        proposal: {
          kind: 'reminder',
          invoiceId,
          invoiceNumber: inv.invoiceNumber,
          customerName,
          stage,
          stageLabel: stage === 1 ? 'Zahlungserinnerung' : stage === 2 ? 'Mahnung' : 'Letzte Mahnung',
          reminderDate: today.toISOString().substring(0, 10),
          dueDate: due.toISOString().substring(0, 10),
          daysOverdue: calc.daysOverdue,
          invoiceGross: inv.grossTotal ?? 0,
          interestRate: calc.interestRate,
          interestAmount: calc.interestAmount,
          reminderFee: calc.reminderFee,
          totalDue: calc.totalDue,
        },
      };
    }

    case 'count_entities': {
      const what = String(args?.what ?? 'all');
      const inclArch = !!args?.includeArchived;
      const where = inclArch ? {} : { archived: false };
      const result: any = {};
      const wantAll = what === 'all';
      if (wantAll || what === 'customers') {
        const [persons, companies] = await Promise.all([
          remult.repo(Person).count(where),
          remult.repo(Company).count(where),
        ]);
        result.customers = { persons, companies, total: persons + companies };
      }
      if (wantAll || what === 'invoices') {
        const all = await remult.repo(Invoice).count(where);
        const finalized = await remult.repo(Invoice).count({ ...where, finalized: true });
        const paid = await remult.repo(Invoice).count({ ...where, paid: true });
        result.invoices = { total: all, finalized, drafts: all - finalized, paid, unpaid: finalized - paid };
      }
      if (wantAll || what === 'projects') {
        const total = await remult.repo(Project).count(where);
        const active = await remult.repo(Project).count({ ...where, status: 'active' });
        result.projects = { total, active, closed: total - active };
      }
      if (wantAll || what === 'expenses') {
        try {
          const total = await remult.repo(Expense).count(where);
          result.expenses = { total };
        } catch { /* Modul evtl. nicht aktiv */ }
      }
      return result;
    }

    case 'list_projects': {
      const q = String(args?.query ?? '').toLowerCase().trim();
      const projs = await remult.repo(Project).find({ where: { archived: false, status: 'active' } });
      const filtered = q ? projs.filter((p) => p.name?.toLowerCase().includes(q)) : projs;
      const slice = filtered.slice(0, 20);
      const custIds = Array.from(new Set(slice.map((p) => p.customerId).filter(Boolean)));
      const nameById = new Map<string, string>();
      if (custIds.length) {
        const [persons, companies] = await Promise.all([
          remult.repo(Person).find({ where: { id: { $in: custIds } } }),
          remult.repo(Company).find({ where: { id: { $in: custIds } } }),
        ]);
        for (const p of persons) nameById.set(p.id, p.displayName);
        for (const c of companies) nameById.set(c.id, c.displayName);
      }
      return {
        count: filtered.length,
        rows: slice.map((p) => ({
          id: p.id,
          name: p.name,
          customerId: p.customerId,
          customerName: nameById.get(p.customerId) ?? '(unbekannt)',
          hourlyRate: p.hourlyRate,
        })),
      };
    }

    // ── Write-Proposals — NUR Validierung + Echo, kein DB-Schreiben.
    case 'draft_invoice': {
      const customerId = String(args?.customerId ?? '');
      if (!customerId) return { error: 'customerId fehlt' };
      const customer = (await remult.repo(Person).findFirst({ id: customerId }))
        ?? (await remult.repo(Company).findFirst({ id: customerId }));
      if (!customer) return { error: 'Kunde nicht gefunden' };
      const rawItems = Array.isArray(args?.items) ? args.items : [];
      if (!rawItems.length) return { error: 'Mindestens eine Position erforderlich' };
      const settings = await remult.repo(CompanySettings).findFirst();
      const defaultVat = settings?.isKleinunternehmer ? 0 : (settings?.country === 'AT' ? 20 : 19);
      const items = rawItems.map((it: any, idx: number) => ({
        name: String(it?.name ?? '').slice(0, 200),
        description: String(it?.description ?? ''),
        quantity: Number(it?.quantity ?? 1),
        amountType: String(it?.amountType ?? 'Stk'),
        price: Number(it?.price ?? 0),
        vat: it?.vat !== undefined ? Number(it.vat) : defaultVat,
        position: idx,
      })).filter((i: any) => i.name && i.quantity > 0 && i.price >= 0);
      if (!items.length) return { error: 'Keine gültigen Positionen' };
      const net = items.reduce((s: number, i: any) => s + i.quantity * i.price, 0);
      const grossEst = items.reduce((s: number, i: any) => s + i.quantity * i.price * (1 + i.vat / 100), 0);
      return {
        proposal: {
          kind: 'invoice',
          customerId,
          customerName: customer.displayName,
          subject: String(args?.subject ?? '').slice(0, 200),
          items,
          netTotal: Number(net.toFixed(2)),
          grossTotal: Number(grossEst.toFixed(2)),
        },
      };
    }

    case 'book_time_entry': {
      const projectId = String(args?.projectId ?? '');
      const hours = Number(args?.hours ?? 0);
      if (!projectId) return { error: 'projectId fehlt' };
      if (!(hours > 0)) return { error: 'hours muss > 0 sein' };
      const project = await remult.repo(Project).findFirst({ id: projectId });
      if (!project) return { error: 'Projekt nicht gefunden' };
      const dateStr = String(args?.date ?? new Date().toISOString().substring(0, 10));
      const settings = await remult.repo(CompanySettings).findFirst();
      const hourlyRate = project.hourlyRate || settings?.defaultHourlyRate || 0;
      return {
        proposal: {
          kind: 'time_entry',
          projectId,
          projectName: project.name,
          date: dateStr,
          hours,
          hourlyRate,
          amount: Number((hours * hourlyRate).toFixed(2)),
          description: String(args?.description ?? ''),
        },
      };
    }

    case 'create_person': {
      const firstname = String(args?.firstname ?? '').trim();
      const lastname = String(args?.lastname ?? '').trim();
      if (!firstname || !lastname) return { error: 'firstname und lastname sind Pflicht' };
      const street = String(args?.street ?? '').trim();
      const zip = String(args?.zip ?? '').trim();
      const city = String(args?.city ?? '').trim();
      const country = String(args?.country ?? 'AT');
      const hasAddress = !!(street || zip || city);
      return {
        proposal: {
          kind: 'person',
          firstname,
          lastname,
          salutation: String(args?.salutation ?? ''),
          email: String(args?.email ?? ''),
          phone: String(args?.phone ?? ''),
          vatId: String(args?.vatId ?? ''),
          address: hasAddress ? { street, zip, city, country } : null,
        },
      };
    }

    case 'create_company': {
      const name = String(args?.name ?? '').trim();
      if (!name) return { error: 'name ist Pflicht' };
      const street = String(args?.street ?? '').trim();
      const zip = String(args?.zip ?? '').trim();
      const city = String(args?.city ?? '').trim();
      const country = String(args?.country ?? 'AT');
      const hasAddress = !!(street || zip || city);
      return {
        proposal: {
          kind: 'company',
          name,
          nameAddon: String(args?.nameAddon ?? ''),
          email: String(args?.email ?? ''),
          phone: String(args?.phone ?? ''),
          vatId: String(args?.vatId ?? ''),
          address: hasAddress ? { street, zip, city, country } : null,
        },
      };
    }

    case 'draft_expense': {
      const netTotal = Number(args?.netTotal ?? 0);
      const vatRate = args?.vatRate !== undefined ? Number(args.vatRate) : 20;
      const category = String(args?.category ?? '');
      if (!(netTotal > 0)) return { error: 'netTotal muss > 0 sein' };
      if (!expenseCategories.includes(category as any)) return { error: `Kategorie ungültig — wähle aus ${expenseCategories.join(', ')}` };
      const dateStr = String(args?.date ?? new Date().toISOString().substring(0, 10));
      const grossTotal = Number((netTotal * (1 + vatRate / 100)).toFixed(2));
      return {
        proposal: {
          kind: 'expense',
          date: dateStr,
          netTotal: Number(netTotal.toFixed(2)),
          vatRate,
          grossTotal,
          category,
          vendor: String(args?.vendor ?? ''),
          description: String(args?.description ?? ''),
        },
      };
    }

    case 'navigate_to': {
      const route = String(args?.route ?? '').trim();
      if (!route.startsWith('/')) return { error: 'Ungültige Route' };
      return { ok: true, navigate: route, label: String(args?.label ?? route) };
    }

    default:
      return { error: `Unbekanntes Tool: ${name}` };
  }
}

/**
 * Tool-Ausführung für den SUPPORT-Agenten. navigate_to ist immer erlaubt;
 * update_setting hängt von der Berechtigung ab (explain/confirm/auto).
 */
async function execSupportTool(name: string, args: any, permission: string): Promise<any> {
  if (name === 'navigate_to') {
    const route = String(args?.route ?? '').trim();
    if (!route.startsWith('/')) return { error: 'Ungültige Route' };
    return { ok: true, navigate: route, label: String(args?.label ?? route) };
  }
  if (name === 'update_setting') {
    const key = String(args?.key ?? '').trim();
    const spec = SUPPORT_SETTABLE[key];
    if (!spec) return { error: `Einstellung "${key}" ist nicht änderbar oder existiert nicht.` };

    // Wert typgerecht parsen
    let value: any = args?.value;
    if (spec.type === 'boolean') value = value === true || value === 'true' || value === 1 || value === '1';
    else if (spec.type === 'number') { value = Number(value); if (isNaN(value)) return { error: 'Wert ist keine Zahl' }; }
    else { value = String(value); if (spec.enum && !spec.enum.includes(value)) return { error: `Wert muss eines sein von: ${spec.enum.join(', ')}` }; }

    if (permission === 'explain') {
      return { ok: false, denied: true, message: `Ich darf Einstellungen nicht selbst ändern (Berechtigung „nur erklären"). Ich zeig dir, wo du es setzt.` };
    }
    if (permission === 'confirm') {
      return { ok: true, proposal: { kind: 'setting', key, value, label: spec.label, displayValue: typeof value === 'boolean' ? (value ? 'aktiviert' : 'deaktiviert') : String(value) } };
    }
    // auto: direkt anwenden
    try {
      const repo = remult.repo(CompanySettings);
      const s = (await repo.findFirst()) ?? repo.create();
      (s as any)[key] = value;
      await repo.save(s);
      return { ok: true, applied: true, label: spec.label, displayValue: typeof value === 'boolean' ? (value ? 'aktiviert' : 'deaktiviert') : String(value) };
    } catch (e: any) {
      return { error: e?.message ?? 'Speichern fehlgeschlagen' };
    }
  }
  return { error: `Unbekanntes Support-Tool: ${name}` };
}

// ───────────────────────────────────────────────────────────────────────
// LLM-Calls (OpenAI-kompatibel)
// ───────────────────────────────────────────────────────────────────────

class LlmConfigError extends Error {
  /** User-facing config-action that resolves the error (link target). */
  action: { label: string; routerLink: string };
  constructor(message: string, action: { label: string; routerLink: string }) {
    super(message);
    this.name = 'LlmConfigError';
    this.action = action;
  }
}

async function getLlmConfig() {
  const settings = await remult.repo(CompanySettings).findFirst();
  if (!settings) {
    throw new LlmConfigError(
      'CompanySettings nicht gefunden — Firma anlegen.',
      { label: 'Firmen-Einstellungen öffnen', routerLink: '/settings/company' },
    );
  }
  if (!settings.moduleLlm) {
    throw new LlmConfigError(
      'KI-Assistent ist nicht aktiviert.',
      { label: 'Modul aktivieren', routerLink: '/settings/module' },
    );
  }
  if (!settings.llmBaseUrl) {
    throw new LlmConfigError(
      'LLM Base-URL fehlt — z. B. http://localhost:8791/v1 für llama.cpp.',
      { label: 'LLM-Konfiguration öffnen', routerLink: '/settings/company' },
    );
  }
  if (!settings.llmModel) {
    throw new LlmConfigError(
      'LLM Modell fehlt — Dateiname/Identifier eintragen.',
      { label: 'LLM-Konfiguration öffnen', routerLink: '/settings/company' },
    );
  }
  return {
    baseUrl: settings.llmBaseUrl.replace(/\/+$/, ''),
    apiKey: settings.llmApiKey || 'none',
    model: settings.llmModel,
  };
}

async function callLlm(
  messages: any[],
  cfg: { baseUrl: string; apiKey: string; model: string },
  opts: { tools?: any[]; toolChoice?: 'auto' | 'none' | 'required'; temperature?: number; maxTokens?: number } = {},
) {
  const body: any = {
    model: cfg.model,
    messages,
    temperature: opts.temperature ?? 0.1,
    top_p: 0.9,
    stream: false,
  };
  if (opts.tools !== undefined) body.tools = opts.tools;
  if (opts.toolChoice !== undefined) body.tool_choice = opts.toolChoice;
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM-Backend antwortete ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json() as Promise<any>;
}

function filterToolsForSkill(skill: Skill | null): any[] {
  if (!skill || !skill.tools.length) return TOOLS;
  const allowed = new Set(skill.tools);
  return TOOLS.filter((t: any) => allowed.has(t?.function?.name));
}

/**
 * Skill-Routing via LLM. Schneller Mini-Call: gibt Skill-Name zurück.
 * Wird nur aufgerufen wenn trigger-keyword-Match nichts findet — bei den meisten
 * Anfragen reicht der Trigger-Match (kein zusätzlicher LLM-Roundtrip).
 */
async function routeWithLlm(
  userMessage: string,
  skills: Skill[],
  cfg: { baseUrl: string; apiKey: string; model: string },
): Promise<Skill | null> {
  const sysList = skills.map((s) => `- ${s.name}: ${s.description}`).join('\n');
  const sys = `Du bist ein Skill-Router für ein Buchhaltungs-System. Lies die User-Nachricht und antworte mit dem Namen genau EINER Skill (kein Erklärtext, kein Punkt am Ende).

Verfügbare Skills:
${sysList}

Wenn nichts klar passt: antworte mit "fallback".`;
  try {
    const r = await callLlm(
      [{ role: 'system', content: sys }, { role: 'user', content: userMessage }],
      cfg,
      { temperature: 0, maxTokens: 24, toolChoice: 'none' },
    );
    const text = String(r?.choices?.[0]?.message?.content ?? '').trim().toLowerCase();
    // Erste Wortgruppe extrahieren — manche Modelle hängen Erklärungen an
    const pick = text.split(/[\s,.\n]+/)[0]?.replace(/[^a-z0-9_-]/g, '');
    return skills.find((s) => s.name === pick) ?? null;
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────
// Routen
// ───────────────────────────────────────────────────────────────────────

llm.get('/api/llm/ping', api.withRemult, async (_req, res) => {
  try {
    const cfg = await getLlmConfig();
    const modelsRes = await fetch(`${cfg.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (!modelsRes.ok) {
      res.status(502).json({ ok: false, error: `Backend antwortete ${modelsRes.status}` });
      return;
    }
    const data = (await modelsRes.json()) as any;
    const models = Array.isArray(data?.data) ? data.data.map((m: any) => m?.id).filter(Boolean) : [];
    res.json({ ok: true, baseUrl: cfg.baseUrl, configuredModel: cfg.model, availableModels: models.slice(0, 50) });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message ?? 'unbekannter Fehler' });
  }
});

// ───────────────────────────────────────────────────────────────────────
// Execute — User-Confirmation für Write-Proposals.
// Validiert das Proposal erneut server-side (LLM ist nicht trusted) und
// erzeugt den jeweiligen Entwurf via Remult — Audit-Log erhält source='llm'
// über X-Source-Header der von audit-proxy ausgewertet wird.
// ───────────────────────────────────────────────────────────────────────

llm.post('/api/llm/execute', api.withRemult, async (req, res) => {
  try {
    if (!(req as any).session?.user) {
      res.status(401).json({ error: 'Nicht eingeloggt' });
      return;
    }
    const proposal = req.body?.proposal;
    if (!proposal || typeof proposal !== 'object') {
      res.status(400).json({ error: 'proposal fehlt' });
      return;
    }
    switch (proposal.kind) {
      case 'setting': {
        // Support-Agent (Berechtigung confirm): bestätigte Einstellungs-Änderung
        const key = String(proposal.key ?? '');
        const spec = SUPPORT_SETTABLE[key];
        if (!spec) { res.status(400).json({ error: 'Einstellung nicht änderbar' }); return; }
        const repo = remult.repo(CompanySettings);
        const s = (await repo.findFirst()) ?? repo.create();
        (s as any)[key] = proposal.value;
        await repo.save(s);
        res.json({ ok: true });
        return;
      }
      case 'invoice': {
        const customerId = String(proposal.customerId ?? '');
        const customer = (await remult.repo(Person).findFirst({ id: customerId }))
          ?? (await remult.repo(Company).findFirst({ id: customerId }));
        if (!customer) { res.status(400).json({ error: 'Kunde nicht gefunden' }); return; }
        const addr = await remult.repo(Address).findFirst({ customerId });
        const inv = remult.repo(Invoice).create();
        inv.customerId = customerId;
        inv.subject = String(proposal.subject ?? '');
        inv.invoiceDate = new Date();
        if (addr) {
          inv.address = [addr.street, `${addr.zip ?? ''} ${addr.city ?? ''}`.trim(), addr.country].filter(Boolean).join('\n');
        }
        const saved = await remult.repo(Invoice).save(inv);
        const rawItems = Array.isArray(proposal.items) ? proposal.items : [];
        for (let i = 0; i < rawItems.length; i++) {
          const it = rawItems[i];
          const item = remult.repo(InvoiceItem).create();
          item.invoiceId = saved.id;
          item.name = String(it.name ?? '');
          item.description = String(it.description ?? '');
          item.quantity = Number(it.quantity ?? 1);
          item.amountType = it.amountType ?? 'Stk';
          item.price = Number(it.price ?? 0);
          item.vat = Number(it.vat ?? 20);
          await remult.repo(InvoiceItem).save(item);
        }
        res.json({ ok: true, kind: 'invoice', id: saved.id, number: saved.invoiceNumber, navigateTo: `/m/invoice/${saved.id}` });
        return;
      }

      case 'time_entry': {
        const project = await remult.repo(Project).findFirst({ id: String(proposal.projectId ?? '') });
        if (!project) { res.status(400).json({ error: 'Projekt nicht gefunden' }); return; }
        const te = remult.repo(TimeEntry).create();
        te.projectId = project.id;
        te.date = new Date(String(proposal.date ?? new Date().toISOString().substring(0, 10)));
        te.hours = Number(proposal.hours ?? 0);
        te.hourlyRate = Number(proposal.hourlyRate ?? project.hourlyRate ?? 0);
        te.description = String(proposal.description ?? '');
        const saved = await remult.repo(TimeEntry).save(te);
        res.json({ ok: true, kind: 'time_entry', id: saved.id, navigateTo: `/m/project/${project.id}` });
        return;
      }

      case 'person': {
        const p = remult.repo(Person).create();
        p.firstname = String(proposal.firstname ?? '');
        p.lastname = String(proposal.lastname ?? '');
        if (proposal.salutation) (p as any).salutation = String(proposal.salutation);
        if (proposal.email) p.email = String(proposal.email);
        if (proposal.phone) p.phone = String(proposal.phone);
        if (proposal.vatId) p.vatId = String(proposal.vatId);
        const saved = await remult.repo(Person).save(p);
        if (proposal.address) {
          const a = remult.repo(Address).create();
          a.customerId = saved.id;
          a.street = String(proposal.address.street ?? '');
          a.zip = String(proposal.address.zip ?? '');
          a.city = String(proposal.address.city ?? '');
          a.country = String(proposal.address.country ?? 'AT');
          await remult.repo(Address).save(a);
        }
        res.json({ ok: true, kind: 'person', id: saved.id, navigateTo: `/m/customer/${saved.id}` });
        return;
      }

      case 'company': {
        const c = remult.repo(Company).create();
        c.name = String(proposal.name ?? '');
        c.nameAddon = String(proposal.nameAddon ?? '');
        if (proposal.email) c.email = String(proposal.email);
        if (proposal.phone) c.phone = String(proposal.phone);
        if (proposal.vatId) c.vatId = String(proposal.vatId);
        const saved = await remult.repo(Company).save(c);
        if (proposal.address) {
          const a = remult.repo(Address).create();
          a.customerId = saved.id;
          a.street = String(proposal.address.street ?? '');
          a.zip = String(proposal.address.zip ?? '');
          a.city = String(proposal.address.city ?? '');
          a.country = String(proposal.address.country ?? 'AT');
          await remult.repo(Address).save(a);
        }
        res.json({ ok: true, kind: 'company', id: saved.id, navigateTo: `/m/customer/${saved.id}` });
        return;
      }

      case 'expense': {
        const exp = remult.repo(Expense).create();
        exp.date = new Date(String(proposal.date ?? new Date().toISOString().substring(0, 10)));
        (exp as any).category = String(proposal.category ?? 'Sonstiges');
        exp.netTotal = Number(proposal.netTotal ?? 0);
        exp.vatRate = Number(proposal.vatRate ?? 20);
        exp.grossTotal = Number(proposal.grossTotal ?? (exp.netTotal * (1 + exp.vatRate / 100)));
        exp.vendor = String(proposal.vendor ?? '');
        exp.description = String(proposal.description ?? '');
        const saved = await remult.repo(Expense).save(exp);
        res.json({ ok: true, kind: 'expense', id: saved.id, navigateTo: `/m/expense/${saved.id}/edit` });
        return;
      }

      case 'reminder': {
        const { Reminder } = await import('../shared/entities/reminder');
        const inv = await remult.repo(Invoice).findFirst({ id: String(proposal.invoiceId ?? '') });
        if (!inv) { res.status(400).json({ error: 'Rechnung nicht gefunden' }); return; }
        const rem = remult.repo(Reminder).create();
        rem.invoiceId = inv.id;
        rem.stage = Number(proposal.stage) as 1 | 2 | 3;
        rem.reminderDate = new Date(String(proposal.reminderDate ?? new Date().toISOString().substring(0, 10)));
        rem.dueDate = new Date(String(proposal.dueDate ?? new Date().toISOString().substring(0, 10)));
        rem.interestRate = Number(proposal.interestRate ?? 0);
        rem.interestAmount = Number(proposal.interestAmount ?? 0);
        rem.reminderFee = Number(proposal.reminderFee ?? 0);
        rem.totalDue = Number(proposal.totalDue ?? 0);
        const settings = await remult.repo(CompanySettings).findFirst();
        rem.bodyText =
          rem.stage === 1 ? (settings?.reminderText1 ?? '')
          : rem.stage === 2 ? (settings?.reminderText2 ?? '')
          : (settings?.reminderText3 ?? '');
        const saved = await remult.repo(Reminder).save(rem);
        res.json({ ok: true, kind: 'reminder', id: saved.id, number: saved.reminderNumber, navigateTo: `/m/invoice/${inv.id}` });
        return;
      }

      default:
        res.status(400).json({ error: `Unbekannter Proposal-Typ: ${proposal.kind}` });
        return;
    }
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'unbekannter Fehler' });
  }
});

/**
 * Lädt die persistierte Conversation. Mit conversationId: spezifische Row.
 * Ohne: jüngste nicht-archivierte des Users (Backward-Compat).
 */
async function loadConversationTurns(userId: string, conversationId?: string): Promise<any[]> {
  const { Conversation } = await import('../shared/entities/conversation');
  const repo = remult.repo(Conversation);
  let conv;
  if (conversationId) {
    conv = await repo.findFirst({ id: conversationId, userId });
  } else {
    const all = await repo.find({ where: { userId, archived: false }, orderBy: { updatedAt: 'desc' as any } });
    conv = all[0];
  }
  if (!conv) return [];
  try {
    const arr = JSON.parse(conv.turnsJson || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Bereinigt persistierte History für strenge Chat-Templates (Mistral/Ministral):
 * - nur user + finale assistant-TEXT-Turns (Tool-Call-Stubs + tool-Results raus)
 * - strikt alternierend ab einer user-Message
 * - endet nie mit einer offenen user-Message (die wird gleich durch die neue
 *   Frage ersetzt)
 * So entsteht garantiert ein „system, user, assistant, user, …"-Verlauf,
 * egal wie kaputt die gespeicherte Tool-Sequenz war.
 */
function sanitizeHistory(turns: any[]): any[] {
  const clean = turns
    .filter((m: any) =>
      (m?.role === 'user' && typeof m.content === 'string' && m.content.trim()) ||
      (m?.role === 'assistant' && typeof m.content === 'string' && m.content.trim() &&
        !(Array.isArray(m.tool_calls) && m.tool_calls.length)),
    )
    .map((m: any) => ({ role: m.role, content: m.content }));

  const out: any[] = [];
  for (const m of clean) {
    if (!out.length) {
      if (m.role !== 'user') continue; // muss mit user beginnen
      out.push(m);
    } else if (out[out.length - 1].role === m.role) {
      out[out.length - 1] = m; // gleiche Rolle hintereinander → letzte behalten
    } else {
      out.push(m);
    }
  }
  if (out.length && out[out.length - 1].role === 'user') out.pop();
  return out;
}

/**
 * Speichert neue Turns ans Ende der angegebenen Conversation (oder der
 * jüngsten nicht-archivierten). Erzeugt Conversation falls noch keine
 * existiert. Setzt Titel aus der ersten User-Message wenn noch leer.
 */
async function appendConversationTurns(
  userId: string,
  newTurns: any[],
  conversationId?: string,
): Promise<{ id: string; title: string }> {
  if (!newTurns.length) return { id: '', title: '' };
  const { Conversation } = await import('../shared/entities/conversation');
  const repo = remult.repo(Conversation);
  let conv;
  if (conversationId) {
    conv = await repo.findFirst({ id: conversationId, userId });
  } else {
    const all = await repo.find({ where: { userId, archived: false }, orderBy: { updatedAt: 'desc' as any } });
    conv = all[0];
  }
  if (!conv) {
    conv = repo.create();
    conv.userId = userId;
    conv.title = '';
    conv.turnsJson = '[]';
    conv.turnCount = 0;
  }
  let existing: any[] = [];
  try {
    const arr = JSON.parse(conv.turnsJson || '[]');
    if (Array.isArray(arr)) existing = arr;
  } catch { /* ignore */ }
  const merged = [...existing, ...newTurns].slice(-200);

  // Auto-Titel aus erster User-Message wenn noch leer
  if (!conv.title) {
    const firstUserMsg = merged.find((t) => t.role === 'user' && typeof t.content === 'string');
    if (firstUserMsg) {
      conv.title = String(firstUserMsg.content).substring(0, 60).replace(/\s+/g, ' ').trim();
    }
  }

  conv.turnsJson = JSON.stringify(merged);
  conv.turnCount = merged.length;
  const saved = await repo.save(conv);
  return { id: saved.id, title: saved.title };
}

/**
 * GET /api/llm/conversations — Liste aller nicht-archivierten Conversations
 * des Users, sortiert nach jüngste-Aktivität zuerst.
 */
llm.get('/api/llm/conversations', api.withRemult, async (req, res) => {
  const user = (req as any).session?.user;
  if (!user) { res.status(401).json({ error: 'Nicht eingeloggt' }); return; }
  const { Conversation } = await import('../shared/entities/conversation');
  const all = await remult.repo(Conversation).find({
    where: { userId: user.id, archived: false },
    orderBy: { updatedAt: 'desc' as any },
  });
  res.json({
    conversations: all.map((c) => ({
      id: c.id,
      title: c.title || '(unbenannter Chat)',
      turnCount: c.turnCount,
      updatedAt: c.updatedAt,
    })),
  });
});

/**
 * GET /api/llm/conversation?id=… — spezifische Conversation laden. Ohne ID:
 * jüngste aktive (Backward-Compat).
 */
llm.get('/api/llm/conversation', api.withRemult, async (req, res) => {
  const user = (req as any).session?.user;
  if (!user) { res.status(401).json({ error: 'Nicht eingeloggt' }); return; }
  const id = String(req.query['id'] ?? '');
  const turns = await loadConversationTurns(user.id, id || undefined);
  // Title + id mitschicken damit Client den State syncen kann
  const { Conversation } = await import('../shared/entities/conversation');
  let convInfo: any = null;
  if (id) {
    convInfo = await remult.repo(Conversation).findFirst({ id, userId: user.id });
  } else {
    const all = await remult.repo(Conversation).find({
      where: { userId: user.id, archived: false },
      orderBy: { updatedAt: 'desc' as any },
    });
    convInfo = all[0];
  }
  res.json({
    turns,
    count: turns.length,
    id: convInfo?.id ?? null,
    title: convInfo?.title ?? null,
  });
});

/**
 * POST /api/llm/conversation — neue, leere Conversation anlegen.
 * Returns {id, title} damit Client direkt switchen kann.
 */
llm.post('/api/llm/conversation', api.withRemult, async (req, res) => {
  const user = (req as any).session?.user;
  if (!user) { res.status(401).json({ error: 'Nicht eingeloggt' }); return; }
  const { Conversation } = await import('../shared/entities/conversation');
  const conv = remult.repo(Conversation).create();
  conv.userId = user.id;
  conv.title = '';
  conv.turnsJson = '[]';
  conv.turnCount = 0;
  const saved = await remult.repo(Conversation).save(conv);
  res.json({ id: saved.id, title: saved.title });
});

/**
 * DELETE /api/llm/conversation?id=… — Conversation **archivieren** (Soft-
 * Delete via Base.archived). Daten bleiben für Audit/§132-BAO erhalten.
 * Ohne id: jüngste aktive archivieren (Backward-Compat).
 */
llm.delete('/api/llm/conversation', api.withRemult, async (req, res) => {
  const user = (req as any).session?.user;
  if (!user) { res.status(401).json({ error: 'Nicht eingeloggt' }); return; }
  const id = String(req.query['id'] ?? '');
  const { Conversation } = await import('../shared/entities/conversation');
  const repo = remult.repo(Conversation);
  let conv;
  if (id) {
    conv = await repo.findFirst({ id, userId: user.id });
  } else {
    const all = await repo.find({ where: { userId: user.id, archived: false }, orderBy: { updatedAt: 'desc' as any } });
    conv = all[0];
  }
  if (conv) {
    conv.archived = true;
    await repo.save(conv);
  }
  res.json({ ok: true, archived: !!conv });
});

llm.post('/api/llm/chat', api.withRemult, async (req, res) => {
  try {
    if (!(req as any).session?.user) {
      res.status(401).json({ error: 'Nicht eingeloggt' });
      return;
    }
    const sessionUser = (req as any).session.user;
    const cfg = await getLlmConfig();
    const incomingMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!incomingMessages.length) {
      res.status(400).json({ error: 'messages fehlt' });
      return;
    }
    // Persist-Flag: Default an. Client kann via persistEnabled:false opten.
    const persistEnabled = req.body?.persistEnabled !== false;
    // Optionaler conversationId — wenn der Client eine spezifische Konvers.
    // adressiert (Multi-Chat-Modus). Ohne id wird die jüngste aktive verwendet.
    const conversationIdArg: string = String(req.body?.conversationId ?? '').trim();

    // History laden + die neue User-Message vom Client dazupacken.
    // Achtung: Bei aktiven persist-Mode erwartet der Server die NEUE Message
    // (oder mehrere neue, falls Client batched) — wir filtern bereits gesehene
    // raus indem wir nur die letzte zusammenhängende user-Sequenz nehmen.
    let userMessages: any[];
    if (persistEnabled) {
      const history = await loadConversationTurns(sessionUser.id, conversationIdArg || undefined);
      // Client sendet aus Effizienzgründen nur die NEUE User-Message.
      // Heuristik: nimm die letzte user-Message aus incomingMessages als
      // „neuen Turn", merge mit history, ignoriere alles davor.
      const newUserMsg = [...incomingMessages].reverse().find((m: any) => m.role === 'user');
      if (!newUserMsg) {
        res.status(400).json({ error: 'Keine user-Message in messages gefunden' });
        return;
      }
      // Window: max 40 vorherige Turns mitschicken (Token-Budget). Zwischen-
      // Tool-Messages werden mit-truncated; wenn der Cut mitten in einer
      // tool_call→tool_response-Sequenz landet, baue die Lücke weg.
      const windowed = history.slice(-40);
      userMessages = [...windowed, newUserMsg];
    } else {
      userMessages = incomingMessages;
    }

    const settings = await remult.repo(CompanySettings).findFirst();

    // Skill-Routing: erst billiger Trigger-Match, sonst Mini-LLM-Router.
    // Nur die LETZTE User-Message wird gerouted — Multi-Turn nutzt den selben
    // Skill bis User offensichtlich Thema wechselt (zukünftige Verbesserung).
    const lastUserMsg = [...userMessages].reverse().find((m: any) => m.role === 'user');
    const lastUserText = String(lastUserMsg?.content ?? '');
    const allSkills = loadSkills();
    let activeSkill: Skill | null = quickRouteByTrigger(allSkills, lastUserText);
    if (!activeSkill && allSkills.length) {
      activeSkill = await routeWithLlm(lastUserText, allSkills, cfg);
    }
    const baseSystem = buildSystemPrompt(settings ?? null);
    const skillSystem = activeSkill
      ? `${baseSystem}\n\n═══════════════════════════════════════════════════════════\nAKTIVE SKILL: ${activeSkill.name}\n═══════════════════════════════════════════════════════════\n\n${activeSkill.body}`
      : baseSystem;
    const skillTools = filterToolsForSkill(activeSkill);

    const messages: any[] = [{ role: 'system', content: skillSystem }, ...userMessages];

    // Tool-Use-Loop: max 6 Runden um Endlos-Loops zu vermeiden
    const toolTrace: any[] = [];
    for (let round = 0; round < 6; round++) {
      // require_tools-Skill (z.B. „abfrage"): erste Runde erzwingt Tool-Call,
      // damit das Modell nicht aus dem Bauch heraus Zahlen halluziniert.
      // Folge-Runden auf 'auto' damit das Modell die finale Antwort formulieren kann.
      const enforce = (activeSkill?.requireTools && round === 0) ? 'required' as const : 'auto' as const;
      const completion = await callLlm(messages, cfg, { tools: skillTools, toolChoice: enforce });
      const choice = completion?.choices?.[0];
      const msg = choice?.message;
      if (!msg) {
        res.status(502).json({ error: 'LLM lieferte keine Message zurück', raw: completion });
        return;
      }
      const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

      // Anti-Halluzinations-Defensive: wenn der Bot ohne Tool-Call eine
      // "Entwurf erzeugt"/"angelegt"/"erstellt"-Aussage macht, lügt er den
      // User an (die Bestätigungs-Karte erscheint nie). In dem Fall ein
      // weiteres Mal mit tool_choice=required nachfragen — das zwingt das
      // Modell zum echten Tool-Call. Greift nur bei Skills mit Write-Tools.
      const hasWriteTools = skillTools.some((t: any) =>
        ['create_person', 'create_company', 'draft_invoice',
         'book_time_entry', 'draft_expense', 'draft_reminder'].includes(t?.function?.name)
      );
      if (!toolCalls.length && hasWriteTools && round === 0) {
        const replyText = String(msg.content ?? '').toLowerCase();
        const HALLUC_PATTERNS = /(entwurf|vorschlag).*(erzeugt|erstellt|angelegt|gespeichert)|(angelegt|erstellt|gespeichert)\b/;
        if (HALLUC_PATTERNS.test(replyText)) {
          console.warn('[llm] Halluzination detected — Bot behauptet Erstellung ohne Tool-Call. Re-Run mit required.');
          // Verwirf die fehlerhafte Antwort, zwinge Tool-Call in nächster Runde.
          const forced = await callLlm(messages, cfg, { tools: skillTools, toolChoice: 'required' });
          const forcedMsg = forced?.choices?.[0]?.message;
          if (forcedMsg && Array.isArray(forcedMsg.tool_calls) && forcedMsg.tool_calls.length) {
            messages.push(forcedMsg);
            for (const tc of forcedMsg.tool_calls) {
              const name = tc?.function?.name;
              let args: any = {};
              try { args = JSON.parse(tc?.function?.arguments ?? '{}'); } catch { args = {}; }
              const result = await execTool(name, args);
              toolTrace.push({ name, args, result });
              messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
            }
            continue;
          }
          // Fallback: ursprüngliche Antwort durchreichen (besser als Endlos-Loop)
        }
      }

      messages.push(msg);
      if (!toolCalls.length) {
        // Persistierung: nur die wirklich NEU hinzugekommenen Turns ans Ende
        // der Conversation hängen. Das sind:
        //   1) die ursprüngliche neue User-Message
        //   2) der finale Assistant-Reply
        //   3) (etwaige) Assistant-Tool-Calls + Tool-Results dazwischen
        let persistedConversationId = conversationIdArg;
        let persistedTitle = '';
        if (persistEnabled) {
          const newUserMsg = userMessages[userMessages.length - 1];
          const startIdx = 1 + userMessages.length;
          const appended = [newUserMsg, ...messages.slice(startIdx)];
          try {
            const persisted = await appendConversationTurns(
              sessionUser.id,
              appended,
              conversationIdArg || undefined,
            );
            persistedConversationId = persisted.id;
            persistedTitle = persisted.title;
          } catch (e) {
            console.error('[llm] persist failed:', e);
          }
        }
        res.json({
          reply: msg.content ?? '',
          toolTrace,
          finishReason: choice.finish_reason,
          skill: activeSkill?.name ?? null,
          conversationId: persistedConversationId,
          conversationTitle: persistedTitle,
        });
        return;
      }
      for (const tc of toolCalls) {
        const name = tc?.function?.name;
        let args: any = {};
        try { args = JSON.parse(tc?.function?.arguments ?? '{}'); } catch { args = {}; }
        const result = await execTool(name, args);
        toolTrace.push({ name, args, result });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    }
    res.status(504).json({ error: 'Tool-Use-Loop überschritt 6 Runden' });
  } catch (e: any) {
    if (e instanceof LlmConfigError) {
      res.status(400).json({ error: e.message, action: e.action, configError: true });
    } else {
      res.status(500).json({ error: e?.message ?? 'unbekannter Fehler' });
    }
  }
});

// ───────────────────────────────────────────────────────────────────────
// Streaming-Chat (SSE) — Live-Tool-Calls + getipptes Antwort-Streaming.
// Unterstützt beide Agenten via agentId ('accountant' | 'support').
// ───────────────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  find_customer: 'Suche Kunden',
  list_invoices: 'Lese Rechnungen',
  get_outstanding: 'Prüfe Außenstände',
  summarize_year: 'Werte Jahr aus',
  list_expenses: 'Lese Ausgaben',
  list_recurring: 'Lese Wiederkehrende',
  get_uva: 'Berechne UVA',
  list_reminders: 'Lese Mahnungen',
  draft_reminder: 'Erstelle Mahnungs-Entwurf',
  count_entities: 'Zähle Einträge',
  list_projects: 'Lese Projekte',
  draft_invoice: 'Erstelle Rechnungs-Entwurf',
  book_time_entry: 'Buche Stunden',
  create_person: 'Lege Person an',
  create_company: 'Lege Firma an',
  draft_expense: 'Erstelle Ausgaben-Entwurf',
  navigate_to: 'Öffne Seite',
  update_setting: 'Ändere Einstellung',
  remember: 'Merke mir das',
  forget: 'Vergesse',
};
function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

/**
 * Selbstkontrolle (Reflexion): bewertet via separatem, zustandslosem LLM-Call,
 * ob die ANTWORT die FRAGE vollständig + korrekt anhand der Tool-DATEN
 * beantwortet. Zustandslos (eigenes system+user-Array) → template-sicher,
 * unabhängig vom Haupt-Verlauf. Gibt {ok, issue} zurück.
 */
async function verifyAnswer(
  question: string,
  toolTrace: any[],
  answer: string,
  cfg: { baseUrl: string; apiKey: string; model: string },
): Promise<{ ok: boolean; issue: string }> {
  const data = JSON.stringify(
    toolTrace.map((t) => ({ tool: t.name, args: t.args, result: t.result })),
  ).slice(0, 4000);
  const sys =
    'Du bist ein strenger interner Prüfer einer Buchhaltungs-Software. Bewerte, ob die ANTWORT die FRAGE des Nutzers vollständig und korrekt ausschließlich anhand der DATEN (Tool-Ergebnisse) beantwortet. ' +
    'Achte auf: fehlende Tool-Aufrufe, ignorierte Datenfelder, erfundene Werte, halbe Antworten, Rückfragen statt Antworten. ' +
    'Antworte mit GENAU "OK" wenn die Antwort passt. Sonst mit einer einzigen knappen Anweisung (1 Satz), was konkret zu tun ist, damit die Antwort stimmt (z.B. welches Tool noch fehlt).';
  const usr = `FRAGE:\n${question}\n\nDATEN (Tool-Ergebnisse):\n${data || '(keine Tools aufgerufen)'}\n\nANTWORT:\n${answer}\n\nUrteil:`;
  try {
    const r = await callLlm(
      [{ role: 'system', content: sys }, { role: 'user', content: usr }],
      cfg,
      { toolChoice: 'none', temperature: 0, maxTokens: 90 },
    );
    const txt = String(r?.choices?.[0]?.message?.content ?? '').trim();
    const ok = /^ok\b/i.test(txt) || txt.toLowerCase() === 'ok' || txt.toLowerCase().startsWith('ok.');
    return { ok, issue: ok ? '' : txt };
  } catch {
    // Prüfer-Fehler → nicht blockieren, Antwort durchlassen.
    return { ok: true, issue: '' };
  }
}

/** Geldbetrag im AT-Format. */
function eurFmt(n: number): string {
  return (Number(n) || 0).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

/**
 * Baut für die hart-verdrahteten Intents eine FERTIGE Markdown-Pipe-Tabelle
 * aus den strukturierten Tool-Daten — damit die Tabelle IMMER sauber rendert,
 * unabhängig davon ob das (kleine) Modell Pipe-Syntax verwendet. Das Modell
 * steuert danach nur noch einen kurzen Kommentar bei.
 * Gibt Markdown zurück oder null (dann formatiert das Modell selbst).
 */
function formatForcedTable(name: string, r: any): string | null {
  if (name === 'get_outstanding') {
    if (!r || !r.count) return 'Aktuell sind **keine** Rechnungen offen. 🎉';
    const rows = (r.byCustomer ?? []).map((c: any) => `| ${c.name} | ${eurFmt(c.total)} |`).join('\n');
    let md = `| Kunde | Offen |\n|---|---|\n${rows}\n| **Gesamt** | **${eurFmt(r.totalGross)}** |`;
    const extra: string[] = [`${r.count} offene Rechnung${r.count === 1 ? '' : 'en'}`];
    if (r.overdueCount) extra.push(`davon **${r.overdueCount} überfällig**`);
    if (r.oldestDate) extra.push(`älteste vom ${r.oldestDate.split('-').reverse().join('.')}`);
    md += `\n\n${extra.join(' · ')}.`;
    if (r.overdueCount) md += `\n\nSoll ich die überfälligen Rechnungen mahnen?`;
    return md;
  }
  if (name === 'summarize_year') {
    if (!r) return null;
    let md = `**Jahr ${r.year}**\n\n| Kennzahl | Wert |\n|---|---|\n` +
      `| Umsatz (brutto) | ${eurFmt(r.grossRevenue)} |\n` +
      `| Ausgaben (brutto) | ${eurFmt(r.totalExpenses)} |\n` +
      `| Saldo | ${eurFmt(r.balance)} |\n` +
      `| Rechnungen | ${r.invoiceCount} |`;
    if (Array.isArray(r.top5Customers) && r.top5Customers.length) {
      md += `\n\n**Top-Kunden**\n\n| # | Kunde | Umsatz |\n|---|---|---|\n` +
        r.top5Customers.map((c: any, i: number) => `| ${i + 1} | ${c.name} | ${eurFmt(c.gross)} |`).join('\n');
    }
    return md;
  }
  if (name === 'count_entities') {
    const lines: string[] = [];
    if (r.customers) lines.push(`| Kunden | ${r.customers.total} |`);
    if (r.invoices) lines.push(`| Rechnungen | ${r.invoices.total} |`);
    if (r.projects) lines.push(`| Projekte | ${r.projects.total} |`);
    if (r.expenses) lines.push(`| Ausgaben | ${r.expenses.total} |`);
    if (!lines.length) return null;
    return `| Bereich | Anzahl |\n|---|---|\n${lines.join('\n')}`;
  }
  if (name === 'get_uva') {
    if (!r || r.error) return null;
    const zahllast = Number(r.zahllast) || 0;
    let md = `**USt-Voranmeldung ${r.period}**\n\n| Kennzahl | Betrag |\n|---|---|\n` +
      `| Umsatzsteuer | ${eurFmt(r.ustSumme)} |\n` +
      `| Vorsteuer | ${eurFmt(r.kz?.kz060_vorsteuer)} |\n` +
      `| **${r.zahllastLabel}** | **${eurFmt(Math.abs(zahllast))}** |`;
    const extra: string[] = [`${r.invoiceCount} Ausgangsrechnung${r.invoiceCount === 1 ? '' : 'en'}`,
      `${r.expenseCount} Beleg${r.expenseCount === 1 ? '' : 'e'}`];
    md += `\n\n${extra.join(' · ')}.`;
    if (r.isKleinunternehmer) md += `\n\n_Kleinunternehmer — i. d. R. keine USt-Voranmeldung nötig (§ 6 Abs. 1 Z 27 UStG)._`;
    return md;
  }
  if (name === 'list_projects') {
    if (!r) return null;
    if (!r.count) return 'Aktuell sind **keine** aktiven Projekte angelegt.';
    const rows = (r.rows ?? []).map((p: any) =>
      `| ${p.name} | ${p.customerName} | ${p.hourlyRate ? eurFmt(p.hourlyRate) + '/h' : '—'} |`).join('\n');
    let md = `| Projekt | Kunde | Satz |\n|---|---|---|\n${rows}`;
    md += `\n\n${r.count} aktive Projekt${r.count === 1 ? '' : 'e'}`;
    if (r.count > (r.rows?.length ?? 0)) md += ` (Top ${r.rows.length} gezeigt)`;
    md += '.';
    return md;
  }
  if (name === 'get_period_summary') {
    if (!r) return null;
    if (r.error) return String(r.error);
    return `**${r.period}**\n\n| Kennzahl | Wert |\n|---|---|\n` +
      `| Einnahmen (brutto) | ${eurFmt(r.grossRevenue)} |\n` +
      `| Ausgaben (brutto) | ${eurFmt(r.totalExpenses)} |\n` +
      `| **Saldo** | **${eurFmt(r.balance)}** |\n` +
      `| Rechnungen | ${r.invoiceCount} |`;
  }
  if (name === 'get_expense_breakdown') {
    if (!r) return null;
    if (r.error) return String(r.error);
    if (!r.count) return `Im Zeitraum **${r.period}** sind keine Ausgaben erfasst.`;
    const rows = (r.byCategory ?? []).map((c: any) => `| ${c.category} | ${eurFmt(c.gross)} | ${c.count} |`).join('\n');
    return `**Ausgaben ${r.period}**\n\n| Kategorie | Brutto | Belege |\n|---|---|---|\n${rows}\n` +
      `| **Gesamt** | **${eurFmt(r.totalGross)}** | **${r.count}** |`;
  }
  if (name === 'get_customer_detail') {
    if (!r) return null;
    if (r.error) return String(r.error);
    let md = `**${r.name}** · ${r.type}${r.vatId ? ` · UID ${r.vatId}` : ''}\n\n| Kennzahl | Wert |\n|---|---|\n` +
      `| Umsatz gesamt | ${eurFmt(r.totalRevenue)} |\n` +
      `| Offen | ${eurFmt(r.openAmount)}${r.openCount ? ` (${r.openCount} Rg.)` : ''} |\n` +
      `| Rechnungen | ${r.invoiceCount} |\n` +
      `| Aktive Projekte | ${r.activeProjects} |`;
    if (r.lastNote) md += `\n\n_Letzte Notiz: ${r.lastNote}_`;
    return md;
  }
  if (name === 'get_invoice_detail') {
    if (!r) return null;
    if (r.error) return String(r.error);
    const de = (s: string | null) => s ? s.split('-').reverse().join('.') : '—';
    let md = `**Rechnung ${r.number}** · ${r.status}\n\n| Feld | Wert |\n|---|---|\n` +
      `| Kunde | ${r.customer} |\n` +
      (r.subject ? `| Betreff | ${r.subject} |\n` : '') +
      `| Datum | ${de(r.date)} |\n` +
      `| Fällig | ${de(r.dueDate)} |\n` +
      `| Netto | ${eurFmt(r.netTotal)} |\n` +
      `| **Brutto** | **${eurFmt(r.grossTotal)}** |`;
    if (r.reverseCharge) md += `\n\n_Reverse-Charge._`;
    return md;
  }
  if (name === 'list_offers') {
    if (!r) return null;
    if (r.error) return String(r.error);
    if (!r.count) return r.filter ? `Keine Angebote mit Status **${r.filter}**.` : 'Aktuell sind **keine** Angebote erfasst.';
    const rows = (r.rows ?? []).map((o: any) => `| ${o.number} | ${o.customer} | ${o.status} | ${eurFmt(o.gross)} |`).join('\n');
    let md = `**Angebote${r.filter ? ` (${r.filter})` : ''}**\n\n| Nr. | Kunde | Status | Brutto |\n|---|---|---|---|\n${rows}`;
    md += `\n\n${r.count} Angebot${r.count === 1 ? '' : 'e'}`;
    if (r.count > (r.rows?.length ?? 0)) md += ` (Top ${r.rows.length} gezeigt)`;
    md += '.';
    return md;
  }
  if (name === 'get_bank_status') {
    if (!r) return null;
    if (r.error) return String(r.error);
    let md = `**Bank-Abgleich**\n\n| Status | Anzahl |\n|---|---|\n` +
      `| **Nicht zugeordnet** | **${r.openCount}** |\n` +
      `| Zugeordnet | ${r.matchedCount} |\n` +
      (r.ignoredCount ? `| Ignoriert | ${r.ignoredCount} |\n` : '') +
      `| Gesamt | ${r.total} |`;
    if (r.openCount) md += `\n\nOffen: Eingang ${eurFmt(r.openCredit)} · Ausgang ${eurFmt(r.openDebit)}.`;
    return md;
  }
  if (name === 'list_assets') {
    if (!r) return null;
    if (r.error) return String(r.error);
    if (!r.count) return 'Aktuell sind **keine** Anlagen erfasst.';
    const rows = (r.rows ?? []).map((a: any) => `| ${a.name} | ${a.category} | ${eurFmt(a.cost)} | ${a.gwg ? 'GWG' : `${a.usefulLife} J.`} |`).join('\n');
    let md = `**Anlagenverzeichnis**\n\n| Anlage | Kategorie | Kosten | Nutzung |\n|---|---|---|---|\n${rows}\n| **Gesamt** |  | **${eurFmt(r.totalCost)}** |  |`;
    md += `\n\n${r.count} Anlage${r.count === 1 ? '' : 'n'}.`;
    return md;
  }
  if (name === 'list_travel') {
    if (!r) return null;
    if (r.error) return String(r.error);
    if (!r.count) return `Im Zeitraum **${r.period}** sind keine Reisen erfasst.`;
    const rows = (r.rows ?? []).map((tr: any) => `| ${tr.date ? tr.date.split('-').reverse().join('.') : '—'} | ${tr.destination} | ${tr.purpose} | ${eurFmt(tr.amount)} |`).join('\n');
    let md = `**Reisekosten ${r.period}**\n\n| Datum | Ziel | Zweck | Betrag |\n|---|---|---|---|\n${rows}\n| **Gesamt** |  |  | **${eurFmt(r.totalAmount)}** |`;
    md += `\n\n${r.count} Reise${r.count === 1 ? '' : 'n'}.`;
    return md;
  }
  if (name === 'get_unbilled_time') {
    if (!r) return null;
    if (r.error) return String(r.error);
    if (!r.count) return 'Aktuell sind **keine** unverrechneten Stunden offen. 🎉';
    const hf = (h: number) => h.toLocaleString('de-AT');
    const rows = (r.byProject ?? []).map((p: any) => `| ${p.project} | ${hf(p.hours)} h | ${eurFmt(p.amount)} |`).join('\n');
    let md = `**Noch abrechenbar**\n\n| Projekt | Stunden | Betrag |\n|---|---|---|\n${rows}\n` +
      `| **Gesamt** | **${hf(r.totalHours)} h** | **${eurFmt(r.totalAmount)}** |`;
    md += `\n\n${r.count} unverrechnete Buchung${r.count === 1 ? '' : 'en'}.`;
    return md;
  }
  if (name === 'list_capabilities') {
    return `**Das kann ich für dich** — frag einfach in deinen Worten:\n\n` +
      `**Fragen & Auswerten**\n` +
      `- Außenstände & überfällige Rechnungen, Umsatz (Jahr/Monat/Quartal), Top-Kunden\n` +
      `- Kundenakte (alles zu einem Kunden), einzelne Rechnung, offene Angebote\n` +
      `- Ausgaben nach Kategorie, Anlagenverzeichnis, Reisekosten\n` +
      `- Unverrechnete Stunden, USt-Voranmeldung (UVA), Bank-Abgleich-Status\n` +
      `- ESt-/SVS-Vorschau & Zusammenfassende Meldung (ich bring dich zur Seite)\n\n` +
      `**Anlegen — du bestätigst, bevor etwas gespeichert wird**\n` +
      `- Kunden, Rechnungen, Zeitbuchungen, Ausgaben, Mahnungen\n\n` +
      `Beispiele: „wer schuldet mir noch Geld?" · „wie lief mein Jahr?" · ` +
      `„alles über MetalTec" · „wie viel kann ich noch abrechnen?"`;
  }
  if (name === 'get_customer_invoices') {
    if (!r) return null;
    if (r.error) return String(r.error);
    if (!r.count) return `Für **${r.customer}** sind keine Rechnungen erfasst.`;
    const de = (s: string | null) => s ? s.split('-').reverse().join('.') : '—';
    const rows = (r.rows ?? []).map((i: any) => `| ${i.number} | ${de(i.date)} | ${eurFmt(i.gross)} | ${i.status} |`).join('\n');
    let md = `**Rechnungen — ${r.customer}**\n\n| Nr. | Datum | Brutto | Status |\n|---|---|---|---|\n${rows}\n` +
      `| **Gesamt** |  | **${eurFmt(r.totalGross)}** |  |`;
    md += `\n\n${r.count} Rechnung${r.count === 1 ? '' : 'en'}`;
    if (r.openGross > 0.005) md += `, davon **${eurFmt(r.openGross)}** offen`;
    md += '.';
    return md;
  }
  if (name === 'get_open_payables') {
    if (!r) return null;
    if (r.error) return String(r.error);
    if (!r.count) return 'Du hast **keine** offenen Eingangsrechnungen — alles bezahlt. 🎉';
    const de = (s: string | null) => s ? s.split('-').reverse().join('.') : '—';
    const rows = (r.rows ?? []).map((e: any) => `| ${e.vendor} | ${de(e.date)} | ${eurFmt(e.gross)} |`).join('\n');
    const more = r.count > (r.rows?.length ?? 0);
    let md = `**Offene Eingangsrechnungen (zu zahlen)**\n\n| Lieferant | Datum | Brutto |\n|---|---|---|\n${rows}` +
      (more ? `\n| … |  |  |` : '') +
      `\n| **Gesamt** |  | **${eurFmt(r.totalGross)}** |`;
    md += `\n\n${r.count} offene Ausgabe${r.count === 1 ? '' : 'n'}`;
    if (more) md += ` (Top ${r.rows.length} gezeigt)`;
    md += '.';
    return md;
  }
  return null;
}

/**
 * Hart verdrahtete Intents: bei eindeutigen Fragen wählen wir das Tool
 * deterministisch im Code (statt der unzuverlässigen Tool-Wahl kleiner
 * Modelle zu vertrauen). Gibt {name,args} zurück oder null.
 * Das Ergebnis wird dem Modell als Kontext gegeben — es formatiert nur noch.
 */
function resolveForcedTool(text: string): { name: string; args: any } | null {
  const t = text.toLowerCase();
  const has = (...ws: string[]) => ws.some((w) => t.includes(w));
  const mentionsCustomer = has(' von ', 'kunde ', 'kunden ', 'firma ', 'bei ');

  // Selbstauskunft → list_capabilities (deterministisch, was kann der Agent).
  if (has('was kannst du', 'was kannst du alles', 'wobei kannst du', 'womit kannst du',
      'wie kannst du helfen', 'was du alles kannst', 'welche möglichkeiten')) {
    return { name: 'list_capabilities', args: {} };
  }

  // Kundenakte / 360-Grad → get_customer_detail. Name nach dem Trigger
  // extrahieren. Deterministisch erzwingen, weil das Modell sonst gern
  // find_customer+list_invoices kombiniert und dabei Zahlen halluziniert.
  {
    const triggers = ['alles über ', 'alles ueber ', 'alles zu ', 'kundenakte ',
      'kundenkonto ', 'komplett über ', 'komplett zu ', 'alles von ', 'übersicht zu ', 'uebersicht zu '];
    for (const trig of triggers) {
      const idx = t.indexOf(trig);
      if (idx === -1) continue;
      const name = text.slice(idx + trig.length).trim()
        .replace(/[?!.]+$/, '').replace(/\s+(komplett|bei mir|aus|info|infos|details?)$/i, '').trim();
      // Nicht erzwingen wenn es um eine Daten-Kategorie statt einen Kunden geht.
      const generic = /\b(rechnung|rechnungen|ausgabe|ausgaben|projekt|projekte|kunde|kunden|umsatz|steuer|uva|monat|jahr|quartal|beleg|belege|anlagen|offene|außenstände|aussenstände)\b/i;
      if (name.length >= 2 && !generic.test(name)) {
        return { name: 'get_customer_detail', args: { query: name } };
      }
    }
  }

  // Rechnungen eines Kunden → get_customer_invoices (Name nach Trigger).
  // Verhindert, dass das Modell Rechnungs-Details halluziniert.
  {
    const m = t.match(/rechnung(?:en)?\s+(?:von|für|fuer|an)\s+(.+)$/);
    const cand = m && m[1] ? text.slice(t.indexOf(m[1]), t.indexOf(m[1]) + m[1].length).trim().replace(/[?!.]+$/, '') : '';
    const m2 = !cand ? t.match(/was hab(?:e)? ich (.+?) (?:gestellt|verrechnet|fakturiert|in rechnung gestellt)/) : null;
    const cand2 = m2 && m2[1] ? text.slice(t.indexOf(m2[1]), t.indexOf(m2[1]) + m2[1].length).trim() : '';
    const name = cand || cand2;
    // Nicht bei Zeitraum-Bezug („rechnungen von 2026 / letztem monat") — das ist
    // keine Kundenfrage.
    const isTime = /\b(20\d\d|monat|jahr|quartal|woche|heute|gestern|letzt|diese[mn]?|vorige[mn]?|gestrig)\b/.test(name.toLowerCase()) || /^\d+$/.test(name);
    if (name.length >= 2 && !isTime) {
      return { name: 'get_customer_invoices', args: { query: name } };
    }
  }

  // Einzelne Rechnung nach Nummer → get_invoice_detail. Nicht bei Mengen-/
  // Listen-Fragen („wie viele rechnungen", „welche rechnungen offen").
  if (!has('wie viele', 'wieviele', 'welche', 'alle ', 'liste', 'offene', 'überfällige', 'ueberfällige', 'unbezahlte')) {
    const invMatch = t.match(/rechnung(?:snr|snummer|s-nr)?\.?\s+(?:nr\.?\s*|nummer\s+)?(\d[\d\-\/]*)/);
    if (invMatch && invMatch[1]) {
      return { name: 'get_invoice_detail', args: { number: invMatch[1] } };
    }
  }

  // Angebote → list_offers. MUSS vor get_outstanding stehen, weil „offen"
  // („welche angebote sind offen") sonst faelschlich Außenstände triggert.
  if (has('angebot', 'angebote', 'offerte', 'offerten')) {
    let st = '';
    if (has('angenommen', 'gewonnen', 'zugesagt')) st = 'won';
    else if (has('abgelehnt', 'verloren', 'abgesagt')) st = 'lost';
    else if (has('entwurf')) st = 'draft';
    else if (has('abgelaufen')) st = 'expired';
    else if (has('offen')) st = 'sent';
    return { name: 'list_offers', args: st ? { status: st } : {} };
  }

  // Bank-Abgleich → get_bank_status (spezifische Phrasen, keine Kollision).
  if (has('bank-abgleich', 'bankabgleich', 'nicht zugeordnet', 'offene buchungen',
      'offene bankbuchungen', 'bankbuchungen', 'kontoabgleich')) {
    return { name: 'get_bank_status', args: {} };
  }

  // Anlagen / AfA → list_assets.
  if (has('anlagenverzeichnis', 'anlagevermögen', 'anlagevermoegen', 'meine anlagen',
      'afa', 'abschreibung', 'abschreibungen', 'wirtschaftsgüter', 'wirtschaftsgueter')) {
    return { name: 'list_assets', args: {} };
  }

  // Reisekosten → list_travel (optional Jahr).
  if (has('reisekosten', 'dienstreise', 'dienstreisen', 'diäten', 'diaeten',
      'kilometergeld', 'km-geld', 'kmgeld')) {
    const m = t.match(/\b(20\d{2})\b/);
    return { name: 'list_travel', args: m ? { period: m[1] } : {} };
  }

  // Unverrechnete Stunden → get_unbilled_time.
  if (has('unverrechnet', 'noch abrechnen', 'noch abrechenbar', 'abrechenbar',
      'offene leistungen', 'offene stunden', 'nicht abgerechnet')) {
    return { name: 'get_unbilled_time', args: {} };
  }
  // Steuer-Hochrechnungen → zur autoritativen Seite navigieren (forced, weil
  // das 3B sonst abwinkt statt zu navigieren). NICHT im Chat approximieren —
  // ESt/SVS sind eigene Berechnungen; Accuracy hat Vorrang.
  if (has('est-vorschau', 'einkommensteuer', 'einkommenssteuer', 'est vorschau', 'est-rechner')) {
    return { name: 'navigate_to', args: { route: '/est', label: 'ESt-Vorschau' } };
  }
  if (has('svs-vorschau', 'sozialversicherung', 'svs voranschlag', 'svs-beitrag', 'svs beitrag')) {
    return { name: 'navigate_to', args: { route: '/svs', label: 'SVS-Vorschau' } };
  }
  if (has('zusammenfassende meldung', 'zm-meldung', 'zm meldung', 'zm-export')) {
    return { name: 'navigate_to', args: { route: '/at-tax/zm', label: 'Zusammenfassende Meldung' } };
  }

  // Offene Eingangsrechnungen / Verbindlichkeiten → get_open_payables (was ICH
  // zahlen muss). VOR get_outstanding, und nicht bei Finanzamt/USt (→ get_uva).
  if (!has('finanzamt', 'ust', 'umsatzsteuer', 'uva', 'vorsteuer') &&
      has('was muss ich noch zahlen', 'was muss ich zahlen', 'was muss ich selber zahlen',
          'was muss ich selber noch zahlen', 'was muss ich überweisen', 'was schulde ich',
          'offene ausgaben', 'offene eingangsrechnung', 'meine verbindlichkeiten', 'verbindlichkeiten',
          'was ich zahlen muss', 'noch zu zahlen')) {
    return { name: 'get_open_payables', args: {} };
  }

  // Offene Rechnungen / Außenstände → get_outstanding (eindeutig, kein Kundenbezug)
  if (!mentionsCustomer && has('außenstände', 'aussenstände', 'außenstand', 'offene rechnung',
      'offene rechnungen', 'noch offen', 'unbezahlte rechnung', 'überfällige rechnung',
      'ueberfällige rechnung', 'was ist offen', 'was schuldet')) {
    return { name: 'get_outstanding', args: {} };
  }

  // Anzahl-Fragen → count_entities mit erkanntem Typ
  if (has('wie viele', 'wieviele', 'anzahl')) {
    let what = 'all';
    if (has('kunde')) what = 'customers';
    else if (has('rechnung')) what = 'invoices';
    else if (has('projekt')) what = 'projects';
    else if (has('ausgabe', 'beleg')) what = 'expenses';
    return { name: 'count_entities', args: { what } };
  }

  // Jahresumsatz / Top-Kunden → summarize_year (Jahr aus Text, sonst aktuelles)
  if (has('jahresumsatz', 'umsatz', 'top kunden', 'top-kunden', 'bestkunden', 'top 5 kunden', 'top5')) {
    const m = t.match(/\b(20\d{2})\b/);
    const year = m ? parseInt(m[1]!, 10) : new Date().getFullYear();
    return { name: 'summarize_year', args: { year } };
  }

  // Projektliste → list_projects. Nur volle Listen-Phrasen (keine Kollision
  // mit spezifischen Lookups wie „stundensatz von projekt X").
  if (has('meine projekte', 'welche projekte', 'aktive projekte', 'laufende projekte',
      'offene projekte', 'alle projekte', 'projektliste', 'projekte an', 'die projekte',
      'projekte auf')) {
    return { name: 'list_projects', args: {} };
  }
  return null;
}

/**
 * Deterministisches Navigations-Routing für den SUPPORT-Agenten. Das 3B
 * verwechselt im Prompt benachbarte Fakten (z.B. „IBAN → Bank-Tab" mit
 * „SMTP → nur mobil") und halluziniert Limitierungen. Bei klaren „wo stell
 * ich X ein"-Intents navigieren wir darum deterministisch auf den richtigen
 * Settings-Tab. SMTP/E-Mail bewusst NICHT (Desktop hat dafür kein Formular).
 */
function resolveSupportNav(text: string): { name: string; args: any } | null {
  const t = text.toLowerCase();
  const has = (...ws: string[]) => ws.some((w) => t.includes(w));
  // Erklär-/How-to-Intents NICHT navigieren — der User will eine Anleitung,
  // keine Seite. (z.B. „zeig mir WIE ich eine Rechnung schreibe".)
  if (has('wie funktioniert', 'wie geht das', 'wie geht ', 'wie schreib', 'wie erstell',
      'wie mach ich ein', 'wie lege ich', 'wie buche ich', 'wie storniere', 'wie versende',
      'was ist ', 'was bedeutet', 'was heißt', 'warum', 'erklär', 'erkläre', 'unterschied zwischen')) {
    return null;
  }
  const wantsLocation = has('wo ', 'wohin', 'wie stell', 'wie änder', 'wie änd', 'wie aktivier',
    'wo finde', 'wo seh', 'wo sehe', 'wo kann ich', 'wo trag', 'wo gebe', 'wo gib', 'wo mach',
    'wie komme', 'bring mich', 'geh zu', 'öffne', 'zeig mir', 'einstellen', 'eintragen',
    'einrichten', 'hinterlegen', 'aktivier', 'deaktivier', 'ändern', 'wo ist');
  if (!wantsLocation) return null;
  // SMTP/E-Mail-Versand ist auf dem Desktop NICHT pflegbar → nicht hin-navigieren.
  if (has('smtp', 'e-mail-versand', 'email-versand', 'mail-versand', 'mailversand', 'mail versand')) return null;
  const nav = (route: string, label: string) => ({ name: 'navigate_to', args: { route, label } });

  // ── Modul ein/aus ──
  if (has('modul') ||
      (has('aktivier', 'deaktivier', 'einschalten', 'ausschalten') &&
       has('projekt', 'produkt', 'ausgab', 'mahnw', 'svs', 'einkommensteuer', 'anlage', 'reisekost', 'kassabuch', 'arbeitszeit'))) {
    return nav('/settings/module', 'Module');
  }

  // ── Einstellungen (Firma-Tabs) — VOR den Feature-Seiten, da spezifischer ──
  if (has('iban', 'bic', 'bankverbindung', 'bankdaten', 'kontonummer', 'bankleitzahl', 'bankname')) return nav('/settings/company?tab=Bank', 'Firma – Bank & Kontakt');
  if (has('kleinunternehmer', 'uid', 'ust-id', 'gisa', 'steuernummer')) return nav('/settings/company?tab=Steuer', 'Firma – Steuer & UID');
  if (has('verzugszins', 'mahnspesen', 'mahngebühr', 'mahngebuehr', 'mahntext', 'mahn-default', 'mahneinstellung')) return nav('/settings/company?tab=Mahnwesen', 'Firma – Mahnwesen');
  if (has('logo', 'skonto', 'rechnungslayout', 'rechnungs-layout')) return nav('/settings/company?tab=Rechnungs-Layout', 'Firma – Rechnungs-Layout');
  if (has('nummernkreis', 'rechnungsnummer', 'nummernformat', 'nummern-format')) return nav('/settings/number-ranges', 'Nummernkreise');
  if (has('firmenname', 'firmenadresse', 'stammdaten', 'absender', 'firmenanschrift')) return nav('/settings/company?tab=Stammdaten', 'Firma – Stammdaten');
  if (has('passwort')) return nav('/change-password', 'Passwort ändern');

  // ── Feature-Seiten (wo seh ich / wo mach ich X) ──
  if (has('uva', 'umsatzsteuervoranmeldung', 'voranmeldung', 'u30')) return nav('/at-tax/uva', 'USt-Voranmeldung');
  if (has('zusammenfassende meldung', 'zm-meldung', 'zm-export', 'ig-leistung')) return nav('/at-tax/zm', 'Zusammenfassende Meldung');
  if (has('svs', 'sozialversicherung')) return nav('/svs', 'SVS-Vorschau');
  if (has('est-vorschau', 'einkommensteuer', 'einkommenssteuer')) return nav('/est', 'ESt-Vorschau');
  if (has('mahnung', 'mahnungen', 'mahnwesen')) return nav('/reminders', 'Mahnungen');
  if (has('angebot', 'offerte', 'auftragsbestätigung', 'lieferschein')) return nav('/om/offers', 'Angebote');
  if (has('wiederkehr', 'abo-rechnung', 'dauerrechnung')) return nav('/recurring', 'Wiederkehrende Rechnungen');
  if (has('rechnung')) return nav('/om/invoice', 'Rechnungen');
  if (has('zeitbuchung', 'stundenbuchung', 'stunden buchen', 'zeiterfassung')) return nav('/pm/time-entries', 'Zeitbuchungen');
  if (has('projekt')) return nav('/pm/overview', 'Projekte');
  if (has('kunde', 'kunden', 'crm', 'firma anlegen', 'person anlegen')) return nav('/crm/overview', 'Kunden');
  if (has('ausgabe', 'ausgaben', 'beleg', 'eingangsrechnung')) return nav('/expenses', 'Ausgaben');
  if (has('anlage', 'afa', 'abschreibung', 'wirtschaftsgut')) return nav('/assets', 'Anlagen');
  if (has('reisekost', 'dienstreise', 'diäten', 'kilometergeld')) return nav('/travel', 'Reisekosten');
  if (has('bank-abgleich', 'bankabgleich', 'abgleich', 'kontoauszug', 'camt', 'bankumsätze', 'kontobewegung')) return nav('/bank/abgleich', 'Bank-Abgleich');
  if (has('produkt')) return nav('/products', 'Produkte');
  if (has('kassabuch', 'kassa', 'barkasse')) return nav('/cashbook', 'Kassabuch');
  if (has('bmd', 'steuerberater-export')) return nav('/at-tax/bmd-export', 'BMD-Export');
  if (has('finanzamt-export', 'jahres-zip', 'finanzamt export')) return nav('/admin/tax-export', 'Finanzamt-Export');
  if (has('analyse', 'auswertung', 'statistik', 'kennzahl')) return nav('/analytics', 'Analyse');
  if (has('backup', 'sicherung', 'datensicherung')) return nav('/admin/backups', 'Backups');
  if (has('audit', 'änderungsprotokoll', 'protokoll')) return nav('/admin/audit-log', 'Audit-Log');
  if (has('dashboard', 'startseite', 'kpi')) return nav('/', 'Dashboard');
  return null;
}

/**
 * Umgangssprache-Leitfaden für den Buchhalter: Few-Shot-Mapping von lockerer
 * Alltagssprache auf das richtige Tool. Kleine Modelle generalisieren Slang
 * schlecht — explizite Beispiele anchorn die Tool-Wahl. Wird an den System-
 * Prompt angehängt.
 */
const ACCOUNTANT_NL_GUIDE = `═══ UMGANGSSPRACHE → TOOL (Beispiele, frei übertragen) ═══
Der Chef redet locker. Übersetze die Absicht aufs richtige Tool — egal wie salopp:
- „wer schuldet mir noch kohle / geld / was", „was steht noch offen", „offene posten", „wer hat noch nicht gezahlt", „außenstände" → get_outstanding
- „wie viele kunden / rechnungen / projekte / belege", „wie viel hab ich an kunden" → count_entities
- „wie lief mein jahr", „top kunden", „beste kunden", „jahresumsatz" → summarize_year (Jahr + Top-Kunden)
- „wie viel hab ich diesen monat / im mai / dieses quartal eingenommen / gemacht", „saldo im …", „einnahmen + ausgaben monat" → get_period_summary (period = YYYY-MM / YYYY-Qn / YYYY)
- „wofür geb ich am meisten aus", „ausgaben nach kategorie", „größter kostenblock", „kostenübersicht" → get_expense_breakdown
- „alles über kunde X", „wie steht X bei mir", „kundenakte X", „zeig mir X komplett" → get_customer_detail
- „zeig mir rechnung 0029", „was steht auf rechnung X", „rechnung nummer X" → get_invoice_detail
- „welche angebote sind offen", „meine angebote", „angenommene angebote", „offene angebote" → list_offers
- „was ist noch nicht zugeordnet", „bank-abgleich status", „offene bankbuchungen" → get_bank_status
- „meine anlagen", „anlagenverzeichnis", „afa", „abschreibungen" → list_assets
- „reisekosten", „meine dienstreisen", „diäten", „kilometergeld" → list_travel
- „wie viel kann ich noch abrechnen", „unverrechnete stunden", „offene leistungen", „abrechenbar" → get_unbilled_time
- „ESt-Vorschau / Einkommensteuer", „SVS", „Zusammenfassende Meldung/ZM" → navigate_to die jeweilige Seite (/est, /svs, /at-tax/zm) — im Chat NICHT selbst hochrechnen
- „rechnungen von / für Kunde X", „was hab ich X gestellt / verrechnet" → get_customer_invoices (NICHT selbst Zahlen erfinden!)
- „was muss ich ans finanzamt", „wie viel ust" → get_uva
- „was muss ich (selber) noch zahlen", „offene ausgaben", „was schulde ich", „verbindlichkeiten" → get_open_payables
- „wer ist X", „find mir Y" → find_customer
- „meine projekte", „was läuft grad" → list_projects
- „schreib ne rechnung an …", „mach ne rechnung", „X soll Y zahlen" → draft_invoice
- „neuer kunde …", „leg … an" → create_person / create_company
- „X stunden auf … gebucht", „trag … stunden ein" → book_time_entry
- „ausgabe … €", „beleg von …", „hab … gekauft" → draft_expense
Wenn die Absicht unklar ist, frag EINE kurze Rückfrage statt zu raten.`;

/**
 * Deterministischer Intent→Tool-Hinweis für den Buchhalter. Fängt die
 * häufigsten Fragen ab, bei denen kleine Modelle daneben greifen.
 * Gibt eine knappe Anweisung zurück (oder '' wenn kein klarer Treffer).
 */
function accountantIntentHint(text: string): string {
  const t = text.toLowerCase();
  const has = (...ws: string[]) => ws.some((w) => t.includes(w));
  // Offene Rechnungen / Außenstände → get_outstanding (kein find_customer!)
  if (has('außenstände', 'aussenstände', 'außenstand', 'offene rechnung', 'offene rechnungen', 'noch offen', 'unbezahlt', 'überfällig', 'ueberfällig', 'schuldet', 'nicht bezahlt')
      && !has('von ', 'kunde ', 'kunden ')) {
    return 'Nutze JETZT das Tool get_outstanding (ohne Argumente). NICHT find_customer — es geht um den Rechnungs-Status, nicht um eine Kundensuche.';
  }
  // Anzahl / wie viele → count_entities
  if (has('wie viele', 'wieviele', 'anzahl')) {
    return 'Nutze count_entities mit dem passenden what (customers/invoices/projects/expenses/all).';
  }
  // Umsatz / Top-Kunden → summarize_year
  if (has('umsatz', 'top kunden', 'top-kunden', 'bestkunden', 'jahresumsatz')) {
    return 'Nutze summarize_year mit dem gefragten Jahr.';
  }
  return '';
}

llm.post('/api/llm/chat/stream', api.withRemult, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  (res as any).flushHeaders?.();
  const sse = (obj: any) => { res.write(`data: ${JSON.stringify(obj)}\n\n`); };

  try {
    if (!(req as any).session?.user) { sse({ type: 'error', message: 'Nicht eingeloggt' }); res.end(); return; }
    const sessionUser = (req as any).session.user;
    const cfg = await getLlmConfig();
    const incomingMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!incomingMessages.length) { sse({ type: 'error', message: 'messages fehlt' }); res.end(); return; }
    const persistEnabled = req.body?.persistEnabled !== false;
    const conversationIdArg = String(req.body?.conversationId ?? '').trim();
    const agentId = String(req.body?.agentId ?? 'accountant');
    const settings = await remult.repo(CompanySettings).findFirst();

    let userMessages: any[];
    if (persistEnabled) {
      // History NUR laden, wenn eine konkrete Conversation adressiert ist.
      // Ohne ID ist es ein NEUER Chat (Widget/„Neuer Chat") — nicht die
      // jüngste fortsetzen, sonst poltert man in einen fremden Verlauf.
      const history = conversationIdArg
        ? await loadConversationTurns(sessionUser.id, conversationIdArg)
        : [];
      const newUserMsg = [...incomingMessages].reverse().find((m: any) => m.role === 'user');
      if (!newUserMsg) { sse({ type: 'error', message: 'Keine user-Message' }); res.end(); return; }
      // Strenge Chat-Templates (Mistral/Ministral via llama.cpp) verlangen
      // strikt abwechselnde user/assistant-Rollen nach dem System-Prompt.
      // Persistierte Tool-Sequenzen (assistant mit tool_calls + tool-Results)
      // brechen das, besonders wenn ein früherer Loop ohne finale Antwort
      // abbrach. Darum: History auf saubere user/assistant-TEXT-Turns
      // reduzieren und strikt alternierend machen.
      userMessages = [...sanitizeHistory(history.slice(-40)), newUserMsg];
    } else {
      userMessages = incomingMessages;
    }

    // ── Agent-Auswahl: Prompt + Tools + Exec-Funktion ────────────────
    let systemPrompt: string;
    let tools: any[];
    let activeSkillName: string | null = null;
    let requireFirstTool = false;
    let execFn: (name: string, args: any) => Promise<any>;
    let forced: { name: string; args: any } | null = null;

    if (agentId === 'support') {
      const permission = settings?.supportAgentPermission ?? 'explain';
      systemPrompt = buildSupportSystemPrompt(settings ?? null, permission);
      tools = SUPPORT_TOOLS;
      execFn = (name, args) => execSupportTool(name, args, permission);
      // Klare „wo stell ich X ein"-Intents deterministisch navigieren — das 3B
      // halluziniert sonst Settings-Limitierungen (verwechselt IBAN mit SMTP).
      const lastUserMsg = [...userMessages].reverse().find((m: any) => m.role === 'user');
      forced = resolveSupportNav(String(lastUserMsg?.content ?? ''));
    } else {
      const lastUserMsg = [...userMessages].reverse().find((m: any) => m.role === 'user');
      const lastUserText = String(lastUserMsg?.content ?? '');
      const allSkills = loadSkills();
      let activeSkill: Skill | null = quickRouteByTrigger(allSkills, lastUserText);
      if (!activeSkill && allSkills.length) activeSkill = await routeWithLlm(lastUserText, allSkills, cfg);
      const baseSystem = buildSystemPrompt(settings ?? null);
      systemPrompt = activeSkill
        ? `${baseSystem}\n\n═══════════════════════════════════════════════════════════\nAKTIVE SKILL: ${activeSkill.name}\n═══════════════════════════════════════════════════════════\n\n${activeSkill.body}`
        : baseSystem;
      // ALLE Tools verfügbar machen (opencode-Ansatz: das geplante Modell
      // wählt selbst). Die Skill liefert nur noch Workflow-Guidance, schränkt
      // aber die Tool-Wahl NICHT mehr ein — das war bei Umgangssprache zu
      // brüchig (falsche Skill → falsches Tool-Subset).
      tools = TOOLS;
      activeSkillName = activeSkill?.name ?? null;
      requireFirstTool = !!activeSkill?.requireTools;
      execFn = execTool;

      // Umgangssprache-Leitfaden immer mitgeben (robuste Tool-Wahl bei Slang).
      systemPrompt += `\n\n${ACCOUNTANT_NL_GUIDE}`;

      // Hart verdrahtete Top-Intents: bei eindeutigen Fragen Tool im Code
      // wählen (schnellster Pfad). Sonst greift Planung + Post-hoc-Formatting.
      forced = resolveForcedTool(lastUserText);
      if (!forced) {
        const hint = accountantIntentHint(lastUserText);
        if (hint) systemPrompt += `\n\n═══ HINWEIS ZUR AKTUELLEN FRAGE ═══\n${hint}`;
      }
    }

    // ── Anrede (Sie/Du) + Name erzwingen — überschreibt den Default-Ton
    //    des jeweiligen Prompts/agent.md. ──
    const addressForm = settings?.agentAddressForm === 'sie' ? 'sie' : 'du';
    const userName = String(settings?.agentUserName ?? '').trim();
    systemPrompt += addressForm === 'sie'
      ? `\n\n═══ ANREDE ═══\nSIEZE den Nutzer durchgängig (Sie-Form, höflich-förmlich). Niemals duzen.`
      : `\n\n═══ ANREDE ═══\nDUZE den Nutzer durchgängig (Du-Form, locker-kollegial).`;
    if (userName) {
      systemPrompt += ` Der Nutzer heißt ${userName} — sprich ihn gelegentlich persönlich mit Namen an (nicht in jeder Nachricht, sonst wirkt es aufdringlich).`;
    }
    // Eigener Agent-Name (optional)
    const agentName = (agentId === 'support'
      ? String(settings?.supportAgentName ?? '').trim()
      : String(settings?.accountantAgentName ?? '').trim());
    if (agentName) {
      systemPrompt += `\nDu heißt „${agentName}". Wenn der Nutzer fragt wer du bist oder dich anspricht, nutze diesen Namen.`;
    }

    // ── Agent-Memory: getrennt pro Agent injizieren + remember/forget-Tools
    //    immer verfügbar machen (auch unabhängig von Skill-Filter). ──
    const memoryScope = agentId === 'support' ? 'support' : 'accountant';
    const memories = await loadAgentMemories(memoryScope);
    systemPrompt += renderMemoryBlock(memories);
    tools = [...tools, ...MEMORY_TOOLS];
    const baseExecFn = execFn;
    execFn = (name, args) =>
      (name === 'remember' || name === 'forget')
        ? execMemoryTool(name, args, memoryScope)
        : baseExecFn(name, args);

    const messages: any[] = [{ role: 'system', content: systemPrompt }, ...userMessages];
    const toolTrace: any[] = [];
    const proposals: any[] = [];
    let navigate: { route: string; label: string } | null = null;
    let finalText = '';

    // ── Hart-verdrahteter Pfad: Tool deterministisch ausführen, Ergebnis dem
    //    Modell als Kontext geben, Modell formatiert nur noch (kein Tool-Loop,
    //    keine Fehl-Tool-Wahl). Template-sicher, da KEIN gefälschtes tool-Message
    //    injiziert wird — die Daten gehen in den System-Prompt. ──
    if (forced) {
      sse({ type: 'tool_call', name: forced.name, label: toolLabel(forced.name) });
      const result = await execFn(forced.name, forced.args);
      toolTrace.push({ name: forced.name, args: forced.args, result });
      if (result?.navigate) navigate = { route: result.navigate, label: result.label };
      if (result?.proposal) proposals.push(result.proposal);
      sse({ type: 'tool_result', name: forced.name, ok: !(result as any)?.error });

      const table = formatForcedTable(forced.name, result);
      if (navigate) {
        // Navigation (z.B. ESt/SVS/ZM) — kurzer deterministischer Satz, der
        // Client springt anhand des navigate-Feldes im done-Event hin.
        finalText = `Ich öffne **${navigate.label}** für dich.`;
      } else if (table) {
        // Vollständig deterministisch: Tabelle + Zusammenfassung + ggf. Mahn-
        // Angebot bauen WIR. Kein Modell-Kommentar — kleine Modelle wiederholen
        // sonst die Zahlen redundant. Schneller (keine zweite LLM-Runde) und
        // immer konsistent.
        finalText = table;
      } else {
        // Kein deterministisches Format → Modell formatiert die Rohdaten.
        messages[0].content +=
          `\n\n═══ BEREITS ABGERUFENE DATEN (via ${forced.name}) ═══\n${JSON.stringify(result)}\n\n` +
          `Beantworte die Frage JETZT NUR mit diesen Daten. Verwende ausschließlich Felder, die oben ` +
          `vorkommen — erfinde nichts. Formatiere als Markdown-Tabelle mit | Pipe |-Syntax.`;
        try {
          const completion = await callLlm(messages, cfg, { toolChoice: 'none' });
          finalText = String(completion?.choices?.[0]?.message?.content ?? '').trim();
        } catch { finalText = ''; }
      }
    }

    // ── Generierungs-Durchlauf: Tool-Loop (max 6 Runden) + garantierte
    //    Schluss-Antwort + Token-Leak-Cleaning. Als Closure, damit der
    //    Reflexions-Loop ihn mehrfach aufrufen kann. Gibt den Antworttext
    //    zurück, oder null wenn die Response hart abgebrochen wurde. ──
    const generateAnswer = async (): Promise<string | null> => {
      const seenCalls = new Set<string>();
      let brokeOnRepeat = false;
      let ft = '';
      for (let round = 0; round < 6; round++) {
        const enforce = (requireFirstTool && round === 0) ? 'required' as const : 'auto' as const;
        const completion = await callLlm(messages, cfg, { tools, toolChoice: enforce });
        const msg = completion?.choices?.[0]?.message;
        if (!msg) { sse({ type: 'error', message: 'LLM lieferte keine Message' }); res.end(); return null; }
        const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
        messages.push(msg);
        if (!toolCalls.length) { ft = String(msg.content ?? ''); break; }

        let anyNew = false;
        for (const tc of toolCalls) {
          const name = tc?.function?.name;
          let args: any = {};
          try { args = JSON.parse(tc?.function?.arguments ?? '{}'); } catch { args = {}; }
          const sig = `${name}:${JSON.stringify(args)}`;
          const repeat = seenCalls.has(sig);
          if (!repeat) { seenCalls.add(sig); anyNew = true; }
          sse({ type: 'tool_call', name, label: toolLabel(name) });
          const result = repeat
            ? { note: 'Dieser Tool-Call wurde bereits ausgeführt (gleiches Ergebnis). Beantworte jetzt die Frage anhand der bisherigen Ergebnisse.' }
            : await execFn(name, args);
          toolTrace.push({ name, args, result });
          if (result?.proposal) proposals.push(result.proposal);
          if (result?.navigate) navigate = { route: result.navigate, label: result.label };
          sse({ type: 'tool_result', name, ok: !(result as any)?.error });
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        if (!anyNew) { brokeOnRepeat = true; break; }
      }
      // Garantierte Schluss-Antwort (kein zweites system-Message → Nudge an [0]).
      if (!ft && !proposals.length) {
        try {
          messages[0].content += brokeOnRepeat
            ? '\n\nWICHTIG: Du hast dasselbe Tool mehrfach ohne neues Ergebnis aufgerufen. Beantworte JETZT die Frage in Worten anhand der vorhandenen Tool-Ergebnisse. Wenn nichts gefunden wurde, sag das ehrlich und schlag das passende Vorgehen vor.'
            : '\n\nWICHTIG: Fasse jetzt eine Antwort in Worten zusammen — anhand der bisherigen Tool-Ergebnisse. Wenn nichts Brauchbares dabei war, sag das ehrlich.';
          const finalCompletion = await callLlm(messages, cfg, { toolChoice: 'none' });
          ft = String(finalCompletion?.choices?.[0]?.message?.content ?? '').trim();
        } catch { /* Fallback-Text unten */ }
      }
      return ft
        .replace(/\[TOOL_CALLS\][\s\S]*$/i, '')
        .replace(/\[ARGS\][\s\S]*$/i, '')
        .replace(/<\|?tool_calls?\|?>[\s\S]*$/i, '')
        .trim();
    };

    if (!forced) {
      // ── ReAct-Planungsschritt (wie opencode): das Modell erst kurz ÜBERLEGEN
      //    lassen, welches Tool es braucht — DANN handeln. Kleine Modelle wählen
      //    so deutlich zuverlässiger als wenn man sofort einen Tool-Call erzwingt
      //    (das unterdrückt das Nachdenken). Template-sicher: eigener system+user-
      //    Plan-Call (toolChoice none), Plan wird dann an messages[0] angehängt. ──
      try {
        const toolNames = tools.map((t: any) => t?.function?.name).filter(Boolean);
        const planSys = {
          role: 'system',
          content: systemPrompt +
            `\n\n═══ JETZT NUR PLANEN ═══\nRufe noch KEIN Tool auf und antworte noch NICHT final. ` +
            `Überlege in EINEM kurzen Satz: Was will der Nutzer genau, und welches EINE Tool aus dieser Liste brauchst du dafür? ` +
            `Tools: ${toolNames.join(', ')}. Nenne den Tool-Namen explizit. Wenn kein Tool nötig ist, sag das.`,
        };
        const planC = await callLlm([planSys, ...userMessages], cfg, { toolChoice: 'none', temperature: 0, maxTokens: 120 });
        const plan = String(planC?.choices?.[0]?.message?.content ?? '')
          .replace(/\[TOOL_CALLS\][\s\S]*$/i, '').trim();
        if (plan) {
          sse({ type: 'tool_call', name: 'plan', label: 'Überlegt' });
          sse({ type: 'tool_result', name: 'plan', ok: true });
          messages[0].content += `\n\n═══ DEIN PLAN (folge ihm) ═══\n${plan}`;
        }
      } catch { /* Plan optional — bei Fehler normal weiter */ }

      const r0 = await generateAnswer();
      if (r0 === null) return;
      finalText = r0;

      // ── Reflexions-Loop: der Agent prüft seine eigene Antwort gegen die
      //    Tool-Daten und iteriert nach, wenn etwas fehlt — bounded (max 2),
      //    sonst Endlosgefahr/Modell-Verwirrung. Nur lesende Antworten (keine
      //    Proposals/Navigation). Sichtbar als „Prüft die Antwort"-Schritt.
      //    Feedback geht als user-Turn (template-sicher), intern markiert →
      //    wird nicht in die Conversation persistiert. ──
      // Nur EINE Reflexions-Runde: jede Iteration ist ein kompletter weiterer
      // Tool-Loop — auf langsamen lokalen Modellen sonst zu zäh. Ein größeres
      // Modell verträgt/nutzt mehr; dann kann man das hochdrehen.
      const reflectionOn = settings?.agentReflection === true;
      const question = String(userMessages[userMessages.length - 1]?.content ?? '');
      for (let v = 0; reflectionOn && finalText && !proposals.length && !navigate && v < 1; v++) {
        sse({ type: 'tool_call', name: 'self_check', label: 'Prüft die Antwort' });
        const verdict = await verifyAnswer(question, toolTrace, finalText, cfg);
        sse({ type: 'tool_result', name: 'self_check', ok: verdict.ok });
        if (verdict.ok) break;
        messages.push({
          role: 'user',
          content: `Interne Selbstprüfung ergab: ${verdict.issue} Korrigiere das jetzt — nutze bei Bedarf weitere Tools und gib dann die finale, vollständige Antwort.`,
          _internal: true,
        });
        const rn = await generateAnswer();
        if (rn === null) return;
        finalText = rn;
      }

      // ── Premium-Formatting auch im non-forced Pfad: hat das Modell ein
      //    formatierbares Daten-Tool genutzt, ersetzen wir seine (evtl.
      //    space-getrennte/unsaubere) Formatierung durch unsere deterministische
      //    Markdown-Tabelle. So sehen Antworten auf JEDE Formulierung gleich
      //    premium aus — nicht nur bei den keyword-forced Fällen. ──
      if (!proposals.length && !navigate) {
        const FMT = ['get_outstanding', 'summarize_year', 'count_entities', 'get_uva', 'list_projects',
          'get_period_summary', 'get_expense_breakdown', 'get_customer_detail',
          'get_invoice_detail', 'list_offers', 'get_bank_status', 'list_assets', 'list_travel',
          'get_unbilled_time', 'list_capabilities', 'get_customer_invoices', 'get_open_payables'];
        const last = [...toolTrace].reverse().find((t) => FMT.includes(t.name) && !(t.result as any)?.error);
        if (last) {
          const tbl = formatForcedTable(last.name, last.result);
          if (tbl) finalText = tbl;
        }
      }
    }

    if (!finalText && proposals.length) finalText = 'Vorschlag erstellt, bitte bestätigen.';
    // Letzte Sicherung: nie mit komplett leerer Antwort enden.
    if (!finalText) finalText = 'Da komme ich gerade nicht weiter — formulier die Frage bitte nochmal etwas anders, oder schalt oben den passenden Agenten um.';

    // Getipptes Streaming des finalen Texts (wortweise). Tool-Calls liefen
    // non-streamed (zuverlässiges Parsing bei lokalen Modellen), die Live-
    // Sichtbarkeit kommt über die tool_call/tool_result-Events oben.
    const chunks = finalText.match(/\S+\s*/g) ?? [];
    for (const ch of chunks) {
      sse({ type: 'token', text: ch });
      await new Promise((r) => setTimeout(r, 12));
    }

    let persistedConversationId = conversationIdArg;
    let persistedTitle = '';
    if (persistEnabled) {
      const newUserMsg = userMessages[userMessages.length - 1];
      const startIdx = 1 + userMessages.length;
      // Interne Reflexions-Feedback-Turns nicht persistieren (sonst tauchen sie
      // beim Reload als „User"-Nachrichten im Verlauf auf).
      const appended = [newUserMsg, ...messages.slice(startIdx).filter((m: any) => !m._internal)];
      try {
        const persisted = await appendConversationTurns(sessionUser.id, appended, conversationIdArg || undefined);
        persistedConversationId = persisted.id;
        persistedTitle = persisted.title;
      } catch (e) {
        console.error('[llm stream] persist failed:', e);
      }
    }

    sse({
      type: 'done',
      reply: finalText,
      toolTrace,
      proposals,
      navigate,
      skill: activeSkillName,
      conversationId: persistedConversationId,
      conversationTitle: persistedTitle,
    });
    res.end();
  } catch (e: any) {
    if (e instanceof LlmConfigError) {
      sse({ type: 'error', message: e.message, action: e.action, configError: true });
    } else {
      sse({ type: 'error', message: e?.message ?? 'unbekannter Fehler' });
    }
    res.end();
  }
});
