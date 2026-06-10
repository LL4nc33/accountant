/**
 * Angebote: PDF + Convert-to-Invoice (Phase 15, v0.17.0)
 *
 * - GET  /api/offer/pdf?id=...     — Angebot als PDF
 * - POST /api/offer/:id/convert    — erzeugt aus Angebot eine Rechnung,
 *                                    setzt status=won + convertedInvoiceId
 *
 * Angebot-PDF orientiert sich an §11-Invoice-PDF, aber:
 *   - kein „Leistungsdatum" (gibt's nicht für Angebote)
 *   - keine UID-Aufschlüsselung im Footer (Angebot ist kein USt-Beleg)
 *   - prominent „Gültig bis"
 *   - Header „ANGEBOT" statt „RECHNUNG"
 */
import * as fluentreports from 'fluentreports';
const Report = fluentreports.Report;

import express, { Router } from 'express';
import { repo, remult } from 'remult';
import { api } from './api';
import { Offer } from '../shared/entities/offer';
import { OfferItem } from '../shared/entities/offer-item';
import { Invoice } from '../shared/entities/invoice';
import { InvoiceItem } from '../shared/entities/invoice-item';
import { CompanySettings } from '../shared/entities/company-settings';

export const offer = Router();
offer.use(express.json());
offer.use(api.withRemult);

function formatCurrency(value: number): string {
  return value.toFixed(2) + ' EUR';
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString('de-AT');
}

