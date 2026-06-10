/**
 * Mahnungs-Service: Berechnung (Verzugszinsen, Mahnspesen, Gesamtforderung),
 * PDF-Renderer und API-Endpoints (Generate, PDF, E-Mail-Versand).
 *
 * Rechtsgrundlagen siehe docs/superpowers/specs/2026-06-08-mahnwesen-design.md
 * §1333 ABGB (Mahnspesen), §456 UGB (B2B Verzugszinsen), §1000 ABGB (B2C 4 %),
 * §132 BAO (7-Jahre-Aufbewahrung), §907 ABGB (Fälligkeit).
 */
import * as fluentreports from 'fluentreports';
import express, { Router } from 'express';
import * as nodemailer from 'nodemailer';
import { repo, remult, type UserInfo } from 'remult';
import { api } from './api';
import { Reminder } from '../shared/entities/reminder';
import { Invoice } from '../shared/entities/invoice';
import { CompanySettings } from '../shared/entities/company-settings';
import { Person } from '../shared/entities/person';
import { Company } from '../shared/entities/company';
import { Address } from '../shared/entities/address';

const Report = (fluentreports as any).Report;

export const reminder = Router();
reminder.use(express.json());
reminder.use(api.withRemult);

// ─────────────────────────────────────────────────────────────────
// Berechnung
// ─────────────────────────────────────────────────────────────────

function formatCurrency(v: number): string {
  return v.toFixed(2).replace('.', ',') + ' EUR';
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('de-AT');
}

export function dueDateOf(invoice: Invoice): Date {
  const d = new Date(invoice.invoiceDate);
  d.setDate(d.getDate() + (invoice.paymentTermsDays || 14));
  return d;
}

export function daysOverdueOf(invoice: Invoice, today: Date = new Date()): number {
  const due = dueDateOf(invoice);
  const ms = today.getTime() - due.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Verzugszinsen nach §456 UGB (B2B) bzw. §1000 ABGB (B2C). Pro-rata-temporis
 * auf Tagesbasis: Brutto × Rate% × Tage/365.
 */
export function calculateInterest(
  grossAmount: number,
  daysOverdue: number,
  ratePercent: number,
): number {
  if (daysOverdue <= 0) return 0;
  return Math.round((grossAmount * (ratePercent / 100) * (daysOverdue / 365)) * 100) / 100;
}

export interface ReminderCalc {
  daysOverdue: number;
  interestAmount: number;
  interestRate: number;
  reminderFee: number;
  totalDue: number;
}

export async function calculateReminder(
  invoice: Invoice,
  stage: 1 | 2 | 3,
  reminderDate: Date,
): Promise<ReminderCalc> {
  const settings = await repo(CompanySettings).findFirst();
  const days = daysOverdueOf(invoice, reminderDate);
  const rate = invoice.isB2B
    ? (settings?.defaultInterestRateB2B ?? 12.2)
    : (settings?.defaultInterestRateB2C ?? 4);
  const interest = calculateInterest(invoice.grossTotal ?? 0, days, rate);
  const fee = stage >= 2 ? (settings?.defaultReminderFee ?? 40) : 0;
  const total = Math.round(((invoice.grossTotal ?? 0) + interest + fee) * 100) / 100;
  return {
    daysOverdue: days,
    interestAmount: interest,
    interestRate: rate,
    reminderFee: fee,
    totalDue: total,
  };
}

// ─────────────────────────────────────────────────────────────────
// PDF-Renderer
// ─────────────────────────────────────────────────────────────────

function stageTitle(stage: 1 | 2 | 3): string {
  return stage === 1 ? 'Zahlungserinnerung' : stage === 2 ? 'Mahnung' : 'Letzte Mahnung';
}

// Sanitizer: ersetzt Unicode-Zeichen die in PDFKit's WinAnsi-Encoding
// (Helvetica-default) nicht existieren durch Latin-1-kompatible Ersätze.
function sanitize(s: string): string {
  if (!s) return s;
  return s
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/[•·]/g, '·')
    .replace(/[–—]/g, '-')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/…/g, '...');
}

