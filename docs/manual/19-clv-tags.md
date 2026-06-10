# 19 · Customer Lifetime Value & Tags

CRM-Polish: zwei zusammenhängende Features zur besseren Kundenklassifikation
und Umsatz-Sicht.

## Customer Lifetime Value (CLV)

Auf Person- und Company-View siehst du oben drei Karten:

| Karte | Inhalt |
|---|---|
| **Lifetime Value** | Brutto-Summe aller festgeschriebenen Nicht-Storno-Rechnungen |
| **Bezahlt** | Davon bezahlte Rechnungen (Sub-Aggregat) |
| **Außenstand** | Differenz (nur sichtbar wenn > 0) |

Sichtbar erst sobald der Kunde mindestens eine festgeschriebene Rechnung hat.

Berechnung: client-side aus bereits geladenen Invoices — kein extra
Endpoint, kein Performance-Overhead.

### Warum Storno ausgeschlossen?

Storno-Rechnungen tragen negative Mengen — sie würden den Lifetime Value
doppelt korrigieren. Statt das händisch zu rechnen filtern wir sie raus,
das Ergebnis ist sauberer.

## Tags

Tags sind farbige Labels, mit denen du Kunden klassifizierst:
- „VIP", „Großkunde", „Nur Beratung", „EU-RC", „Bar-Zahler", …
- Beliebige Anzahl pro Kunde
- Eigene Farbe pro Tag (HEX, Auto-Kontrast für Schrift)

### Tag anlegen

Im Customer-Edit (Person oder Company) → **„Tags"**-Sektion unten:

1. Drop-down „Tag hinzufügen…" → bestehendes Tag wählen
2. Oder: Name + Farbe + **„+ Neu"** → legt das Tag direkt an

### Tag-Pills

Auf Customer-View neben dem Titel:
- Farbiger Pill mit Tag-Name
- Auto-Kontrast: helle Tags → schwarze Schrift, dunkle Tags → weiße Schrift

### Tag verwalten

Tags sind als eigene Entity (`Tag`) hinterlegt:
- Zentrale Liste über Remult-Admin (Soft-Delete via `archived=true`)
- Archivierte Tags bleiben auf vorhandenen Customers referenziert, werden
  aber nicht mehr im Picker angezeigt

## Datenmodell

```
Customer (Person/Company)
├── tagIds: "id1;id2;id3"   ← Semikolon-getrennt
└── customFields: "{...}"

Tag
├── name
├── color   (HEX, z.B. #FF6600)
└── description
```

Keine Many-to-Many-Tabelle für v1 — bei klein/mittleren Datenmengen ist die
Komma-Liste günstiger zu lesen und zu serialisieren.

## Häufige Fragen

**Kann ich nach Tags filtern in der Kunden-Übersicht?**
Aktuell nicht. Tag-basiertes Filtern kommt evtl. später.

**Was wenn ich ein Tag lösche das auf 50 Kunden referenziert?**
Tags werden soft-deleted (`archived=true`). Die `tagIds`-Liste am Customer
bleibt — UI zeigt sie nicht mehr an, DB hat den Bezug aber noch.

**Kann ich Tags auf Invoices statt Customers setzen?**
Nicht in v1. Für Invoice-Klassifikation nutze `reference` oder `subject`.

**Sind CLV-Werte in Analytics enthalten?**
Ja, indirekt — Analytics-Dashboard zeigt Top-10-Kunden nach Brutto-Umsatz,
das ist exakt die CLV-Aggregation pro Kunde.