async function renderOfferPdf(off: Offer): Promise<Buffer> {
  if (!off?.items) throw new Error('Offer items not found');

  const settings = await remult.repo(CompanySettings).findFirst();
  const senderLine = settings?.name
    ? `${settings.name} · ${settings.addressStreet ?? ''} · ${settings.addressZip ?? ''} ${settings.addressCity ?? ''}`.trim()
    : '⚠ Firmendaten nicht konfiguriert (siehe /settings/company)';

  // Dokumenttyp-spezifische Labels.
  const kind = off.kind || 'offer';
  const docHeading = kind === 'order_confirmation'
    ? 'AUFTRAGSBESTÄTIGUNG'
    : kind === 'delivery_note'
      ? 'LIEFERSCHEIN'
      : 'ANGEBOT';
  const numberLabel = kind === 'order_confirmation'
    ? 'AB-Nr.:'
    : kind === 'delivery_note'
      ? 'Lieferschein-Nr.:'
      : 'Angebots-Nr.:';

  const headerData = {
    senderLine,
    receiver: off.address || '',
    offerNumber: off.offerNumber,
    offerDate: formatDate(off.offerDate),
    validUntil: formatDate(off.validUntil),
    deliveryDate: off.deliveryDate ? formatDate(off.deliveryDate) : '',
    subject: off.subject,
    kind,
    docHeading,
    numberLabel,
  };

  const itemRows = off.items.map((item, idx) => ({
    posNr: idx + 1,
    item,
  }));

  const detailBand = (x: any, r: { posNr: number; item: OfferItem }) => {
    x.band(
      [
        { data: ' ' + r.posNr + '.', width: 40, align: 1 },
        { data: r.item.name, width: 240, align: 1 },
        { data: r.item.quantity + ' ' + (r.item.amountType ?? ''), width: 60, align: 3 },
        { data: formatCurrency(r.item.price), width: 90, align: 3 },
        { data: formatCurrency(r.item.total), width: 90, align: 3 },
      ],
      { border: 0, padding: 1 },
    );
    if (r.item.description) {
      x.band([{ data: '   ' + r.item.description, width: 480 }], { border: 0, padding: 1 });
    }
  };

  const net = off.netTotal;
  const gross = off.grossTotal;
  const vatTotals = off.vatTotals;

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const rpt = new Report('buffer')
        .data(itemRows)
        .pageHeader((rep: any) => {
          rep.fontSize(8);
          rep.text(headerData.senderLine, { align: 'center' });
          rep.fontSize(10);
          rep.text(' ');
          rep.text(headerData.receiver || '');
          rep.text(' ');
          rep.fontSize(14);
          rep.text(headerData.docHeading, { align: 'left' });
          rep.fontSize(10);
          rep.text(`${headerData.numberLabel}  ${headerData.offerNumber}`);
          rep.text(`Datum:         ${headerData.offerDate}`);
          if (headerData.kind === 'offer') {
            rep.text(`Gültig bis:    ${headerData.validUntil}`);
          } else if (headerData.deliveryDate) {
            rep.text(`${headerData.kind === 'delivery_note' ? 'Liefer-/Leistungsdatum' : 'Liefertermin'}: ${headerData.deliveryDate}`);
          }
          if (headerData.subject) rep.text(`Betreff:       ${headerData.subject}`);
          rep.text(' ');
          if (off.headerText) {
            rep.text(off.headerText);
            rep.text(' ');
          }
          rep.fontBold();
          rep.band(
            [
              { data: 'Pos.', width: 40 },
              { data: 'Bezeichnung', width: 240 },
              { data: 'Menge', width: 60, align: 3 },
              { data: 'Preis', width: 90, align: 3 },
              { data: 'Gesamt', width: 90, align: 3 },
            ],
            { border: 1, padding: 2 },
          );
          rep.fontNormal();
        })
        .detail(detailBand)
        .pageFooter((rep: any) => {
          rep.fontSize(9);
          rep.text(' ');
          rep.text(`Netto-Gesamtbetrag:    ${formatCurrency(net)}`, { align: 'right' });
          for (const vt of vatTotals) {
            if (vt.vat === 0) continue;
            rep.text(`USt ${vt.vat}%:            ${formatCurrency(vt.total)}`, { align: 'right' });
          }
          rep.fontBold();
          rep.text(`Gesamtbetrag:          ${formatCurrency(gross)}`, { align: 'right' });
          rep.fontNormal();
          rep.text(' ');
          if (off.footerText) rep.text(off.footerText);
          rep.text(' ');
          rep.fontSize(8);
          if (headerData.kind === 'offer') {
            rep.text(
              `Dieses Angebot ist gültig bis ${headerData.validUntil}. Es gelten unsere allgemeinen Geschäftsbedingungen.`,
              { align: 'left' },
            );
          } else if (headerData.kind === 'order_confirmation') {
            rep.text(
              `Mit dieser Auftragsbestätigung bestätigen wir den Auftrag zu den oben angegebenen Konditionen.`,
              { align: 'left' },
            );
          } else if (headerData.kind === 'delivery_note') {
            rep.text(' ');
            rep.fontSize(9);
            rep.text('Ware/Leistung erhalten am: __________________   Unterschrift Empfänger: __________________');
            rep.fontSize(8);
          }
          if (settings?.iban) {
            rep.text(`IBAN: ${settings.iban}   BIC: ${settings.bic ?? ''}   ${settings.bankName ?? ''}`);
          }
        })
        .render((err: any, buf: Buffer) => {
          if (err) return reject(err);
          resolve(buf);
        });
      void rpt;
    } catch (e) {
      reject(e);
    }
  });
}

offer.get('/api/offer/pdf', async (req, res) => {
  const sessionUser = (req.session as any)?.user;
  if (!sessionUser) {
    res.status(401).send('Unauthorized');
    return;
  }
  const id = req.query['id'] as string;
  if (!id) {
    res.status(400).send('id query-param fehlt');
    return;
  }
  const off = await repo(Offer).findFirst({ id });
  if (!off) {
    res.status(404).send('Angebot nicht gefunden');
    return;
  }
  // Items via Relations laden
  const items = await repo(OfferItem).find({ where: { offerId: off.id } });
  (off as any).items = items;

  try {
    const buffer = await renderOfferPdf(off);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(buffer);
  } catch (e: any) {
    console.error('[offer] PDF render failed:', e);
    res.status(500).send('PDF-Render-Fehler: ' + (e?.message ?? 'unbekannt'));
  }
});

