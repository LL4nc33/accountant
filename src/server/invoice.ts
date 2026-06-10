import * as fluentreports from 'fluentreports';

var Report = fluentreports.Report;

import express, { Router } from 'express';
import { api } from './api';
import { Invoice } from '../shared/entities/invoice';
import { repo, remult } from 'remult';
import { InvoiceItem } from '../shared/entities/invoice-item';
import { CompanySettings } from '../shared/entities/company-settings';
import { Person } from '../shared/entities/person';
import { Company } from '../shared/entities/company';
import { Address } from '../shared/entities/address';
import { isEU } from '../shared/entities/country';

export const invoice = Router();
invoice.use(express.json());
invoice.use(api.withRemult);

invoice.get('/api/invoice/pdf', async (req, res) => {
  const sessionUser = (req.session as any)?.user;
  if (!sessionUser) {
    res.status(401).send('Unauthorized');
    return;
  }

  const invoice = await repo(Invoice).findFirst({ id: req.query['id'] as string });
  if (!invoice) {
    res.status(404).send('Invoice not found');
    return;
  }
  const buffer = await renderInvoice(invoice);
  res.setHeader('Content-Type', 'application/pdf');
  res.send(buffer);
});

/**
 * Rechnung als Vorlage kopieren: neue Rechnung mit selben Items, eigenem
 * neuen InvoiceNumber, Status Entwurf, aktuelles Datum. Ohne `correctsInvoiceId`
 * (das ist nur für Storno). Praktisch für Stammkunden mit monatlich gleicher
 * Leistung.
 */
invoice.post('/api/invoice/:id/duplicate', async (req, res) => {
  const sessionUser = (req.session as any)?.user;
  if (!sessionUser) {
    res.status(401).json({ error: 'Nicht eingeloggt' });
    return;
  }
  const original = await repo(Invoice).findFirst({ id: req.params['id'] });
  if (!original) {
    res.status(404).json({ error: 'Rechnung nicht gefunden' });
    return;
  }

  const items = await repo(InvoiceItem).find({ where: { invoiceId: original.id } });

  const dup = repo(Invoice).create();
  dup.customerId = original.customerId;
  dup.address = original.address;
  dup.subject = original.subject;
  dup.invoiceDate = new Date();
  dup.reverseCharge = original.reverseCharge;
  dup.recipientVatId = original.recipientVatId;
  dup.vatType = original.vatType;
  dup.headerText = original.headerText;
  dup.footerText = original.footerText;
  const savedDup = await repo(Invoice).save(dup);

  for (const item of items) {
    const dupItem = repo(InvoiceItem).create();
    dupItem.invoiceId = savedDup.id;
    dupItem.name = item.name;
    dupItem.description = item.description;
    dupItem.productId = item.productId;
    dupItem.quantity = item.quantity;
    dupItem.amountType = item.amountType;
    dupItem.price = item.price;
    dupItem.vat = item.vat;
    dupItem.discount = item.discount;
    dupItem.discountType = item.discountType;
    await repo(InvoiceItem).save(dupItem);
  }

  res.json({ id: savedDup.id, invoiceNumber: savedDup.invoiceNumber });
});

/**
 * Storno-Rechnung anlegen: kopiert Original mit umgedrehten Beträgen.
 * Verlangt dass die Original-Rechnung festgeschrieben ist.
 * Antwort: { id } — die neue Storno-Rechnung-ID, zur Navigation.
 */
