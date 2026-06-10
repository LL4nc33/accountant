/**
 * Background-Scanner für überfällige Rechnungen. Erzeugt Mahnungs-ENTWÜRFE
 * (nicht versendet!) sobald eine Schwelle überschritten ist.
 *
 * Schwelle pro Stufe = (Tage seit Fälligkeit) ≥ daysUntilFirstReminder + (lastStage × daysBetweenReminders)
 *
 * NIEMALS automatischer Versand. Der User bestätigt jede Mahnung manuell.
 */
import { remult, withRemult } from 'remult';
import { Invoice } from '../shared/entities/invoice';
import { Reminder } from '../shared/entities/reminder';
import { CompanySettings } from '../shared/entities/company-settings';
import { dueDateOf, daysOverdueOf, calculateReminder } from './reminder';

let intervalHandle: NodeJS.Timeout | undefined;

async function scanOnce(): Promise<void> {
  const settings = await remult.repo(CompanySettings).findFirst();
  if (!settings?.moduleReminder) return;

  const overdueInvoices = await remult.repo(Invoice).find({
    where: { finalized: true, paid: false, archived: false },
  });

  const today = new Date();
  for (const inv of overdueInvoices) {
    const days = daysOverdueOf(inv, today);
    if (days <= 0) continue;

    const existing = await remult.repo(Reminder).find({ where: { invoiceId: inv.id } });
    const maxStage = existing.reduce((m, r) => Math.max(m, r.stage), 0);
    if (maxStage >= 3) continue;

    const nextStage = (maxStage + 1) as 1 | 2 | 3;
    const requiredDays =
      (settings.daysUntilFirstReminder ?? 14) +
      maxStage * (settings.daysBetweenReminders ?? 14);
    if (days < requiredDays) continue;

    // Schwelle erreicht → Entwurf anlegen
    try {
      const calc = await calculateReminder(inv, nextStage, today);
      const due = new Date(today);
      due.setDate(due.getDate() + (settings.daysBetweenReminders ?? 14));

      const rem = remult.repo(Reminder).create();
      rem.invoiceId = inv.id;
      rem.stage = nextStage;
      rem.reminderDate = today;
      rem.dueDate = due;
      rem.interestAmount = calc.interestAmount;
      rem.interestRate = calc.interestRate;
      rem.reminderFee = calc.reminderFee;
      rem.totalDue = calc.totalDue;
      rem.bodyText =
        nextStage === 1 ? (settings.reminderText1 ?? '')
        : nextStage === 2 ? (settings.reminderText2 ?? '')
        : (settings.reminderText3 ?? '');
      await remult.repo(Reminder).save(rem);

      console.log(
        `[reminder-loop] Entwurf Stufe ${nextStage} für Rechnung ${inv.invoiceNumber} (${days} Tg überfällig)`,
      );
    } catch (e: any) {
      console.error(
        `[reminder-loop] Fehler beim Anlegen für ${inv.invoiceNumber}:`,
        e?.message ?? e,
      );
    }
  }
}

export function startReminderLoop(intervalMinutes = 360): void {
  if (intervalHandle) return;
  // Erst-Scan nach 60s, damit Bootstrap + DB-Migration sicher durch sind
  setTimeout(() => withRemult(scanOnce).catch(console.error), 60_000);
  intervalHandle = setInterval(() => {
    withRemult(scanOnce).catch(console.error);
  }, intervalMinutes * 60_000);
  console.log(`[reminder-loop] gestartet, alle ${intervalMinutes} Min`);
}
