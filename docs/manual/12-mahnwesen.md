# 12 · Mahnwesen

accountant kann Mahnungen für überfällige Rechnungen erzeugen — drei Stufen,
mit gesetzlich korrekt berechneten Verzugszinsen und Mahnspesen nach AT-Recht.

## Wann brauchst du das?

Sobald du regelmäßig Außenstände hast und nicht mehr per Hand mahnen willst.
Das System schlägt automatisch Mahnungs-Entwürfe vor — du bestätigst.
**Versendet wird nie automatisch.**

## Setup

1. **Modul aktivieren**: `/settings/module` (Desktop) oder Mobile-Drawer →
   Einstellungen → Module → „Mahnwesen" einschalten.

2. **Defaults konfigurieren**: `/settings/company` → unten Sektion „Mahnwesen":
   - **Verzugszinssatz B2B** (% p.a.) — Standard 12,2 (ECB-Basiszinssatz + 9,2 PP nach §456 UGB)
   - **Verzugszinssatz B2C** (% p.a.) — Standard 4 (gesetzlich §1000 ABGB)
   - **Mahnspesen ab Stufe 2** (€) — Standard 40 (§1333 ABGB B2B-Pauschale)
   - **Tage bis 1. Mahnung** (nach Fälligkeit) — Standard 14
   - **Tage zwischen Mahnungen** — Standard 14
   - **Mahntexte Stufe 1/2/3** — Default-Texte sind editierbar

## Workflow

### Manuell mahnen (Invoice-View)

Wenn eine festgeschriebene Rechnung überfällig ist, erscheint auf der
Invoice-View-Seite (Desktop und Mobile) eine **gelbe Mahnstand-Sektion**:

- „Überfällig seit X Tagen"
- Tabelle bisheriger Mahnungen
- Button **„+ Neue Mahnung (Stufe N)"** — N = nächste freie Stufe

Klick → Mahnung-Entwurf wird angelegt (mit korrekt berechneten Verzugszinsen
+ Mahnspesen). Status = **Entwurf**. PDF sofort einsehbar.

### Mahnung versenden

Mahnungen kannst du direkt per E-Mail mit PDF-Anhang verschicken
(`POST /api/reminder/:id/send-mail`) — Voraussetzung ist eine konfigurierte
SMTP-Verbindung unter Einstellungen → Firma. Nach erfolgreichem Versand wird
die Mahnung automatisch als „versendet" markiert (`sent` + `sentAt`).
Alternativ: PDF herunterladen und manuell per E-Mail versenden.

### Per KI-Assistent („mahne Maier")

Wenn das LLM-Modul aktiv ist und der `mahnwesen.md`-Skill geroutet wird:

```
User: mahne Maier
Agent: ruft find_customer({query: "Maier"})
       ruft list_invoices({customerId, status: "overdue"})
       → 2 überfällige Rechnungen
       fragt: "Beide oder nur eine bestimmte?"

User: beide
Agent: ruft draft_reminder für jede → 2 Vorschlagskarten

User klickt auf jeder Karte „Bestätigen" → Mahnungen werden angelegt.
```

### Automatischer Vorschlags-Scanner

Im Hintergrund läuft ein Scanner alle 6 Stunden, der überfällige Rechnungen
prüft und Mahnungs-Entwürfe vorschlägt sobald die Schwelle erreicht ist:

- Schwelle Stufe 1: `daysOverdue ≥ daysUntilFirstReminder`
- Schwelle Stufe 2: `daysOverdue ≥ daysUntilFirstReminder + daysBetweenReminders`
- Schwelle Stufe 3: `daysOverdue ≥ daysUntilFirstReminder + 2 × daysBetweenReminders`

**Beispiel:** Rechnung mit 14 Tagen Zahlungsziel ist seit 30 Tagen fällig
(= 30 Tage nach Fälligkeit). Bei Default-Settings (14+14+14):
- Stufe 1 (14d) und Stufe 2 (28d) wurden vom Scanner als Entwurf angelegt
- Stufe 3 (42d) noch nicht — kommt automatisch dazu sobald 42 Tage überschritten

