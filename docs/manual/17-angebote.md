# 17 · Angebote

Angebote sind die Vor-Stufe zur Rechnung — der Kunde bekommt eine unverbindliche
Auflistung von Leistungen mit Preis und Gültigkeitsdatum.

## Wann brauchst du das?

Sobald du B2B-Aufträge bekommst, die VOR der Rechnung in schriftlicher Form
bestätigt werden müssen.

## Workflow

### 1. Neues Angebot

`/om/offers` → **„+ Neues Angebot"**

- Kunde + Anschrift wählen (Anschrift wird automatisch aus Customer-Adresse gefüllt)
- Betreff (z.B. „Webseite-Relaunch")
- Angebotsdatum (Standard: heute)
- Gültig bis (Standard: heute + 30 Tage)
- Items wie bei Rechnung (Produkt-Picker, Menge, Preis, USt, Rabatt)
- USt-Typ Netto / Brutto

Speichern → Angebot bekommt automatisch eine `AG{NNNN}`-Nummer.

### 2. PDF erzeugen + versenden

In der Offer-Liste (`/om/offers`) → PDF-Symbol pro Zeile.

Status auf **„Versendet"** setzen wenn du es geschickt hast.

### 3. Status-Flow

| Status | Bedeutung | Setzen via |
|---|---|---|
| Entwurf | bearbeiten möglich | beim Anlegen |
| Versendet | warten auf Kunden-Reaktion | E-Mail-Icon in Liste |
| Angenommen | konvertiert in Rechnung | Convert-Button |
| Abgelehnt | Kunde lehnt ab | X-Icon in Liste |
| Abgelaufen | Gültigkeit überschritten | manuell oder im Hintergrund |

### 4. Konvertieren

Wenn der Kunde annimmt: **„In Rechnung umwandeln"**-Button im Offer-Edit oder
in der Liste.

→ accountant erzeugt eine neue Rechnung mit allen Items kopiert
→ Setzt `Offer.status = Angenommen` + `convertedInvoiceId` als Backlink
→ Offer ist ab dann **eingefroren** (Items unveränderlich)
→ Direkter Sprung zur neuen Rechnung

## API

| Endpoint | Methode | Zweck |
|---|---|---|
| `/api/offer/pdf?id=…` | GET | Angebots-PDF |
| `/api/offer/:id/convert` | POST | → Rechnung erzeugen |
| `/api/offer/:id/status` | POST | Status manuell setzen (außer „won") |

Standard Remult-CRUD auf `/api/offers` für Liste/Edit.

## PDF-Inhalt

- Sender (oben klein, eine Zeile aus CompanySettings)
- Empfänger
- „ANGEBOT" als Überschrift
- Angebots-Nr. + Datum + Gültig bis
- Items-Tabelle (Pos, Bezeichnung, Menge, Preis, Gesamt)
- Summary: Netto + USt (per Rate) + Gesamtbetrag
- Footer mit Gültigkeits-Klausel + IBAN
- AGB-Hinweis als Standard-Text

## Häufige Fragen

**Kann ich ein Angebot direkt in eine Rechnung verwandeln ohne Status-Wechsel?**
Ja, der Convert-Button funktioniert auch bei Status „Entwurf". Du brauchst
nicht erst auf „Versendet" zu setzen.

**Was wenn der Kunde Änderungen will?**
Solange das Angebot NICHT in eine Rechnung konvertiert wurde, kannst du
Items editieren und Texte anpassen. Bei mehrfachen Angeboten lege je ein
neues an, falls du beide nachvollziehen willst.

**Wie ändere ich das Default-Gültigkeitsdatum?**
Aktuell hardcoded auf +30 Tage. Wenn du das öfter brauchst: Source-Code
`src/shared/entities/offer.ts` → `validUntil`-Default-Wert.

**Was wenn der Kunde nicht reagiert?**
Manuell auf „Abgelaufen" setzen. Automatische Status-Wechsel bei Datum-
Überschreitung gibt es noch nicht (kommt evtl. später).

**Kann ich Anhänge zum Angebot hinzufügen?**
Aktuell nicht — nur Header- und Footer-Text. Anhänge sind out-of-scope für
v1, du sendest sie separat per E-Mail.
