import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { remult } from 'remult';
import { api } from './api';
import { CompanySettings } from '../shared/entities/company-settings';

/**
 * Health-Endpoints für Reverse-Proxy + Monitoring.
 *
 * /healthz   — Liveness. Server-Prozess läuft + responds. Reverse-Proxy
 *              nutzt das für Aufbringen / Drain.
 * /readyz    — Readiness. Liveness + DB lesbar + Bootstrap durch. Erst dann
 *              ist Traffic anzunehmen sicher.
 * /metricsz  — Schlanke Counter (Anzahl Customers/Invoices/Expenses) als
 *              JSON für simple Monitoring-Probes.
 *
 * Alle Routen sind UN-authentifiziert — sie liefern keine Geschäftsdaten,
 * nur Liveness/Readiness/Counts. Bei Bedarf via Reverse-Proxy auf
 * internes Netz beschränken.
 */
export const health = express.Router();

const DATA_DIR = process.env['DATA_DIR'] ?? './data';
const VERSION_FILE_CANDIDATES = [
  path.resolve(__dirname, '..', '..', 'VERSION'),  // dev
  path.resolve(__dirname, '..', 'VERSION'),         // dist
];

function readVersion(): string {
  for (const f of VERSION_FILE_CANDIDATES) {
    try { return fs.readFileSync(f, 'utf8').trim(); } catch { /* ignore */ }
  }
  return 'unknown';
}

health.get('/healthz', (_req, res) => {
  res.json({
    status: 'ok',
    version: readVersion(),
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

health.get('/readyz', api.withRemult, async (_req, res) => {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // DB-Erreichbarkeit: CompanySettings-Singleton lesen
  try {
    await remult.repo(CompanySettings).count();
    checks['db'] = { ok: true };
  } catch (e: any) {
    checks['db'] = { ok: false, detail: e?.message ?? 'unbekannter Fehler' };
  }

  // Data-Dir + Subdirs erreichbar
  try {
    fs.accessSync(DATA_DIR, fs.constants.R_OK | fs.constants.W_OK);
    checks['dataDir'] = { ok: true };
  } catch (e: any) {
    checks['dataDir'] = { ok: false, detail: `DATA_DIR=${DATA_DIR} nicht beschreibbar` };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'not_ready',
    version: readVersion(),
    uptime: Math.round(process.uptime()),
    checks,
    timestamp: new Date().toISOString(),
  });
});

health.get('/metricsz', api.withRemult, async (_req, res) => {
  try {
    const { Person } = await import('../shared/entities/person');
    const { Company } = await import('../shared/entities/company');
    const { Invoice } = await import('../shared/entities/invoice');
    const { Project } = await import('../shared/entities/project');
    const { Expense } = await import('../shared/entities/expense');
    const [persons, companies, invoices, projects, expenses] = await Promise.all([
      remult.repo(Person).count(),
      remult.repo(Company).count(),
      remult.repo(Invoice).count(),
      remult.repo(Project).count(),
      remult.repo(Expense).count().catch(() => 0),
    ]);
    res.json({
      version: readVersion(),
      uptime: Math.round(process.uptime()),
      memory: {
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
      counts: { persons, companies, invoices, projects, expenses },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(503).json({ status: 'error', error: e?.message ?? 'unbekannter Fehler' });
  }
});
