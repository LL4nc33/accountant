# 08 Projekte und Zeiterfassung

## Workflow-Idee

Klassisch für IT-Dienstleister:

1. **Projekt anlegen** pro Kunde (oder pro Auftrag)
2. **Stunden buchen** zu jedem Projekt (Datum, Beschreibung, Stunden, Satz)
3. **Rechnung erzeugen** aus den offenen Stunden — eine InvoiceItem pro TimeEntry, Stunden als Menge, Stundensatz als Preis
4. Abgerechnete TimeEntries werden automatisch markiert, doppelte Abrechnung ist nicht möglich

## Projekt anlegen

Sidebar → Projekte → Übersicht → „+ Neues Projekt".

| Feld | Bedeutung |
|---|---|
| Kunde | Person oder Firma — Pflicht |
| Projektname | erscheint als Subject auf der Rechnung |
| Beschreibung | optional, intern |
| Status | `active` (Stunden buchbar) oder `closed` (nur Read-only) |
| Stundensatz | Override für dieses Projekt. 0 = fallback auf CompanySettings.defaultHourlyRate |

## Zeitbuchung

Auf Projektdetail → „+ Stunden buchen". Vorbefüllung: Datum heute, Satz vom Projekt.

| Feld | Bedeutung |
|---|---|
| Datum | Leistungstag |
| Stunden | dezimal (0.25, 0.5, 1.0, 2.5 …) |
| Stundensatz | wird auf der Buchung snapshotted — spätere Projekt-Satz-Änderungen wirken nicht rückwirkend |
| Beschreibung | Multiline, landet im PDF als Item-Beschreibung |

Solange `billedInvoiceItemId` leer ist, kann die Buchung bearbeitet oder gelöscht werden.

## Rechnung erzeugen

Auf Projektdetail → „Rechnung erzeugen". Bestätigungsdialog zeigt Anzahl Einträge, Gesamtstunden, Netto-Summe. Bei Bestätigung:

- Eine neue Invoice mit `subject = <Projektname>` wird angelegt
- Pro TimeEntry eine InvoiceItem mit Datum + erster Description-Zeile im Item-Namen, Stunden als Menge, Snapshot-Satz als Preis
- USt = `CompanySettings.country`-Default (AT 20%, DE 19%, CH 8.1%)
- Wenn `isKleinunternehmer=true`: USt = 0
- Alle TimeEntries werden mit `billedInvoiceItemId` markiert
- Du landest direkt auf der neuen Rechnung für letzten Schliff (Header-/Footer-Text, Leistungsdatum, RC-Flag)

## „Stunden zurückführen"

Aktuell nicht automatisch. Wenn eine Rechnung storniert wird und die Stunden wieder offen sein sollen:
1. InvoiceItems der Rechnung notieren
2. Die jeweiligen TimeEntries als Admin in der SQLite-Datenbank editieren, `billedInvoiceItemId` leeren (das Feld ist nur für die Admin-Rolle änderbar)

Ein UI-Workflow dafür ist aktuell nicht vorhanden.

## Reporting

Projekte haben aktuell keine eigenen Reports oder Charts.
