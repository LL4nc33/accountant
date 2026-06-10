/**
 * Background-Loop für wiederkehrende Rechnungen. Läuft jede Stunde,
 * sucht aktive RecurringInvoices mit `nextRunDate <= today`, erzeugt
 * pro Treffer eine neue Entwurf-Invoice (Items aus Template kopiert)
 * und schiebt `nextRunDate` ums Intervall weiter.
 *
 * Nutzt withRemult damit Lifecycle-Hooks der Invoice (saving, audit etc.)
 * korrekt feuern.
 */
import { remult, withRemult } from 'remult';
import { RecurringInvoice, RecurringInterval } from '../shared/entities/recurring-invoice';
import { Invoice } from '../shared/entities/invoice';
import { InvoiceItem } from '../shared/entities/invoice-item';

function advanceDate(d: Date, interval: RecurringInterval): Date {
  const out = new Date(d);
  switch (interval) {
    case 'monatlich': out.setMonth(out.getMonth() + 1); break;
    case 'quartalsweise': out.setMonth(out.getMonth() + 3); break;
    case 'halbjährlich': out.setMonth(out.getMonth() + 6); break;
    case 'jährlich': out.setFullYear(out.getFullYear() + 1); break;
  }
  return out;
}

async function runOnce(): Promise<void> {
  const now = new Date();
  const dueRecurrings = await remult.repo(RecurringInvoice).find({
    where: { active: true },
  });
  let created = 0;
  for (const rec of dueRecurrings) {
    if (new Date(rec.nextRunDate) > now) continue;
    try {
      const template = await remult.repo(Invoice).findFirst({ id: rec.templateInvoiceId });
      if (!template) {
        console.warn(`[recurring] Vorlage ${rec.templateInvoiceId} nicht gefunden — übersprungen`);
        continue;
      }
      const items = await remult.repo(InvoiceItem).find({ where: { invoiceId: template.id } });

      const newInv = remult.repo(Invoice).create();
      newInv.customerId = template.customerId;
      newInv.address = template.address;
      newInv.subject = template.subject;
      newInv.invoiceDate = new Date();
      newInv.reverseCharge = template.reverseCharge;
      newInv.recipientVatId = template.recipientVatId;
      newInv.vatType = template.vatType;
      newInv.headerText = template.headerText;
      newInv.footerText = template.footerText;
      const label = rec.title?.trim() || template.subject?.trim() || template.invoiceNumber;
      newInv.reference = `Wiederkehrend (${label})`;
      const saved = await remult.repo(Invoice).save(newInv);

      for (const item of items) {
        const newItem = remult.repo(InvoiceItem).create();
        newItem.invoiceId = saved.id;
        newItem.name = item.name;
        newItem.description = item.description;
        newItem.productId = item.productId;
        newItem.quantity = item.quantity;
        newItem.amountType = item.amountType;
        newItem.price = item.price;
        newItem.vat = item.vat;
        newItem.discount = item.discount;
        newItem.discountType = item.discountType;
        await remult.repo(InvoiceItem).save(newItem);
      }

      rec.lastRunDate = new Date();
      rec.nextRunDate = advanceDate(rec.nextRunDate, rec.interval);
      await remult.repo(RecurringInvoice).save(rec);
      created++;
      console.log(`[recurring] „${label}" → Rechnung ${saved.invoiceNumber}`);
    } catch (e) {
      const label = rec.title?.trim() || `RecurringInvoice ${rec.id}`;
      console.error(`[recurring] Fehler bei „${label}":`, e);
    }
  }
  if (created > 0) console.log(`[recurring] ${created} Rechnung(en) erzeugt`);
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startRecurringLoop(intervalMinutes = 60): void {
  if (intervalHandle) return;
  // Erstes Mal nach kurzer Verzögerung (Server-Start nicht blockieren)
  setTimeout(() => withRemult(runOnce).catch(console.error), 30_000);
  // Danach im fixen Intervall
  intervalHandle = setInterval(() => {
    withRemult(runOnce).catch(console.error);
  }, intervalMinutes * 60_000);
}
