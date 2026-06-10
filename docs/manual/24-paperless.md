# 24 · Paperless-ngx-Adapter

Optionale Anbindung an eine bestehende [Paperless-ngx](https://paperless-ngx.com)-
Instanz für Beleg-Archivierung. Eingangsrechnungen (Expenses) bekommen einen
Direkt-Link auf den Original-Beleg-Scan.

## Voraussetzung

- Laufende Paperless-ngx-Instanz (egal ob lokal, Docker, anderer Host)
- API-Token aus Paperless (Admin → User-Settings → API-Token)

## Setup

1. **Paperless-URL eintragen** in `/settings/company` → Sektion „Paperless-ngx":
   z.B. `http://paperless.local:8000` (ohne Trailing-Slash)
2. **API-Token eintragen** im selben Feld
3. **Speichern**

Der Token wird mit `includeInApi: false` markiert — er verlässt nie den
Browser, geht nur server-side beim Proxy-Call mit.

## Status prüfen

```bash
curl -b cookie.txt http://localhost:6002/api/paperless/status
```

Antworten:
- `{configured: false}` — URL/Token fehlt
- `{configured: true, connected: false, error: "..."}` — Connection-Test
  scheitert (falsche URL / Token expired / Paperless offline)
- `{configured: true, connected: true, documentCount: N}` — alles OK

## Workflow

### Beleg verknüpfen

Expense-Edit (`/expenses/new/edit` oder bestehende Ausgabe):

1. Sektion **„Beleg-Archiv (Paperless-ngx)"** zwischen Belegnummer und Kategorie
2. Klick auf **„Aus Paperless suchen"**
3. Such-Begriff tippen (Lieferant, Belegnummer, …)
4. Trefferliste erscheint (250ms-Debounce, Live-Update)
5. Klick auf Treffer → verknüpft mit der Ausgabe
6. Karte zeigt jetzt **„Beleg #N verknüpft"** + **„Beleg ansehen"**-Link

### Beleg-Original ansehen

In der Expense oder im Expense-Edit:
**„Beleg ansehen"** → öffnet den Original-Scan im Paperless-Web-UI
(neuer Tab, du bist dort eingeloggt).

### Verknüpfung lösen

In der verknüpften Karte: **„Verknüpfung lösen"** → setzt
`Expense.paperlessDocId = ''`. Der Beleg selbst bleibt in Paperless.

## API

| Endpoint | Methode | Zweck |
|---|---|---|
| `/api/paperless/status` | GET | Setup-Check + Connection-Test |
| `/api/paperless/search?q=…` | GET | Volltext-Suche (max 20 Treffer) |
| `/api/paperless/document/:id` | GET | Document-Detail mit URLs |
| `/api/paperless/preview/:id` | GET | PDF/Image-Stream-Proxy |

Alle Endpoints **admin-only**. Server-Proxy heißt: dein Browser braucht NIE
direkt Paperless-Credentials.

## Architektur

```
Browser
  │ /api/paperless/search?q=...
  ▼
accountant Server
  │ Authorization: Token <PAPERLESS_TOKEN>
  ▼
Paperless-ngx Instance
  │ JSON-Response
  ▼
accountant Server (Transform)
  │ Filtered JSON
  ▼
Browser
```

Token bleibt server-side. Browser sieht nur accountant.

## Häufige Fragen

**Was passiert wenn Paperless offline geht?**
Picker zeigt „Nichts gefunden" — keine Hard-Fails in der UI. Bereits
verknüpfte Beleg-IDs bleiben in der DB. „Beleg ansehen"-Link wird 404 wenn
Paperless erreichbar ist aber das Doc gelöscht wurde.

**Kann ich Belege aus accountant ins Paperless hochladen?**
Nicht in v1. Upload-Endpoint von Paperless ist anders strukturiert (POST
mit multipart-form-data), kommt evtl. später.

**Funktioniert das mit anderen Beleg-Archiven (DocuWare, AnyDok, …)?**
Aktuell nur Paperless-ngx. Adapter für andere wären je 1-2h Aufwand wenn
sie REST-API + Token-Auth haben.

**Wie groß darf ein Beleg in Paperless sein?**
Limit kommt von Paperless selbst (Standard 50 MB). accountant proxied
nur, hat kein eigenes Limit.

**Sind Paperless-Token Audit-pflichtig?**
Ja — Token-Rotation alle 90 Tage ist Best-Practice. accountant speichert
ihn unverschlüsselt in der DB (analog zu LLM-API-Key) — sichere `$DATA_DIR`
mit Disk-Encryption.
