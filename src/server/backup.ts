/**
 * Auto-Backup-Service (Phase 13, v0.15.0)
 *
 * SQLite-Online-Snapshots via VACUUM INTO — atomar, konsistent, kein
 * Lock-Stress auf die Live-DB. Snapshots werden mit ISO-Timestamp im
 * Namen abgelegt unter $DATA_DIR/backups/.
 *
 * Retention:
 *   - Tägliche Snapshots: jüngste N (default 7)
 *   - Wöchentliche Snapshots: 1 pro ISO-Woche, zusätzlich M (default 4)
 *   - Monatliche Snapshots: 1 pro Kalendermonat, zusätzlich K (default 12)
 *   - Alles ältere wird gelöscht.
 *
 * Initial-Lauf 30s nach Start (für direktes Feedback), danach alle 24h.
 *
 * Sicherheits-Hinweis: die SQLite-Datei enthält ALLE Daten inkl. User-
 * Passwort-Hashes. Backups dürfen NIE in Public-Folders landen. Der
 * Download-Endpoint ist admin-only.
 */
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import type { UserInfo } from 'remult';
import { api } from './api';

export const backup = express.Router();
backup.use(express.json());
backup.use(api.withRemult);

const DATA_DIR = process.env['DATA_DIR'] ?? './data';
const SQLITE_PATH = path.join(DATA_DIR, 'db', 'accountant.sqlite');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Neue Snapshots heissen `accountant-…`; `oa-…` bleibt fuer Rueckwaerts-
// kompatibilitaet (alte Backups vor der Umbenennung) weiterhin gueltig.
const SNAPSHOT_RE = /^(?:accountant|oa)-(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})\.sqlite$/;
const FILENAME_GUARD = /^(?:accountant|oa)-\d{4}-\d{2}-\d{2}T\d{6}\.sqlite$/;

interface SnapshotInfo {
  name: string;
  fullPath: string;
  mtime: Date;
  size: number;
  age: 'daily' | 'weekly' | 'monthly' | 'old';
}

const RETENTION = {
  daily: 7,
  weekly: 4,
  monthly: 12,
};

