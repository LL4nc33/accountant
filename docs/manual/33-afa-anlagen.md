# 33 Anlagenverzeichnis + AfA

> Modul aktivieren: **Einstellungen → Module → Anlagenverzeichnis / AfA**.
> Pfad: Buchhaltung → **Anlagen**.

## Pflicht §125 BAO

Ab Anschaffungskosten **> 800 €** muss jedes Wirtschaftsgut einzeln im Anlagenverzeichnis erfasst werden.

## AfA-Logik

**GWG (Geringwertige Wirtschaftsgüter, §13 EStG):** Anschaffungskosten **≤ 1.000 €** werden sofort vollständig im Anschaffungsjahr abgesetzt. Auto-Detection: bei Cost-Eingabe wird das GWG-Flag automatisch gesetzt; bei Cost > Limit wird es automatisch zurückgesetzt.

**Lineare AfA (§7 Abs. 1 EStG):** bei Cost > 1.000 € — gleichmäßige Verteilung über die Nutzungsdauer.

**Halbjahresregel §7 Abs. 2 EStG:** bei Anschaffung in der zweiten Jahreshälfte (Juli–Dezember) nur halbe Jahres-AfA im Anschaffungs- und letzten Jahr. Die AfA läuft dann N+1 Jahre statt N.

**Beispiel:** MacBook Pro 14" M4 — 2.200 € am 10.12.2025 angeschafft, ND 3 Jahre:
| Jahr | AfA | Restbuchwert |
|---|---|---|
| 2025 | 366,67 € | 1.833,33 € |
| 2026 | 733,33 € | 1.100,00 € |
| 2027 | 733,33 € | 366,67 € |
| 2028 | 366,67 € | 0,00 € |

## Typische Nutzungsdauern

| Kategorie | ND |
|---|---|
| Computer / Notebook | 3 Jahre |
| Smartphone | 5 Jahre |
| Büromöbel | 7 Jahre |
| PKW | 8 Jahre |
| Produktionsmaschinen | 10 Jahre |

## UI

- **/assets**: Liste mit KPI-Karten (AfA des Jahres, Restbuchwert-Summe, Anzahl Anlagen).
- **/assets/:id**: Detail mit jahresweisem AfA-Plan, aktuelles Jahr highlighted.
- **/assets/:id/edit**: Edit-Form mit Auto-GWG bei Cost-Change, ND-Hinweis, Abgangs-Felder (Datum + Erlös) für Verkäufe/Verschrottung.

## Out of Scope

- Degressive AfA (§7 Abs. 1a/1b EStG) — befristet 2020-2026, niedrige Praxisrelevanz.
- Verkettung AfA→ESt-Vorschau — die AfA wird (noch) nicht automatisch in den ESt-Forecast eingerechnet. Manuell hinzufügen falls relevant.
