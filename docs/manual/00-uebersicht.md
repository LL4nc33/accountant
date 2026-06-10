# accountant — Anwender-Handbuch

Selbst-gehostete Buchhaltungs- und Rechnungssoftware. DACH-Fokus, primär Österreich.

## Wer sollte das lesen?

Personen, die accountant installieren und für die eigene Firma oder als Einzelunternehmer verwenden wollen.

## Aufbau

| Kapitel | Inhalt |
|---|---|
| 01 Installation | Docker-Setup, Env-Vars, Default-Login |
| 02 Erste Schritte | Login, Firmen-Daten, erste Rechnung |
| 03 Firmen-Einstellungen | Was die einzelnen Felder bedeuten |
| 04 UID & VIES | UID prüfen, Cache, Pflichtfelder |
| 05 Reverse-Charge | RC-Rechnungen für EU- und Drittland-Kunden |
| 06 Kleinunternehmer | §6 Abs. 1 Z 27 UStG, GISA-Zahl |
| 07 Leistungsdatum | Pflichtangaben am Beleg |
| 08 Projekte & Zeit | Projekte, Stunden, Rechnung aus Stunden |
| 09 Module | Produkt-Katalog, Ausgaben, Wiederkehrend, Finanzamt-Export, Onboarding-Wizard, Storno, Soft-Delete, Audit-Log, DSGVO |
| 10 Mobile-App | PWA-Installation auf iOS/Android, Auto-Routing, Toggle Mobile/Desktop, iOS-Safari-PDF, Updates |
| 11 KI-Assistent | Lokales LLM-Setup (llama.cpp, Ollama), Modell-Empfehlung, Tools, Skill-Markdowns, Anti-Halluzination |
| 12 Mahnwesen | 3 Stufen, Verzugszinsen B2B/B2C, Mahnspesen §1333 ABGB, PDF + Background-Scanner, KI-Tool |
| 13 USt-Voranmeldung | Aggregation pro Monat/Quartal/Jahr nach UVA-Kennzahlen, CSV-Export, FinanzOnline-Übernahme |
| 14 BMD/RZL-Export | Steuerberater-CSV mit Buchungssätzen, konfigurierbarem Kontorahmen, Reverse-Charge + KU-Logik |
| 15 Auto-Backup | Nightly SQLite-Snapshots mit Retention 7/4/12, Download + Restore-Workflow |
| 16 Bank-Abgleich | CAMT.053-Import, Match-Engine mit Score, halb-automatisches Bezahlt-Markieren |
| 17 Angebote | Lead-Funnel mit Status (Entwurf/Versendet/Angenommen/Abgelehnt/Abgelaufen), PDF, Convert-to-Invoice |
| 18 Chat-Verlauf | Conversation-Memory pro User, persistente Sessions, 200-Turn-Cap |
| 19 CLV & Tags | Lifetime-Value-Cards pro Customer + farbige Tag-Pills mit Multi-Select-Picker |
| 20 Analytics | Year-Dashboard mit KPI-Cards, 12-Monats-Chart, Top-Kunden, Aufwand-Kategorien |
| 21 Plan-then-Act | KI plant Mehrschritt-Aufgaben und führt schrittweise mit User-Confirm aus |
| 22 Activity-Timeline | CustomerNotes mit Kind-Avatars (Notiz/Anruf/Termin/E-Mail/Vor-Ort) |
| 23 Custom Fields | Frei definierbare Key-Value-Felder pro Customer ohne Schema |
| 24 Paperless | Anbindung an Paperless-ngx, Beleg-Verknüpfung in Expenses |
| 25 Beleg-OCR | Foto → Vision-LLM → Expense-Felder auto-gefüllt |
| 26 XRechnung | UBL-2.1-Export für DE-B2B-Pflicht 2025 und AT-B2G via USP |
| 27 Multi-Currency | Pro-Rechnung-Währung EUR / CHF mit Snapshot-Lock §131 BAO |
| 28 SVS-Vorschau | AT-Sozialversicherung KV/PV/UV/SV-Prognose, Vorläufig-vs-Endabrechnung, Schock-Schutz im 3. Jahr |
| 29 ESt-Vorschau | AT-Einkommensteuer-Forecast 2026 mit Gewinnfreibetrag §10 EStG, SVS-Kopplung |
| 30 Skonto | Invoice-Level Skonto-Klausel „X % bei Zahlung innerhalb Y Tagen", PDF + XRechnung |
| 31 Logo + Rechnungs-Layout | Logo-Upload, Skonto-Defaults, DIN-A4 Layout |
| 32 Zusammenfassende Meldung | EU-Reverse-Charge-Aggregation pro UID, FinanzOnline-CSV |
| 33 Anlagenverzeichnis / AfA | §7 EStG lineare AfA + Halbjahresregel, GWG §13 EStG |
| 34 Auftragsbestätigung + Lieferschein | Offer.kind ∈ offer/order_confirmation/delivery_note mit kontextueller PDF |
| 35 Reisekosten §26 EStG | Diäten/Nächtigung/KM-Geld nach AT-Standardsätzen 2026 |
| 36 Kassabuch | Chronologisches Bareinnahmen/-ausgaben-Journal mit Saldo (NICHT RKSV) |
| 37 Navigation + Layout | Gruppierte Sidebar (Buchhaltung/Steuer/Einstellungen/System/Konto), Edit-Shell mit Tabs (Desktop) und Accordion (Mobile) |
