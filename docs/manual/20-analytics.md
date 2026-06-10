# 20 · Analytics-Dashboard

Auswertung über Umsatz, Aufwand und Top-Kunden mit Vergleich gegen die
Vorperiode — wahlweise als **Jahres-** oder **Monats-Analyse**.
Pure SVG, keine Chart.js-Dep.

## Aufruf

- Desktop: Sidebar → **„Analyse"** (admin-only)
- Mobile: Drawer → **„Analyse"**

URL: `/analytics` bzw. `/m/analytics`.

## Granularität + Year-Picker

Oben rechts:
- **Granularitäts-Dropdown**: „Jahres-Analyse" oder „Monats-Analyse"
- bei Monats-Analyse zusätzlich ein **Monats-Dropdown**
- **Jahres-Dropdown**: alle Jahre mit Daten (aus `/api/analytics/years`),
  plus das aktuelle Jahr

Jede Auswahl lädt automatisch neu.

## KPI-Cards

Vier farb-codierte Cards mit Delta vs. Vorjahr:

| Card | Inhalt |
|---|---|
| **Rechnungssumme** | Brutto-Summe aller Nicht-Storno-Rechnungen im Jahr |
| **Eingegangen** | Davon bezahlte (Sub-Aggregat) |
| **Aufwand** | Brutto-Summe aller Expenses |
| **Saldo** | Umsatz − Aufwand (grün wenn positiv, rot wenn negativ) |

Delta-Indikator: `+1.234,56 € vs. 2025` mit Farbe (grün = besser, rot = schlechter).

## Status-Pills

Vier Counter-Pills zeigen den aktuellen Stand:

- **Entwürfe** — nicht festgeschriebene Rechnungen
- **festgeschr. offen** — finalisiert aber unbezahlt
- **bezahlt** — vollständig erledigt
- **überfällig** — open + älter als `Invoice.paymentTermsDays`

## Monatlicher Verlauf

12-Monats-SVG-Chart mit Doppel-Balken pro Monat. Bei Jahres-Analyse sind das
die 12 Kalendermonate des Jahres, bei Monats-Analyse die letzten 12 Monate
(trailing, „Verlauf (letzte 12 Monate)"):
- Dunkler Balken: **Rechnungssumme** (invoiced)
- Gelber Balken: **Aufwand** (expense)
- Höhe normalisiert auf `max(invoiced, expense)` aller 12 Monate

Hover über Balken zeigt die genaue Zahl (CSS-Hover → opacity-Wechsel als
Feedback).

## Top-10 Kunden

Horizontale Ranked-Bars sortiert nach Brutto-Umsatz:
- Name + Brutto-Summe
- Balken-Breite proportional zum Top-1
- Sub-Zeile: Anzahl Rechnungen

Nur festgeschriebene Nicht-Storno-Rechnungen zählen.

## Aufwand pro Kategorie

Gleiche Ranked-Bars für Expense-Kategorien:
- 13 Standard-Kategorien (Wareneinkauf, Software/Lizenzen, Miete, …)
- Sortiert nach Volumen
- Sub-Zeile: Anzahl Belege + Netto-Summe

## API

```
GET /api/analytics?year=YYYY&granularity=year|month[&month=MM]
GET /api/analytics/years
```

`GET /api/analytics` liefert JSON mit:
- `granularity`: `year` oder `month`
- `current`: monthly[12], topCustomers[10], categories[N], periodTotal, counts,
  plus periodLabel/year/month
- `previous`: periodLabel, periodTotal, counts (für Delta-Berechnung)
- `deltas`: invoicedGross, expenseGross, saldo

`GET /api/analytics/years` liefert die Liste aller Jahre mit Daten.

Beide admin-only.

## Performance

- Server-Aggregation in **<50 ms** bei <5000 Invoices
- Frontend rendert SVG direkt, kein Canvas, kein Chart-Lib
- **Bundle-Increase: ~6 KB** gesamt (Component + SCSS)

## Häufige Fragen

**Wieso ist mein Top-Kunde 0 €?**
Wahrscheinlich hat der höchste Umsatz nur unfertige Entwürfe. Festschreibe
die Rechnungen → erscheint sofort.

**Wieso passt die Eingegangen-Summe nicht zum Bezahlt-Count?**
Bezahlt-Count zählt Rechnungen, Eingegangen-Summe addiert deren Brutto.
Wenn du eine 10.000-€-Rechnung und neun 100-€-Rechnungen hast, ist Count
10 aber Summe 10.900.

**Kann ich auf Monat oder Quartal statt Jahr umstellen?**
Monat ja — per Granularitäts-Dropdown auf „Monats-Analyse" (zeigt den
gewählten Monat als KPIs + die letzten 12 Monate als Trend). Quartal gibt es
aktuell nicht, kommt evtl. später.

**Werden CHF-Rechnungen mitgezählt?**
Ja, aber 1:1 ohne Wechselkurs-Umrechnung — die Summen vermischen EUR + CHF.
Wenn du das genau wissen willst: pro Währung getrennte Reports laufen
out-of-scope. UVA/BMD-Export rechnet weiterhin nur EUR.

**Wo wird der Vorjahres-Vergleich gespeichert?**
Nirgends — bei jeder Anfrage werden beide Jahre frisch aggregiert. Bei
<5000 Invoices ist das schnell genug.
