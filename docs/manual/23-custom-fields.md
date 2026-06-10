# 23 · Custom Fields

Pro Kunde frei definierbare Key-Value-Felder. Kein Schema, kein Vorab-Setup
— du gibst beim Kunden direkt ein was du brauchst.

## Wozu?

Branchen-spezifische Daten, die nicht in die Standard-Felder passen:
- LinkedIn-Profil
- Vertragsende
- Lieferanten-Konto-Nr.
- Stammkunde seit
- Bevorzugter Liefertag
- Mitarbeiter-Hauptansprechpartner
- ELDA-Nr. (bei Personalvermittlern)
- whatever you need

## Eintrag anlegen

Person- oder Company-Edit → **„Custom Fields"**-Sektion im Notizen-Tab:

1. **„+ Feld hinzufügen"** klicken
2. Key + Value tippen (z.B. „LinkedIn" + „linkedin.com/in/mueller")
3. **Speichern** (Form-Save)

Mehrere Felder beliebig viele.

## Anzeige

In der Customer-View (Read-Only) zwischen Adressen und Aktivitäten:

```
Custom Fields:
  LinkedIn:         linkedin.com/in/mueller
  Branche:          IT-Beratung
  Stammkunde-seit:  2024-03
  Vertragsende:     2027-12-31
```

Definition-List-Layout, key fett + Doppelpunkt, value daneben.

Sektion wird ausgeblendet wenn keine Felder vorhanden.

## Datenmodell

```
Customer (Person/Company)
└── customFields: '{"key":"value", ...}'   ← JSON-String
```

- Format: JSON-Object mit String-Keys und String-Values
- Maximale Key-Länge: 64 Zeichen (UI-Limit)
- Maximale Value-Länge: 500 Zeichen (UI-Limit)
- Beliebige Anzahl Felder, kein Schema

## Migrations-Safe

Bestehende Customers vor v0.23.0 haben `customFields = ''` (Knex-Default).
Read-Only-View parsiert das tolerant — leerer String oder ungültiges JSON
→ keine Anzeige.

## API

Custom Fields sind Teil von `Customer.customFields` — kein eigener Endpoint.
Standard PUT/PATCH auf `/api/persons/:id` bzw. `/api/companies/:id` mit
`{customFields: '{"…":"…"}'}` aktualisiert sie.

## Häufige Fragen

**Kann ich nach Custom Fields filtern in der Übersicht?**
Aktuell nicht. Volltext-Search greift aber: `Customer.customFields` ist
indiziert in der Customer-Suche.

**Was wenn der Value ein Datum oder Zahl ist?**
Alles wird als String gespeichert. Du tippst „2027-12-31" → wird als String
gespeichert. Beim Display erscheint es exakt so.

**Kann ich Custom Fields zentral definieren (Schema)?**
Nein, bewusst nicht. Schema-loses Design heißt: jeder Kunde kann andere
Felder haben. Wenn du immer dieselben brauchst: leg sie immer wieder gleich
an, oder pull-request für ein „Custom-Field-Templates"-Feature.

**Sind Custom Fields im XRechnung-Export?**
Nein — XRechnung folgt EN16931, dort gibt es keinen freien Slot dafür. Für
B2B-Übergabe schreib das was wichtig ist in den Header- oder Footer-Text
der Rechnung.

**Werden Custom Fields ge-backupt?**
Ja, sie sind Teil der `persons`/`companys`-Tabellen und in jedem
SQLite-Snapshot enthalten.
