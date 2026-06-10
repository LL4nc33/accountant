import express, { Router } from 'express';
import { randomUUID } from 'crypto';
import { remult } from 'remult';
import { api } from './api';
import { Project } from '../shared/entities/project';
import { TimeEntry } from '../shared/entities/time-entry';
import { Invoice } from '../shared/entities/invoice';
import { InvoiceItem } from '../shared/entities/invoice-item';
import { Person } from '../shared/entities/person';
import { Company } from '../shared/entities/company';
import { CompanySettings } from '../shared/entities/company-settings';
import { vatPresetFor } from '../shared/entities/vat-presets';

export const projects = Router();
projects.use(express.json());
projects.use(api.withRemult);

projects.post('/api/projects/:id/generate-invoice', async (req, res) => {
  const sessionUser = (req.session as any)?.user;
  if (!sessionUser) {
    res.status(401).send('Unauthorized');
    return;
  }

  const projectId = req.params.id;
  const project = await remult.repo(Project).findFirst({ id: projectId });
  if (!project) {
    res.status(404).json({ error: 'Projekt nicht gefunden' });
    return;
  }

  const openEntries = await remult.repo(TimeEntry).find({
    where: { projectId, billedInvoiceItemId: '' },
  });
  if (openEntries.length === 0) {
    res.status(400).json({ error: 'Keine offenen Stunden vorhanden' });
    return;
  }

  // Resolve effective rate per entry: entry → project → CompanySettings.
  // We do this BEFORE locking so a zero-rate situation aborts cleanly without
  // having to release pending locks.
  const settingsPreview = await remult.repo(CompanySettings).findFirst();
  const effectiveRates = openEntries.map(e =>
    e.hourlyRate || project.hourlyRate || settingsPreview?.defaultHourlyRate || 0
  );
  if (effectiveRates.some(r => r === 0)) {
    res.status(400).json({
      error: 'Mindestens ein Eintrag hat Stundensatz 0 (auch nach Fallback auf Projekt + CompanySettings). Bitte ergänzen.',
    });
    return;
  }

  // Immediately mark entries with a PENDING lock so concurrent calls find
  // zero open entries and bail out before duplicate invoices are created.
  const pendingTag = `PENDING:${randomUUID()}`;
  for (const entry of openEntries) {
    entry.billedInvoiceItemId = pendingTag;
    await remult.repo(TimeEntry).save(entry);
  }

  try {
    const settings = settingsPreview;
    const senderCountry = settings?.country ?? 'AT';
    const customer = (await remult.repo(Person).findFirst({ id: project.customerId }))
      ?? (await remult.repo(Company).findFirst({ id: project.customerId }));
    if (!customer) {
      res.status(400).json({ error: 'Kunde nicht gefunden' });
      return;
    }

    const billing = customer.addresses?.[0];
    const addressLines = billing
      ? [customer.displayName, billing.street, `${billing.zip} ${billing.city}`.trim(), billing.country]
          .filter(s => s && s.trim()).join('\n')
      : customer.displayName;

    const defaultVat = vatPresetFor(senderCountry).default;
    const isKlein = !!settings?.isKleinunternehmer;
    const itemVat = isKlein ? 0 : defaultVat;

    // Create Invoice (sequence-number assigned in Invoice.saving hook)
    const invoiceRepo = remult.repo(Invoice);
    const inv = invoiceRepo.create();
    inv.customerId = project.customerId;
    inv.address = addressLines;
    inv.subject = project.name;
    inv.headerText = '';
    inv.footerText = '';
    inv.vatType = 'Netto';
    inv.items = [];
    const savedInv = await invoiceRepo.save(inv);

    // Create one InvoiceItem per TimeEntry; replace PENDING with real item id.
    const itemRepo = remult.repo(InvoiceItem);
    let totalNet = 0;
    for (let i = 0; i < openEntries.length; i++) {
      const entry = openEntries[i];
      const effectiveRate = effectiveRates[i];
      const item = itemRepo.create();
      item.invoiceId = savedInv.id;
      const dateStr = new Date(entry.date).toLocaleDateString('de-AT');
      const trimmed = entry.description.trim();
      const firstLine = trimmed.split('\n')[0].slice(0, 120);
      // Bezeichnung = erste Zeile der TimeEntry-Beschreibung (Hauptinhalt).
      // Falls leer: Fallback auf Datum als Identifier.
      item.name = firstLine || `Zeitbuchung ${dateStr}`;
      // Description = Datum als Präfix + voller Text. Wird vom PDF-Renderer als
      // zweite Zeile unter der Bezeichnung gerendert (kleinere Schrift, eingerückt).
      item.description = trimmed
        ? `${dateStr} — ${trimmed}`
        : `${dateStr} (Zeitbuchung)`;
      item.quantity = entry.hours;
      item.amountType = 'Std';
      item.price = effectiveRate;
      item.vat = itemVat;
      item.discount = 0;
      item.discountType = '%';
      const savedItem = await itemRepo.save(item);
      totalNet += entry.hours * effectiveRate;

      // Replace PENDING lock with the real InvoiceItem id.
      entry.billedInvoiceItemId = savedItem.id;
      await remult.repo(TimeEntry).save(entry);
    }

    res.json({
      invoiceId: savedInv.id,
      invoiceNumber: savedInv.invoiceNumber,
      itemCount: openEntries.length,
      totalNet,
    });
  } catch (err) {
    // If anything blows up after the PENDING lock, release the entries so the
    // user can retry. Only release rows still carrying our exact pendingTag —
    // never overwrite an id that may have already become a real InvoiceItem.
    for (const entry of openEntries) {
      if (entry.billedInvoiceItemId === pendingTag) {
        entry.billedInvoiceItemId = '';
        try {
          await remult.repo(TimeEntry).save(entry);
        } catch {
          // best-effort release; swallow to not mask the original error
        }
      }
    }
    throw err;
  }
});
