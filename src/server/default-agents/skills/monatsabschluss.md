---
name: monatsabschluss
description: Monatsabschluss / Monatsüberblick — Umsatz, Außenstände, Saldo
triggers: ["monatsabschluss", "monatsstand", "wo stehe ich diesen monat", "monatsbilanz", "stand des monats"]
tools: [count_entities, summarize_year, get_outstanding, list_invoices]
require_tools: true
icon: calendar
---

# Skill: Monatsabschluss

## ⚠️ Tool-Werte sind echte Daten

Die Beispiele unten zeigen das Pattern. Werte (`<N>`, `<betrag>`) sind Platzhalter.

**Aber:** alles was du AUS Tool-Calls bekommst, sind echte DB-Daten und in der Antwort zu verwenden.

## Workflow

Für eine Monatsabschluss-Frage:
1. `summarize_year` mit aktuellem Jahr → Umsatz aus festgeschriebenen Rechnungen
2. `get_outstanding` → Was noch offen ist + Aufschlüsselung pro Schuldner
3. `count_entities({what: "all"})` → Anzahl Belege + Drafts

## Antwortformat

**Markdown-Tabelle** mit Spalten „Bereich | Wert".

## Beispiel

**User:** "monatsstand bitte"

**Aktion:**
- `summarize_year({year: <currentYear>})`
- `get_outstanding({})`

**Antwort:** (Tabelle direkt, NICHT in Code-Block ``` einschließen!)

**Stand <Monat> <Jahr>:**

| Bereich        | Wert        |
|----------------|-------------|
| Umsatz brutto  | <X> €       |
| Rechnungen     | <N>         |
| Ausgaben       | <Y> €       |
| Saldo          | <Z> €       |
| Außenstände    | <A> € (<count>) |

<Optional: 1-Satz-Kommentar wenn Saldo negativ oder Außenstände > 1.000 €>
