# 18 · Chat-Verlauf (Conversation-Memory)

Der KI-Assistent merkt sich Gespräche jetzt über Sessions hinweg. Du kannst
einen Chat morgen weiterführen wo du heute aufgehört hast.

## Wie funktioniert das?

Conversations werden pro User in der DB gespeichert:
- Beim Öffnen vom Chat (`/chat` oder `/m/chat`) wird der Verlauf automatisch
  geladen — ohne `conversationId` die jüngste aktive Conversation
- Jede neue User-Frage + jede Assistant-Antwort + jeder Tool-Call landet in
  der Conversation
- Pro Anfrage gehen die letzten **40 Turns** ans LLM (Token-Budget)
- Hartes Cap: **200 Turns gesamt** — beim Persistieren wird auf die letzten
  200 Turns getrimmt (`slice(-200)`)

Mehrere Conversations pro User sind möglich: ein `POST /api/llm/conversation`
legt eine neue, leere Conversation an; `GET`/`chat` adressieren über einen
optionalen `conversationId` eine bestimmte.

## Verlauf zurücksetzen

Im Chat: **„↻ Neuer Chat"**-Button oben rechts → archiviert die aktive
Conversation serverseitig (Soft-Delete via `Base.archived`). Die Row bleibt für
den Audit-Trail / §132 BAO erhalten; ein neuer Chat beginnt eine frische
Conversation.

## Architektur

```
┌────────────┐  GET /api/llm/conversation       ┌──────────────┐
│ Chat-UI    ├──────────────────────────────────►              │
│            │                                  │              │
│            │  POST /api/llm/chat              │   Server     │
│            ├──────────────────────────────────►              │
│            │  (nur die neue user-Message)     │   + lädt     │
│            │                                  │   History    │
│            │  ← reply (mit auto-persist)      │   + History  │
│            │                                  │   schiebt    │
│            │  DELETE /api/llm/conversation    │   40 Turns   │
│            ├──────────────────────────────────► (archiviert) │
└────────────┘                                  └──────────────┘
                                                       │
                                                       ▼
                                                 Conversation
                                                 (Entity per
                                                  User)
```

## Privacy

Conversation-Daten enthalten **alles** was du im Chat geschrieben hast +
alle Bot-Antworten + alle Tool-Results (Kundendaten, Beträge, etc.).

- Pro User getrennt — kein cross-user-Read
- Admin-only Entity-Access (`allowApiCrud: ['admin']`)
- Backup-Snapshots aus v0.15.0 enthalten Conversations
- Bei DSGVO-Auskunft Customer-bezogene Conversations händisch löschen

## API

| Endpoint | Methode | Zweck |
|---|---|---|
| `/api/llm/conversation` | GET | Conversation laden (optional `?id=…`, sonst jüngste aktive) |
| `/api/llm/conversation` | POST | Neue, leere Conversation anlegen |
| `/api/llm/conversation` | DELETE | Conversation archivieren (optional `?id=…`) |
| `/api/llm/chat` | POST | Chat-Send mit `persistEnabled: true` (default), optional `conversationId` |

`persistEnabled: false` deaktiviert die Persistenz für einzelne Calls (z.B.
Integrations-Tests).

## Häufige Fragen

**Wo werden die Daten gespeichert?**
SQLite-Tabelle `conversations` im `$DATA_DIR/db/`. Mehrere Conversations pro
User werden unterstützt (eine neue per `POST /api/llm/conversation`).

**Kann ich exportieren was ich gefragt habe?**
Via Admin-Panel von Remult (`/api/admin`) den `Conversation`-Row holen +
`turnsJson` parsen. CLI-Export ist out-of-scope für v1.

**Was wenn das LLM-Modul aus ist?**
GET liefert leeres Array, kein Fehler. Chat-UI verhält sich wie vor v0.18.0
(stateless).

**Werden Tool-Calls im UI angezeigt nach Reload?**
Nein — die UI filtert beim Laden nur `user` + `assistant`-Messages mit
Content. Tool-Calls bleiben in der DB für Debugging.

**Wie hoch ist das Token-Budget pro Call?**
40 Turns × ~200 Tokens pro Turn = ~8 K Tokens Context im Schnitt. Plus
System-Prompt + aktive Skill = realistisch 12-15 K Tokens. Bei lokalen
Modellen mit 32 K Context kein Problem.
