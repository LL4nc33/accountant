/**
 * XRechnung (UBL 2.1) Export (Phase 20, v0.26.0)
 *
 * Generiert ISO-20022-konformes UBL-2.1-XML aus einer existierenden Invoice
 * — für DE-B2B-Pflicht 2025, AT-B2G über USP.
 *
 * Endpoint:
 *   GET /api/invoice/:id/xrechnung.xml
 *
 * Wir generieren das XML per Template-String — kein XML-Library-Dep nötig.
 * Sonderfälle abgedeckt:
 *   - normale 20%/13%/10%/0%-Rechnungen
 *   - Reverse-Charge (B2B EU) → TaxCategory AE + Note
 *   - Drittland → TaxCategory G (Export) + Note
 *   - Kleinunternehmer → TaxCategory E (befreit) + Note §6 Abs.1 Z27
 *
 * Hinweise:
 *   - Customization-ID XRechnung 3.0.2 (zur Zeit aktuelle DE-Spec)
 *   - Profile reportingenabled BIS3 (peppol-konform)
 *   - ZUGFeRD (PDF/A-3 mit eingebettetem XML) ist out-of-scope für v1
 */
import express from 'express';
import { repo, remult } from 'remult';
import { api } from './api';
import { Invoice } from '../shared/entities/invoice';
import { InvoiceItem } from '../shared/entities/invoice-item';
import { CompanySettings } from '../shared/entities/company-settings';
import { Person } from '../shared/entities/person';
import { Company } from '../shared/entities/company';
import { Address } from '../shared/entities/address';
import { isEU } from '../shared/entities/country';

export const xrechnung = express.Router();
xrechnung.use(express.json());
xrechnung.use(api.withRemult);

function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isoDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().substring(0, 10);
}

