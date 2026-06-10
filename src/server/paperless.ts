/**
 * Paperless-ngx-Adapter (Phase 18, v0.24.0)
 *
 * Verbindet accountant mit einer bestehenden Paperless-ngx-Instanz für
 * Beleg-Archivierung. URL + API-Token in CompanySettings, Anfragen werden
 * server-seitig proxied (Token verlässt nie den Browser).
 *
 * Endpoints:
 *   GET  /api/paperless/status         — Setup-Check + Verbindungs-Test
 *   GET  /api/paperless/search?q=…     — Volltext-Suche
 *   GET  /api/paperless/document/:id   — Single-Document Detail
 *   GET  /api/paperless/preview/:id    — PDF/Image-Preview proxy stream
 *
 * Auth: alle Endpoints admin-only (sensible Belege).
 */
import express from 'express';
import { repo, type UserInfo } from 'remult';
import { api } from './api';
import { CompanySettings } from '../shared/entities/company-settings';

export const paperless = express.Router();
paperless.use(express.json());
paperless.use(api.withRemult);

function requireAdmin(req: express.Request, res: express.Response): UserInfo | null {
  const u = (req.session as any)?.['user'] as UserInfo | undefined;
  if (!u) {
    res.status(401).json({ error: 'Nicht eingeloggt' });
    return null;
  }
  if (!u.roles?.includes('admin')) {
    res.status(403).json({ error: 'Admin-Recht erforderlich' });
    return null;
  }
  return u;
}

async function getPaperlessConfig(): Promise<{ url: string; token: string } | null> {
  const settings = await repo(CompanySettings).findFirst();
  if (!settings?.paperlessUrl?.trim() || !settings?.paperlessToken?.trim()) {
    return null;
  }
  // Trailing slash entfernen — Paperless API endpoints werden relativ angehängt.
  let url = settings.paperlessUrl.trim();
  while (url.endsWith('/')) url = url.slice(0, -1);
  return { url, token: settings.paperlessToken.trim() };
}

async function paperlessFetch(
  cfg: { url: string; token: string },
  path: string,
): Promise<Response> {
  return fetch(`${cfg.url}${path}`, {
    headers: {
      Authorization: `Token ${cfg.token}`,
      Accept: 'application/json',
    },
  });
}

paperless.get('/api/paperless/status', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const cfg = await getPaperlessConfig();
  if (!cfg) {
    res.json({ configured: false });
    return;
  }
  try {
    const resp = await paperlessFetch(cfg, '/api/documents/?page_size=1');
    if (!resp.ok) {
      res.json({
        configured: true,
        connected: false,
        error: `HTTP ${resp.status}: ${resp.statusText}`,
      });
      return;
    }
    const data = await resp.json();
    res.json({
      configured: true,
      connected: true,
      documentCount: data?.count ?? 0,
      url: cfg.url,
    });
  } catch (e: any) {
    res.json({
      configured: true,
      connected: false,
      error: e?.message ?? 'Verbindung fehlgeschlagen',
    });
  }
});

paperless.get('/api/paperless/search', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const cfg = await getPaperlessConfig();
  if (!cfg) {
    res.status(503).json({ error: 'Paperless ist nicht konfiguriert' });
    return;
  }
  const q = String(req.query['q'] ?? '').trim();
  if (!q) {
    res.status(400).json({ error: 'Query-Parameter q fehlt' });
    return;
  }
  try {
    const resp = await paperlessFetch(
      cfg,
      `/api/documents/?query=${encodeURIComponent(q)}&page_size=20`,
    );
    if (!resp.ok) {
      res.status(502).json({ error: `Paperless HTTP ${resp.status}` });
      return;
    }
    const data = await resp.json();
    res.json({
      count: data?.count ?? 0,
      results: (data?.results ?? []).map((d: any) => ({
        id: d.id,
        title: d.title,
        created: d.created,
        added: d.added,
        correspondent: d.correspondent,
        documentType: d.document_type,
        archiveSerialNumber: d.archive_serial_number,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Suche fehlgeschlagen' });
  }
});

paperless.get('/api/paperless/document/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const cfg = await getPaperlessConfig();
  if (!cfg) {
    res.status(503).json({ error: 'Paperless ist nicht konfiguriert' });
    return;
  }
  const id = req.params['id'];
  if (!id || !/^\d+$/.test(id)) {
    res.status(400).json({ error: 'Ungültige Document-ID' });
    return;
  }
  try {
    const resp = await paperlessFetch(cfg, `/api/documents/${id}/`);
    if (!resp.ok) {
      res.status(resp.status).json({ error: `Paperless HTTP ${resp.status}` });
      return;
    }
    const d = await resp.json();
    res.json({
      id: d.id,
      title: d.title,
      created: d.created,
      added: d.added,
      content: d.content,
      correspondent: d.correspondent,
      documentType: d.document_type,
      tags: d.tags ?? [],
      // URL zum Original im Paperless-Web-UI (User klickt sich rein)
      originalUrl: `${cfg.url}/documents/${id}/`,
      // URL zum PDF-Download via accountant-Proxy
      previewUrl: `/api/paperless/preview/${id}`,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Abfrage fehlgeschlagen' });
  }
});

paperless.get('/api/paperless/preview/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const cfg = await getPaperlessConfig();
  if (!cfg) {
    res.status(503).json({ error: 'Paperless ist nicht konfiguriert' });
    return;
  }
  const id = req.params['id'];
  if (!id || !/^\d+$/.test(id)) {
    res.status(400).json({ error: 'Ungültige Document-ID' });
    return;
  }
  try {
    const resp = await fetch(`${cfg.url}/api/documents/${id}/preview/`, {
      headers: { Authorization: `Token ${cfg.token}` },
    });
    if (!resp.ok) {
      res.status(resp.status).end();
      return;
    }
    res.setHeader('Content-Type', resp.headers.get('content-type') ?? 'application/pdf');
    if (!resp.body) {
      res.status(502).end();
      return;
    }
    const reader = resp.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    };
    await pump();
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Preview fehlgeschlagen' });
  }
});
