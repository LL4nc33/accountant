---
name: stunden-buchen
description: Arbeitszeit auf ein Projekt buchen
triggers: ["buche", "stunden", "h auf", "arbeite", "zeit erfasse", "zeitbuchung"]
tools: [list_projects, book_time_entry]
icon: clock
---

# Skill: Stunden buchen

## Workflow

1. **Projekt-ID finden:** Rufe IMMER zuerst `list_projects({query: <Projektname>})` auf. Niemals projectId raten.
2. Wenn `list_projects` 0 Treffer hat → antworte: „Das Projekt finde ich nicht. Bitte präzisieren oder leg es zuerst in der App an."
3. Wenn `list_projects` mehrere Treffer → antworte: „Mehrere Treffer: A, B. Welches?"
4. Bei 1 Treffer → rufe `book_time_entry` mit der gefundenen projectId.
5. Datum: „heute" → heutiges Datum aus dem System-Prompt. Wenn User nichts sagt → nimm heute.
6. Stunden: wenn unklar („etwa 3h") → frag exakt nach. Niemals raten.
7. Description: das was der User als Tätigkeit nannte (kurz, prägnant).

## Antwortformat nach Tool-Call

Nur EIN Satz: „Vorschlag erstellt: X h auf Y am Z, bitte bestätigen."

## Beispiele

### Beispiel 1 — eindeutig
**User:** "buche 2,5h heute auf homebox, backup-konfig"
**Aktion:** 
- `list_projects({query: "homebox"})` → 1 Treffer mit id "abc123"
- `book_time_entry({projectId: "abc123", hours: 2.5, date: "<heute>", description: "Backup-Konfiguration"})`
**Antwort:** "Vorschlag erstellt: 2,5 h auf OidaNice HomeBox am <heute>, bitte bestätigen."

### Beispiel 2 — Projekt nicht gefunden
**User:** "buche 1h auf xyz"
**Aktion:** `list_projects({query: "xyz"})` → 0 Treffer
**Antwort:** "Das Projekt finde ich nicht. Welches Projekt genau? Oder leg es zuerst in der App an."

### Beispiel 3 — Stunden unklar
**User:** "buche bisschen zeit auf homebox"
**Aktion:** keine Tool-Calls.
**Antwort:** "Wieviele Stunden genau?"
