# 30 Skonto

## Wofür

Standard-AT/DE-Zahlungsabschlag: „2 % Skonto bei Zahlung innerhalb 7 Tagen". Beschleunigt den Geldeingang, weil Kunden sich den Abschlag sichern wollen.

## Einrichtung

**Globale Defaults:** Einstellungen → Firma → Rechnungs-Layout:
- Standard Skonto-Satz (%)
- Standard Skonto-Frist (Tage)

Bei jeder neuen Rechnung werden diese Defaults vorausgefüllt — pro Rechnung jederzeit überschreibbar im **Rechnungs-Edit → Zahlung + Skonto**.

`0 %` bedeutet: kein Skonto auf der Rechnung.

## Anzeige

**Invoice-View:** Grüne Skonto-Karte zeigt Frist (absolutes Datum), Skontobetrag und tatsächlich zu zahlenden Betrag.

**PDF:** Skonto-Zeile direkt unter dem Gesamtbetrag, AT/DE-Standard-Formulierung:
> Skonto: 2 % bei Zahlung bis 15.06.2026 → Skontobetrag −12,00 €, zu zahlen 588,00 €

**XRechnung 3.0:** Die `cac:PaymentTerms`-Note enthält die Skonto-Klausel maschinenlesbar für DE-B2B-Verarbeitung.

## Per-Item-Rabatt vs. Skonto

Skonto ist **Invoice-Level**: prozentualer Abschlag auf den Gesamtbetrag bei pünktlicher Zahlung.

Wenn Du **per-Position rabattieren** willst (z.B. „Kunde X bekommt 10 % auf alles"), nutze stattdessen `InvoiceItem.discount` + `discountType` im Item-Edit.

## Hinweis §16 UStG

Bei Skonto-Inanspruchnahme verlangt §16 UStG bei USt-pflichtigen Rechnungen eine USt-Korrektur. Diese passiert außerhalb der Software über Storno-/Korrekturrechnung. Bei Kleinunternehmer (kein USt) ist keine Korrektur nötig.
