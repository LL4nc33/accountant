# 13 · USt-Voranmeldung

accountant aggregiert pro Zeitraum die Umsätze und Vorsteuer-Beträge
nach UVA-Kennzahlen — du übernimmst die Werte 1:1 in das FinanzOnline-
Formular U30.

## Wann brauchst du das?

Als regelbesteuerte:r AT-Unternehmer:in monatlich oder quartalsweise
(je nach Umsatz). Als Kleinunternehmer:in kannst du es trotzdem öffnen —
die Aggregation zeigt dann die Befreiung (KZ 016) und Vorsteuer informativ
(KZ 060 bleibt 0, weil kein Vorsteuerabzug).

## Setup

UVA hängt am Modul **Finanzamt-Export** — derselbe Toggle.

1. **Modul aktivieren**: `/settings/module` → „Finanzamt-Export" einschalten.
2. Sidebar zeigt nun unter Einstellungen → **„USt-Voranmeldung"**.

## Workflow

### Direktaufruf

`/at-tax/uva` (Desktop) bzw. `/m/at-tax/uva` (Mobile).

1. **Zeitraum wählen**: Monat / Quartal / Jahr + Jahr-Drop-down.
2. **Aggregation lädt automatisch**.
3. **UVA-Kennzahlen** werden gemäß FinanzOnline U30 angezeigt.
4. **Zahllast oder Gutschrift** prominent oben.
5. **CSV-Download** für die Akte / den Steuerberater.
6. **Drucken / PDF** über Browser-Print-Dialog.

### Per KI-Assistent

```
User: wie viel UVA für Mai?
Agent: ruft get_uva({period: '2026-05'})
       → Zahllast 1.247,80 €
         KZ 022 (Bemessung 20%): 6.239,00 €
         KZ 060 (Vorsteuer): 247,40 €

User: und Q1 insgesamt?
Agent: ruft get_uva({period: '2026-Q1'})
```

### Period-Format

- `YYYY-MM` — Monat (z.B. `2026-05`)
- `YYYY-Q1` bis `YYYY-Q4` — Quartal
- `YYYY` — gesamtes Jahr

## UVA-Kennzahlen

| KZ  | Bedeutung                                          |
|-----|----------------------------------------------------|
| 000 | Gesamtbetrag der Bemessungsgrundlagen              |
| 022 | Bemessung 20% (Normalsteuersatz)                   |
| 029 | Bemessung 10% (ermäßigter Satz)                    |
| 006 | Bemessung 13% (ermäßigter Satz)                    |
| 020 | Bemessung 0% / steuerfrei                          |
| 011 | Innergemeinschaftliche Lieferungen                 |
| 017 | Ausfuhrlieferungen (Drittland)                     |
| 016 | Kleinunternehmer-Befreiung §6 Abs. 1 Z 27          |
| 060 | Vorsteuer aus Eingangsrechnungen                   |

## Was fließt in die Aggregation ein?

**Ausgangsrechnungen (Umsatz):**
- Nur **festgeschriebene** Rechnungen (§131 BAO)
- Nicht archivierte
- Datum (`invoiceDate`) im Zeitraum
- Stornorechnungen reduzieren die Summen automatisch (negative Mengen)
- Per-Item-Aggregation: jede Position trägt mit ihrem USt-Satz zur entsprechenden KZ bei
- **Reverse-Charge-Rechnungen**: Klassifikation aus Customer-Billing-Address
  - EU-Land (≠ AT) → KZ 011
  - Drittland oder leer → KZ 017
- **Kleinunternehmer-Modus**: alle Umsätze → KZ 016, restliche KZ bleiben 0

**Eingangsrechnungen (Vorsteuer):**
- Alle nicht-archivierten Expenses im Zeitraum
- Pro USt-Satz aggregiert
- KU-Modus: KZ 060 = 0 (kein Vorsteuerabzug erlaubt)

## Übernahme in FinanzOnline

1. Auf [finanzonline.bmf.gv.at](https://finanzonline.bmf.gv.at) anmelden.
2. Eingaben → Erklärungen → Umsatzsteuervoranmeldung.
3. KZ-Werte aus accountant 1:1 in das Formular U30 übertragen.
4. Bei KU-Modus: Nur KZ 016 eintragen.

## Compliance

- **§21 UStG**: Voranmeldung monatlich bei Umsatz > 100.000 €, sonst
  quartalsweise. Bei KU: jährlich U1.
- **§131 BAO**: Nur festgeschriebene Rechnungen — Drafts werden ignoriert.
- **§132 BAO**: 7 Jahre Aufbewahrungspflicht — CSV-Export sichert die
  Berechnung für die Akte.
- **Audit-Log**: Jeder UVA-Aufruf ist eine Lese-Operation, kein Audit-Trail
  notwendig.

## Häufige Fragen

**Wieso fehlt eine Rechnung in der Aggregation?**
Wahrscheinlich noch nicht festgeschrieben (Status = Entwurf). Nur
festgeschriebene Rechnungen sind für die UVA maßgeblich (§131 BAO).
Festschreibe-Aktion: `/om/invoice/:id` → „Festschreiben".

**Wie kommt KZ 011 zu Stande?**
accountant prüft pro Reverse-Charge-Rechnung die Rechnungsanschrift
des Kunden. Liegt das Land in der EU (ohne AT), zählt es zu KZ 011 —
sonst zu KZ 017 (Drittland).

**Was wenn der Kunde keine Adresse hat?**
Dann zählt die RC-Rechnung konservativ als Drittland (KZ 017). Ergänze
die Anschrift in `/crm/person/:id` oder `/crm/company/:id` für korrekte
Klassifikation.

**Kann ich KU-Modus zur Mitte des Jahres aktivieren?**
Technisch ja, aber die Logik wirkt global. Wenn du im laufenden Jahr
wechselst, musst du die Aggregation pro Vor-/Nach-Zeitraum separat
machen. Empfehlung: KU-Status mit Steuerberater zum Jahreswechsel klären.

**Kann ich Anlagenabschreibung, ig. Erwerb usw. dazurechnen?**
Aktuell nicht — die Aggregation deckt nur die Standard-KZ aus Rechnungen
+ Belegen ab. Sonderfälle ergänzt du manuell im FinanzOnline-Formular.

**Wie genau ist die Berechnung?**
Auf 2 Nachkommastellen gerundet (Halbe-Aufwärts). Bei sehr großen Beträgen
können sich kleine Rundungs-Differenzen zu manueller Aufsummierung ergeben
— das ist gewollt und gesetzlich akzeptiert.
