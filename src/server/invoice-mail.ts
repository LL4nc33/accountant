/**
 * E-Mail-Versand der Rechnung als PDF-Anhang. Endpoint:
 *   POST /api/invoice/:id/send-mail
 *   Body: { to, subject?, body? }
 *
 * SMTP-Daten kommen aus `CompanySettings`. Wenn `smtpHost` leer ist, lehnt
 * der Endpoint ab — der User soll es zuerst in Settings konfigurieren.
 */
import express from 'express';
import * as nodemailer from 'nodemailer';
import { repo, type UserInfo } from 'remult';
import { api } from './api';
import { Invoice } from '../shared/entities/invoice';
import { CompanySettings } from '../shared/entities/company-settings';
import { renderInvoice } from './invoice';

export const invoiceMail = express.Router();
invoiceMail.use(express.json());
invoiceMail.use(api.withRemult);

invoiceMail.post('/api/invoice/:id/send-mail', async (req, res) => {
  const userInfo = (req.session as any)?.['user'] as UserInfo | undefined;
  if (!userInfo) {
    res.status(401).json({ error: 'Nicht eingeloggt' });
    return;
  }
  const { to, subject, body } = req.body ?? {};
  if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    res.status(400).json({ error: 'Ungültige Empfänger-Adresse' });
    return;
  }

  const settings = await repo(CompanySettings).findFirst();
  if (!settings?.smtpHost) {
    res.status(400).json({
      error: 'SMTP nicht konfiguriert. Bitte unter Einstellungen → Firma die SMTP-Daten eintragen.',
    });
    return;
  }
  if (!settings.smtpFromAddress) {
    res.status(400).json({
      error: 'Absender-E-Mail nicht konfiguriert.',
    });
    return;
  }

  const inv = await repo(Invoice).findFirst({ id: req.params['id'] });
  if (!inv) {
    res.status(404).json({ error: 'Rechnung nicht gefunden' });
    return;
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderInvoice(inv);
  } catch (e: any) {
    console.error('[invoice-mail] PDF-Render-Fehler:', e);
    res.status(500).json({ error: 'PDF konnte nicht generiert werden: ' + (e?.message ?? e) });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort || 587,
    secure: settings.smtpSecure,    // true = TLS, false = STARTTLS auf Port 587
    auth: settings.smtpUser ? {
      user: settings.smtpUser,
      pass: settings.smtpPassword,
    } : undefined,
  });

  const defaultSubject = `Rechnung ${inv.invoiceNumber}`;
  const defaultBody =
    `Sehr geehrte Damen und Herren,\n\n` +
    `anbei finden Sie unsere Rechnung ${inv.invoiceNumber} im PDF-Format.\n\n` +
    `Bei Rückfragen stehen wir gerne zur Verfügung.\n\n` +
    `Mit freundlichen Grüßen\n${settings.smtpFromName || settings.name}\n`;

  try {
    const fromName = settings.smtpFromName || settings.name || 'accountant';
    await transporter.sendMail({
      from: `"${fromName}" <${settings.smtpFromAddress}>`,
      to,
      subject: typeof subject === 'string' && subject ? subject : defaultSubject,
      text: typeof body === 'string' && body ? body : defaultBody,
      attachments: [
        {
          filename: `Rechnung-${inv.invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
    res.json({ ok: true, message: 'E-Mail wurde versendet' });
  } catch (e: any) {
    console.error('[invoice-mail] SMTP-Fehler:', e);
    res.status(500).json({ error: 'E-Mail-Versand fehlgeschlagen: ' + (e?.message ?? e) });
  }
});