/**
 * Konvertiert ein Angebot in eine Rechnung. Kopiert Items 1:1,
 * markiert Offer als won, hält convertedInvoiceId als Backlink.
 *
 * Body (optional):
 *   { invoiceDate?: string, performanceDateFrom?: string, performanceDateTo?: string }
 */
offer.post('/api/offer/:id/convert', async (req, res) => {
  const sessionUser = (req.session as any)?.user;
  if (!sessionUser) {
    res.status(401).json({ error: 'Nicht eingeloggt' });
    return;
  }
  const off = await repo(Offer).findFirst({ id: req.params['id']! });
  if (!off) {
    res.status(404).json({ error: 'Angebot nicht gefunden' });
    return;
  }
  if (off.status === 'won' && off.convertedInvoiceId) {
    res.status(409).json({
      error: 'Angebot wurde bereits konvertiert',
      invoiceId: off.convertedInvoiceId,
    });
    return;
  }

  const items = await repo(OfferItem).find({ where: { offerId: off.id } });

  const inv = repo(Invoice).create();
  inv.customerId = off.customerId;
  inv.address = off.address;
  inv.subject = off.subject || `Angebot ${off.offerNumber}`;
  inv.invoiceDate = req.body?.invoiceDate ? new Date(req.body.invoiceDate) : new Date();
  if (req.body?.performanceDateFrom) inv.performanceDateFrom = new Date(req.body.performanceDateFrom);
  if (req.body?.performanceDateTo) inv.performanceDateTo = new Date(req.body.performanceDateTo);
  inv.vatType = off.vatType;
  inv.headerText = off.headerText;
  inv.footerText = off.footerText;
  inv.reference = off.offerNumber ? `Angebot ${off.offerNumber}` : off.reference;
  const savedInv = await repo(Invoice).save(inv);

  for (const oi of items) {
    const ii = repo(InvoiceItem).create();
    ii.invoiceId = savedInv.id;
    ii.name = oi.name;
    ii.description = oi.description;
    ii.productId = oi.productId;
    ii.quantity = oi.quantity;
    ii.amountType = oi.amountType;
    ii.price = oi.price;
    ii.vat = oi.vat;
    ii.discount = oi.discount;
    ii.discountType = oi.discountType;
    await repo(InvoiceItem).save(ii);
  }

  off.status = 'won';
  off.convertedInvoiceId = savedInv.id;
  off.convertedAt = new Date();
  await repo(Offer).save(off);

  res.json({
    ok: true,
    invoiceId: savedInv.id,
    invoiceNumber: savedInv.invoiceNumber,
    offerStatus: off.status,
  });
});

/**
 * Status setzen (sent, lost, expired) — ohne Convert.
 */
offer.post('/api/offer/:id/status', async (req, res) => {
  const sessionUser = (req.session as any)?.user;
  if (!sessionUser) {
    res.status(401).json({ error: 'Nicht eingeloggt' });
    return;
  }
  const newStatus = req.body?.status;
  if (!['draft', 'sent', 'lost', 'expired'].includes(newStatus)) {
    res.status(400).json({
      error: 'Ungültiger Status. Erlaubt: draft, sent, lost, expired. (won nur via /convert)',
    });
    return;
  }
  const off = await repo(Offer).findFirst({ id: req.params['id']! });
  if (!off) {
    res.status(404).json({ error: 'Angebot nicht gefunden' });
    return;
  }
  if (off.status === 'won') {
    res.status(409).json({ error: 'Konvertierte Angebote dürfen nicht zurückgesetzt werden' });
    return;
  }
  off.status = newStatus;
  await repo(Offer).save(off);
  res.json({ ok: true, status: off.status });
});
