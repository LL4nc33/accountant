# 34 Auftragsbestätigung + Lieferschein

## Pragmatic-Ansatz

Statt 2 neue Entities haben wir die bestehende **Offer-Entity** erweitert um eine `kind`-Eigenschaft. Status-Flow (draft → sent → won/lost) bleibt für alle Dokumenttypen identisch.

| Kind | Headline | Datum-Feld | Footer-Text |
|---|---|---|---|
| `offer` (default) | „ANGEBOT" | Gültig bis | „Dieses Angebot ist gültig bis ... Es gelten unsere AGB." |
| `order_confirmation` | „AUFTRAGSBESTÄTIGUNG" | Liefertermin | „Mit dieser AB bestätigen wir den Auftrag zu den o.g. Konditionen." |
| `delivery_note` | „LIEFERSCHEIN" | Liefer-/Leistungsdatum | „Ware/Leistung erhalten am: __ Unterschrift Empfänger: __" |

## Workflow

1. **Anfrage rein** → Angebot anlegen (kind=offer), versenden.
2. **Kunde nimmt an** → Angebot duplizieren als Auftragsbestätigung (kind=order_confirmation), Liefertermin eintragen, versenden.
3. **Lieferung** → AB duplizieren als Lieferschein (kind=delivery_note), Liefer-/Leistungsdatum, Empfänger unterschreiben lassen.
4. **Rechnungslegung** → Lieferschein per „In Rechnung umwandeln" → Rechnungs-Entwurf mit kopierten Positionen.

## UI

- **Offer-Edit**: Dropdown „Dokumenttyp" am Anfang der Form. Datumsfeld passt sich kontextuell an (Gültig bis / Liefertermin / Lieferdatum).
- **Offers-Liste**: Spalte „Typ" zeigt AB / LS / Angebot; Datum-Spalte zeigt Gültigkeit oder Liefertermin je nach kind.

## PDF-Unterschiede

Gleiche §-Form, gleiche Items-Tabelle, gleicher Footer — nur Überschrift und das Datums-Label unterscheiden sich. Der Lieferschein-PDF hat zusätzlich am Schluss eine Empfangsbestätigungs-Zeile mit Unterschrift-Slot.

## Hinweis

Lieferschein hat **keinen** USt-Charakter — er ist kein §11-Beleg. Er begleitet die Ware/Leistung und dient als Übergabebeleg. Die Rechnung kommt separat.