Versendet wird nichts. Die Entwürfe siehst du auf:
- Dashboard-Card „Mahn-Vorschläge bereit"
- `/reminders` (Desktop) / `/m/reminders` (Mobile) Mahn-Übersicht
- Direkt auf jeder betroffenen Invoice-View

## Berechnungs-Details

### Verzugszinsen

Pro-rata auf Tagesbasis:

```
Zinsbetrag = Rechnung-Brutto × (Zinssatz % / 100) × (Tage / 365)
```

Beispiel: Rechnung 1.000 € brutto, 30 Tage überfällig, 12,2 % B2B-Zinssatz:
`1000 × 0,122 × (30 / 365) = 10,03 €`

Der Zeitraum läuft ab dem Fälligkeitsdatum (= Rechnungsdatum + paymentTermsDays).

### Mahnspesen

§1333 ABGB pauschal **€40 ab Stufe 2** (Stufe 1 = Erinnerung ist kostenfrei).
Konkret nachgewiesene weitere Mahnkosten könntest du im Body-Text begründen —
das System rechnet aktuell nur die Pauschale ab.

### Gesamtforderung

```
Gesamtforderung = Rechnung-Brutto + Verzugszinsen + Mahnspesen
```

## Was wird im PDF gerendert?

- Sender-Zeile (oben klein, eine Zeile)
- Empfänger (Anschrift vom Rechnungs-Snapshot)
- Datum, Mahnungs-Nr., Stufe (oben rechts)
- Überschrift („Zahlungserinnerung" / „Mahnung" / „Letzte Mahnung")
- Bezug auf Original-Rechnung (Nr + Datum + Fälligkeit)
- Begleittext (aus Settings, editierbar)
- Forderungsaufstellung als Tabelle
- Neue Zahlungsfrist
- IBAN + BIC + Bank + Verwendungszweck
- Bei Stufe 3: Hinweis auf Inkasso/Klagsweg
- Footer: UID, GISA, Steuernummer, Bankverbindung

## Compliance

- **§1333 ABGB**: Mahnspesen-Pauschale + Verzugszinsen — abgebildet
- **§456 UGB**: B2B-Verzugszinssatz (Basiszinssatz + 9,2 PP) — konfigurierbar
- **§1000 ABGB**: B2C-Verzugszinssatz 4 % — konfigurierbar
- **§907 ABGB**: Fälligkeit aus Rechnungsdatum + Zahlungsziel — automatisch
- **§132 BAO**: 7-Jahre-Aufbewahrung — Reminder ist normale Entity, Backup-Service erfasst sie
- **Audit-Log**: jede Mahn-Erzeugung, Edit, Versand wird geloggt

## Häufige Fragen

**Wie ändere ich den Zinssatz nach ECB-Update?**
`/settings/company` → Sektion „Mahnwesen" → Felder editieren → Speichern.
Die Änderung gilt für künftige Mahnungen. Bestehende Mahnungen behalten den
ursprünglich berechneten Zinssatz (Snapshot auf Reminder.interestRate).

**Was wenn der Kunde inzwischen bezahlt hat?**
Du markierst die Rechnung als bezahlt — die Mahnung bleibt zwar als
historische Entity bestehen, aber der Status zeigt das. Bei zukünftigen
Scan-Läufen ignoriert das System bezahlte Rechnungen.

**Kann ich für eine Rechnung von vornherein keine Mahnung erlauben?**
Aktuell nicht via Flag. Workaround: Rechnung archivieren oder als bezahlt
markieren (wenn Tausch-Geschäft o.ä.).

**Was passiert nach Stufe 3?**
Das System gibt einen Hinweis aus, dass Inkasso oder Klage der nächste Schritt
ist — die Übergabe selbst läuft außerhalb accountant.

**Wann werden Verzugszinsen aktualisiert?**
Nicht automatisch. Eine bestehende Mahnung hat ihren Snapshot. Wenn der User
nach einer Woche eine neue Mahnung anlegen will (Stufe N+1), berechnet sich
der Zins erneut für den nun längeren Verzug.