function ensureBackupDir(): void {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function timestampForName(d: Date = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function parseSnapshotDate(name: string): Date | null {
  const m = SNAPSHOT_RE.exec(name);
  if (!m) return null;
  const [, y, mo, da, h, mi, s] = m;
  return new Date(
    parseInt(y!, 10),
    parseInt(mo!, 10) - 1,
    parseInt(da!, 10),
    parseInt(h!, 10),
    parseInt(mi!, 10),
    parseInt(s!, 10),
  );
}

function isoWeekKey(d: Date): string {
  // ISO-Week: Thursday-based week number per ISO-8601
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Erzeugt einen neuen SQLite-Snapshot. Atomar via `VACUUM INTO`.
 * Liefert den Pfad. Wirft bei Fehler.
 */
export function createSnapshot(): SnapshotInfo {
  ensureBackupDir();
  if (!fs.existsSync(SQLITE_PATH)) {
    throw new Error(`SQLite-DB nicht gefunden: ${SQLITE_PATH}`);
  }
  const name = `accountant-${timestampForName()}.sqlite`;
  const fullPath = path.join(BACKUP_DIR, name);
  // VACUUM INTO erzeugt eine konsistente Kopie ohne Lock-Konflikte.
  const db = new Database(SQLITE_PATH, { readonly: true });
  try {
    // VACUUM INTO erwartet single-quoted string; escape single quotes im Pfad.
    const escaped = fullPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escaped}'`);
  } finally {
    db.close();
  }
  const stat = fs.statSync(fullPath);
  return {
    name,
    fullPath,
    mtime: stat.mtime,
    size: stat.size,
    age: 'daily',
  };
}

export function listSnapshots(): SnapshotInfo[] {
  ensureBackupDir();
  const entries = fs.readdirSync(BACKUP_DIR);
  const snapshots: SnapshotInfo[] = [];
  for (const name of entries) {
    if (!SNAPSHOT_RE.test(name)) continue;
    const fullPath = path.join(BACKUP_DIR, name);
    try {
      const stat = fs.statSync(fullPath);
      const parsed = parseSnapshotDate(name) ?? stat.mtime;
      snapshots.push({
        name,
        fullPath,
        mtime: parsed,
        size: stat.size,
        age: 'daily',
      });
    } catch {
      // ignore missing files
    }
  }
  // Neueste zuerst
  snapshots.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  classifyAge(snapshots);
  return snapshots;
}

/**
 * Markiert jeden Snapshot mit seiner Retention-Klasse anhand der
 * Daily/Weekly/Monthly-Budgets. Anwendung: GC entfernt alles 'old'.
 */
function classifyAge(snapshots: SnapshotInfo[]): void {
  // Annahme: snapshots sind nach mtime DESC sortiert.
  const keptDaily = new Set<string>();
  const keptWeekly = new Set<string>();
  const keptMonthly = new Set<string>();

  // 1) Daily: jüngste N
  for (let i = 0; i < snapshots.length && keptDaily.size < RETENTION.daily; i++) {
    const s = snapshots[i]!;
    const key = dayKey(s.mtime);
    if (keptDaily.has(key)) continue;
    keptDaily.add(key);
    s.age = 'daily';
  }

  // 2) Weekly: pro ISO-Woche der jüngste Snapshot, max M Wochen
  for (let i = 0; i < snapshots.length && keptWeekly.size < RETENTION.weekly; i++) {
    const s = snapshots[i]!;
    if (s.age === 'daily') continue;
    const wk = isoWeekKey(s.mtime);
    if (keptWeekly.has(wk)) continue;
    keptWeekly.add(wk);
    s.age = 'weekly';
  }

  // 3) Monthly: pro Monat der jüngste Snapshot, max K Monate
  for (let i = 0; i < snapshots.length && keptMonthly.size < RETENTION.monthly; i++) {
    const s = snapshots[i]!;
    if (s.age === 'daily' || s.age === 'weekly') continue;
    const mo = monthKey(s.mtime);
    if (keptMonthly.has(mo)) continue;
    keptMonthly.add(mo);
    s.age = 'monthly';
  }

  // 4) Alles andere = old → wird vom GC entfernt
  for (const s of snapshots) {
    if (s.age !== 'daily' && s.age !== 'weekly' && s.age !== 'monthly') {
      s.age = 'old';
    }
  }
}

export function applyRetention(): { kept: number; deleted: number } {
  const snapshots = listSnapshots();
  let deleted = 0;
  for (const s of snapshots) {
    if (s.age === 'old') {
      try {
        fs.unlinkSync(s.fullPath);
        deleted++;
      } catch (e) {
        console.error('[backup] Konnte alten Snapshot nicht löschen:', s.name, e);
      }
    }
  }
  return { kept: snapshots.length - deleted, deleted };
}

let loopHandle: NodeJS.Timeout | null = null;

export function startBackupLoop(): void {
  ensureBackupDir();

  // Erster Lauf nach 30 Sekunden — gibt Feedback ohne Server-Start zu blockieren.
  // Danach alle 24 Stunden.
  const INTERVAL_MS = 24 * 60 * 60 * 1000;
  const FIRST_DELAY_MS = 30 * 1000;

  const tick = () => {
    try {
      const snap = createSnapshot();
      const ret = applyRetention();
      console.log(
        `[backup] Snapshot erstellt: ${snap.name} (${(snap.size / 1024 / 1024).toFixed(1)} MB), ` +
        `Retention: ${ret.kept} behalten, ${ret.deleted} gelöscht`,
      );
    } catch (e) {
      console.error('[backup] Snapshot fehlgeschlagen:', e);
    }
  };

  setTimeout(() => {
    tick();
    loopHandle = setInterval(tick, INTERVAL_MS);
  }, FIRST_DELAY_MS);
}

export function stopBackupLoop(): void {
  if (loopHandle) {
    clearInterval(loopHandle);
    loopHandle = null;
  }
}

// ─── API ──────────────────────────────────────────────────────────────

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

backup.get('/api/backup/list', (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const snaps = listSnapshots();
    res.json({
      backupDir: BACKUP_DIR,
      retention: RETENTION,
      count: snaps.length,
      totalSize: snaps.reduce((s, x) => s + x.size, 0),
      snapshots: snaps.map((s) => ({
        name: s.name,
        size: s.size,
        mtime: s.mtime.toISOString(),
        age: s.age,
      })),
    });
  } catch (e) {
    console.error('[backup] list failed', e);
    res.status(500).json({ error: 'Liste konnte nicht gelesen werden' });
  }
});

backup.post('/api/backup/now', (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const snap = createSnapshot();
    const ret = applyRetention();
    res.json({
      ok: true,
      snapshot: {
        name: snap.name,
        size: snap.size,
        mtime: snap.mtime.toISOString(),
      },
      retention: ret,
    });
  } catch (e: any) {
    console.error('[backup] manual snapshot failed', e);
    res.status(500).json({ error: e?.message ?? 'Snapshot fehlgeschlagen' });
  }
});

backup.get('/api/backup/download/:name', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const name = req.params['name'] ?? '';
  // Hard-Guard: nur exakt unsere Namens-Convention erlauben, kein Path-Traversal
  if (!FILENAME_GUARD.test(name)) {
    res.status(400).json({ error: 'Ungültiger Snapshot-Name' });
    return;
  }
  const fullPath = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Snapshot nicht gefunden' });
    return;
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  fs.createReadStream(fullPath).pipe(res);
});

backup.delete('/api/backup/:name', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const name = req.params['name'] ?? '';
  if (!FILENAME_GUARD.test(name)) {
    res.status(400).json({ error: 'Ungültiger Snapshot-Name' });
    return;
  }
  const fullPath = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Snapshot nicht gefunden' });
    return;
  }
  try {
    fs.unlinkSync(fullPath);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[backup] delete failed', e);
    res.status(500).json({ error: e?.message ?? 'Löschen fehlgeschlagen' });
  }
});
