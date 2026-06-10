# 35 Reisekosten

> Modul aktivieren: **Einstellungen → Module → Reisekosten**.
> Pfad: Buchhaltung → **Reisekosten**.

## Wofür

§26 EStG: Reise- und Reisekostenersätze sind beim Selbständigen Betriebsausgaben, mindern den Gewinn (und damit ESt + SVS-Bemessungsgrundlage).

## AT-Standardsätze 2026

| Position | Satz |
|---|---|
| Diäten Inland Tagessatz | 26,40 € (ab 3h Reisedauer, je angefangene 24h ein voller Tagessatz) |
| Nächtigung Pauschale Inland | 17,00 € / Nacht (alternativ Belegabrechnung) |
| Kilometergeld PKW | 0,50 € / km (Mitfahrer: +0,05 €/km) |

**Auslandsdiäten:** länderspezifisch (BMF-Tabelle). Hier nicht hartcodiert — User trägt Beträge manuell ein.

## Workflow

1. **Neue Reise** anlegen mit Reiseziel + Zweck + Datum + Dauer (Stunden) + Nächtigungen + KM.
2. Click **„⚙ AT-Standardsätze übernehmen"** → Diäten, Nächtigung-Pauschale, KM-Geld werden auto-berechnet und in die Kosten-Felder geschrieben.
3. Manuell ergänzen: ÖV/Taxi-Kosten (mit Beleg), sonstige Kosten.
4. Speichern → fließt in die Aufwands-Aggregation ein.

**Auto-Fill überschreibt manuelle Eingaben** — wenn Du erst manuell tippst und dann den Button drückst, wird überschrieben. Der Toast zeigt die übernommenen Werte zur Kontrolle.

## Zweck-Kategorien

- Kundentermin
- Vorort-Service
- Konferenz / Messe
- Schulung / Fortbildung
- Beschaffung / Lieferant
- Sonstiges

## UI

- **/travel**: Listenansicht mit KPI-Karten (Anzahl Reisen, Summe, KM des Jahres). Tabelle mit Datum, Ziel, Zweck, Aufschlüsselung der Kosten.
- **/travel/:id/edit**: Edit-Form mit Live-Preview der Auto-Fill-Werte unter dem Button.
- Optional: Projekt-ID + Kunden-ID verlinken für spätere Weiterverrechnung.

## Belegabrechnung statt Pauschale

Standardsätze sind Pauschalen — Du kannst jederzeit auf belegbasierte Abrechnung wechseln (Hotelrechnung statt 17 €/Nacht). Einfach Beleg-Betrag in das „Nächtigung"-Feld eintragen statt den Auto-Wert.
