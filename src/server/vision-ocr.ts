/**
 * Beleg-OCR via Vision-LLM (Phase 19, v0.25.0)
 *
 * POST /api/llm/vision-ocr (Content-Type: image/jpeg|png|webp, raw body)
 *  → ruft das konfigurierte LLM mit Vision-Format auf
 *  → erwartet JSON mit Beleg-Feldern zurück
 *  → liefert ein Expense-Proposal (kein direkter DB-Write)
 *
 * Voraussetzung: Modell muss Vision können (Ministral-3-Vision, Gemma-12B-IT,
 * Llava, etc.). Wird das Modell ohne Vision-Support gehändelt liefert das
 * Backend einen klaren Fehler zurück.
 *
 * Anti-Halluzination:
 *  - LLM bekommt explizite Strict-JSON-Anweisung
 *  - Fehlende Werte = null (NIE erfinden)
 *  - User bestätigt den Vorschlag in der UI bevor Expense gespeichert wird
 *  - keine direkte Persistierung server-side
 */
import express from 'express';
import { repo, remult } from 'remult';
import { api } from './api';
import { CompanySettings } from '../shared/entities/company-settings';

export const visionOcr = express.Router();
visionOcr.use(api.withRemult);

const VISION_PROMPT = `Du bist ein OCR-Assistent für deutschsprachige Rechnungs- und Beleg-Bilder (AT/DE/CH). Extrahiere folgende Felder ALS JSON-Object:

- vendor: Name des Lieferanten / Händlers (String oder null)
- date: Beleg-Datum als ISO YYYY-MM-DD (String oder null)
- reference: Rechnungs- oder Belegnummer wie auf dem Beleg gedruckt (String oder null)
- netTotal: Netto-Gesamtbetrag (Number oder null)
- vatRate: USt-Satz in Prozent als Zahl (20 für 20%, 10 für 10%, etc.; null wenn unklar)
- vatAmount: USt-Betrag absolut (Number oder null)
- grossTotal: Brutto-Gesamtbetrag (Number oder null)
- category: Wenn klar ableitbar, EINE der folgenden Kategorien als String:
  ["Wareneinkauf","Büromaterial","Software / Lizenzen","Hardware","Miete","Telefon / Internet","Reisekosten","Bewirtung","Werbung","Versicherungen","Steuerberatung","Bank / Gebühren","Sonstiges"]
  sonst null
- description: Kurz-Beschreibung was gekauft wurde (max 200 Zeichen, String oder null)

REGELN:
1. Antworte AUSSCHLIESSLICH mit dem JSON-Object. Kein Markdown, kein Code-Fence, kein Vorwort, kein Kommentar.
2. Bei fehlenden Werten: null. NIEMALS raten.
3. Zahlen ohne Tausender-Separator, Punkt als Dezimaltrenner (z.B. 47.90).
4. Beträge brutto INKLUSIVE USt erkennen — Brutto und Netto getrennt ausgeben.
5. Bei ambivalenten Werten den am häufigsten gedruckten / fettesten wählen.

Beispiel-Antwort:
{"vendor":"A1 Telekom Austria","date":"2026-05-15","reference":"RE-2026-05-001","netTotal":39.92,"vatRate":20,"vatAmount":7.98,"grossTotal":47.90,"category":"Telefon / Internet","description":"Mobilfunk Mai 2026"}`;

async function getLlmConfig() {
  const settings = await repo(CompanySettings).findFirst();
  if (!settings) throw new Error('CompanySettings nicht gefunden');
  if (!settings.moduleLlm) throw new Error('KI-Assistent ist nicht aktiviert. Aktiviere unter /settings/module.');
  if (!settings.llmBaseUrl) throw new Error('LLM Base-URL fehlt. Setze sie unter /settings/company.');
  if (!settings.llmModel) throw new Error('LLM Modell fehlt. Setze es unter /settings/company.');
  return {
    baseUrl: settings.llmBaseUrl.replace(/\/+$/, ''),
    apiKey: settings.llmApiKey || 'none',
    model: settings.llmModel,
  };
}

function detectImageMime(buf: Buffer): string {
  // Magic-Number-Sniffing — kein Verlass auf Content-Type-Header.
  if (buf.length < 4) return 'application/octet-stream';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  return 'application/octet-stream';
}

function tryParseJson(raw: string): any | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  // Falls das Modell einen Code-Fence dazupackt: ausschälen
  const fenceMatch = /^```(?:json)?\s*([\s\S]+?)\s*```$/.exec(trimmed);
  const candidate = fenceMatch ? fenceMatch[1]! : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    // Fallback: erstes { … } extrahieren
    const objMatch = /(\{[\s\S]*\})/.exec(candidate);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[1]!);
      } catch {
        return null;
      }
    }
    return null;
  }
}

interface Proposal {
  vendor: string;
  date: string;
  reference: string;
  netTotal: number | null;
  vatRate: number | null;
  vatAmount: number | null;
  grossTotal: number | null;
  category: string;
  description: string;
}

function normalize(raw: any): Proposal {
  const num = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    const cleaned = String(v).replace(/[^\d.,-]/g, '').replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : Math.round(parsed * 100) / 100;
  };
  const str = (v: any): string => (v === null || v === undefined) ? '' : String(v).trim();

  return {
    vendor: str(raw?.vendor),
    date: str(raw?.date),
    reference: str(raw?.reference),
    netTotal: num(raw?.netTotal),
    vatRate: num(raw?.vatRate),
    vatAmount: num(raw?.vatAmount),
    grossTotal: num(raw?.grossTotal),
    category: str(raw?.category),
    description: str(raw?.description),
  };
}

visionOcr.post(
  '/api/llm/vision-ocr',
  express.raw({
    type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/octet-stream'],
    limit: '15mb',
  }),
  async (req, res) => {
    try {
      if (!(req as any).session?.user) {
        res.status(401).json({ error: 'Nicht eingeloggt' });
        return;
      }
      const buf = req.body as Buffer;
      if (!buf || !Buffer.isBuffer(buf) || !buf.length) {
        res.status(400).json({
          error: 'Kein Bild-Body. Content-Type image/jpeg|png|webp + raw bytes senden.',
        });
        return;
      }
      const mime = detectImageMime(buf);
      if (mime === 'application/octet-stream') {
        res.status(400).json({ error: 'Format nicht erkannt. Akzeptiert: JPEG, PNG, WebP, GIF.' });
        return;
      }
      const cfg = await getLlmConfig();
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;

      // OpenAI-kompatible Vision-Message-Form
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: VISION_PROMPT },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ];

      const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          temperature: 0.05,
          max_tokens: 800,
          stream: false,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        res.status(502).json({
          error: `LLM-Backend antwortete ${resp.status}`,
          detail: text.slice(0, 500),
        });
        return;
      }
      const json = await resp.json();
      const content: string = json?.choices?.[0]?.message?.content ?? '';
      const parsed = tryParseJson(content);
      if (!parsed) {
        res.status(502).json({
          error: 'LLM lieferte kein JSON. Modell unterstützt evtl. keine Vision.',
          rawReply: content.slice(0, 500),
        });
        return;
      }
      const proposal = normalize(parsed);
      res.json({
        ok: true,
        proposal,
        bytesProcessed: buf.length,
        mime,
        rawReply: content.slice(0, 1000),
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message ?? 'OCR fehlgeschlagen' });
    }
  },
);
