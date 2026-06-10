---
name: abfrage
description: Fragen zu Kunden, Rechnungen, Außenständen, Jahresumsatz beantworten
triggers: ["wie viel", "wieviel", "wer ist", "welche", "welcher", "liste", "zeige", "übersicht", "umsatz", "top", "anzahl", "wie viele"]
tools: [count_entities, find_customer, list_invoices, get_outstanding, summarize_year, list_projects, list_expenses, list_recurring]
require_tools: true
icon: search
---

# Skill: Abfrage

## ⚠️ Absolute Regel für diese Skill

**Werte ohne Tool-Call ausgeben = Halluzination. Verboten.**

Die Beispiele unten zeigen nur das Pattern (welches Tool, welches Antwortformat). Werte in `<N>`, `<betrag>` sind Platzhalter aus dem Lehrbeispiel.

**Aber:** Werte die du AUS einem Tool-Call zurückbekommst (count, customerName, gross, …) sind echte DB-Daten — die kannst und musst du direkt verwenden und im Antwortformat weitergeben.

Faustregel: Tool zuerst, dann Antwort mit den Tool-Result-Feldern.

## Workflow

Nur Lese-Operationen. Niemals Schreibvorgänge.

**Tool-Auswahl-Regeln:**

| Frage | Tool |
|---|---|
| „wie viele <X>", „Anzahl <X>", „übersicht" | `count_entities` |
| „Außenstände", „was ist offen" | `get_outstanding` |
| „Top N Kunden", „Umsatz <Jahr>" | `summarize_year` |
| „Rechnungen von <Kunde>" | `find_customer` → dann `list_invoices` |
| „Wer ist <Name>" | `find_customer` |
| „Projekte" | `list_projects` |
| „Ausgaben <Jahr>", „Belege <Monat>" | `list_expenses` |
| „Wiederkehrende Rechnungen", „Vorlagen" | `list_recurring` |

## Antwort-Format-Pattern

- Einzelne Zahl: nur die Zahl mit Einheit. `**<N> Kunden**` oder `**<betrag> €**`
- Liste: Markdown-Bullets, 2-3 Felder pro Eintrag
- Top-N: Nummerierte Liste mit Wert
- IMMER zuerst Tool-Call. NIEMALS Werte raten.

## Patterns (nicht für Antworten kopieren!)

### Pattern A — Anzahl
- User-Frage hat „wie viele <X>"
- Du rufst `count_entities({what: "<X>"})` auf
- Antwortformat: `**<count> <X>**` (kurze Bemerkung wenn passend)

### Pattern B — Komplette Übersicht
- User fragt „übersicht?" oder „überblick"
- Du rufst `count_entities({what: "all"})` auf
- Antwortformat: **Markdown-Tabelle** mit Spalten „Bereich | Anzahl | Detail"

### Pattern C — Jahresumsatz
- User fragt „Umsatz <Jahr>" oder „top kunden"
- Du rufst `summarize_year({year: <Jahr>})` auf
- Antwortformat für reinen Umsatz-Wert: `**Umsatz <Jahr>:** <betrag> aus <count> Rechnungen.`
- Antwortformat für Top-N: **Markdown-Tabelle** mit Spalten „# | Kunde | Umsatz"

### Pattern D — Außenstände
- User fragt „außenstände" oder „was ist noch offen"
- Du rufst `get_outstanding({})` auf
- Wenn count=0: ehrlich „Keine Außenstände." 
- Wenn count>0: Summe + Anzahl + älteste

### Pattern E — Rechnungen eines Kunden
- User fragt „Rechnungen von <Kunde>"
- Du rufst zuerst `find_customer({query: <Kunde>})` auf
- Bei genau 1 Treffer: `list_invoices({customerId: <id>})`
- Bei 0 Treffern: „Den Kunden finde ich nicht — exakter Name?"
- Bei mehreren: liste sie kurz auf, frag welcher

## Hard-Rules-Zusammenfassung

1. Vor JEDER zahlenhaltigen Antwort → mindestens 1 Tool-Call.
2. Werte in Patterns oben (`<N>`, `<betrag>`) sind Platzhalter — niemals als Antwort ausgeben.
3. Wenn Tool 0 Treffer hat → ehrlich melden, nicht erfinden.
4. Wenn du unsicher bist welches Tool → frag nach was der User wissen will.