export async function renderReminder(rem: Reminder): Promise<Buffer> {
  const invoice = await repo(Invoice).findFirst({ id: rem.invoiceId });
  if (!invoice) throw new Error('Rechnung zur Mahnung nicht gefunden');
  const settings = await repo(CompanySettings).findFirst();

  // Sender-Adresse aufbauen
  const senderName = settings?.name
    ? `${settings.name}${settings.nameAddon ? ' ' + settings.nameAddon : ''}`
    : 'Firmendaten nicht konfiguriert';
  const senderAddress = [
    settings?.addressStreet,
    `${settings?.addressZip ?? ''} ${settings?.addressCity ?? ''}`.trim(),
    settings?.country,
  ].filter((s) => s && (typeof s === 'string' ? s.trim() : true)).join(', ');

  // Receiver-Fallback: wenn invoice.address leer ist, ziehe Customer + dessen
  // Billing-Address. Damit die Mahnung immer einen Empfänger-Block hat.
  let receiverAddress = invoice.address?.trim() ?? '';
  if (!receiverAddress && invoice.customerId) {
    const person = await repo(Person).findFirst({ id: invoice.customerId });
    const company = !person ? await repo(Company).findFirst({ id: invoice.customerId }) : null;
    const addrs = await repo(Address).find({ where: { customerId: invoice.customerId } });
    const billing = addrs.find((a: any) => a.addressType === 'Rechnungsanschrift') ?? addrs[0];
    if (billing) {
      const nameLine = person
        ? `${person.firstname ?? ''} ${person.lastname ?? ''}`.trim()
        : company
          ? [company.name, company.nameAddon].filter((s: any) => s && s.trim()).join(' ').trim()
          : '';
      receiverAddress = [
        nameLine,
        billing.street,
        `${billing.zip ?? ''} ${billing.city ?? ''}`.trim(),
        billing.country && billing.country !== 'AT' ? billing.country : '',
      ].filter((l: string) => l && l.trim().length > 0).join('\n');
    }
  }

  const bodyText =
    rem.bodyText ||
    (rem.stage === 1
      ? settings?.reminderText1
      : rem.stage === 2
        ? settings?.reminderText2
        : settings?.reminderText3) ||
    '';

  const report = new Report('buffer').data([{}]);

  // ── DIN-A4 Layout-Konstanten ─────────────────────────────────────
  // A4 = 595 × 842 pt (210 × 297 mm).
  // DIN 5008 Geschäftsbrief: Margins 25mm links/oben/unten, 20mm rechts.
  // 1 mm = 2.835 pt → 25mm = 70.9 pt, 20mm = 56.7 pt.
  // Wir nehmen 55pt links/rechts + sicheren Footer-Abstand zum Page-Bottom.
  const PAGE_W = 595, PAGE_H = 842;
  const MARGIN_LEFT = 55;       // ~19.4mm
  const MARGIN_RIGHT = 50;      // ~17.6mm (= rechter Inhalts-Endpunkt 545)
  const MARGIN_BOTTOM = 62;     // ~21.9mm Sicherheits-Bottom
  const COL_LEFT = MARGIN_LEFT;
  const CONTENT_RIGHT = PAGE_W - MARGIN_RIGHT;   // 545
  const CONTENT_W = CONTENT_RIGHT - COL_LEFT;    // 490
  const COL_RIGHT = 390;        // Meta-Spalte oben rechts
  const VALUE_X = 420;
  const VALUE_W = CONTENT_RIGHT - VALUE_X;       // 125
  // pageFooter sitzt am unteren Rand: 4 Zeilen × 10pt = 40pt block
  // Block startet bei y = PAGE_H - MARGIN_BOTTOM - 4*10 = 740
  // Separator-Linie 6pt darüber bei y=734
  const FOOTER_Y_TOP = PAGE_H - MARGIN_BOTTOM - 40;  // 740
  const FOOTER_SEP_Y = FOOTER_Y_TOP - 8;             // 732

  // Helper: echte Linie via PDFKit moveTo/lineTo
  const hline = (pdf: any, y: number, x1 = COL_LEFT, x2 = CONTENT_RIGHT, weight = 0.5, color = '#bbb') => {
    if (!pdf?.moveTo) return;
    pdf.save();
    pdf.lineWidth(weight).strokeColor(color).moveTo(x1, y).lineTo(x2, y).stroke();
    pdf.restore();
  };

  // Logo embed helper (oben rechts, max 140×50pt)
  const drawLogo = (pdf: any) => {
    if (!settings?.logoDataUrl?.startsWith('data:image/')) return;
    try {
      const b64 = settings.logoDataUrl.split(',', 2)[1];
      if (!b64) return;
      const buf = Buffer.from(b64, 'base64');
      // Logo rechtsbündig im Margin-Rahmen: rechtes Ende bei CONTENT_RIGHT
      pdf.image(buf, CONTENT_RIGHT - 145, 50, { fit: [145, 50], align: 'right' });
    } catch (e) { console.warn('[reminder/pdf] logo embed failed', e); }
  };

  report
    .margins(MARGIN_LEFT)
    .pageHeader((x: any) => {
      const pdf = x._PDF;
      drawLogo(pdf);

      // Sender-Zeile oben links (kleingedruckt)
      // Sender-Mini-Zeile oben (über dem Anschriftfeld, Margin-konform)
      x.fontSize(8);
      x.print(sanitize(`${senderName} · ${senderAddress}`), { x: COL_LEFT, y: 50, width: 380 });

      // Empfänger-Block linke Spalte — DIN-5008 Anschriftfeld bei y=127 (45mm)
      // (passt damit hinter normale DL-Briefumschlag-Fenster, falls Postversand)
      x.fontSize(10);
      const addrLines = receiverAddress.split('\n').filter((l) => l.trim());
      addrLines.slice(0, 5).forEach((line, i) => {
        x.print(sanitize(line), { x: COL_LEFT, y: 127 + i * 14, width: 280 });
      });

      // Meta-Block rechts: Datum, Mahnungs-Nr., Stufe (auf Höhe Anschriftfeld)
      x.fontSize(9);
      const metaRow = (label: string, value: string, row: number) => {
        x.print(label, { x: COL_RIGHT, y: 127 + row * 14, width: 90 });
        x.print(value, { x: COL_RIGHT + 95, y: 127 + row * 14, width: 90 });
      };
      metaRow('Datum:', formatDate(rem.reminderDate), 0);
      metaRow('Mahnungs-Nr.:', rem.reminderNumber, 1);
      metaRow('Stufe:', `${rem.stage} von 3`, 2);
    })
    .detail((x: any) => {
      const pdf = x._PDF;

      // ─── Fixed Y-Slots (DIN-A4-konform, Anschriftfeld ab y=127) ──
      // y=200  Title (18pt bold)
      // y=232  Bezug
      // y=260..370  Body-Text-Slot (110pt, word-wrap)
      // y=385  Forderungsaufstellung-Header + Linie
      // y=410  Row 1 (Rechnungsbetrag)
      // y=428  Row 2 (Verzugszinsen)
      // y=446  Row 3 (Mahnspesen)
      // y=470  Gesamtforderung
      // y=510  Frist
      // y=540..600  Bank-Block (4 × 15pt)
      // y=625..680  Stage-3 Warning (optional)
      // y=732  Footer-Separator
      // y=740..780  pageFooter

      // ── Title ───────────────────────────────────────────────
      x.fontSize(18);
      if (x.fontBold) x.fontBold();
      x.print(stageTitle(rem.stage), { x: COL_LEFT, y: 200, width: CONTENT_W });
      if (x.fontNormal) x.fontNormal();

      // ── Bezug auf Rechnung ──────────────────────────────────
      x.fontSize(10);
      x.print(
        `Bezugnehmend auf unsere Rechnung ${invoice.invoiceNumber} vom ${formatDate(invoice.invoiceDate)} (Fälligkeit ${formatDate(dueDateOf(invoice))}).`,
        { x: COL_LEFT, y: 232, width: CONTENT_W },
      );

      // ── Body-Text mit Word-Wrap (110pt slot, Ellipsis bei Überlauf) ──
      if (pdf?.text) {
        pdf.save();
        pdf.font('Helvetica').fontSize(10).fillColor('#000');
        pdf.text(sanitize(bodyText), COL_LEFT, 260, {
          width: CONTENT_W, height: 110, lineGap: 2, ellipsis: '...',
        });
        pdf.restore();
      }

      // ── Forderungsaufstellung ───────────────────────────────
      const FORD_HEADER_Y = 385;
      const FORD_ROW1_Y   = 410;
      const FORD_ROW2_Y   = 428;
      const FORD_ROW3_Y   = 446;
      const FORD_TOTAL_Y  = 470;

      x.fontSize(10);
      if (x.fontBold) x.fontBold();
      x.print('Forderungsaufstellung', { x: COL_LEFT, y: FORD_HEADER_Y, width: CONTENT_W });
      if (x.fontNormal) x.fontNormal();
      hline(pdf, FORD_HEADER_Y + 14, COL_LEFT, CONTENT_RIGHT, 0.7, '#222');

      const drawRow = (rowY: number, label: string, value: string, bold = false) => {
        if (bold && x.fontBold) x.fontBold();
        x.print(label, { x: COL_LEFT, y: rowY, width: VALUE_X - COL_LEFT - 10 });
        x.print(value, { x: VALUE_X, y: rowY, width: VALUE_W, align: 3 });
        if (bold && x.fontNormal) x.fontNormal();
      };

      drawRow(FORD_ROW1_Y, `Rechnungsbetrag (Rechnung ${invoice.invoiceNumber})`, formatCurrency(invoice.grossTotal ?? 0));
      if (rem.interestAmount > 0) {
        drawRow(FORD_ROW2_Y, `Verzugszinsen (${rem.interestRate.toFixed(1)} % p.a. seit Fälligkeit)`, formatCurrency(rem.interestAmount));
      }
      if (rem.reminderFee > 0) {
        drawRow(FORD_ROW3_Y, 'Mahnspesen (§ 1333 ABGB)', formatCurrency(rem.reminderFee));
      }

      hline(pdf, FORD_TOTAL_Y - 8, COL_LEFT, CONTENT_RIGHT, 0.7, '#222');
      drawRow(FORD_TOTAL_Y, 'Gesamtforderung', formatCurrency(rem.totalDue), true);
      hline(pdf, FORD_TOTAL_Y + 14, COL_LEFT, CONTENT_RIGHT, 0.4, '#666');
      hline(pdf, FORD_TOTAL_Y + 16, COL_LEFT, CONTENT_RIGHT, 0.7, '#222');

      // ── Zahlungs-Aufruf ─────────────────────────────────────
      x.fontSize(10);
      x.print(
        `Wir ersuchen Sie höflich, diesen Betrag bis spätestens ${formatDate(rem.dueDate)} auf folgendes Konto zu überweisen:`,
        { x: COL_LEFT, y: 510, width: CONTENT_W },
      );

      // ── Bankdaten in fixen Slots ────────────────────────────
      if (settings?.iban) {
        const BANK_Y_START = 540;
        const rows: Array<[string, string]> = [
          ['IBAN', settings.iban],
          ['BIC', settings.bic || '—'],
          ['Bank', settings.bankName || '—'],
          ['Verwendungszweck', `${invoice.invoiceNumber} / ${rem.reminderNumber}`],
        ];
        x.fontSize(10);
        rows.forEach(([label, value], i) => {
          const y = BANK_Y_START + i * 15;
          if (x.fontBold) x.fontBold();
          x.print(label, { x: COL_LEFT, y, width: 100 });
          if (x.fontNormal) x.fontNormal();
          x.print(value, { x: COL_LEFT + 105, y, width: CONTENT_W - 105 });
        });
      }

      // ── Stage-3 Schluss-Hinweis ─────────────────────────────
      if (rem.stage === 3 && pdf?.text) {
        pdf.save();
        pdf.font('Helvetica').fontSize(9).fillColor('#333');
        pdf.text(
          sanitize('Sollten Sie auch dieser letzten Aufforderung nicht nachkommen, sehen wir uns gezwungen, die Forderung an ein Inkasso-Unternehmen zu übergeben bzw. den Klagsweg zu beschreiten. Damit verbundene Kosten gehen zu Ihren Lasten.'),
          COL_LEFT, 625, { width: CONTENT_W, height: 60, lineGap: 2 },
        );
        pdf.restore();
      }
    })
    .pageFooter((x: any) => {
      const pdf = x._PDF;
      // Linie als optische Trennung zur Body-Zone
      hline(pdf, FOOTER_SEP_Y, COL_LEFT, CONTENT_RIGHT, 0.3, '#ccc');

      x.fontSize(7.5);
      if (!settings) return;
      const lines: string[] = [];
      const isKlein = !!settings.isKleinunternehmer;
      if (isKlein) {
        if (settings.gisaZahl) {
          const auth = settings.gisaAuthority ? ` · Behörde: ${settings.gisaAuthority}` : '';
          lines.push(`GISA-Zahl: ${settings.gisaZahl}${auth}`);
        }
        if (settings.taxNumber) lines.push(`Steuernummer: ${settings.taxNumber}`);
        if (settings.vatId) lines.push(`UID: ${settings.vatId}`);
      } else {
        if (settings.vatId) lines.push(`UID: ${settings.vatId}`);
        if (settings.taxNumber) lines.push(`Steuernummer: ${settings.taxNumber}`);
        if (settings.gisaZahl) {
          const auth = settings.gisaAuthority ? ` · Behörde: ${settings.gisaAuthority}` : '';
          lines.push(`GISA-Zahl: ${settings.gisaZahl}${auth}`);
        }
      }
      if (settings.iban) {
        const bank = [settings.iban, settings.bic, settings.bankName].filter((s: any) => s && s.trim()).join(' · ');
        lines.push(`Bankverbindung: ${bank}`);
      }
      if (settings.email || settings.phone || settings.website) {
        const contact = [settings.email, settings.phone, settings.website].filter((s: any) => s && s.trim()).join(' · ');
        lines.push(contact);
      }
      lines.slice(0, 4).forEach((line, i) => {
        x.print(line, { x: COL_LEFT, y: FOOTER_Y_TOP + i * 10, width: CONTENT_W });
      });
    });

  return new Promise<Buffer>((resolve, reject) => {
    report.render((err: any, buffer: any) => {
      if (err) reject(err);
      else resolve(Buffer.from(buffer));
    });
  });
}

