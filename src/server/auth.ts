import express, { Router } from 'express';
import { api } from './api';
import { repo, type UserInfo } from 'remult';
import { compare, hash } from 'bcryptjs';
import { User } from '../shared/entities/user';

export const auth = Router();
auth.use(express.json());
auth.use(api.withRemult);

// Dev-Mode: env-var unterdrückt den Force-PW-Change-Flow (Banner +
// Redirect). Nur für lokale Test-Setups gedacht — Prod-Deploys müssen
// das Default-Passwort vor Inbetriebnahme ändern.
const DEV_SKIP_PW_CHANGE = process.env['OA_DEV_SKIP_FORCED_PW_CHANGE'] === 'true';
if (DEV_SKIP_PW_CHANGE) {
  console.warn(
    '⚠ OA_DEV_SKIP_FORCED_PW_CHANGE=true — Default-Passwort-Warnung deaktiviert. ' +
    'Nur für Dev gedacht. NIE in Production setzen.'
  );
}

auth.post('/api/login', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!name || !password) {
    res.status(400).json({ error: 'Benutzername und Passwort sind Pflicht.' });
    return;
  }

  const user = await repo(User).findFirst({ name });

  if (
    user &&
    user.active &&
    (await compare(password, user.password))
  ) {
    const userInfo: UserInfo = {
      id: user.id,
      name: user.name,
      roles: user.isAdmin ? ['admin'] : [],
    };

    if (req.session) {
      (req.session as any)['user'] = userInfo;
    }
    res.json({
      ...userInfo,
      usedDefaultPassword: DEV_SKIP_PW_CHANGE ? false : !!user.usedDefaultPassword,
    });
  } else {
    // 401 ist semantisch korrekt — Anmeldung gescheitert.
    // Bewusst gleiche Antwort für unbekannten User und falsches Passwort
    // (verrät keinem Bot, ob ein bestimmter User-Name existiert).
    res.status(401).json({ error: 'Benutzer oder Passwort ungültig' });
  }
});

auth.post('/api/logout', async (req, res) => {
  if (req.session) {
    (req.session as any)['user'] = null;
    req.session.destroy(() => {});
  }
  res.json('logged out');
});

auth.get('/api/currentUser', async (req, res) => {
  if (!req.session) {
    res.json(null);
    return;
  }
  const userInfo = (req.session as any)['user'] as UserInfo | undefined;
  if (!userInfo) {
    res.json(null);
    return;
  }
  // Fresh lookup so the banner clears immediately after a password change.
  const full = await repo(User).findFirst({ id: userInfo.id });
  res.json({
    ...userInfo,
    usedDefaultPassword: DEV_SKIP_PW_CHANGE ? false : !!full?.usedDefaultPassword,
  });
});

/**
 * Setzt das Passwort des aktuell eingeloggten Users.
 * - Verlangt das aktuelle Passwort als Beweis (außer wenn `usedDefaultPassword`
 *   true ist — beim Default-Passwort-Wechsel ist das alte Passwort öffentlich
 *   bekannt, das schützt nichts).
 * - Hasht das neue Passwort mit bcryptjs.
 * - Cleart usedDefaultPassword.
 */
auth.post('/api/change-password', async (req, res) => {
  const sessionUser = (req.session as any)?.['user'] as UserInfo | undefined;
  if (!sessionUser) {
    res.status(401).json({ error: 'Nicht eingeloggt' });
    return;
  }
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    res.status(400).json({ error: 'Neues Passwort muss mindestens 8 Zeichen haben' });
    return;
  }

  const user = await repo(User).findFirst({ id: sessionUser.id });
  if (!user) {
    res.status(404).json({ error: 'User nicht gefunden' });
    return;
  }

  // Current-Password-Check nur wenn der User nicht noch das Default-Passwort hat.
  if (!user.usedDefaultPassword) {
    if (typeof currentPassword !== 'string' || !(await compare(currentPassword, user.password))) {
      res.status(403).json({ error: 'Aktuelles Passwort ist falsch' });
      return;
    }
  }

  user.password = await hash(newPassword, 10);
  user.usedDefaultPassword = false;
  await repo(User).save(user);
  res.json({ ok: true });
});
