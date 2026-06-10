# 03 Firmen-Einstellungen

Erfassbar unter Settings (Zahnrad oben rechts) → **Firmen-Einstellungen**.

Singleton: es gibt genau einen `CompanySettings`-Datensatz pro Installation. Multi-Mandanten sind in dieser Architektur nicht vorgesehen.

## Wer darf editieren?

Nur User mit Rolle `admin` (Property `isAdmin: true`).

## Felder — Stammdaten

| Feld | Pflicht? | Verwendung |
|---|---|---|
| Firmenname | empfohlen | Erste Zeile im Rechnungs-Header |
| Namenszusatz / Rechtsform | optional | z.B. „e.U.", „GmbH". Wird im PDF-Header hinter dem Firmennamen angezeigt |
| Straße | empfohlen | Im Sender-Block auf Rechnungen |
| PLZ | empfohlen | Im Sender-Block |
| Stadt | empfohlen | Im Sender-Block |
| Land | Pflicht | `AT` / `DE` / `CH`. Default `AT`. Treibt USt-Sätze, Pflichttexte und Default-Währung (CH → CHF) |
| UID/USt-ID/MWST-Nr. | Pflicht für USt-pflichtige Rechnungen | Erscheint im Rechnungs-Footer; Format wird validiert |
| IBAN | optional | Erscheint im Footer als Bankverbindung |
| BIC | optional | Ergänzt IBAN-Anzeige |
| Bankname | optional | Ergänzt IBAN-Anzeige |
| E-Mail / Telefon / Website | optional | Aktuell nicht im PDF; werden für Mahnungen verwendet |

## Felder — Steuer + Kleinunternehmer (AT)

| Feld | Bedeutung |
|---|---|
| Kleinunternehmer aktiv | Globaler Schalter — schaltet auf §6-Abs.-1-Z-27-UStG-Modus (kein USt-Ausweis, KU-Note im Summary, GISA-Zahl + Behörde wandert im Footer vor die UID) |
| GISA-Zahl | Nummer aus dem österreichischen Gewerberegister (7–9 Ziffern, z.B. `21345678`) |
| GISA-Behörde | Bezirksverwaltungsbehörde (z.B. „Magistrat der Stadt Wien") |
| Steuernummer (Finanzamt) | Vom Finanzamt vergeben — nicht zu verwechseln mit der UID |

§63 Gewerbeordnung verpflichtet alle Gewerbetreibenden, GISA-Zahl und
Behörde auf Geschäftsdokumenten anzuführen. accountant rendert beide
automatisch im Rechnungs-Footer.

## Felder — Defaults

| Feld | Verwendung |
|---|---|
| Default-Stundensatz | Fallback wenn weder Projekt noch TimeEntry einen eigenen Stundensatz hat |
| Default-Zahlungsziel (Tage) | Wird beim Anlegen einer neuen Rechnung in `dueDate` umgerechnet (Rechnungsdatum + Tage) |
| Default-Verzugszinssatz | Basis für die Mahnungs-Berechnung; B2B aus §456 UGB, B2C aus §1000 ABGB. Wird in Kapitel 12 (Mahnwesen) detailliert beschrieben |

## Felder — SMTP (für E-Mail-Versand)

| Feld | Verwendung |
|---|---|
| SMTP-Server / Port / TLS | Outbound-Konfiguration |
| SMTP-Benutzer + Passwort | Authentifizierung; Passwort wird mit `includeInApi: false` markiert und nie an den Client geliefert |
| Absender-Name | Wird als `From:`-Display-Name verwendet; Fallback ist „accountant" |
| Absender-Adresse | Reply-To-Adresse |

Verwendet von Rechnungs- und Mahnungs-Versand. Konfiguration ist
optional — ohne SMTP-Daten ist der E-Mail-Knopf einfach ausgeblendet.

## Felder — KI-Assistent (LLM)

| Feld | Verwendung |
|---|---|
| Base-URL | OpenAI-kompatibler Endpoint, muss auf `/v1` enden (z.B. `http://localhost:8791/v1`) |
| API-Key | Bei lokalen Backends meist leer; bei Hosted-Provider den echten Key eintragen |
| Modell | Exakter Modell-Identifier (z.B. `Ministral-3-3B-Instruct-2512-Q4_K_M.gguf`) |

Details + Setup-Anleitung für llama.cpp in [Kapitel 11
KI-Assistent](11-ki-assistent.md).

## Country-Codes

- `AT` — Österreich (Default)
- `DE` — Deutschland
- `CH` — Schweiz (CHF + MWST-Sätze 8.1/3.8/2.6/0 seit v0.27.0)

## Format-Hinweise

- **UID Österreich:** `ATU` + 8 Ziffern (z.B. `ATU12345678`). Format wird validiert (siehe `src/shared/entities/vat-id.ts`).
- **USt-ID Deutschland:** `DE` + 9 Ziffern.
- **MWST-Nr Schweiz:** `CHE-` + 9 Ziffern + `MWST` (z.B. `CHE-123.456.789 MWST`).
- **IBAN:** kann mit oder ohne Leerzeichen eingegeben werden. Wird im PDF wie eingegeben angezeigt.

## Was passiert, wenn `CompanySettings` leer ist?

Der PDF-Renderer zeigt anstelle des Sender-Blocks die Zeile:

> ⚠ Firmendaten nicht konfiguriert — bitte unter /settings/company eintragen

