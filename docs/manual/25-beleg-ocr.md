# 25 · Beleg-OCR (Vision-LLM)

Foto vom Beleg → Expense-Felder werden automatisch ausgefüllt. Nutzt das
konfigurierte lokale Vision-LLM (Ministral-3-Vision, Gemma-12B-IT, Llava
o.ä.).

## Voraussetzung

- **KI-Assistent-Modul aktiv** (`/settings/module` → KI einschalten)
- **Vision-fähiges Modell** in `/settings/company` → KI:
  - Ministral-3-Vision (Empfehlung, schnell + AT-trainiert)
  - Gemma-12B-IT (alle DACH-Sprachen)
  - Llava-1.6 (klassische Variante)

## Workflow

### 1. Neue Ausgabe

`/expenses` → **„+ Neue Ausgabe"**.

### 2. Beleg fotografieren oder hochladen

Drop-Zone oben mit Kamera-Icon. Auf Mobile:
- Tap → öffnet die Kamera (rückseitig per `capture="environment"`)
- Foto schießen → wird sofort an Server geschickt

Auf Desktop:
- Tap → File-Picker
- JPEG / PNG / WebP / GIF akzeptiert, max 15 MB

### 3. OCR läuft

Drop-Zone zeigt **„OCR läuft… (Vision-LLM analysiert)"**.

Server:
1. Liest raw image bytes (max 15 MB)
2. Magic-Number-Check (echtes Bild?)
3. Base64-Encoding + OpenAI-Vision-Format
4. LLM-Call mit Strict-JSON-Prompt
5. JSON-Parse + Normalisierung
6. Antwort als Proposal an die UI

Dauer: 2-8 Sekunden bei lokalem Modell, je nach Hardware.

### 4. Auto-Fill

Toast: **„N Felder aus Beleg übernommen. Bitte prüfen."**

Folgende Felder werden ausgefüllt (sofern leer):
- Lieferant
- Datum
- Belegnummer
- Beschreibung
- Kategorie (eine der 13 Expense-Kategorien)
- Netto-Betrag
- USt-Satz (%)
- USt-Betrag
- Brutto-Betrag

### 5. Prüfen und Speichern

**WICHTIG:** Der OCR-Output ist eine Vorlage, kein verbindlicher Eintrag.
Prüfe jedes Feld manuell, bevor du speicherst. Der LLM kann sich verlesen
(handgeschriebene Zahlen, schlechte Foto-Qualität, exotische Layouts).

## Beispiel

A1-Telekom-Rechnung von 47,90 € brutto:

```json
{
  "vendor": "A1 Telekom Austria",
  "date": "2026-05-15",
  "reference": "RE-2026-05-001",
  "netTotal": 39.92,
  "vatRate": 20,
  "vatAmount": 7.98,
  "grossTotal": 47.90,
  "category": "Telefon / Internet",
  "description": "Mobilfunk Mai 2026"
}
```

→ Form-Felder werden alle entsprechend gefüllt.

## API

```
POST /api/llm/vision-ocr
Content-Type: image/jpeg (oder image/png, image/webp)
Body: raw image bytes (max 15 MB)
```

Response:
```json
{
  "ok": true,
  "proposal": { "vendor": "...", "date": "...", ... },
  "bytesProcessed": 234567,
  "mime": "image/jpeg",
  "rawReply": "..."
}
```

Bei Fehler:
- HTTP 400 — kein Bild oder Format nicht erkannt
- HTTP 502 — LLM-Backend fehlerhaft oder Modell nicht Vision-fähig

## Anti-Halluzination

Strikte Regeln im Prompt:
1. **JSON-only** — kein Markdown, kein Code-Fence, kein Vorwort
2. **Fehlende Werte = `null`** — niemals raten
3. **Komma-Dezimal nicht erlaubt im JSON** — Punkt-Dezimal (z.B. 47.90)
4. **Code-Fence-Tolerant-Parser** — falls Modell trotzdem ```json``` wrappt

Plus: User prüft jedes Feld manuell vor dem Save.

## Häufige Fragen

**Wieso erkennt es 12 € als 1.200 €?**
Manche Modelle haben Schwierigkeiten mit Tausender-Punkten (DE/AT-Notation
„1.200,00"). Probier ein anderes Modell oder verbessere die Foto-Qualität.

**Wieso ist die Kategorie immer „Sonstiges"?**
Wenn das Modell die Kategorie nicht klar zuordnen kann → `null` →
Default „Sonstiges". Du wählst die Kategorie manuell.

**Wie groß sollte das Foto sein?**
2-4 MP reicht. Größer ist Verschwendung (Token-Cost + Upload-Zeit). Kleiner
verliert Genauigkeit bei kleiner Schrift.

**Kann ich PDF-Belege hochladen?**
Aktuell nur Bilder. PDF→JPG-Conversion müsste der Browser machen — kommt
evtl. später als Server-Side-Feature (pdf-to-image).

**Werden Foto-Daten irgendwo gespeichert?**
Das Bild wird einmalig an den LLM gesendet (lokal oder gehostet), Server
hält nichts in der DB. Wenn dein LLM-Endpoint loggt, bleibt es dort.

**Wieso bekomme ich „Modell unterstützt evtl. keine Vision"?**
Das aktive Modell ist nicht multimodal. Wechsle in CompanySettings auf ein
Vision-Modell (Ministral-3-Vision o.ä.).

**Kostet das Geld?**
Bei lokalem Modell (llama.cpp, Ollama) nein. Bei Hosted-Provider
(OpenAI/Anthropic) je nach Provider — ein Vision-Call ist meist 5-20x
teurer als ein Text-Call.
