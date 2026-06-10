# 31 Logo + Rechnungs-Layout

> Pfad: Einstellungen → Firma → **Rechnungs-Layout** (Tab).

## Logo

**Wo erscheint es:** PDF-Header der Rechnungen + Angebote + Mahnungen, oben rechts.

**Empfohlen:**
- PNG mit transparentem Hintergrund (oder JPG)
- Ca. 120 × 60 px → wird auf 145 × 50 pt skaliert
- Max 500 KB (Soft-Limit, sonst wird Settings-JSON unnötig groß)

**Upload:** Click „Logo hochladen" → File-Picker. Preview erscheint sofort. Klick „Entfernen" persistiert sofort (kein Speichern-Klick nötig).

## DIN-A4 PDF-Layout

Seit v0.41.8 sind alle PDFs DIN-5008-konform:
- Margins: links 55pt (~19mm), rechts 50pt (~18mm), bottom 62pt (~22mm)
- Empfänger-Block bei y=127 — passt hinter normale DL-Briefumschlag-Fenster, wenn Du die Rechnung gedruckt per Post versendest
- Sender-Mini-Zeile bei y=50 oben links (über dem Empfänger-Fenster)
- Footer (UID / Steuernummer / GISA / Bankverbindung) ans untere Drittel, mit Trenn-Linie zum Body

## Skonto-Defaults

Siehe Kapitel 30 — die Defaults Skonto-Satz + Frist werden in jede neue Rechnung vorgeladen.

## Spalten-Alignment

Items-Tabelle: Pos (28pt) · Bezeichnung (226pt) · Menge (55pt rechts) · Einzelpreis (80pt rechts) · Gesamtpreis (80pt rechts). Totals-Block fluchtet exakt mit der Gesamtpreis-Spalte.

## Unicode-Sanitizer

PDFKit's Standard-Helvetica unterstützt nur WinAnsi-Encoding (Latin-1). Folgende Zeichen werden beim Rendern automatisch ersetzt:
- `→` `←` → `->` `<-`
- `•` → `·` (Latin-1 middle dot)
- `–` `—` → `-`
- Smart-Quotes (`„"'`) → straight quotes
- `…` → `...`

Wenn Du also in Item-Beschreibungen Pfeile oder Bullets verwendest, werden sie ASCII-kompatibel gerendert statt verschwunden.
