# 27 · Multi-Currency (EUR / CHF)

Jede Rechnung führt eine eigene Währung — Default EUR, optional CHF.
Wichtig wenn du Schweizer Kunden hast oder selber CH-Sitz hast.

## Wozu?

- Du sitzt in AT/DE und hast einzelne CH-Kunden, die in CHF zahlen wollen
- Du verkaufst accountant an CH-EPUs, die ausschließlich CHF brauchen
- Du machst Mischrechnungen (AT-Sitz, manche Rechnungen CHF)

## Verhalten

### Bei neuen Rechnungen

Saving-Hook setzt automatisch:
- CH-Sitz (`CompanySettings.country=CH`) → CHF
- Alles andere → EUR

Du siehst das nicht direkt im UI — das Feld liegt unsichtbar an der
Invoice. Die Anzeige im PDF + XRechnung folgt der Währung.

### Pro Rechnung anpassen

Es gibt aktuell **kein** Währungs-Auswahlfeld im Rechnungs-Editor: die
Währung wird beim ersten Speichern automatisch aus `CompanySettings.country`
abgeleitet (CH → CHF, sonst EUR) und danach nicht über die UI geändert. Die
Betragsanzeige im Editor ist EUR-fix; verbindlich ist die Währung im PDF +
XRechnung. Wer einzelne Rechnungen in CHF braucht, setzt den Wert derzeit
über den Remult-Admin oder die API.

### Bei festgeschriebenen Rechnungen

§131-BAO-Lock greift: `currency` ist nicht in der Liste der nach
Festschreibung noch änderbaren Felder — jede Änderung wird abgelehnt.
Snapshot für die Aufbewahrungsfrist.

## Format-Unterschiede

| Wert | EUR | CHF |
|---|---|---|
| Display | `100,00 €` | `CHF 100,00` |
| Symbol-Position | hinten | vorne |
| Dezimaltrenner | Komma | Komma |
| Tausender-Trenner | Punkt | Punkt |

(Locale: de-AT)

## Wo wird die Währung respektiert?

| Komponente | Verhalten |
|---|---|
| Invoice-PDF (fluentreports) | `formatCurrency(value, invoice.currency)` |
| XRechnung XML | `<cbc:DocumentCurrencyCode>` + alle `currencyID="…"` (Fallback EUR) |

## Wo NICHT (yet)?

| Bereich | Status |
|---|---|
| Mahnungs-PDF | Beträge sind im PDF fest mit „EUR" beschriftet (folgt nicht der Invoice-Currency) |
| UVA-Aggregation | nur EUR (CHF läuft mit, wird aber EUR-Reporting verfälschen wenn vermischt) |
| BMD/RZL-Export | nur EUR |
| Analytics-Dashboard | mischt EUR + CHF 1:1 ohne Wechselkurs |
| Bank-Abgleich | matched alle Tx unabhängig von Currency |
| CHF-IBAN-Slot | nur eine IBAN in CompanySettings |

Empfehlung: wenn du regelmäßig CHF-Rechnungen schreibst, exportiere CHF
separat (z.B. eigener BMD-Export-Run, dann Steuerberater rechnet um).

## Historische Wechselkurse

Out-of-scope für v1. Aktuell:
- Beim Erzeugen der Rechnung: CHF-Betrag wird raw eingetragen
- Bei UVA-Übersetzung: Steuerberater rechnet bei Quartals-Übergabe selber
  um (mit dem mittleren ECB-Kurs des Liefermonats)
- Kein automatischer Kurs-Service

## Häufige Fragen

**Wieso ist CHF auf einer festgeschriebenen Rechnung nicht änderbar?**
§131 BAO: Rechnungen sind ab Festschreibung inhaltlich unveränderlich. Das
gilt auch für die Währung — sie ist ein Snapshot.

**Was wenn ich Kunden in 3 Währungen habe (EUR, CHF, USD)?**
USD nicht unterstützt. Aufwand für weitere Währungen: `supportedCurrencies`
in `currency.ts` erweitern + Format-Helper anpassen + Unit-Tests + Doku-
Update. Pull-Requests willkommen.

**Wie sieht das im XRechnung-XML aus?**
```xml
<cbc:DocumentCurrencyCode>CHF</cbc:DocumentCurrencyCode>
<cbc:PriceAmount currencyID="CHF">90.00</cbc:PriceAmount>
```

**Funktioniert CHF auch bei Reverse-Charge?**
Ja, aber RC ist USt-rechtlich AT-spezifisch (§3a Abs. 6 UStG). Wenn dein
CH-Kunde aus CH ist, ist das Drittland → TaxCategory G, nicht AE. Das
accountant erledigt automatisch wenn `Address.country = CH`.

**Wie aggregiert Analytics EUR + CHF?**
Aktuell stumpf 1:1. Wenn dein Top-Kunde CHF macht und ein anderer EUR,
wird CHF-Zahl gleichwertig zur EUR-Zahl behandelt. Bei gemischtem
Portfolio Analytics nur als Trend lesen, nicht als absolute Zahl.

**Backup-Restore: wird `currency` korrekt restored?**
Ja, ist normaler Spaltenwert in der SQLite. v0.15.0+-Snapshots haben es.
Legacy-Rows vor v0.27.0 haben `currency=''`, Fallback liefert EUR.
