# 37 Navigation + Layout

Seit v0.42.0 ist die Navigation einheitlich gruppiert und alle Edit-Pages folgen dem gleichen Layout-Pattern.

## Sidebar-Gruppen (Desktop + Mobile-Drawer)

| Gruppe | Items |
|---|---|
| **Buchhaltung** | Anlagen · Reisekosten · Kassabuch · Bank-Abgleich |
| **Steuer** (admin) | USt-Voranmeldung · Zusammenfassende Meldung · SVS-Vorschau · ESt-Vorschau · BMD / RZL-Export · Finanzamt-Export |
| **Einstellungen** | Firma · Module · Nummernkreise · KI-Gedächtnis |
| **System** (admin) | Audit-Log · Backups |
| **Konto** | Handbuch · Passwort ändern · Über |

Plus die Top-Level-Einträge oben: **Dashboard · Kunden · Rechnungen** sind immer sichtbar; **Projekte · Produkte · KI-Assistent · Ausgaben** erscheinen nur, wenn das jeweilige Modul aktiviert ist.

Jede Gruppe ist auf- und zuklappbar. Gruppen, deren Module deaktiviert sind oder die nur Admins zustehen, werden ausgeblendet (z.B. „Steuer" und „System" nur mit Admin-Rolle).

## Edit-Shell

Alle Edit-/Settings-Pages mit mehr als 3 logischen Sektionen nutzen das einheitliche **Edit-Shell**-Pattern:

**Desktop:** horizontale Tabs (`<clr-tabs>`) — eine pro Sektion. Validierungs-Dot (rot) im Tab-Label wenn ein Pflichtfeld in diesem Tab leer ist.

**Mobile:** Accordion-Sections — eine ist default geöffnet, die übrigen aufklappbar.

Mehrteilige Formulare sind in Tabs gegliedert. Die Firmen-Einstellungen
(`/settings/company`) etwa haben sechs Tabs: Stammdaten, Steuer & UID,
Bank & Kontakt, Rechnungs-Layout, Mahnwesen und KI-Assistent. Andere längere
Editoren nutzen dasselbe Tab-Muster.

## DIN-A4 PDF-Layout

Alle Dokument-PDFs (Rechnung, Mahnung, Angebot, AB, Lieferschein) folgen DIN-5008-konformen Margins:
- Links 55pt (~19mm)
- Rechts 50pt (~18mm)
- Bottom 62pt (~22mm)
- Empfänger-Block bei y=127 — passt hinter normale DL-Briefumschlag-Fenster

PDF-Download-Button steht direkt auf der Invoice-View neben dem XRechnung-XML-Button (Desktop + Mobile).

## Mobile-/Desktop-Switch

Cookie-basierter Toggle in beiden Drawer/Sidebars („Desktop-Ansicht" / „Mobile-Ansicht"). Auto-Routing: `/m/*`-Pfade bekommen die Mobile-UI, Root-Pfade die Desktop-UI. Bei einer Viewport-Breite unter 768 px leitet die App automatisch auf `/m/*` weiter — der Toggle-Cookie überschreibt das.
