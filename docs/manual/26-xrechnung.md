# 26 · XRechnung (UBL 2.1 XML)

Generiert E-Rechnung im **XRechnung-3.0**-Format aus existierender Invoice.
Konform zu **DE-B2B-Pflicht 2025** und **AT-B2G über USP**.

## Wozu?

In Deutschland sind alle B2B-Rechnungen ab 2025 elektronisch im strukturierten
Format zu übermitteln (E-Rechnungs-Gesetz). Österreichische B2G-Rechnungen
laufen seit 2014 über USP (Unternehmensservice-Portal) als XRechnung.

## Workflow

1. Rechnung in accountant erstellen (normal über Edit → Festschreiben)
2. Invoice-View öffnen
3. Action-Button **„XRechnung-XML"** (neben „Als Vorlage kopieren")
4. → XML-Datei wird heruntergeladen

### Übergabe an Kunden

Methoden:
- **E-Mail-Anhang** — XML zusammen mit PDF schicken (PDF als
  menschen-lesbare Sicht)
- **Peppol-Network** — via PEPPOL-Access-Point (USP für AT)
- **B2G-Portal** (DE: zentrales Verwaltungs-Portal je Bundesland)

## Format-Details

| Element | Wert |
|---|---|
| `<cbc:CustomizationID>` | `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0` |
| `<cbc:ProfileID>` | `urn:fdc:peppol.eu:2017:poacc:billing:01:1.0` |
| `<cbc:InvoiceTypeCode>` | `380` (normal) / `381` (Storno-Rechnung) |
| `<cbc:DocumentCurrencyCode>` | dynamisch aus `Invoice.currency` |

## Sonderfälle

### Reverse-Charge EU

```xml
<cac:TaxCategory>
  <cbc:ID>AE</cbc:ID>
  <cbc:Percent>0.00</cbc:Percent>
  <cbc:TaxExemptionReason>Reverse-Charge gemäß §3a Abs. 6 UStG / Art. 196 MwStSyst-RL</cbc:TaxExemptionReason>
</cac:TaxCategory>
```

### Drittland

```xml
<cac:TaxCategory>
  <cbc:ID>G</cbc:ID>
  <cbc:Percent>0.00</cbc:Percent>
  <cbc:TaxExemptionReason>Drittlandsleistung — nicht steuerbar in Österreich</cbc:TaxExemptionReason>
</cac:TaxCategory>
```

### Kleinunternehmer

```xml
<cac:TaxCategory>
  <cbc:ID>E</cbc:ID>
  <cbc:Percent>0.00</cbc:Percent>
  <cbc:TaxExemptionReason>Steuerbefreit gemäß §6 Abs. 1 Z 27 UStG (Kleinunternehmer)</cbc:TaxExemptionReason>
</cac:TaxCategory>
```

### Storno

`InvoiceTypeCode` wird auf `381` gesetzt (statt `380`). Mengen sind
negativ in den Invoice-Lines.

## Unit-Code-Mapping (UN/ECE Rec. 20)

| accountant | UBL-Code |
|---|---|
| Stk | C62 (Stück) |
| Std | HUR (Stunde) |
| Tag(e) | DAY |
| m | MTR |
| m² | MTK |
| m³ | MTQ |
| kg | KGM |
| t | TNE |
| km | KMT |
| L | LTR |
| pauschal | LS (Lump Sum) |
| % | P1 |

## API

```
GET /api/invoice/:id/xrechnung.xml
```

Response: `application/xml` mit `Content-Disposition: attachment`.

## Validierung

Lokales Tool (KoSIT-Validator):
- https://kosit.org/xrechnung/validator
- Drag & Drop der XML-Datei → instant Feedback ob konform

Online:
- https://peppol.helger.com/peppol/public/menuitem-validation-ubl → wählen
  „XRechnung 3.0" → upload

## Häufige Fragen

**Validiert die XML automatisch beim Download?**
Nein — wir generieren strukturkonformes XML, aber prüfen NICHT gegen den
KoSIT-Validator. User selbst validieren wenn nötig.

**Wird auch ZUGFeRD (PDF/A-3 mit XML) generiert?**
Nein, out-of-scope für v1. ZUGFeRD braucht PDF/A-3-Generierung mit XML-
Attachment im konformen Format — das ist eine eigene PDF-Renderer-Phase.
Workaround: PDF normal aus accountant + XML aus accountant separat
versenden. Für B2G ist das akzeptiert.

**Was mit der Leitweg-ID für DE-B2G?**
`Invoice.reference` wird als `<cbc:BuyerReference>` ins XML geschrieben.
Trag dort die Leitweg-ID ein bevor du XML generierst.

**Wird die XML auch im PDF eingebettet?**
Nein (das wäre ZUGFeRD). XML ist separat als File.

**Was wenn CompanySettings.iban leer ist?**
Der `<cac:PaymentMeans>`-Block wird einfach weggelassen. XML bleibt
strukturell valide.

**Wie wird die DueDate berechnet?**
`Invoice.invoiceDate + Invoice.paymentTermsDays` (Snapshot vom Customer).
Default 14 Tage.

**Brauche ich was extra für CHF-Rechnungen?**
Nein, `DocumentCurrencyCode` wird dynamisch aus `Invoice.currency` gesetzt.
UBL akzeptiert ISO-4217-CHF nativ.
