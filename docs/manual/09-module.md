# 09 — Module

Dieses Kapitel fasst die Module zusammen, die in den Releases v0.4 bis v0.6
hinzugekommen sind. Sie sind eigenständig nutzbar — der größte Teil ist
über **Einstellungen → Module** ein- oder ausschaltbar, damit die Seitenleiste
nicht überfüllt wird.

## 9.1 Produkt-Katalog (`v0.4.0`)

Wiederkehrende Rechnungs-Positionen (z. B. „Beratungsstunde Senior, 80 € netto, 20 % USt")
müssen nicht jedes Mal getippt werden.

- `Einstellungen → Module → Produkt-Katalog` aktivieren
- Sidebar: **Produkte → Übersicht** + **Neues Produkt**
- Beim Anlegen einer Rechnungs-Position erscheint ein **„Aus Katalog"**-Picker
  oberhalb der Felder. Auswahl füllt Name, Beschreibung, Preis und USt vor.
- Alles bleibt pro Rechnung überschreibbar — der Katalog ist nur ein
  Default-Lieferant.

## 9.2 Soft-Delete / Archivierung (`v0.5.1`)

Alte Datensätze werden nicht hart gelöscht (§132 BAO will sie 7 Jahre lang sehen),
sondern **archiviert**.

- Listen haben einen Toggle **„Archivierte anzeigen"** oben rechts. Default:
  versteckt.
- Edit-Seite hat **„Archivieren"** / **„Reaktivieren"**-Button.
- Customer-Picker im Invoice-Edit zeigt keine archivierten Kunden.
- Festgeschriebene Rechnungen sind weiterhin archivierbar (zwei unabhängige
  Dimensionen).

## 9.3 Festschreibung & Audit-Log (`v0.5.0`)

§131 BAO verlangt, dass abgegebene Rechnungen nicht mehr verändert werden.

- **Festschreiben**-Button auf Invoice-View → kurzes Bestätigungs-Modal.
- Danach: Server-Hook blockt jede Änderung an Inhalts-Feldern (auch an
  Items). Hard-Delete wirft eine §132-BAO-Fehlermeldung.
- Korrekturen: über die Storno-Rechnung (siehe 9.4).

**Audit-Log** unter `Admin-Menü → Audit-Log`:
- Append-only — Server akzeptiert kein Update oder Delete auf Log-Einträge.
- Erfasst Create/Update/Delete (sowie Finalize und Bezahlt-Markierung bei
  Rechnungen) für die wichtigsten Geschäftsentitäten — u.a. Rechnung, Person,
  Firma, Projekt, Produkt, Ausgabe, Angebot, wiederkehrende Rechnung und
  Mahnung.
- Filter nach Entity-Typ + Operation, Diff-Preview pro Eintrag.

## 9.4 Storno- & Korrektur-Rechnung (`v0.6.3`)

Auf einer festgeschriebenen Rechnung:

- **„Storno anlegen"**-Button → öffnet Bestätigung.
- Ergebnis: neue Rechnung mit **negativen Mengen**, eigenem `invoiceNumber`,
  Subject „Storno zu Rechnung X — …" und einem `correctsInvoiceId`-Link aufs Original.
- Die Storno-Rechnung ist Entwurf — vor dem Festschreiben kannst du Texte
  nachjustieren oder zusätzliche Positionen einfügen.

Daneben: **„Als Vorlage kopieren"** (Duplicate) — kopiert mit positiven Mengen,
ohne Link, als neue eigenständige Entwurfs-Rechnung.

## 9.5 Wiederkehrende Rechnungen (`v0.6.5`)

Für SaaS-/Wartungs-Verträge, monatliche Pauschalen etc.

- Sidebar: **Rechnungen → Wiederkehrend**
- Neuen Eintrag anlegen: Template-Rechnung wählen, Intervall (monatlich,
  quartalsweise, halbjährlich, jährlich), nächstes Ausführungs-Datum.
- Server-Loop läuft stündlich (erste Iteration 30 s nach Server-Start) und
  erzeugt Entwürfe sobald `nextRunDate` heute oder in der Vergangenheit ist.
- Entstandene Rechnungen tragen die Reference `Wiederkehrend (TITEL)`.

## 9.6 Ausgaben / Eingangsrechnungen (`v0.6.0`)

Eingangsrechnungen + sonstige Betriebsausgaben, getrennt von den
Ausgangsrechnungen.

- `Einstellungen → Module → Ausgaben / Eingangsrechnungen` aktivieren
- Sidebar: **Ausgaben → Übersicht** + **Neue Ausgabe**
- Pro Belege: Datum, Lieferant, Belegnummer, Beschreibung, Kategorie
  (Whitelist), Netto + USt-Satz + Brutto (live gekoppelt), Zahlungsstatus.
- Übersicht hat Jahres- und Monats-Filter mit Summen-Block.
- Dashboard zeigt zusätzlich eine zweite Stat-Zeile (Ausgaben + Saldo)
  sobald das Modul aktiv ist.

## 9.7 Finanzamt-Jahres-Export (`v0.6.1`)

Ein-Klick-Paket pro Steuerjahr.

- `Einstellungen → Module → Finanzamt-Jahres-Export` aktivieren
- Cog-Dropdown → **Finanzamt-Export** (admin-only)
- Jahres-Picker mit Live-Count, Download-Button → ZIP enthält:
  - `uebersicht.txt` — Header, Einnahmen, Ausgaben, Saldo, KU-Schwellwert-Check
    (€55.000 brutto/Jahr ab 2025)
  - `rechnungen.csv` — alle Ausgangsrechnungen mit Festschreibungs-Status
  - `ausgaben.csv` — alle Eingangsrechnungen mit USt-Aufschlüsselung

## 9.8 E-Mail-Versand (`v0.6.2`)

Auf jeder Rechnung-View: **„Per E-Mail senden"**-Button — sichtbar sobald
SMTP konfiguriert ist.

- Konfiguration unter `Einstellungen → Firma → SMTP-Sektion`:
  Host, Port, TLS, Benutzer, Passwort, From-Adresse, From-Name.
- Modal beim Klick: Empfänger (Default = Kunden-E-Mail), Subject und Body
  vorbelegt mit „Rechnung NUMMER" + generiertem Anschreiben.
- PDF wird on-the-fly generiert und als Anhang verschickt.
- `smtpPassword` hat `includeInApi: false` — wird nie an den Browser
  ausgeliefert.

## 9.9 DSGVO-Auskunft (`v0.6.4`)

Art. 15 DSGVO verlangt, dass Betroffene auf Anfrage alle über sie
gespeicherten Daten erhalten.

- Auf Person- oder Company-View: **„DSGVO-Auskunft"**-Button (admin-only)
- Liefert JSON-Download mit Stammdaten + Adressen + Rechnungen (inkl.
  Items) + Projekte (inkl. TimeEntries) + relevante Audit-Log-Einträge
- Section „Rechtsgrundlagen" erklärt, warum §132 BAO Vorrang vor Art. 17
  Löschrecht hat.

## 9.10 Onboarding-Wizard (`v0.6.8`)

Bei einer frischen Installation erscheint auf dem Dashboard ein dezenter
gelber Hinweis-Banner „Setup noch nicht fertig" solange Firmenname oder
Adresse leer sind.

- **„Setup öffnen"** führt zum Wizard auf `/onboarding`
- Drei Schritte: Firma → Steuer → Bank + Kontakt
- **„Später ausfüllen"** ist jederzeit möglich — der Banner verschwindet,
  bestehende Daten bleiben erhalten.

## 9.11 Eigene Arbeitszeit (`v0.6.7`)

Monats-Aggregation der eigenen TimeEntries — unabhängig vom
Rechnungs-Workflow.

- `Einstellungen → Module → Eigene Arbeitszeit-Aggregation` aktivieren
- Sidebar (unter Projekte): **Arbeitszeit**
- Jahres-Picker oben, pro Monat eine Karte mit Gesamt-Stunden, abgerechneten
  vs. offenen Stunden, und Projekt-Chips (grün wenn bereits abgerechnet).
- Jahres-Summe oben rechts.
