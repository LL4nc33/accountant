# 02 Erste Schritte

Nach dem Login landest du auf dem Dashboard mit den wichtigsten Kennzahlen, den letzten Rechnungen und Schnellaktionen.

![Dashboard](https://raw.githubusercontent.com/LL4nc33/accountant/main/assets/screenshot-dashboard.png)

## 1. Einloggen

Browser auf `http://localhost:6002` — Login mit `admin / admin`.

Du wirst **automatisch auf die Passwort-Wechsel-Seite umgeleitet**.
Solange `admin/admin` aktiv ist, ist keine andere Seite erreichbar
(Force-PW-Change ist eine Art-32-DSGVO-Pflicht).

## 2. Admin-Passwort ändern

Die `/change-password`-Seite öffnet sich automatisch nach dem ersten
Login. Neues Passwort setzen → Speichern → die App leitet dich aufs
Dashboard weiter.

> Für Development kannst du den Force-Change mit der Env-Variablen
> `OA_DEV_SKIP_FORCED_PW_CHANGE=true` aushebeln. **Niemals in
> Production setzen.**

## 3. Onboarding-Wizard (First-Run)

Beim ersten Login erscheint ein **3-Schritt-Setup** für die
Firmen-Daten:

1. **Firma** — Name, Anschrift, Land
2. **Steuer** — UID, Kleinunternehmer-Toggle, GISA-Zahl + Behörde (für AT)
3. **Bank & Kontakt** — IBAN, BIC, Bankname, E-Mail, Telefon

Du kannst den Wizard überspringen und alles später unter Settings →
**Firmen-Einstellungen** anpassen. Details siehe [Kapitel
03 Firmen-Einstellungen](03-firmen-einstellungen.md).

## 4. Ersten Kunden anlegen

Kunden → **Kunden-Übersicht** → „Neue Person" oder „Neue Firma".
Mindestens Name + Adresse erfassen.

Die Kundennummer wird automatisch aus dem Nummernkreis vergeben (siehe
Settings → Nummernkreise — Default `10000+` für Kunden). Falls du eine
UID kennst, kannst du gleich auf **„UID gegen VIES prüfen"** klicken —
das Ergebnis (verifizierter Firmenname + Datum) wird auf dem Kunden
hinterlegt und 30 Tage gecached. Siehe [Kapitel 04 UID &
VIES](04-uid-und-vies.md).

## 5. Erste Rechnung erzeugen

Rechnungen → **Neue Rechnung**. Kunde wählen, Positionen einpflegen
(Bezeichnung, Menge, Einzelpreis, USt-Satz), speichern.
Rechnungsnummer wird beim Speichern aus dem Nummernkreis vergeben.

- **USt-Satz-Dropdown** ist country-driven (AT: 20/13/10/0, DE: 19/7/0,
  CH: 8.1/3.8/2.6/0)
- **Reverse-Charge** wird automatisch vorgeschlagen, wenn die
  Kunden-Land vom Sitz abweicht und der Kunde eine UID hat — siehe
  [Kapitel 05](05-reverse-charge.md)
- **Kleinunternehmer** schaltet auf den §6-Abs.-1-Z-27-Modus um — keine
  USt im PDF, KU-Vermerk im Summary — siehe [Kapitel 06](06-kleinunternehmer.md)

Aus der Rechnung-Detailansicht → **„PDF anzeigen"** für den Download.
Der Sender-Block, UID, IBAN und alle Pflichtangaben kommen aus den
Firmen-Einstellungen. Mit **„Festschreiben"** (§131 BAO) wird die
Rechnung gegen weitere Änderungen verriegelt — siehe [Kapitel 09.3
Festschreibung & Audit-Log](09-module.md#93-festschreibung--audit-log-v050).

## Was du danach weiter erkunden kannst

| Bereich | Kapitel |
|---|---|
| Mahnungen, Bank-Abgleich | [12 Mahnwesen](12-mahnwesen.md), [16 Bank-Abgleich](16-bank-abgleich.md) |
| USt-Voranmeldung, BMD/RZL-Export | [13 USt-Voranmeldung](13-uva.md), [14 BMD-Export](14-bmd-export.md) |
| KI-Assistent mit lokalem LLM | [11 KI-Assistent](11-ki-assistent.md) |
| Angebote / Lead-Funnel | [17 Angebote](17-angebote.md) |
| Mobile-PWA installieren | [10 Mobile-App](10-mobile-app.md) |
