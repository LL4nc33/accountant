# 22 · Activity-Timeline

Chronologische Aktivitäten pro Kunde: Notizen, Telefonate, Termine, E-Mails,
Vor-Ort-Besuche.

## Wann brauchst du das?

Wenn du wissen willst „was war beim letzten Kundengespräch?" oder „wann
hatte ich zuletzt Kontakt mit X?".

## Aufruf

Person- oder Company-View (`/crm/person/:id` bzw. `/crm/company/:id`) →
Sektion **„Aktivitäten"** über den Rechnungen.

## Eintrag anlegen

Inline-Form ganz oben:

1. **Kind-Dropdown** wählen:
   - Notiz (Standard)
   - Telefonat
   - Termin
   - E-Mail
   - Vor-Ort
2. **Datum** wählen (Standard: heute)
3. **Titel** eingeben (z.B. „Bestellbestätigung telefonisch")
4. **Beschreibung** (optional, mehrzeilig)
5. **„Hinzufügen"** klicken

→ landet sofort oben in der Timeline.

## Timeline-Anzeige

Pro Eintrag eine Card mit:
- **Avatar** (farb-codiert pro Kind):
  - Notiz = neutral
  - Telefonat = blau
  - Termin = grün
  - E-Mail = gelb
  - Vor-Ort = lila
- Kind-Label + Datum (Wochentag ausgeschrieben, z.B. „Montag, 07.06.2026")
- Titel + Beschreibung
- Delete-Button (mit Confirm)

Sortierung: jüngste oben (`occurredAt DESC`).

## Anlasszeitpunkt vs. Eingabe-Zeitpunkt

- `occurredAt` = wann das Ereignis stattgefunden hat (User-editierbar)
- `createdAt` = wann du den Eintrag angelegt hast (system-fix)

Das erlaubt rückwirkende Einträge: gestriges Telefonat heute nachtragen
mit `occurredAt=gestern`.

## Datenmodell

```
CustomerNote (Entity)
├── customerId      ← Person.id oder Company.id
├── kind            ← note / call / meeting / email / visit
├── title           ← max 120 Zeichen
├── body            ← mehrzeilig, beliebig
├── occurredAt      ← User-editierbar
├── createdAt       ← System (Base)
├── updatedAt       ← System (Base)
└── archived        ← Soft-Delete
```

## API

Standard Remult-CRUD über `/api/customer-notes`:
- Search via `title`, `body`, `kind`, `customerId`
- allowApiCrud=true
- Audit-Log fängt jede Operation (`auditProxy.log`)

## Häufige Fragen

**Kann ich Anhänge hochladen (Foto, PDF)?**
Aktuell nicht. Anhänge kommen evtl. später.

**Werden Aktivitäten in der DSGVO-Auskunft (Customer-Export) enthalten?**
Aktuell nicht. Der DSGVO-Auskunfts-Endpoint `GET /api/dsgvo/customer/:id`
liefert Stammdaten, Adressen, Rechnungen + Positionen, Projekte +
Zeitbuchungen und Audit-Log-Einträge — Activity-Notizen sind dort noch nicht
enthalten. Bis das ergänzt ist, exportiere relevante Aktivitäten bei einer
Auskunft separat (z.B. über die Customer-Suche).

**Was wenn ich versehentlich falschen Kunden im Eintrag habe?**
Aktuell nur Löschen + neu anlegen. Cross-Customer-Move kommt evtl. später.

**Wieso ist die Timeline-Sektion grau wenn keine Einträge?**
„Noch keine Aktivitäten erfasst — Notiz oder Telefonat oben anlegen." als
Hinweis-Text. Inline-Form bleibt sichtbar.

**Kann der KI-Assistent Einträge anlegen?**
Aktuell nicht. Bei Bedarf: Skill `kunde-anlegen` um `create_customer_note`-
Tool erweitern. Kommt evtl. später.