// ─────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────

/**
 * Erzeugt einen Reminder-Entwurf für eine überfällige Rechnung.
 * POST /api/reminder
 * Body: { invoiceId, stage?, dueDate?, reminderDate? }
 */
reminder.post('/api/reminder', async (req, res) => {
  const userInfo = (req.session as any)?.['user'] as UserInfo | undefined;
  if (!userInfo) {
    res.status(401).json({ error: 'Nicht eingeloggt' });
    return;
  }
  const { invoiceId, stage: stageRaw, dueDate: dueDateRaw, reminderDate: reminderDateRaw } = req.body ?? {};
  if (typeof invoiceId !== 'string' || !invoiceId) {
    res.status(400).json({ error: 'invoiceId fehlt' });
    return;
  }
  const invoice = await repo(Invoice).findFirst({ id: invoiceId });
  if (!invoice) {
    res.status(404).json({ error: 'Rechnung nicht gefunden' });
    return;
  }
  if (!invoice.finalized) {
    res.status(400).json({ error: 'Nur festgeschriebene Rechnungen können gemahnt werden' });
    return;
  }
  if (invoice.paid) {
    res.status(400).json({ error: 'Diese Rechnung ist bereits bezahlt' });
    return;
  }
  // Stufe ermitteln: explizit angegeben oder nächste freie Stufe
  const existing = await repo(Reminder).find({ where: { invoiceId } });
  const maxExistingStage = existing.reduce((m, r) => Math.max(m, r.stage), 0);
  const stage = (Number(stageRaw) as 1 | 2 | 3) || ((maxExistingStage + 1) as 1 | 2 | 3);
  if (stage < 1 || stage > 3) {
    res.status(400).json({ error: 'stage muss 1, 2 oder 3 sein' });
    return;
  }

  const reminderDate = reminderDateRaw ? new Date(reminderDateRaw) : new Date();
  const calc = await calculateReminder(invoice, stage, reminderDate);
  const settings = await repo(CompanySettings).findFirst();
  const defaultDue = new Date(reminderDate);
  defaultDue.setDate(defaultDue.getDate() + (settings?.daysBetweenReminders ?? 14));
  const dueDate = dueDateRaw ? new Date(dueDateRaw) : defaultDue;

  const entity = repo(Reminder).create();
  entity.invoiceId = invoiceId;
  entity.stage = stage;
  entity.reminderDate = reminderDate;
  entity.dueDate = dueDate;
  entity.interestAmount = calc.interestAmount;
  entity.interestRate = calc.interestRate;
  entity.reminderFee = calc.reminderFee;
  entity.totalDue = calc.totalDue;
  entity.bodyText =
    stage === 1 ? (settings?.reminderText1 ?? '')
    : stage === 2 ? (settings?.reminderText2 ?? '')
    : (settings?.reminderText3 ?? '');

  const saved = await repo(Reminder).save(entity);
  res.json({ ok: true, id: saved.id, reminderNumber: saved.reminderNumber });
});

