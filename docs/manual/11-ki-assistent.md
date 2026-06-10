# 11 · KI-Assistent

accountant kommt mit einem optionalen KI-Assistenten, der **lokal** läuft
und sich wie ein Mitarbeiter ansprechen lässt. Du fragst, er antwortet auf
Basis deiner echten Daten, und für Schreibvorgänge (Rechnung anlegen,
Stunden buchen, Kunde anlegen) erstellt er **Entwürfe, die du bestätigst.**

![KI-Assistent](https://raw.githubusercontent.com/LL4nc33/accountant/main/assets/screenshot-ki-assistent.png)

## Zwei Agenten

Im Eingabefeld schaltest du zwischen zwei Agenten um:

- **Buchhalter** (Default): beantwortet Fragen zu deinen Daten und legt nach
  Bestätigung an (Rechnung, Zeitbuchung, Kunde, Ausgabe, Mahnung).
- **Support**: kennt die App selbst, erklärt wo etwas eingestellt wird und
  navigiert dich direkt hin (z. B. „wo trag ich meine IBAN ein?").

Namen, Anrede (Sie/Du) und die Schreibrechte des Support-Agenten stellst du
unter Firma → KI-Assistent ein.

## Was der Buchhalter beantwortet

Du sprichst in normaler Sprache, auch umgangssprachlich. Beispiele:

| Bereich | Beispielfragen |
|---|---|
| **Forderungen** | „wer schuldet mir noch Geld?" · „welche Rechnungen sind überfällig?" |
| **Umsatz / Saldo** | „wie lief mein Jahr?" · „wieviel hab ich diesen Monat gemacht?" · „top Kunden 2026" |
| **Kunde** | „alles über Mustermann GmbH" · „rechnungen von Mustermann GmbH" |
| **Ausgaben** | „wofür geb ich am meisten aus?" · „was muss ich noch zahlen?" |
| **Projekte / Zeit** | „meine Projekte" · „wie viel kann ich noch abrechnen?" |
| **Steuer** | „was muss ich diesen Monat ans Finanzamt?" (UVA) · „ESt-Vorschau" (öffnet die Seite) |
| **Anlagen / Reisen / Bank** | „meine Anlagen" · „Reisekosten" · „was ist beim Bank-Abgleich offen?" |
| **Anzahlen** | „wie viele Kunden / Rechnungen / Projekte?" |

Schreibvorgänge (immer mit Bestätigung):

| Bereich | Beispiel |
|---|---|
| **Rechnung** | „schreib eine Rechnung an Mustermann GmbH, 3h Setup à 90 €" |
| **Stunden buchen** | „buche heute 2,5 h auf Projekt X, Backup-Konfig" |
| **Ausgabe** | „trag eine Ausgabe ein: heute 89 € netto Software-Lizenz" |
| **Kunde anlegen** | „leg eine Person an: Maria Musterfrau, Musterstraße 2, 1000 Wien" |

Was er alles kann, sagt er dir auch selbst auf „was kannst du?".

## Datenschutz: Self-Host empfohlen

Der Assistent spricht **jede OpenAI-kompatible Inference-API**. In der Praxis:

| Backend | Use-Case | Privacy |
|---|---|---|
| **llama.cpp** (`llama-server`) | Lokal auf eigenem Server / NAS / Workstation | ✅ Daten bleiben im LAN |
| **llama-tq** | llama.cpp-Fork mit mehr Durchsatz (quantisierter KV-Cache, Speculative Decoding) — [github.com/LL4nc33/llama-tq](https://github.com/LL4nc33/llama-tq) | ✅ Daten bleiben im LAN |
| **Ollama** | Lokal, einfacher Setup | ✅ Daten bleiben im LAN |
| **LM Studio** | Lokal mit GUI | ✅ Daten bleiben im LAN |
| **vLLM / Together / Groq / OpenRouter** | Hosted, schneller | ⚠ Daten gehen zum Provider |
| **Anthropic Claude / OpenAI GPT** | Hosted, top Qualität | ⚠ Daten gehen zum Provider |

Empfehlung für sensitive Buchhaltungsdaten: **bleib lokal.** Selbst ein
Mini-PC oder ein Raspberry Pi 5 mit 16 GB reicht für 3B-Modelle.

## Modell-Empfehlung

| Modell | Größe (Q4_K_M) | Hardware | Tool-Use-Qualität |
|---|---|---|---|
| **Ministral-3-3B-Instruct-2512** | ~2 GB | Mini-PC, Laptop, iGPU | Sehr gut für bounded-domain wie Buchhaltung |
| **Qwen 2.5 / 3.5 3B Instruct** | ~2 GB | Mini-PC | Sehr gut, langer Context |
| **Qwen 3.5 9B MTP** | ~5,5 GB | GPU 8 GB+ | Top, MTP = 30 % schneller |
| **Gemma 4 12B IT** | ~7-8 GB | GPU 12 GB+ | Top Sprachqualität DE |

## Setup

### 1. llama.cpp starten

```bash
llama-server \
  -m Ministral-3-3B-Instruct-2512-Q4_K_M.gguf \
  -ngl 99 \
  -c 16384 \
  -fa \
  --jinja \
  --host 0.0.0.0 --port 8791
```

Wichtige Flags:
- `-ngl 99` — alle Layer auf die GPU (sonst läuft alles auf CPU → langsam)
- `-fa` — FlashAttention (deutlich schneller)
- `--jinja` — korrektes Chat-Template (für Tool-Use **Pflicht**, sonst kommen Tool-Calls als JSON-im-Content statt strukturiert zurück)
- `-c 16384` — Context-Window (Tool-Use braucht mehr als Default 4K)

### 2. Modul aktivieren

`/settings/module` (Desktop) oder Mobile-Drawer → Einstellungen → Module
→ „KI-Assistent (lokal)" einschalten.

### 3. Endpoint konfigurieren

`/settings/company` → Sektion „KI-Assistent":

- **Base-URL:** `http://<llama-host>:8791/v1` (Pfad muss auf `/v1` enden)
- **API-Key:** leer lassen für lokale Backends; bei Hosted-Provider den
  echten Key eintragen
- **Modell:** der exakte Dateiname / Model-Identifier (z. B. `Ministral-3-3B-Instruct-2512-Q4_K_M.gguf`)

Speichern. Der Assistent ist sofort einsatzbereit unter:
- Desktop: Sidebar → „KI-Assistent"
- Mobile: Drawer → „KI-Assistent"

## Chat-Oberfläche (seit v0.30.x)

- **Welcome-Screen** mit kategorisierten Chips (Fragen / Anlegen /
  Mahnen) — klick auf einen Chip übernimmt den Prompt in das Eingabefeld
- **Multi-Conversation-History** im rechten Sidepanel (nur Desktop)
  — neue Konversation per „+ Neu", zwischen alten wechseln, Archivieren
  via ↘-Button. Es gibt bewusst **kein Hard-Delete** — archivierte
  Konversationen bleiben als Audit-Trail in der DB
- **Proposal-Karten persistieren** über Reload (Konversations-Verlauf
  wird inklusive Tool-Calls rekonstruiert) — Bestätigen-Button bleibt
  also auch verfügbar, wenn du zwischen Konversationen wechselst
- **Deine Nachrichten als dezente Bubble rechts, Antworten voll-breit mit
  Agent-Avatar** und sauberen Tabellen (Design Richtung ChatGPT/Claude)
- Erreichbar als Vollbild („KI-Assistent") oder als kleines Chat-Fenster
  unten rechts auf jeder Seite

## Plan-then-Act (seit v0.21.0)

Für Mehrschritt-Anfragen („Schick die Mahnung an Mustermann GmbH und buch dann
0,5 h Recherche") kann die KI einen Plan ausgeben und Schritt für
Schritt mit Confirm ausführen — siehe [Kapitel 21
Plan-then-Act](21-plan-then-act.md).

## Conversation-Memory (seit v0.18.0)

Der Verlauf persistiert pro User über Browser-Restarts hinweg. Details
zur Window-Schiebung (40 Turns ans LLM, 200-Turn-Cap pro Konversation,
ältere Konversationen weiter abrufbar) siehe [Kapitel 18
Chat-Verlauf](18-conversation-memory.md).

## Sicherheits-Architektur

Auch wenn die KI lokal läuft, ist sie nicht vertrauenswürdig in dem Sinne,
dass sie ohne Aufsicht in deine DB schreibt:

1. **Read-Tools** (Außenstände, Umsatz, Perioden-Saldo, Kunden-Übersicht,
   Rechnungen, Ausgaben, offene Verbindlichkeiten, Projekte, unverrechnete
   Stunden, Anlagen, Reisekosten, UVA, Bank-Status u. a.) liefern Daten
   read-only — kein Risiko.
2. **Write-Tools** (`create_person`, `create_company`, `draft_invoice`,
   `book_time_entry`, `draft_expense`, `draft_reminder`) erstellen **NUR
   Vorschläge**, keine direkten DB-Einträge.
3. Im Chat erscheint eine **gelbe Vorschlagskarte** mit allen Feldern.
4. Erst dein Klick auf **„Bestätigen"** löst den eigentlichen Write-Vorgang
   via `POST /api/llm/execute` aus.
5. Server validiert **jedes Feld nochmal** vor dem Schreiben — die Tool-Args
   des LLM sind nicht trusted.
6. Audit-Log erfasst den Vorgang wie jeden anderen — `userName` ist der
   eingeloggte User.

Eine halluzinierte Rechnung kann also nie unbemerkt in deine DB landen.

## Anti-Halluzination

Buchhaltung ist sensitiv. Auf kleinen lokalen Modellen schützt vor allem das
**deterministische Tool-Routing** vor erfundenen Zahlen:

1. **Eindeutige Fragen werden im Code geroutet** (nicht vom Modell): „wer
   schuldet mir Geld" landet garantiert bei den Außenständen, „rechnungen von
   Kunde X" bei dessen Rechnungsliste usw.
2. **Die Tabelle baut der Server**, nicht das Modell — direkt aus den echten
   Tool-Daten. Das Modell kann die Zahlen also gar nicht umschreiben.
3. **Niedrige Temperatur** server-seitig, keine kreative Interpretation.
4. **Tool-Ergebnisse sind angereichert** (Kundennamen, Summen, Fälligkeiten),
   damit das Modell nicht raten oder nachfragen muss.

Findet sich kein passendes Tool, antwortet der Agent ehrlich mit dem was er
holen kann, statt etwas zu erfinden.

## Skills editieren (Power-User)

Die Verhaltens-Regeln des Agenten liegen als Markdown-Dateien unter
`$DATA_DIR/agents/`:

```
$DATA_DIR/agents/
├── agent.md                ← Top-Level-Persona + Meta-Regeln
└── skills/
    ├── abfrage.md          ← Lese-Anfragen (Kunden, Rechnungen, Außenstände)
    ├── stunden-buchen.md
    ├── rechnung-erstellen.md
    ├── ausgabe-erfassen.md
    ├── kunde-anlegen.md
    └── fallback.md         ← Wenn keine spezifische Skill passt
```

Power-User können:
- Existierende Skills tweaken (z. B. mehr Few-Shot-Beispiele hinzufügen)
- Eigene Skills hinzufügen (z. B. `monatsabschluss.md` für firmenspezifische
  Workflows)
- Die Persona umschreiben (`agent.md`)

Bei jedem Container-Start werden **fehlende** Defaults aus dem Image
nach `$DATA_DIR/agents/` kopiert — bestehende Dateien werden **nicht**
überschrieben. Deine Edits überleben Updates.

Skill-Format (YAML-Frontmatter):

```yaml
---
name: monatsabschluss
description: Monatsende-Übersicht generieren
triggers: ["monatsabschluss", "monat ende", "monatsstand"]
tools: [count_entities, summarize_year, get_outstanding, list_invoices]
require_tools: true
icon: calendar
---

# Skill: Monatsabschluss

## Workflow
1. Aktuellen Monat via summarize_year holen
2. Außenstände mit get_outstanding prüfen
3. Tabelle ausgeben

## Beispiel
**User:** "monatsabschluss"
**Aktion:** summarize_year + get_outstanding
**Antwort:** Tabelle mit Umsatz, Ausgaben, Saldo, Außenstände
```

## Häufige Fragen

**Wie schnell antwortet er?**
Mit Ministral 3B auf GPU: 0,7-2,0 Sekunden pro Antwort. Auf CPU langsamer
(5-15 Sekunden) — siehe `-ngl 99` Flag oben.

**Was wenn das Modell etwas Falsches sagt?**
Bei Read-Anfragen: kann nicht passieren wenn Tool-Use korrekt
funktioniert — der Server gibt nur echte DB-Daten zurück. Bei Write-Anfragen:
du siehst die Vorschlagskarte und kannst „Verwerfen" klicken.

**Kann er Rechnungen festschreiben?**
Nein. Festschreiben ist ein Compliance-Schritt (§131 BAO) der ausschließlich
manuell durch dich erfolgt.

**Was wenn das Modell ein älteres Datum erfindet?**
Sollte nicht passieren — das aktuelle Datum wird über den System-Prompt
mit-injected. Falls doch: prüf die Vorschlagskarte vor Bestätigen.

**Kann ich auch von unterwegs fragen?**
Ja, wenn deine Inferenz-Backend und accountant von außerhalb erreichbar
sind (z. B. WireGuard-VPN ins eigene Netz). Die Mobile-PWA hat einen
„KI-Assistent"-Eintrag im Drawer.
