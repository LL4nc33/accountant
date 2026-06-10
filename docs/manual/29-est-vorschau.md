# 29 ESt-Vorschau

> Modul aktivieren: **Einstellungen → Module → ESt-Vorschau (AT)**.
> Empfehlung: parallel SVS-Modul aktivieren (siehe Kapitel 28) für realistische Forecast.

## Wofür

Wie hoch ist meine Einkommensteuer-Vorauszahlung dieses Jahr? Statt Schätzen oder Steuerberater anrufen: laufender ESt-Forecast direkt aus der DB.

## Berechnungsbasis (AT-Tarif 2026)

Tarif final per Inflationsanpassungsverordnung 2026 (BGBl. II Nr. 191/2025):

| Stufe | Bracket | Satz |
|---|---|---|
| 1 | 0 – 13.539 € | 0 % |
| 2 | 13.539 – 21.992 € | 20 % |
| 3 | 21.992 – 36.458 € | 30 % |
| 4 | 36.458 – 70.365 € | 40 % |
| 5 | 70.365 – 104.859 € | 48 % |
| 6 | 104.859 – 1.000.000 € | 50 % |
| 7 | über 1.000.000 € | 55 % |

**Gewinnfreibetrag §10 EStG:**
- Grundfreibetrag: 15 % auf die ersten 33.000 € BMG → max 4.950 € (automatisch).
- Investitionsbedingt: 13 % / 7 % / 4,5 % gestaffelt bis BMG 583.000 → max 41.450 € zusätzlich. Voraussetzung: Investition in begünstigte Wirtschaftsgüter (≥4 J Nutzungsdauer) oder Wertpapiere §14 Abs. 7 Z 4 EStG.

**SVS-Kopplung:** Wenn das SVS-Modul aktiv ist, werden die berechneten SVS-Beiträge automatisch als Betriebsausgabe (§4 Abs. 4 EStG) abgezogen, bevor die ESt berechnet wird.

## UI

- **/est** Detail-Seite mit Year-Picker, Berechnungs-Kaskade Gewinn → −SVS → −GFB → zu versteuerndes Einkommen → ESt, Tarifstufen-Aufschlüsselung mit Anteil + Steuer pro Bracket.
- Toggle „investitionsbedingten Gewinnfreibetrag ansetzen" — conservative Default off.
- Dashboard-KPI-Card mit Jahresbetrag + Grenzsteuersatz. Warnung wenn SVS-Modul nicht aktiv (ESt-Schätzung überzeichnet).

## Hinweise

- Pauschalierungen (§17 Basispauschale 15 %, KU-Pauschalierung 45/20 %) sind nicht berücksichtigt — User mit Pauschalierung muss Gewinn manuell overriden.
- Verlustvortrag (§18 Abs. 6 EStG) ebenfalls nicht einbezogen.
- Verbindlich bleibt der ESt-Bescheid des Finanzamts.
