---
name: mahnwesen
description: Außenstände prüfen + Mahnungen erzeugen (Stufen 1-3 nach AT-Recht)
triggers: ["überfällig", "mahnung", "wer schuldet", "schuldet noch", "mahnstand", "außenstände", "mahne", "mahn"]
tools: [get_outstanding, list_invoices, find_customer, list_reminders, draft_reminder]
require_tools: true
icon: warning-standard
---

# Skill: Mahnwesen-Übersicht

## ⚠️ Tool-Werte sind echte Daten

Die Beispiele unten sind Lehrmuster. Werte (`<N>`, `<betrag>`) sind Platzhalter — aber alles aus Tool-Calls ist echt.

## Workflow

**Abfrage-Modus** („wer schuldet noch was?"):
1. `get_outstanding` → liefert `byCustomer`-Aufschlüsselung sortiert nach Höhe
2. Bei konkretem Schuldner: `list_invoices({customerId: <id>, status: "overdue"})` für Details

**Mahn-Erzeugungs-Modus** („mahne Maier" / „erste Mahnung für Rechnung 0023"):
1. Wenn Kundenname statt Rechnungs-Nr: `find_customer` → ID, dann `list_invoices({customerId, status: "overdue"})` → IDs der überfälligen
2. Bei mehreren überfälligen Rechnungen: frag welche oder alle
3. `draft_reminder({invoiceId, stage?})` für jede Rechnung → Vorschlagskarte mit Verzugszinsen + Mahnspesen + Gesamtforderung
4. User bestätigt im Chat-UI → Mahnung wird als Entwurf angelegt
5. Antwort EIN Satz: „Mahnung Stufe N für Rechnung X erstellt, bitte bestätigen."

**Übersichts-Modus** („welche Mahnungen sind offen?"):
- `list_reminders` → zeigt alle Mahnungen mit Stufe + Status

**Wichtig:** Du kannst Mahnungen nur als ENTWURF erstellen. Versendet werden sie immer manuell vom User.

## Antwortformat

- 0 Außenstände: „Keine offenen Rechnungen — alles bezahlt."
- Wenige (≤ 3): Bullet-Liste pro Schuldner mit Betrag
- Viele: **Markdown-Tabelle** mit Spalten „# | Kunde | Offen € | Älteste"

## Beispiel

**User:** "wer schuldet mir noch was?"

**Aktion:** `get_outstanding({})`

**Antwort bei Treffern:** (Tabelle direkt, NICHT in ``` einschließen!)

**<N> offene Rechnungen, gesamt <X> €. Davon <overdue> überfällig (>14 Tage).**

| # | Kunde       | Offen        |
|---|-------------|--------------|
| 1 | <Name>      | <betrag> €   |
| 2 | <Name>      | <betrag> €   |

Älteste offene Rechnung von <date>.

**Antwort bei 0 Treffern:**
„Keine offenen Rechnungen — alles bezahlt."
