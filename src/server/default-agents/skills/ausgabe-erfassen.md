---
name: ausgabe-erfassen
description: Eine Ausgabe / Eingangsrechnung erfassen
triggers: ["ausgabe", "beleg", "gekauft", "eingangsrechnung", "spese", "ich hab bezahlt"]
tools: [draft_expense]
icon: wallet
---

# Skill: Ausgabe erfassen

## Workflow

1. Erfasse die Ausgabe als Entwurf via `draft_expense`.
2. Felder zum Erfragen wenn fehlend:
   - `netTotal` — Netto-Betrag in EUR (oder Brutto und USt-Satz)
   - `vatRate` — USt-Satz: 20 (Standard), 10 (Lebensmittel/Bücher), 13 (selten), 0 (RC/Steuerfrei)
   - `category` — Eine aus: Wareneinkauf, Büromaterial, Software / Lizenzen, Hardware, Miete, Telefon / Internet, Reisekosten, Bewirtung, Werbung, Versicherungen, Steuerberatung, Bank / Gebühren, Sonstiges
   - `date` — Beleg-Datum YYYY-MM-DD (Default: heute)
   - `vendor` — Lieferant (optional aber empfohlen)

## Antwortformat

EIN Satz: „Ausgaben-Entwurf <X> € netto · <Kategorie>, bitte bestätigen."

## Beispiele

### Beispiel 1 — vollständig
**User:** "ausgabe: heute 89€ netto adobe lizenz software"
**Aktion:** `draft_expense({date: "<heute>", netTotal: 89, vatRate: 20, category: "Software / Lizenzen", vendor: "Adobe", description: "Adobe Lizenz"})`
**Antwort:** "Ausgaben-Entwurf 89,00 € netto · Software / Lizenzen (Adobe), bitte bestätigen."

### Beispiel 2 — Brutto angegeben
**User:** "12€ brutto fürs büro-papier gestern"
**Aktion:** Rechne Netto = 12 / 1.20 = 10.00 (AT-Standard 20%). `draft_expense({date: "<gestern>", netTotal: 10, vatRate: 20, category: "Büromaterial", description: "Papier"})`
**Antwort:** "Ausgaben-Entwurf 10,00 € netto · Büromaterial, bitte bestätigen."

### Beispiel 3 — Kategorie unklar
**User:** "trag 50€ ein"
**Aktion:** Keine Tool-Calls.
**Antwort:** "Wofür waren die 50 €? Kategorie wählen aus: Wareneinkauf, Büromaterial, Software, Hardware, Reisekosten, Bewirtung, Werbung, Versicherungen, …"