reminder.get('/api/reminder/:id/pdf', async (req, res) => {
  const userInfo = (req.session as any)?.['user'] as UserInfo | undefined;
  if (!userInfo) {
    res.status(401).send('Unauthorized');
    return;
  }
  const rem = await repo(Reminder).findFirst({ id: req.params['id'] });
  if (!rem) {
    res.status(404).send('Mahnung nicht gefunden');
    return;
  }
  try {
    const buffer = await renderReminder(rem);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Mahnung-${rem.reminderNumber}.pdf"`);
    res.send(buffer);
  } catch (e: any) {
    console.error('[reminder] PDF-Render-Fehler:', e);
    res.status(500).send('PDF-Render fehlgeschlagen: ' + (e?.message ?? e));
  }
});

reminder.post('/api/reminder/:id/send-mail', async (req, res) => {
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
  if (!settings?.smtpHost || !settings.smtpFromAddress) {
    res.status(400).json({ error: 'SMTP nicht konfiguriert. Bitte unter Einstellungen → Firma die SMTP-Daten eintragen.' });
    return;
  }
  const rem = await repo(Reminder).findFirst({ id: req.params['id'] });
  if (!rem) {
    res.status(404).json({ error: 'Mahnung nicht gefunden' });
    return;
  }
  const invoice = await repo(Invoice).findFirst({ id: rem.invoiceId });
  if (!invoice) {
    res.status(404).json({ error: 'Zugehörige Rechnung nicht gefunden' });
    return;
  }
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderReminder(rem);
  } catch (e: any) {
    res.status(500).json({ error: 'PDF konnte nicht generiert werden: ' + (e?.message ?? e) });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort || 587,
    secure: settings.smtpSecure,
    auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPassword } : undefined,
  });

  const defaultSubject = `${stageTitle(rem.stage)} ${rem.reminderNumber} (Rechnung ${invoice.invoiceNumber})`;
  const defaultBody =
    `Sehr geehrte Damen und Herren,\n\n` +
    `anbei finden Sie ${rem.stage === 1 ? 'unsere Zahlungserinnerung' : 'unsere Mahnung'} ${rem.reminderNumber} zur Rechnung ${invoice.invoiceNumber} im PDF-Format.\n\n` +
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
          filename: `Mahnung-${rem.reminderNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
    // Versand-Status persistieren
    rem.sent = true;
    rem.sentAt = new Date();
    await repo(Reminder).save(rem);
    res.json({ ok: true, message: 'Mahnung wurde versendet' });
  } catch (e: any) {
    console.error('[reminder-mail] SMTP-Fehler:', e);
    res.status(500).json({ error: 'E-Mail-Versand fehlgeschlagen: ' + (e?.message ?? e) });
  }
});

/**
 * Listet Mahnungen + zugehörige Rechnungsinformationen + daysOverdue.
 * Hilfreich für Dashboard-Card + Mahn-Übersicht.
 * GET /api/reminders/overview
 */
reminder.get('/api/reminders/overview', async (req, res) => {
  const userInfo = (req.session as any)?.['user'] as UserInfo | undefined;
  if (!userInfo) {
    res.status(401).json({ error: 'Nicht eingeloggt' });
    return;
  }
  try {
    const reminders = await repo(Reminder).find({ orderBy: { reminderDate: 'desc' as any } });
    const invoiceIds = Array.from(new Set(reminders.map((r) => r.invoiceId)));
    const invs = invoiceIds.length ? await repo(Invoice).find({ where: { id: { $in: invoiceIds } } }) : [];
    const byId = new Map(invs.map((i) => [i.id, i]));
    const today = new Date();
    res.json({
      reminders: reminders.map((r) => {
        const inv = byId.get(r.invoiceId);
        return {
          id: r.id,
          reminderNumber: r.reminderNumber,
          reminderDate: r.reminderDate,
          dueDate: r.dueDate,
          stage: r.stage,
          totalDue: r.totalDue,
          sent: r.sent,
          sentAt: r.sentAt,
          invoiceId: r.invoiceId,
          invoiceNumber: inv?.invoiceNumber ?? null,
          customerId: inv?.customerId ?? null,
          invoiceGross: inv?.grossTotal ?? 0,
          invoiceDate: inv?.invoiceDate ?? null,
          paid: inv?.paid ?? false,
          daysOverdue: inv ? daysOverdueOf(inv, today) : 0,
        };
      }),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'unbekannter Fehler' });
  }
});
