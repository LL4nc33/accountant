# 07 Leistungsdatum und §11 UStG Pflichtangaben

Eine Rechnung über €400 brutto muss in Österreich nach §11 UStG zehn Punkte enthalten. accountant befüllt sie automatisch aus deinen Daten — du musst nur sicherstellen, dass alle Felder gepflegt sind.

## Die 10 Pflichtangaben

| Nr | Inhalt | Quelle in accountant |
|---|---|---|
| 1 | Name & Anschrift Aussteller | CompanySettings |
| 2 | Name & Anschrift Empfänger | Anschrift-Feld der Rechnung |
| 3 | Menge & Bezeichnung Lieferung/Leistung | Positionen |
| 4 | Tag der Lieferung/sonstigen Leistung | Leistungsdatum (s.u.) oder Rechnungsdatum |
| 5 | Entgelt + Steuersatz (oder Hinweis auf Befreiung) | Positionen + USt-Spalten oder Vermerk |
| 6 | Steuerbetrag | Auto-berechnet aus Positionen |
| 7 | Ausstellungsdatum | Rechnungsdatum |
| 8 | Fortlaufende Nummer | Auto aus Nummernkreis |
| 9 | UID des Ausstellers | CompanySettings |
| 10 | UID des Empfängers (>€10k brutto oder bei RC) | Empfänger-UID auf Rechnung |

## Leistungsdatum

Bei einmaligen Leistungen: ein einzelnes Datum.
Bei Zeitraum-Leistungen (z.B. Wartungsvertrag, Stundenkontingent): "von" und "bis" Datum.

In der Rechnungs-Bearbeitung: Felder "Leistungsdatum von" und "Leistungsdatum bis". Beide leer = Leistungsdatum entspricht Rechnungsdatum.

Im PDF erscheint je nach Befüllung:
- beide leer → "Leistungsdatum: 01.01.2026" (= Rechnungsdatum)
- nur "von" → "Leistungsdatum: 01.01.2026"
- beide → "Leistungszeitraum: 01.01.2026 – 31.01.2026"

## Kleinbetragsrechnung (≤€400 brutto)

Bei Rechnungen ≤€400 brutto reichen verkürzte Angaben (Ausstellungsdatum, Bezeichnung, Entgelt+Steuer, Steuersatz, Name/Anschrift Aussteller). accountant hat hierfür noch kein vereinfachtes Layout — kommt in einer späteren Phase. Aktuell fährt die App immer das volle §11-Layout, das ist auch für Kleinbetragsrechnungen rechtlich zulässig.
