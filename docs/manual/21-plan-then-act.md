# 21 · Plan-then-Act — KI für Mehrschritt-Aufgaben

Wenn deine Anfrage MEHRERE aufeinanderfolgende Aktionen enthält, plant der
KI-Assistent zuerst und führt dann Schritt für Schritt aus.

## Wann wird das aktiviert?

Wenn deine Nachricht eines dieser Trigger-Wörter enthält:
- „und dann", „danach", „anschließend"
- „zuerst", „erst mal"
- „schritt für schritt", „alles auf einmal"
- „kombiniert", „in einem aufwasch"
- „schritt 1", „plan erstellen"

## 3-Phasen-Workflow

### Phase 1 — Plan-Ausgabe (read-only)

Der Bot generiert eine nummerierte Liste der geplanten Schritte. KEIN
Tool-Call, kein DB-Write.

Format:
```
Plan:
1. **Firma anlegen** — Maier GmbH (B2B-Annahme)
2. **Rechnung erstellen** — 800 € netto, 20% USt

Soll ich Schritt 1 ausführen?
```

### Phase 2 — Sequentielle Ausführung

Bei „ja" / „mach" / „los" / „weiter" führt der Bot **EINEN Schritt** aus:
- Tool-Call für genau diesen Schritt
- Bei Write-Operationen: Proposal-Card erscheint → User bestätigt extra in
  der Karte
- Danach: „Schritt 1 erledigt. Soll ich Schritt 2 ausführen?"

Bei „nein" / „lass": stoppt höflich, fragt ob neuer Plan.

### Phase 3 — Abschluss

Nach dem letzten Schritt: Kurz-Zusammenfassung mit allen erzeugten
Belegnummern.

## Beispiel

> **User:** Lege Müller GmbH als Kunde an und mach gleich eine Rechnung über 800 € netto, USt 20%

> **Agent:**
> Plan:
> 1. **Firma anlegen** — Müller GmbH (B2B-Annahme, UID falls vorhanden später ergänzbar)
> 2. **Rechnung erstellen** — Müller GmbH als Empfänger, 1 Position 800 € netto + 20% USt = 960 € brutto
>
> Soll ich Schritt 1 ausführen?

> **User:** ja

> **Agent:** [Tool: `create_company({name: "Müller GmbH"})` → Proposal-Card oben in der UI]
> Vorschlag „Firma anlegen: Müller GmbH" wartet auf deine Bestätigung in der Karte oben.
> Sobald bestätigt: soll ich Schritt 2 ausführen?

> **User:** ja

> **Agent:** [Tool: `create_invoice(...)` → Proposal-Card]
> Vorschlag „Rechnung über 960 € brutto an Müller GmbH" zur Bestätigung bereit.

> **User:** [bestätigt beide Karten]

> **Agent:** Erledigt: Müller GmbH angelegt, Rechnung über 960 € brutto erzeugt.

## Anti-Halluzination

Drei Schichten Schutz:
1. **Phase 1 read-only** — keine DB-Schreibung beim Plan
2. **Phase 2: ein Schritt pro Confirm** — User-„ja" zwischen jedem Tool-Call
3. **Proposal-Karten** — jeder Write geht über extra Confirm in der UI
   (`create_person`, `create_invoice`, `draft_reminder`, …)

## Skill-File

Das Verhalten ist in `data/agents/skills/plan-then-act.md` definiert.
Editieren ohne Rebuild möglich:

```bash
docker exec accountant vi /app/data/agents/skills/plan-then-act.md
```

Nach dem Save wird das Skill beim nächsten Chat-Aufruf neu geladen.

## Häufige Fragen

**Was wenn der Plan falsch ist?**
Sag dem Bot: „Schritt 2 nicht, mach lieber X" — er gibt einen überarbeiteten
Plan aus.

**Kann ich mitten im Plan abbrechen?**
„nein" oder „stopp" → Bot stoppt. Bisher ausgeführte Schritte sind
gespeichert (Proposal-Bestätigungen haben sie persistiert).

**Was wenn ich zwei Schritte gleichzeitig will?**
Geht nicht — die Skill-Regeln erzwingen EIN Schritt pro Antwort. Das ist
bewusst — verhindert dass der Bot ungewollte Mehrfach-Writes auslöst.

**Bleibt der Plan über mehrere Tage stabil?**
Ja, dank Conversation-Memory aus v0.18.0. Solange du innerhalb der letzten
40 Turns bleibst, sieht der Bot den Plan und weiß welcher Schritt als
nächstes kommt.