invoice.post('/api/invoice/:id/storno', async (req, res) => {
  const sessionUser = (req.session as any)?.user;
  if (!sessionUser) {
    res.status(401).json({ error: 'Nicht eingeloggt' });
    return;
  }
  const original = await repo(Invoice).findFirst({ id: req.params['id'] });
  if (!original) {
    res.status(404).json({ error: 'Rechnung nicht gefunden' });
    return;
  }
  if (!original.finalized) {
    res.status(400).json({
      error: 'Nur festgeschriebene Rechnungen brauchen Storno — ' +
             'unfertige Entwürfe lassen sich direkt bearbeiten.',
    });
    return;
  }
  if (original.correctsInvoiceId) {
    res.status(400).json({
      error: 'Diese Rechnung ist bereits eine Storno-Rechnung. ' +
             'Bitte das Original stornieren, nicht das Storno.',
    });
    return;
  }

  // Original-Items holen
  const items = await repo(InvoiceItem).find({ where: { invoiceId: original.id } });

  // Neue Storno-Rechnung anlegen
  const storno = repo(Invoice).create();
  storno.customerId = original.customerId;
  storno.address = original.address;
  storno.subject = `Storno zu Rechnung ${original.invoiceNumber} — ${original.subject}`;
  storno.invoiceDate = new Date();
  storno.performanceDateFrom = original.performanceDateFrom;
  storno.performanceDateTo = original.performanceDateTo;
  storno.reverseCharge = original.reverseCharge;
  storno.recipientVatId = original.recipientVatId;
  storno.reference = original.invoiceNumber;
  storno.vatType = original.vatType;
  storno.correctsInvoiceId = original.id;
  storno.headerText =
    `Storno-Rechnung zu unserer Rechnung ${original.invoiceNumber} vom ` +
    `${new Date(original.invoiceDate).toLocaleDateString('de-AT')}.\n` +
    (original.headerText ?? '');
  storno.footerText = original.footerText;
  // saving-Hook vergibt invoiceNumber + sequenceNumber
  const savedStorno = await repo(Invoice).save(storno);

  // Items kopieren mit umgekehrten Mengen
  for (const item of items) {
    const stornoItem = repo(InvoiceItem).create();
    stornoItem.invoiceId = savedStorno.id;
    stornoItem.name = item.name;
    stornoItem.description = item.description;
    stornoItem.productId = item.productId;
    stornoItem.quantity = -item.quantity;
    stornoItem.amountType = item.amountType;
    stornoItem.price = item.price;
    stornoItem.vat = item.vat;
    stornoItem.discount = item.discount;
    stornoItem.discountType = item.discountType;
    await repo(InvoiceItem).save(stornoItem);
  }

  res.json({ id: savedStorno.id, invoiceNumber: savedStorno.invoiceNumber });
});

function formatCurrency(value: number, currency: string = 'EUR') {
  if (currency === 'CHF') return `CHF ${value.toFixed(2)}`;
  return value.toFixed(2) + ' EUR';
}

function formatDate(date: Date) {
  return date.toLocaleDateString('de-AT');
}

function performanceLabel(invoice: Invoice): string {
  if (invoice.performanceDateFrom && invoice.performanceDateTo) {
    return 'Leistungszeitraum:';
  }
  return 'Leistungsdatum:';
}

function formatPerformanceValue(invoice: Invoice): string {
  if (invoice.performanceDateFrom && invoice.performanceDateTo) {
    return `${formatDate(invoice.performanceDateFrom)} – ${formatDate(invoice.performanceDateTo)}`;
  }
  if (invoice.performanceDateFrom) {
    return formatDate(invoice.performanceDateFrom);
  }
  if (invoice.invoiceDate) {
    return formatDate(invoice.invoiceDate);
  }
  return invoice.createdAt ? formatDate(invoice.createdAt) : '';
}