function fmtNum(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

interface Party {
  name: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  vatId: string;
  email: string;
}

function buildPartyXml(tag: string, p: Party): string {
  return `<cac:${tag}>
    <cac:Party>
      <cac:PartyName><cbc:Name>${esc(p.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(p.street)}</cbc:StreetName>
        <cbc:CityName>${esc(p.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(p.zip)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${esc(p.country)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${p.vatId ? `<cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(p.vatId)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>` : ''}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      ${p.email ? `<cac:Contact><cbc:ElectronicMail>${esc(p.email)}</cbc:ElectronicMail></cac:Contact>` : ''}
    </cac:Party>
  </cac:${tag}>`;
}

interface RateBucket {
  rate: number;
  netto: number;
  ust: number;
  category: string; // S / E / AE / G / O / Z
  reason?: string;
}

interface XmlContext {
  isKlein: boolean;
  isRC: boolean;
  isThirdCountry: boolean;
}

function classifyCategory(item: InvoiceItem, ctx: XmlContext): string {
  if (ctx.isKlein) return 'E'; // exempt
  if (ctx.isRC) return ctx.isThirdCountry ? 'G' : 'AE'; // G = export, AE = reverse charge
  if (item.vat === 0) return 'Z'; // zero rate
  return 'S'; // standard
}

function categoryReason(category: string): string {
  switch (category) {
    case 'E': return 'Steuerbefreit gemäß §6 Abs. 1 Z 27 UStG (Kleinunternehmer)';
    case 'AE': return 'Reverse-Charge gemäß §3a Abs. 6 UStG / Art. 196 MwStSyst-RL';
    case 'G': return 'Drittlandsleistung — nicht steuerbar in Österreich';
    case 'Z': return 'Nullsteuersatz';
    default: return '';
  }
}

async function buildXml(invoiceId: string): Promise<string> {
  const inv = await repo(Invoice).findFirst({ id: invoiceId });
  if (!inv) throw new Error('Invoice nicht gefunden');
  const items = await repo(InvoiceItem).find({ where: { invoiceId } });
  if (!items.length) throw new Error('Invoice hat keine Positionen');
  const settings = await repo(CompanySettings).findFirst();
  if (!settings) throw new Error('CompanySettings nicht gefunden');

  // Customer + Customer-Address
  let custName = '';
  let custVatId = inv.recipientVatId || '';
  let custEmail = '';
  let custCountry = '';
  if (inv.customerId) {
    const person = await repo(Person).findFirst({ id: inv.customerId });
    const company = !person ? await repo(Company).findFirst({ id: inv.customerId }) : null;
    const customer = person ?? company;
    if (customer) {
      custName = customer.displayName;
      if (!custVatId) custVatId = customer.vatId || '';
      custEmail = customer.email || '';
    }
    const addrs = await repo(Address).find({ where: { customerId: inv.customerId } });
    const billing = addrs.find((a) => a.addressType === 'Rechnungsanschrift') ?? addrs[0];
    if (billing) custCountry = billing.country || '';
  }

  const isKlein = !!settings.isKleinunternehmer;
  const isRC = !!inv.reverseCharge;
  const isThirdCountry = isRC && (!isEU(custCountry) || custCountry === '');
  const ctx: XmlContext = { isKlein, isRC, isThirdCountry };

  // Aggregations pro USt-Satz
  const buckets = new Map<number, RateBucket>();
  for (const item of items) {
    const rate = item.vat;
    const netto = inv.vatType === 'Brutto'
      ? item.total / (1 + rate / 100)
      : item.total;
    const ust = isKlein || isRC ? 0 : (inv.vatType === 'Brutto' ? item.total - netto : item.total * (rate / 100));
    const category = classifyCategory(item, ctx);
    // Bei RC oder Klein: alles in einem Bucket konsolidieren (rate=0 für reporting)
    const bucketKey = (isKlein || isRC) ? 0 : rate;
    const existing = buckets.get(bucketKey) ?? {
      rate: bucketKey, netto: 0, ust: 0, category, reason: categoryReason(category),
    };
    existing.netto += netto;
    existing.ust += ust;
    buckets.set(bucketKey, existing);
  }

  const totalNet = Array.from(buckets.values()).reduce((s, b) => s + b.netto, 0);
  const totalTax = Array.from(buckets.values()).reduce((s, b) => s + b.ust, 0);
  const totalGross = totalNet + totalTax;

  const dueDate = (() => {
    const d = new Date(inv.invoiceDate);
    d.setDate(d.getDate() + (inv.paymentTermsDays ?? 14));
    return isoDate(d);
  })();

  const sender: Party = {
    name: settings.name || '—',
    street: settings.addressStreet || '',
    zip: settings.addressZip || '',
    city: settings.addressCity || '',
    country: settings.country || 'AT',
    vatId: settings.vatId || '',
    email: settings.email || '',
  };

  // Empfänger-Adresse aus Invoice.address (Multi-Line) parsen — wir nehmen,
  // was wir kriegen, der Rest kommt aus dem Customer-Lookup.
  const addrLines = (inv.address || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const buyer: Party = {
    name: custName || addrLines[0] || '—',
    street: addrLines.length > 2 ? addrLines[addrLines.length - 3]! : '',
    zip: '',
    city: '',
    country: custCountry || 'AT',
    vatId: custVatId,
    email: custEmail,
  };
  // PLZ + Ort aus vorletzter Zeile extrahieren (Format: „PLZ Ort")
  if (addrLines.length >= 2) {
    const second = addrLines[addrLines.length - 2] ?? '';
    const m = /^(\d{4,5})\s+(.+)$/.exec(second);
    if (m) {
      buyer.zip = m[1]!;
      buyer.city = m[2]!;
    }
  }

  const lineXml = items.map((item, idx) => {
    const lineNetto = inv.vatType === 'Brutto'
      ? item.total / (1 + item.vat / 100)
      : item.total;
    const category = classifyCategory(item, ctx);
    return `<cac:InvoiceLine>
      <cbc:ID>${idx + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${esc(unitCodeFor(item.amountType ?? 'Stk'))}">${fmtNum(item.quantity)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${inv.currency || "EUR"}">${fmtNum(lineNetto)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Name>${esc(item.name || '—')}</cbc:Name>
        ${item.description ? `<cbc:Description>${esc(item.description)}</cbc:Description>` : ''}
        <cac:ClassifiedTaxCategory>
          <cbc:ID>${category}</cbc:ID>
          <cbc:Percent>${fmtNum((isKlein || isRC) ? 0 : item.vat)}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${inv.currency || "EUR"}">${fmtNum(item.price)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`;
  }).join('\n    ');

  const taxSubtotalXml = Array.from(buckets.values()).map((b) => `<cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${inv.currency || "EUR"}">${fmtNum(b.netto)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${inv.currency || "EUR"}">${fmtNum(b.ust)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${b.category}</cbc:ID>
        <cbc:Percent>${fmtNum(b.rate)}</cbc:Percent>
        ${b.reason ? `<cbc:TaxExemptionReason>${esc(b.reason)}</cbc:TaxExemptionReason>` : ''}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`).join('\n    ');

  const note = isKlein
    ? 'Umsatzsteuerbefreit – Kleinunternehmer gemäß §6 Abs. 1 Z 27 UStG'
    : (isRC ? (isThirdCountry
        ? 'Drittlandsleistung — nicht steuerbar in Österreich (§3a Abs. 6 UStG)'
        : 'Steuerschuld geht auf den Leistungsempfänger über (Reverse-Charge gemäß §3a Abs. 6 UStG / Art. 196 MwStSyst-RL)')
      : '');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(inv.invoiceNumber || inv.id)}</cbc:ID>
  <cbc:IssueDate>${isoDate(inv.invoiceDate)}</cbc:IssueDate>
  <cbc:DueDate>${dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>${inv.correctsInvoiceId ? '381' : '380'}</cbc:InvoiceTypeCode>
  ${note ? `<cbc:Note>${esc(note)}</cbc:Note>` : ''}
  <cbc:DocumentCurrencyCode>${esc(inv.currency || "EUR")}</cbc:DocumentCurrencyCode>
  ${inv.reference ? `<cbc:BuyerReference>${esc(inv.reference)}</cbc:BuyerReference>` : '<cbc:BuyerReference>—</cbc:BuyerReference>'}
  ${buildPartyXml('AccountingSupplierParty', sender)}
  ${buildPartyXml('AccountingCustomerParty', buyer)}
  ${settings.iban ? `<cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${esc(inv.invoiceNumber || '')}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${esc(settings.iban)}</cbc:ID>
      ${settings.bankName ? `<cbc:Name>${esc(settings.bankName)}</cbc:Name>` : ''}
      ${settings.bic ? `<cac:FinancialInstitutionBranch><cbc:ID>${esc(settings.bic)}</cbc:ID></cac:FinancialInstitutionBranch>` : ''}
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>` : ''}
  <cac:PaymentTerms>
    <cbc:Note>Zahlbar bis ${dueDate}${(inv.skontoPercent && inv.skontoPercent > 0 && inv.skontoDeadline) ? ` — ${inv.skontoPercent.toLocaleString('de-AT')}% Skonto bei Zahlung bis ${inv.skontoDeadline.toISOString().substring(0,10)} (Skonto -${fmtNum(inv.skontoAmount)} ${inv.currency || 'EUR'})` : ''}</cbc:Note>
  </cac:PaymentTerms>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${inv.currency || "EUR"}">${fmtNum(totalTax)}</cbc:TaxAmount>
    ${taxSubtotalXml}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${inv.currency || "EUR"}">${fmtNum(totalNet)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${inv.currency || "EUR"}">${fmtNum(totalNet)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${inv.currency || "EUR"}">${fmtNum(totalGross)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${inv.currency || "EUR"}">${fmtNum(totalGross)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${lineXml}
</Invoice>
`;
}

/** Map accountant-Mengentyp → UN/ECE Recommendation 20 Unit Code (UBL).
 *  Spec: https://docs.peppol.eu/poacc/billing/3.0/codelist/UNECERec20/ */
function unitCodeFor(amountType: string): string {
  const map: Record<string, string> = {
    'Stk': 'C62', // one (default für Stück)
    'Std': 'HUR', // hour
    'Tag(e)': 'DAY',
    'm': 'MTR',
    'm²': 'MTK',
    'm³': 'MTQ',
    'kg': 'KGM',
    't': 'TNE',
    'lfm': 'MTR',
    'km': 'KMT',
    'L': 'LTR',
    'pauschal': 'LS',
    '%': 'P1',
  };
  return map[amountType] ?? 'C62';
}

xrechnung.get('/api/invoice/:id/xrechnung.xml', async (req, res) => {
  const user = (req.session as any)?.user;
  if (!user) {
    res.status(401).send('Nicht eingeloggt');
    return;
  }
  try {
    const xml = await buildXml(req.params['id']!);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    const filename = `xrechnung-${req.params['id']}.xml`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  } catch (e: any) {
    console.error('[xrechnung] generation failed:', e);
    res.status(500).json({ error: e?.message ?? 'XML-Generierung fehlgeschlagen' });
  }
});
