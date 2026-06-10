import compression from 'compression';
import { randomUUID } from 'crypto';
import express from 'express';
import session from 'express-session';
import * as fs from 'fs';
import * as path from 'path';
import { api } from './api';
import { auth } from './auth';
import { invoice } from './invoice';
import { projects } from './projects';
import { search } from './search';
import { vies } from './vies';
import { taxExport } from './tax-export';
import { invoiceMail } from './invoice-mail';
import { dsgvo } from './dsgvo';
import { llm } from './llm';
import { health } from './health';
import { reminder } from './reminder';
import { startReminderLoop } from './reminder-loop';
import { uva } from './uva';
import { bmdExport } from './bmd-export';
import { backup, startBackupLoop } from './backup';
import { bank } from './bank';
import { offer } from './offer';
import { analytics } from './analytics';
import { svs } from './svs';
import { est } from './est';
import { zm } from './zm';
import { paperless } from './paperless';
import { visionOcr } from './vision-ocr';
import { xrechnung } from './xrechnung';
import { startRecurringLoop } from './recurring-loop';
import FileStore from 'session-file-store';
const sessionStore = FileStore(session);

const DATA_DIR = process.env['DATA_DIR'] ?? './data';
const PORT = Number(process.env['PORT'] ?? 6002);
let SESSION_SECRET = process.env['SESSION_SECRET'];
if (!SESSION_SECRET) {
  SESSION_SECRET = randomUUID();
  console.warn(
    '⚠ SESSION_SECRET nicht gesetzt — verwende generierten Zufallswert. ' +
    'Sessions überleben keinen Restart. ' +
    'Setze SESSION_SECRET=<random-hex> in der Umgebung für Production.'
  );
}

// Session-Cookie-Härtung: httpOnly + sameSite=lax sind immer an.
// `secure` wird über Env-Var aktiviert wenn die App hinter einem TLS-Reverse-Proxy läuft
// (siehe docs/SETUP.md). Im Dev-Setup über plain http ist `secure: false` korrekt — sonst
// werden Cookies vom Browser nicht gespeichert und der Login schlägt fehl.
const COOKIE_SECURE = process.env['SESSION_COOKIE_SECURE'] === 'true';
if (!COOKIE_SECURE) {
  console.warn(
    '⚠ SESSION_COOKIE_SECURE != "true" — Session-Cookie ohne Secure-Flag. ' +
    'OK für lokales Dev über http. In Production hinter TLS-Reverse-Proxy ' +
    'auf "true" setzen (siehe docs/SETUP.md).'
  );
}

const app = express();
// Vertraue X-Forwarded-Proto vom Reverse-Proxy (sonst meldet Express das Request als http
// und secure-Cookies werden ignoriert).
app.set('trust proxy', 1);
app.use(compression());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new sessionStore({ path: path.join(DATA_DIR, 'sessions'), logFn: () => {} }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 Tage — überlebt Browser-Neustart bei Remember-Me
    },
  })
);

// WICHTIG: Custom-Route-Router MÜSSEN vor dem Remult-API-Router (api)
// gemounted werden, sonst fängt Remult Pfade ab die zu Pluralen seiner
// Entities passen (z.B. /api/reminders/overview → Remult sucht Reminder
// mit id="overview" → NotFound).
app.use(invoice);
app.use(projects);
app.use(search);
app.use(vies);
app.use(taxExport);
app.use(invoiceMail);
app.use(dsgvo);
app.use(llm);
app.use(health);
app.use(reminder);
app.use(uva);
app.use(bmdExport);
app.use(backup);
app.use(bank);
app.use(offer);
app.use(analytics);
app.use(svs);
app.use(est);
app.use(zm);
app.use(paperless);
app.use(visionOcr);
app.use(xrechnung);
app.use(auth);
app.use(api);

const VERSION_FILE = path.resolve(__dirname, '..', '..', 'VERSION');
const VERSION_FALLBACK = (() => {
  try { return fs.readFileSync(VERSION_FILE, 'utf8').trim(); } catch { return 'unknown'; }
})();
app.get('/VERSION', (_req, res) => {
  res.set('content-type', 'text/plain; charset=utf-8').send(VERSION_FALLBACK);
});

app.use('/', express.static('dist/accountant/browser'));
app.all('/*', function (req, res) {
  // Versucht beide Pfade: Production (dist/server → __dirname/../accountant/browser)
  // und Dev (src/server via tsx → process.cwd()/dist/accountant/browser).
  // Vermeidet 404 bei `tsx src/server/index.ts`.
  const candidates = [
    path.resolve(path.join(__dirname, '..', 'accountant/browser/index.html')),
    path.resolve(path.join(process.cwd(), 'dist/accountant/browser/index.html')),
  ];
  const indexPath = candidates.find((c) => fs.existsSync(c));
  if (!indexPath) {
    res.status(500).send('SPA index.html nicht gefunden — bitte `npm run build` laufen lassen.');
    return;
  }
  res
    .status(200)
    .set('content-type', 'text/html; charset=utf-8')
    .sendFile(indexPath);
});

const server = app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  startRecurringLoop();
  startReminderLoop();
  startBackupLoop();
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
