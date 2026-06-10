/**
 * DSGVO Art. 15 — Auskunftsrecht. Gibt einer betroffenen Person (Customer)
 * eine strukturierte Aufstellung aller über sie gespeicherten Daten:
 *   - Stammdaten (Name, Adresse, UID, …)
 *   - alle ausgestellten Rechnungen + Positionen
 *   - alle Projekte + Zeitbuchungen
 *   - Audit-Log-Einträge die ihre ID erwähnen
 *
 * Endpoint: GET /api/dsgvo/customer/:id (Admin only)
 * Liefert JSON als Download — kann ohne Weiterverarbeitung an den Customer
 * weitergegeben werden.
 *
 * Hinweis: Reine Auskunft. KEIN Löschen — §132 BAO blockt das ohnehin.
 * Spätere Phase: Anonymisierungs-Workflow (Name + Kontakt leeren,
 * Rechnungs-Numerik aber erhalten).
 */
import express from 'express';
import { repo, type UserInfo } from 'remult';
import { api } from './api';
import { Person } from '../shared/entities/person';
import { Company } from '../shared/entities/company';
import { Address } from '../shared/entities/address';
import { Invoice } from '../shared/entities/invoice';
import { InvoiceItem } from '../shared/entities/invoice-item';
import { Project } from '../shared/entities/project';
import { TimeEntry } from '../shared/entities/time-entry';
import { AuditLog } from '../shared/entities/audit-log';

export const dsgvo = express.Router();
dsgvo.use(express.json());
dsgvo.use(api.withRemult);

dsgvo.get('/api/dsgvo/customer/:id', async (req, res) => {
  const userInfo = (req.session as any)?.['user'] as UserInfo | undefined;
  if (!userInfo || !userInfo.roles?.includes('admin')) {
    res.status(403).json({ error: 'Nur Admin' });
    return;
  }
  const id = req.params['id']!;

  const person = await repo(Person).findFirst({ id });
  const company = !person ? await repo(Company).findFirst({ id }) : null;
  const customer = person ?? company;
  if (!customer) {
    res.status(404).json({ error: 'Kunde nicht gefunden' });
    return;
  }

  const [addresses, invoices, projects, audit] = await Promise.all([
    repo(Address).find({ where: { customerId: id } }),
    repo(Invoice).find({ where: { customerId: id } }),
    repo(Project).find({ where: { customerId: id } }),
    repo(AuditLog).find({ where: { entityId: id } }),
  ]);

  // Items + TimeEntries je Parent
  const itemsByInvoice: Record<string, InvoiceItem[]> = {};
  for (const inv of invoices) {
    itemsByInvoice[inv.id] = await repo(InvoiceItem).find({ where: { invoiceId: inv.id } });
  }
  const timeEntriesByProject: Record<string, TimeEntry[]> = {};
  for (const p of projects) {
    timeEntriesByProject[p.id] = await repo(TimeEntry).find({ where: { projectId: p.id } });
  }

  const report = {
    title: 'DSGVO Art. 15 — Auskunft über gespeicherte Daten',
    generatedAt: new Date().toISOString(),
    generatedBy: userInfo.name,
    customer: {
      type: person ? 'Person' : 'Company',
      stammdaten: customer,
    },
    addresses,
    invoices: invoices.map((inv) => ({
      ...inv,
      items: itemsByInvoice[inv.id] ?? [],
    })),
    projects: projects.map((p) => ({
      ...p,
      timeEntries: timeEntriesByProject[p.id] ?? [],
    })),
    auditLogEntries: audit,
    rechtsgrundlagen: {
      'Verarbeitung': 'Erfüllung des Vertrags (Art. 6 Abs. 1 lit. b DSGVO) ' +
                      'und gesetzliche Verpflichtungen (Art. 6 Abs. 1 lit. c DSGVO).',
      'Aufbewahrung':
        'Rechnungen und Belege: 7 Jahre gemäß §132 BAO (AT) / 10 Jahre gemäß §147 AO (DE) / ' +
        '10 Jahre gemäß GeBüV (CH). Die Aufbewahrungspflicht überwiegt das Löschrecht ' +
        'gemäß Art. 17 Abs. 3 lit. b DSGVO bis zum Ablauf der Frist.',
      'Empfänger': 'Keine. Daten werden ausschließlich für die Vertragsabwicklung und ' +
                   'die gesetzlich vorgeschriebene Buchführung verarbeitet.',
      'Drittland-Übermittlung': 'Findet nicht statt.',
    },
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="dsgvo-auskunft-${id}-${new Date().toISOString().slice(0, 10)}.json"`,
  );
  res.send(JSON.stringify(report, null, 2));
});