export async function renderInvoice(invoice: Invoice): Promise<Buffer> {
  if (!invoice?.items) {
    throw new Error('Invoice items not found');
  }

  const settings = await remult.repo(CompanySettings).findFirst();

  // Look up the customer (Person or Company) to fall back to its vatId
  // and to read its billing-address country for tax decisions.
  let customerVatId = invoice.recipientVatId || '';
  let customerVerifiedAt: Date | undefined;
  let customerVerifiedName = '';
  let receiverCountry = '';
  let receiverAddressFallback = ''; // fallback wenn invoice.address leer
  if (invoice.customerId) {
    const person = await remult
      .repo(Person)
      .findFirst({ id: invoice.customerId });
    const company = !person
      ? await remult.repo(Company).findFirst({ id: invoice.customerId })
      : null;
    const customer = person ?? company;
    if (customer) {
      if (!customerVatId) customerVatId = customer.vatId || '';
      customerVerifiedAt = customer.vatIdVerifiedAt;
      customerVerifiedName = customer.vatIdVerifiedName || '';
    }

    const addrs = await remult
      .repo(Address)
      .find({ where: { customerId: invoice.customerId } });
    const billing =
      addrs.find((a) => a.addressType === 'Rechnungsanschrift') ?? addrs[0];
    if (billing) {
      receiverCountry = billing.country || '';
      // Receiver-Fallback aufbauen: Name (Person/Firma) + Adresse
      const nameLine = person
        ? `${person.firstname ?? ''} ${person.lastname ?? ''}`.trim()
        : company
          ? [company.name, company.nameAddon].filter((s: any) => s && s.trim()).join(' ').trim()
          : '';
      const lines = [
        nameLine,
        billing.street,
        `${billing.zip ?? ''} ${billing.city ?? ''}`.trim(),
        billing.country && billing.country !== 'AT' ? billing.country : '',
      ].filter((l: string) => l && l.trim().length > 0);
      receiverAddressFallback = lines.join('\n');
    }
  }

  // Sanitizer: ersetzt Unicode-Zeichen die in PDFKit's WinAnsi-Encoding
  // nicht existieren (Helvetica-default) durch Latin-1-kompatible Ersätze.
  // Affects: → (arrows), some bullets, em-dash variants.
  const sanitize = (s: string): string => {
    if (!s) return s;
    return s
      .replace(/→/g, '->')
      .replace(/←/g, '<-')
      .replace(/[•·]/g, '·')      // U+00B7 (Latin-1) statt U+2022
      .replace(/[–—]/g, '-')      // em/en-dash -> ASCII dash
      .replace(/[""]/g, '"')      // smart quotes
      .replace(/['']/g, "'")      // smart single quotes
      .replace(/…/g, '...');
  };

  // receiverAddress final: invoice.address hat Vorrang, sonst Fallback
  const receiverAddress = (invoice.address && invoice.address.trim().length > 0)
    ? invoice.address
    : receiverAddressFallback;

  const isKlein = !!settings?.isKleinunternehmer;
  const isRC = !!invoice.reverseCharge;

  const primary_data = invoice.items.map((item, index) => ({
    posNr: index + 1,
    item,
  }));

  // ── DIN-A4 Layout-Konstanten ────────────────────────────────────
  // A4 = 595 × 842 pt. DIN-5008-konforme Geschäftsbrief-Margins:
  // links 55pt (~19mm), rechts 50pt (~18mm), Bottom 62pt (~22mm).
  const PAGE_W = 595, PAGE_H = 842;
  const MARGIN_LEFT = 55, MARGIN_RIGHT = 50, MARGIN_BOTTOM = 62;
  const CONTENT_RIGHT = PAGE_W - MARGIN_RIGHT;   // 545
  const COL_LEFT = MARGIN_LEFT;                  // 55
  // Items-Tabelle-Spalten — Header (via x.print) und Items (via x.band)
  // müssen exakt aligned sein. Items haben keine Gaps zwischen den Spalten
  // (fluentreports rendert sequentiell), Header hat kleine Gaps für Optik.
  // Lösung: für den Header verwenden wir Spalten ohne Gap; für Items
  // identische Width-Werte. Layout: 55..83 Pos | 87..313 Name | 320..375 Menge
  // | 380..460 Einzelpreis | 465..545 Gesamtpreis.
  const COL_POS_X = MARGIN_LEFT, COL_POS_W = 28;             // 55..83
  const COL_NAME_X = MARGIN_LEFT + 32, COL_NAME_W = 226;     // 87..313
  const COL_QTY_X = 320, COL_QTY_W = 55;                     // 320..375
  const COL_PRICE_X = 380, COL_PRICE_W = 80;                 // 380..460
  const COL_TOTAL_X = 465, COL_TOTAL_W = CONTENT_RIGHT - 465; // 465..545
  // Gap-Widths zwischen Spalten im Band-Layout (Items)
  const COL_GAP_NAME_QTY = COL_QTY_X - (COL_NAME_X + COL_NAME_W);    // 7
  const COL_GAP_QTY_PRICE = COL_PRICE_X - (COL_QTY_X + COL_QTY_W);   // 5
  const COL_GAP_PRICE_TOTAL = COL_TOTAL_X - (COL_PRICE_X + COL_PRICE_W); // 5
  // pageFooter: 4 Zeilen × 10pt = 40pt block, Separator 8pt drüber
  const FOOTER_Y_TOP = PAGE_H - MARGIN_BOTTOM - 40;   // 740
  const FOOTER_SEP_Y = FOOTER_Y_TOP - 8;              // 732

  // Echte Linie via PDFKit moveTo/lineTo
  const hline = (x: any, y: number, x1 = COL_LEFT, x2 = CONTENT_RIGHT, weight = 0.5, color = '#bbb') => {
    const pdf = x._PDF;
    if (!pdf?.moveTo) return;
    pdf.save();
    pdf.lineWidth(weight).strokeColor(color).moveTo(x1, y).lineTo(x2, y).stroke();
    pdf.restore();
  };

  // Bands in fluentreports positionieren x RELATIV zum Margin. Da wir Margin
  // = MARGIN_LEFT (=55) gesetzt haben, muss x für bands = COL_*_X - MARGIN_LEFT
  // sein damit Items vertikal mit dem Tabellenheader fluchten (der via
  // x.print mit absoluten Koordinaten platziert wurde).
  const BAND_POS_X = COL_POS_X - MARGIN_LEFT;
  const BAND_NAME_X = COL_NAME_X - MARGIN_LEFT;

  var detail = function (x: any, r: { posNr: number; item: InvoiceItem }, s: any) {
    x.fontSize(10);
    // Band-Layout: Pos | gap(4) | Name | gap | Menge | gap | Einzelpreis | gap | Gesamtpreis
    // Pos-Width 28 + Name-Gap 4 + Name 226 = 258 → entspricht COL_NAME_X(87) - MARGIN_LEFT(55) + COL_NAME_W(226) = 258 ✓
    x.band(
      [
        { data: String(r.posNr), width: COL_POS_W, align: 1 },         // 0..28 → 55..83
        { data: '', width: 4 },                                          // Gap 4 → 83..87
        { data: sanitize(r.item.name), width: COL_NAME_W, align: 1 },  // 87..313
        { data: '', width: COL_GAP_NAME_QTY },                          // Gap → 313..320
        {
          data: `${r.item.quantity} ${r.item.amountType ?? ''}`.trim(),
          width: COL_QTY_W, align: 3,
        },                                                              // 320..375
        { data: '', width: COL_GAP_QTY_PRICE },                         // Gap → 375..380
        { data: formatCurrency(r.item.price, invoice.currency), width: COL_PRICE_W, align: 3 }, // 380..460
        { data: '', width: COL_GAP_PRICE_TOTAL },                       // Gap → 460..465
        { data: formatCurrency(r.item.total, invoice.currency), width: COL_TOTAL_W, align: 3 }, // 465..545
      ],
      { x: BAND_POS_X, addY: 10 }
    );
    // Beschreibung in kleinerer Schrift, eingerückt unter Item-Name.
    if (r.item.description && r.item.description.trim().length > 0) {
      x.fontSize(8.5);
      for (const line of r.item.description.split('\n')) {
        x.print(sanitize(line), { x: BAND_NAME_X, addY: 3, width: 400 });
      }
      x.fontSize(10);
    }
  };

  var tableFooter = function (x: any, r: any) {
    x.fontNormal();
    // Schließende Linie unter den Items
    x.print(' ', { x: COL_LEFT, addY: 6 });
    const pdf = x._PDF;
    if (pdf?.moveTo) {
      const yLine = pdf.y;
      hline(x, yLine, COL_LEFT, CONTENT_RIGHT, 0.7, '#222');
    }
    x.print(' ', { x: COL_LEFT, addY: 8 });

    // Totals: Label rechtsbündig vor COL_PRICE_X, Wert in COL_TOTAL_X-Spalte.
    // Band-x relativ zu Margin (siehe BAND_POS_X-Hinweis).
    // Layout: Label-Spalte 305..460 | gap | Wert-Spalte 465..545
    const LABEL_ABS_X = 305;
    const LABEL_X = LABEL_ABS_X - MARGIN_LEFT;
    const LABEL_W = COL_PRICE_X + COL_PRICE_W - LABEL_ABS_X; // = 460-305 = 155
    const TOTAL_GAP = COL_TOTAL_X - (COL_PRICE_X + COL_PRICE_W); // 5
    const VALUE_W = COL_TOTAL_W;

    const drawTotalRow = (label: string, value: string, bold = false) => {
      if (bold && x.fontBold) x.fontBold();
      x.band(
        [
          { data: label, width: LABEL_W, align: 3 },
          { data: '', width: TOTAL_GAP },
          { data: value, width: VALUE_W, align: 3 },
        ],
        { x: LABEL_X, addY: 4 }
      );
      if (bold && x.fontNormal) x.fontNormal();
    };

    x.fontSize(10);

    if (isRC) {
      drawTotalRow('Gesamtbetrag (netto)', formatCurrency(invoice.netTotal, invoice.currency), true);
      x.fontSize(8.5);
      const vermerk =
        receiverCountry && isEU(receiverCountry)
          ? 'Steuerschuld geht auf den Leistungsempfänger über (Reverse-Charge gemäß § 3a Abs. 6 UStG / Art. 196 MwStSyst-RL).'
          : 'Drittlandsleistung — nicht steuerbar in Österreich (§ 3a Abs. 6 UStG).';
      x.print(vermerk, { x: COL_LEFT, addY: 14, width: CONTENT_RIGHT - COL_LEFT });
      x.fontSize(10);
    } else if (isKlein) {
      drawTotalRow('Gesamtbetrag', formatCurrency(invoice.netTotal, invoice.currency), true);
      x.fontSize(8.5);
      x.print(
        'Umsatzsteuerbefreit - Kleinunternehmer gemäß § 6 Abs. 1 Z 27 UStG.',
        { x: COL_LEFT, addY: 14, width: CONTENT_RIGHT - COL_LEFT }
      );
      x.fontSize(10);
    } else {
      drawTotalRow('Gesamtbetrag netto', formatCurrency(invoice.netTotal, invoice.currency));
      for (const item of invoice.vatTotals) {
        drawTotalRow(`zzgl. USt ${item.vat}%`, formatCurrency(item.total, invoice.currency));
      }
      // Doppellinie als optische Trennung vor Brutto-Gesamtbetrag
      const pdf2 = x._PDF;
      if (pdf2?.moveTo) {
        const yAfter = pdf2.y + 2;
        hline(x, yAfter, LABEL_ABS_X, CONTENT_RIGHT, 0.4, '#666');
      }
      x.print(' ', { x: COL_LEFT, addY: 4 });
      x.fontSize(11);
      drawTotalRow('Gesamtbetrag brutto', formatCurrency(invoice.grossTotal, invoice.currency), true);
      x.fontSize(10);
    }

    // Skonto-Hinweis — eigene Zeile unter Gesamtbetrag, klar abgesetzt
    if (invoice.skontoPercent && invoice.skontoPercent > 0 && invoice.skontoDeadline) {
      x.fontSize(9);
      const deadline = invoice.skontoDeadline;
      const deadlineStr = `${String(deadline.getDate()).padStart(2,'0')}.${String(deadline.getMonth()+1).padStart(2,'0')}.${deadline.getFullYear()}`;
      const skontoLine =
        `Skonto: ${invoice.skontoPercent.toLocaleString('de-AT')} % bei Zahlung bis ${deadlineStr} -> ` +
        `Skontobetrag -${formatCurrency(invoice.skontoAmount, invoice.currency)}, ` +
        `zu zahlen ${formatCurrency(invoice.grossTotalWithSkonto, invoice.currency)}`;
      x.print(skontoLine, { x: COL_LEFT, addY: 16, width: CONTENT_RIGHT - COL_LEFT });
      x.fontSize(10);
    }
  };

  // pageHeader: läuft auf JEDER Seite (fixed top). Logo + Sender-Zeile.
  var pageTopHeader = function (x: any) {
    const pdf = x._PDF;
    // Logo oben rechts (rechts-aligned an CONTENT_RIGHT)
    const logoDataUrl = settings?.logoDataUrl;
    if (logoDataUrl && logoDataUrl.startsWith('data:image/')) {
      try {
        const b64 = logoDataUrl.split(',', 2)[1];
        if (b64) {
          const buf = Buffer.from(b64, 'base64');
          pdf.image(buf, CONTENT_RIGHT - 145, 50, { fit: [145, 50], align: 'right' });
        }
      } catch (e) { console.warn('[invoice/pdf] Logo embed failed', e); }
    }
    // Sender-Mini-Zeile bei y=50 (über dem Anschriftfeld, DIN-konform)
    const senderLine = settings && settings.name
      ? [settings.name, settings.addressStreet, `${settings.addressZip} ${settings.addressCity}`.trim()]
          .filter((s: string) => s && s.trim().length > 0)
          .join(' · ')
      : 'Firmendaten nicht konfiguriert - bitte unter /settings/company eintragen';
    x.fontSize(8);
    x.print(senderLine, { x: COL_LEFT, y: 50, width: 380 });
    x.fontSize(10);
  };

  var proposalHeader = function (x: any, r: any) {
    // Group-Header (nur Seite 1): Receiver-Block links + Invoice-Meta rechts +
    // Subject + headerText + Tabellen-Spaltenheader.
    const pdf = x._PDF;

    // Receiver-Adresse linke Spalte ab y=127 (DIN-5008 Anschriftfeld: 45mm vom Rand)
    x.fontSize(10);
    const addrLines = receiverAddress.split('\n').filter((l: string) => l.trim());
    addrLines.slice(0, 5).forEach((line: string, i: number) => {
      x.print(sanitize(line), { x: COL_LEFT, y: 127 + i * 14, width: 280 });
    });
    if (customerVatId) {
      const uidY = 127 + Math.min(addrLines.length, 5) * 14 + 4;
      x.fontSize(9);
      x.print(`UID: ${customerVatId}`, { x: COL_LEFT, y: uidY, width: 280 });
    }

    // Meta-Block rechte Spalte ab y=127 (auf Höhe Anschriftfeld)
    x.fontSize(9);
    const META_LABEL_X = 390, META_VALUE_X = 485;
    const drawMeta = (label: string, value: string, row: number) => {
      const y = 127 + row * 14;
      x.print(label, { x: META_LABEL_X, y, width: 90 });
      x.print(value, { x: META_VALUE_X, y, width: CONTENT_RIGHT - META_VALUE_X });
    };
    drawMeta('Rechnungs-Nr.:', invoice.invoiceNumber, 0);
    drawMeta('Datum:', invoice.invoiceDate ? formatDate(invoice.invoiceDate) :
              (invoice.createdAt ? formatDate(invoice.createdAt) : ''), 1);
    drawMeta(performanceLabel(invoice), formatPerformanceValue(invoice), 2);

    // Subject + Header-Text bei fixer Y (unterhalb Anschriftfeld + Luft)
    x.fontSize(13);
    if (x.fontBold) x.fontBold();
    x.print(sanitize(invoice.subject || ' '), { x: COL_LEFT, y: 220, width: CONTENT_RIGHT - COL_LEFT });
    if (x.fontNormal) x.fontNormal();
    x.fontSize(10);
    if (invoice.headerText && invoice.headerText.trim().length > 0) {
      if (pdf?.text) {
        pdf.save();
        pdf.font('Helvetica').fontSize(10).fillColor('#000');
        pdf.text(sanitize(invoice.headerText), COL_LEFT, 248, {
          width: CONTENT_RIGHT - COL_LEFT, height: 36, lineGap: 1,
        });
        pdf.restore();
      }
    }

    // Tabellen-Spaltenheader bei y=295 (Items starten ~y=315)
    const HEADER_Y = 295;
    if (pdf?.rect) {
      pdf.save();
      pdf.rect(COL_LEFT, HEADER_Y - 4, CONTENT_RIGHT - COL_LEFT, 18).fill('#f4f4f4');
      pdf.restore();
    }
    x.fontSize(9);
    if (x.fontBold) x.fontBold();
    x.print('Pos.',        { x: COL_POS_X,   y: HEADER_Y, width: COL_POS_W,   align: 1 });
    x.print('Bezeichnung', { x: COL_NAME_X,  y: HEADER_Y, width: COL_NAME_W,  align: 1 });
    x.print('Menge',       { x: COL_QTY_X,   y: HEADER_Y, width: COL_QTY_W,   align: 3 });
    x.print('Einzelpreis', { x: COL_PRICE_X, y: HEADER_Y, width: COL_PRICE_W, align: 3 });
    x.print('Gesamtpreis', { x: COL_TOTAL_X, y: HEADER_Y, width: COL_TOTAL_W, align: 3 });
    if (x.fontNormal) x.fontNormal();
    hline(x, HEADER_Y + 14, COL_LEFT, CONTENT_RIGHT, 0.7, '#222');
    // Cursor unter den Header setzen, damit detail() bei y≈315 startet
    x.print(' ', { x: COL_LEFT, y: HEADER_Y + 20, width: 1 });
  };

  var proposalFooter = function (x: any, r: any) {
    // Group-Footer: läuft nach den Items, fließt natürlich. Hier nur
    // freier Fuß-Text der Rechnung (User-konfigurierbar).
    if (invoice.footerText && invoice.footerText.trim().length > 0) {
      x.fontSize(11);
      x.print(sanitize(invoice.footerText), { x: COL_LEFT, addY: 20, width: CONTENT_RIGHT - COL_LEFT });
    }
  };

  // pageBottomFooter: läuft auf JEDER Seite (fixed Y am Page-Bottom).
  // DIN-konform: Block endet bei y=780, ~62pt = 22mm zum Page-Bottom.
  // 4 Zeilen × 10pt + Separator-Linie 8pt drüber = ~50pt Gesamthöhe.
  var pageBottomFooter = function (x: any) {
    const baseY = FOOTER_Y_TOP;       // 740
    const pdf = x._PDF;
    // Trennlinie zur Body-Zone
    hline(x, FOOTER_SEP_Y, COL_LEFT, CONTENT_RIGHT, 0.3, '#ccc');
    let lineY = baseY;
    if (settings) {
      x.fontSize(8);
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
        const bank = [settings.iban, settings.bic, settings.bankName]
          .filter((s: string) => s && s.trim().length > 0)
          .join(' · ');
        lines.push(`Bankverbindung: ${bank}`);
      }
      // Cap auf 4 Zeilen
      lines.slice(0, 4).forEach((line, i) => {
        x.print(line, { x: COL_LEFT, y: baseY + i * 10, width: CONTENT_RIGHT - COL_LEFT });
      });
      lineY = baseY + Math.min(lines.length, 4) * 10;
    }
    // RC-Audit-Vermerk
    if (isRC && customerVerifiedAt) {
      x.fontSize(7);
      const stamp = `UID des Leistungsempfängers gegen VIES geprüft am ${formatDate(customerVerifiedAt)}` +
        (customerVerifiedName ? ` -- ${customerVerifiedName}` : '');
      x.print(stamp, { x: COL_LEFT, y: lineY + 4, width: CONTENT_RIGHT - COL_LEFT });
      x.fontSize(8);
    }
  };

  // PDFKit ships Helvetica by default — no external fonts needed.
  var report = new Report('buffer').data(primary_data);

  var r = report.margins(MARGIN_LEFT).detail(detail);

  report
    .pageHeader(pageTopHeader)
    .pageFooter(pageBottomFooter)
    .groupBy('no')
    .header(proposalHeader)
    .footer(proposalFooter)
    .groupBy('product.product_type')
    .sum('amount')
    .footer(tableFooter);

  //r.printStructure();

  return new Promise((resolve, reject) => {
    r.render(function (err: any, buffer: Buffer) {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve(buffer);
      }
    });
  });
}
