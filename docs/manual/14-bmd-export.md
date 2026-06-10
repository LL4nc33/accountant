# 14 · BMD / RZL — Steuerberater-Export

accountant kann alle Buchungssätze eines Zeitraums als CSV-Paket
exportieren, das dein Steuerberater in BMD, RZL, dvo, SBS o.ä. importieren
kann.

## Wann brauchst du das?

Monatlich, quartalsweise oder einmal im Jahr — je nachdem wie dein
Steuerberater die Daten haben will.

## Setup

Hängt am Modul **Finanzamt-Jahres-Export**.

1. `/settings/module` → „Finanzamt-Jahres-Export" einschalten.
2. Cog-Dropdown → **„BMD / RZL-Export"** (`/at-tax/bmd-export`).

## Konten anpassen

`/settings/company` → ans Ende der Seite scrollen → Sektion „BMD/RZL-Konten".
Editier hier die Konten gemäß Vorgabe deines Steuerberaters:

| Konto | Default | Beschreibung |
|---|---|---|
| Forderungen | 2000 | Sollkonto Ausgangsrechnungen |
| Verbindlichkeiten | 3300 | Habenkonto Eingangsrechnungen |
| Erlöse 20% | 4000 | Normalsteuersatz |
| Erlöse 10% | 4010 | Ermäßigt (Lebensmittel etc.) |
| Erlöse 13% | 4020 | Ermäßigt (Beherbergung etc.) |
| Erlöse 0% | 4030 | Steuerfrei |
| Erlöse Reverse-Charge EU | 4400 | RC §3a Abs. 6 UStG |
| Erlöse Drittland | 4500 | nicht steuerbar AT |
| USt 20% | 3500 | |
| USt 10% | 3510 | |
| USt 13% | 3520 | |
| Vorsteuer | 2500 | |
| Aufwand-Sammel | 7000 | Eingangsrechnungen-Sammelaufwand |

Defaults orientieren sich am üblichen AT-Einheitlichen Kontorahmen
für EPU. Steuerberater haben oft eigene Schemata — einmal abstimmen.

## Workflow

1. `/at-tax/bmd-export` (Desktop) oder Mobile-Drawer → „BMD / RZL-Export".
2. Zeitraum wählen (Monat / Quartal / Jahr).
3. „BMD-ZIP herunterladen".

Du erhältst ein ZIP mit drei Dateien:

- **`umsaetze.csv`** — alle Ausgangsrechnungen als Buchungssätze
- **`vorsteuer.csv`** — alle Eingangsrechnungen als Buchungssätze
- **`README.txt`** — Format-Beschreibung + Konto-Mapping als Begleittext

## CSV-Format

| Spalte | Beispiel | Beschreibung |
|---|---|---|
| Datum | 15.05.2026 | Beleg-/Rechnungsdatum |
| Belegart | AR / AR-Storno / ER | Ausgangs- / Storno / Eingangsrechnung |
| Belegnummer | R26-0042 | Original-Belegnummer |
| Buchungstext | „Maier GmbH — Honorar Mai" | Kunde/Lieferant + Betreff |
| Sollkonto | 2000 | aus Kontorahmen |
| Habenkonto | 4000 | aus Kontorahmen |
| Betrag | 1500,00 | positiv, Komma-Dezimal |
| Steuercode | USt20 / RC-EU / DL / KU | Code für Steuerberater-Mapping |
| Steuersatz | 20 | numerisch |

**Encoding**: UTF-8 mit BOM (Excel-AT kompatibel).
**Trennzeichen**: Semikolon (;).

## Buchungs-Logik

### Ausgangsrechnung (Regelbesteuerung)
```
Forderungen   AN   Erlöse (Rate)          [netto]
Forderungen   AN   USt (Rate)             [USt-Betrag]
```

### Reverse-Charge EU
```
Forderungen   AN   Erlöse RC EU           [netto]
```
Keine USt, weil Leistungsempfänger schuldet (§3a Abs. 6 UStG).

### Drittland
```
Forderungen   AN   Erlöse Drittland       [netto]
```
Nicht steuerbar in AT.

### Kleinunternehmer
```
Forderungen   AN   Erlöse 0%              [netto]
```
§6 Abs. 1 Z 27 UStG — alle Umsätze auf Erlöse-0%-Konto.

### Eingangsrechnung (Regelbesteuerung)
```
Aufwand       AN   Verbindlichkeiten      [netto]
Vorsteuer     AN   Verbindlichkeiten      [USt-Betrag]
```

### Eingangsrechnung (KU)
```
Aufwand       AN   Verbindlichkeiten      [brutto]
```
Kein Vorsteuerabzug — der USt-Anteil bleibt im Aufwand.

## Import in BMD/RZL/dvo

**BMD NTCS:**
1. Buchhaltung → Stammdaten → CSV-Import-Definition anlegen.
2. Spalten mappen (einmalig): Datum, Belegnr, Soll, Haben, Betrag, Steuercode.
3. Ab dann: ZIP auspacken, `umsaetze.csv` + `vorsteuer.csv` einlesen.

**RZL:**
- CSV-Import mit deutschen Headern wird meist automatisch erkannt.
- Steuercode-Mapping: `USt20` → 20%-Code im RZL-Schema, etc.

**Andere (dvo, SBS, KSP, BMD):**
- Generisches CSV-Import — Spalten werden über die Header-Zeile erkannt.
- Bei Problemen: Steuerberater darum bitten, einmalig die Spalten zu mappen.

## Compliance

- **§132 BAO**: 7-jährige Aufbewahrung — die CSVs **ersetzen nicht** die
  Original-Rechnungs-PDFs. Exportiere zusätzlich das Finanzamt-Jahres-Paket
  (`/admin/tax-export`), das die PDFs enthält.
- **§131 BAO**: Nur festgeschriebene Rechnungen werden exportiert. Drafts
  bleiben außen vor.
- **Audit-Log**: Jeder Export-Aufruf ist eine Lese-Operation.

## Häufige Fragen

**Mein Steuerberater verwendet ein anderes Konto für Erlöse 20%.**
`/settings/company` → Sektion „BMD/RZL-Konten" → Konto ändern → Speichern →
erneut exportieren.

**Was wenn der Steuerberater BMD-NTCS-Binärformat (`.bmd`) braucht?**
Das BMD-Binärformat erfordert eine BMD-Lizenz und -Toolchain. Wir
liefern nur das generische CSV — fast alle Steuerberater können das
importieren, ggf. mit einer einmaligen Mapping-Definition.

**Wie kommen Stornorechnungen ins CSV?**
Als Belegart `AR-Storno` mit positivem Betrag — der Steuerberater bucht
das gegenüberliegend. Alternativ wären negative Beträge möglich, aber das
ist je nach Steuerberater-Vorliebe verschieden.

**Was ist der „Steuercode"-Spalte gut für?**
Damit der Steuerberater seinen USt-Verprobungs-Code automatisch zuweisen
kann. `USt20` → AT-USt-Code für 20%, `RC-EU` → Reverse-Charge-Code, `DL` →
Drittland, `KU` → Kleinunternehmer-Befreiung.

**Was wenn ich keine Rechnungen im Zeitraum habe?**
Das ZIP enthält trotzdem die CSVs (nur mit Header-Zeile) plus README. Der
Steuerberater weiß damit, dass nichts zu buchen ist.
