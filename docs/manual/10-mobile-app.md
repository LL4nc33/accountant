# 10 — accountant auf dem Smartphone

Seit v0.7.0 hat accountant eine vollwertige Mobile-UI als Progressive Web
App. Auf einem Smartphone funktioniert dieselbe Installation wie am Desktop —
nur eben für Touch und kleine Screens neu designt.

## So funktioniert es

- **Automatische Erkennung**: Öffnest du `https://deine-installation/` auf
  einem Smartphone (< 768 px Viewport-Breite), wird beim Login automatisch
  auf die Mobile-Variante unter `/m/…` umgeleitet.
- **Tablet bekommt Desktop**: Ab 768 px Breite (iPad portrait und alles
  größer) wird die Desktop-UI angezeigt — Tablets haben genug Platz für
  Datagrids + Sidebar.
- **Toggle**: Im Mobile-Drawer („Hamburger" oben links) findest du
  „Desktop-Ansicht" — setzt ein Cookie das Mobile übergeht. Im Desktop
  findest du im User-Menu „Mobile-Ansicht" als Gegenrichtung.

## Als PWA installieren

Wenn du die App häufig nutzt, installiere sie als „Home-Screen-App":

**iOS / Safari**
1. Im Safari auf deine accountant-URL gehen
2. Teilen-Button (Quadrat mit Pfeil) → „Zum Home-Bildschirm"
3. Name bestätigen → App erscheint mit eigenem Icon im Home-Screen
4. Beim Öffnen startet sie ohne Browser-Leiste in der Mobile-Variante

**Android / Chrome**
1. Auf deine accountant-URL gehen
2. Drei-Punkte-Menu → „App installieren" oder „Zum Startbildschirm"
3. Bestätigen → eigenes Icon erscheint im App-Launcher

Beide Wege liefern eine standalone-App ohne Adressleiste. Daten werden
weiter vom Server geholt — die PWA ist **online-only**, kein Offline-Modus.

## Was geht alles auf Mobile?

Alles. Konkret:

- **Dashboard**: Stats (Fakturiert, Kunden, Außenstände, Saldo, Ausgaben),
  letzte Rechnungen
- **Kunden**: Suche + Liste, Detail-View mit Stammdaten, Adressen,
  zugehörigen Rechnungen, Projekten und gekauften Produkten (Customer-360),
  DSGVO-Auskunft als JSON-Download. Person + Firma anlegen + bearbeiten.
- **Rechnungen**: Liste mit „Nur offene"/„Archivierte"-Filtern, Detail
  mit PDF-Vorschau (im Browser-eigenen Renderer), Bezahlt markieren mit
  Datum-Picker, Festschreiben, Storno anlegen, Als Vorlage kopieren,
  Archivieren — alles als Bottom-Sheet-Modal mit großen Touch-Targets.
  Edit mit Items als tap-bare Cards die ein Modal öffnen.
- **Projekte**: Liste mit offenen Stunden pro Projekt, Edit, TimeEntries
  bearbeiten (mit Lock-Modus wenn schon abgerechnet)
- **Produkte**: Katalog ansehen, anlegen, bearbeiten
- **Ausgaben**: Liste mit Jahres/Monats-Filter und Netto/Brutto-Totals,
  Ausgaben anlegen + bearbeiten mit Live-Coupling Netto↔Brutto bei
  USt-Änderung
- **Wiederkehrend**: Liste der wiederkehrenden Rechnungen (Detail kommt
  später)
- **Audit-Log**: Append-only-Protokoll mit Entity + Operation Filter
- **Finanzamt-Export**: ZIP-Download direkt auf das Smartphone
- **Settings**: Firma (inkl. SMTP) + Module + Nummernkreise komplett editierbar

## iOS-Safari + PDF

iOS Safari rendert PDFs in iframes seit iOS 14 nicht zuverlässig (nur erste
Seite). Mobile zeigt deshalb auf iOS Safari einen großen Button
„PDF im neuen Tab öffnen" — das nutzt den native iOS-PDF-Viewer und
funktioniert dort sauber. Auf Android Chrome + Desktop Firefox/Chrome
rendert die PDF direkt inline.

## Bekannte Grenzen

- **Offline-Cache**: Die PWA ist online-only. Bei keiner Verbindung lädt
  das App-Shell aus dem Cache aber Daten fehlen. Für echtes Offline-CRUD
  würde es Conflict-Resolution brauchen — bewusst out-of-scope.
- **Tablet-Modus**: Tablets bekommen die Desktop-UI. Wenn du auf einem
  Tablet die Mobile-UI willst: Toggle „Mobile-Ansicht" im Desktop-User-Menu.

## Updates

Wenn der Server eine neue Version ausliefert, lädt der Service-Worker
beim nächsten Besuch das neue App-Shell. Bei Hard-Refresh
(`Strg+Shift+R` auf Desktop, „Inhalt neu laden" in iOS Safari) bekommst
du sofort die aktuelle Version.

## Adressleiste verbergen (Android)

Wenn du die App nicht installierst und nur über den Browser nutzt, kannst
du auf Android Chrome unter „Drei-Punkte-Menu → Zum Startbildschirm
hinzufügen" einen Shortcut mit minimaler Browser-Leiste anlegen — das ist
fast wie installiert, ohne den expliziten PWA-Install.
