---
name: rechnung-erstellen
description: Rechnungs-Entwurf für einen Kunden anlegen
triggers: ["rechnung", "rechne ab", "fakturiere", "schreib eine rechnung", "abrechnen"]
tools: [find_customer, draft_invoice]
icon: file-group
---

# Skill: Rechnung erstellen

## Workflow

1. **Kunden-ID finden:** Rufe IMMER zuerst `find_customer({query: <Name>})` auf. Niemals customerId raten.
2. Wenn 0 Treffer → antworte: „Den Kunden gibt es noch nicht. Soll ich ihn anlegen?" (Skill kunde-anlegen)
3. Wenn mehrere Treffer → liste sie kurz auf und frag welcher.
4. Bei 1 Treffer → rufe `draft_invoice` mit der gefundenen customerId.

## Positionen

- `name`: was abgerechnet wird (z.B. „Setup", „Beratung")
- `quantity`: Menge
- `amountType`: Einheit. Allowed: Stk, Std, m, m², m³, kg. Wenn User „Stunden" oder „h" sagt → "Std".
- `price`: Netto-Einzelpreis. Wenn User Brutto angibt → nach Netto-Preis fragen ODER selbst zurückrechnen (Brutto / 1.2 für AT-20%).
- `vat`: USt-Satz. Default 20% (AT Regelbesteuerung) oder 0% wenn Kleinunternehmer aktiv. Bei Unsicherheit nachfragen.

## Antwortformat

EIN Satz: „Rechnungs-Entwurf für <Kunde> mit <X> Positionen erstellt, Netto <X> €. Bitte bestätigen."

## Beispiele

### Beispiel 1 — eindeutig
**User:** "rechnung an oidanice, 3h setup à 90€"
**Aktion:**
- `find_customer({query: "oidanice"})` → id "cust-1"
- `draft_invoice({customerId: "cust-1", items: [{name: "Setup", quantity: 3, amountType: "Std", price: 90}]})`
**Antwort:** "Rechnungs-Entwurf für OidaNice mit 1 Position erstellt, Netto 270,00 €. Bitte bestätigen."

### Beispiel 2 — Kunde unbekannt
**User:** "rechnung an mustermann"
**Aktion:** `find_customer({query: "mustermann"})` → 0 Treffer
**Antwort:** "Den Kunden Mustermann gibt es noch nicht. Soll ich ihn anlegen? Sag mir Vorname + Nachname + Adresse."

### Beispiel 3 — mehrere Positionen
**User:** "rechne an maier ab: 5h beratung à 120€, 2h setup à 90€"
**Aktion:**
- `find_customer({query: "maier"})` → id "cust-2"
- `draft_invoice({customerId: "cust-2", items: [{name: "Beratung", quantity: 5, amountType: "Std", price: 120}, {name: "Setup", quantity: 2, amountType: "Std", price: 90}]})`
**Antwort:** "Rechnungs-Entwurf für Maier mit 2 Positionen erstellt, Netto 780,00 €. Bitte bestätigen."
