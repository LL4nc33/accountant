# 36 Kassabuch

> Modul aktivieren: **Einstellungen → Module → Kassabuch (nicht RKSV)**.
> Pfad: Buchhaltung → **Kassabuch**.

## ⚠ NICHT RKSV-konform

Dieses Kassabuch ist **kein** Registrierkassen-Modul im Sinne der RKSV (Registrierkassensicherheitsverordnung).

**Bei Bar-Tagesumsätzen > 7.500 €/Jahr** ist eine RKSV-konforme Registrierkasse mit Smartcard-Signing + Belegkette + FinanzOnline-Anmeldung **gesetzlich Pflicht**. Verwende dafür ein zertifiziertes Tool (z.B. hellocash, Re-7).

Dieses Modul ist gedacht für **niedrige Bar-Umsätze**:
- Trinkgeld
- Auslagen-Erstattungen
- Kleinbeträge unter der Pflichtgrenze
- Private Einlagen / Entnahmen

## §131 BAO

Auch bei nicht-RKSV-pflichtigen Bargeschäften gelten die BAO-Pflichten: **zeitnah, vollständig, geordnet, unveränderlich** nach Erfassung. Das Audit-Log greift automatisch — alle Änderungen werden geloggt.

## Datenmodell

Jeder Eintrag hat:
- **Datum** + **Beleg-Nr.** (z.B. K-2026-001)
- **Beschreibung**
- **Betrag** — positiv = Einnahme, negativ = Ausgabe
- **Kategorie** (Bareinnahme Kunde / Trinkgeld / Spesen / Auslagen / Einlage Privat / Entnahme Privat / Kassendifferenz / Sonstiges)
- **USt-Satz** — 0 für USt-freie Vorgänge (Trinkgeld, Privatentnahme)
- Optionale Verknüpfungen zu Rechnung und/oder Expense

Auto-Berechnung Netto + USt-Betrag bei vatRate > 0.

## UI

- **/cashbook**: Liste mit Year-Filter, KPI-Karten (Saldo gesamt oder Jahresende, Einnahmen, Ausgaben des Filter-Jahres), Tabelle mit **laufendem Saldo nach jeder Buchung**.
- **/cashbook/:id/edit**: Edit-Form. Bei USt-Satz > 0 wird unter dem Betrag der Split „Netto / USt" gezeigt — mit Kontext „Einnahme/Ausgabe" damit die Vorzeichen klar sind.
