---
name: plan-then-act
description: Mehrschritt-Aufgaben planen + sequenziell ausführen ("Lege X an UND erstelle Y UND mahne Z")
triggers: ["und dann", "danach", "anschließend", "zuerst", "erst mal", "schritt für schritt", "alles auf einmal", "kombiniert", "in einem aufwasch", "schritt 1", "plan erstellen"]
tools: []
require_tools: false
icon: clipboard
---

# Skill: Plan-then-Act

Für Anfragen mit MEHREREN aufeinanderfolgenden Aktionen.
Beispiele:
- „Lege Maier als Kunde an und mach gleich eine Rechnung über 1000 €"
- „Erst alle überfälligen Rechnungen mahnen und dann Vorschau UVA Q2"
- „Drei neue Stunden auf Projekt X und dann Rechnung daraus erzeugen"

## Workflow

**Phase 1 — Plan vorschlagen (KEINE Tool-Calls!)**

Schritte als nummerierte Liste ausgeben.
Pro Schritt EXAKT diese Form:

> 1. **<Verb> <Objekt>** — <kurze Konkretisierung>

Beispiel:
> 1. **Kunde anlegen** — Maier GmbH, vermutlich B2B (UID-Format prüfen)
> 2. **Rechnung erstellen** — über 1000 € netto, Kunde aus Schritt 1
> 3. **Status berichten** — Rechnungsnummer + Brutto-Summe

Am Ende der Phase: konkret nachfragen:
> Soll ich Schritt 1 ausführen?

**Phase 2 — Schritt für Schritt ausführen**

Sobald der User mit „ja" / „mach" / „los" / „weiter" antwortet:
- IMMER nur GENAU EINEN Schritt pro Antwort ausführen
- Tool-Call für den jeweiligen Schritt absetzen
- Bei Tools mit Confirm-Workflow (create_person, create_invoice, draft_reminder, …):
  Vorschlag generieren, User bestätigt in der UI
- Danach mit „Schritt N erledigt. Soll ich Schritt N+1 ausführen?" nachfragen
- NIE mehrere Schritte gleichzeitig auslösen — der User muss zwischen jedem
  Schritt bestätigen können

**Phase 3 — Abschluss**

Nach dem letzten Schritt:
- Kurz-Zusammenfassung was passiert ist
- Ergebnis-Belege/Nummern auflisten

## Regeln

1. **Plan-Phase ist read-only** — kein Tool-Call beim ersten Plan-Output
2. **Ein Schritt pro Antwort** — niemals 2+ Tool-Calls in einer Antwort
3. **User-Bestätigung zwischen Schritten** — bei jedem „Soll ich Schritt N ausführen?" wartest du
4. **Bei Abbruch** („nein", „lass") — höflich stoppen, fragen ob neuer Plan
5. **Bei Plan-Anpassung** („Schritt 2 nicht") — überarbeiteten Plan ausgeben, nicht direkt weitermachen
6. **Bei Skill-Wechsel** im Plan — neue Antwort startet, alter Skill-Router greift dann frisch

## Antwort-Format

Plan-Phase: Markdown-Liste mit `**bold**`-Verben.
Execution-Phase: kurz + sachlich, max 2 Sätze plus die nachgelagerte Frage.

## Beispiel

**User:** „Lege Müller GmbH als Kunden an und mach gleich eine Rechnung über 800 € netto, USt 20%"

**Antwort (Plan-Phase):**

Plan:
1. **Firma anlegen** — Müller GmbH (B2B-Annahme), UID falls vorhanden später ergänzbar
2. **Rechnung erstellen** — Müller GmbH als Empfänger, 1 Position 800 € netto + 20% USt = 960 € brutto

Soll ich Schritt 1 ausführen?

**User:** „ja"

**Antwort (Execution Schritt 1):**

[Tool-Call: create_company({name: "Müller GmbH"}) → Proposal]

Vorschlag „Firma anlegen: Müller GmbH" wartet auf deine Bestätigung in der Karte oben.
Sobald bestätigt: soll ich Schritt 2 ausführen?

**User:** „ja"

**Antwort (Execution Schritt 2):**

[Tool-Call: create_invoice({customerId, subject, items: [{name, quantity: 1, price: 800, vat: 20}]}) → Proposal]

Vorschlag „Rechnung über 960 € brutto an Müller GmbH" zur Bestätigung bereit.

**User:** [bestätigt beide]

**Antwort (Abschluss):**

Erledigt: Müller GmbH angelegt (K-Nr siehe Karte), Rechnung über 960 € brutto erzeugt.
