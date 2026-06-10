/**
 * Bank-Abgleich-Endpoint (Phase 14, v0.16.0)
 *
 * Upload eines CAMT.053-XML, Persistierung als BankTransaction (Dedupe
 * via txId), Match-Vorschläge gegen offene Rechnungen, manueller
 * Confirm → Invoice.paid+paidAt.
 *
 * Anti-Halluzination: jede automatische Zuordnung kommt nur als
 * VORSCHLAG, NIE als direkte Schreibung in die Rechnung. Der User
 * bestätigt jeden Match.
 */
import express from 'express';
import { repo, type UserInfo } from 'remult';
import { api } from './api';
import { parseCamt053, CamtParseError } from './camt';
import { BankTransaction } from '../shared/entities/bank-transaction';
import { Invoice } from '../shared/entities/invoice';
import { Person } from '../shared/entities/person';
import { Company } from '../shared/entities/company';

export const bank = express.Router();
// Eigener body-parser mit hohem Limit nur für /api/bank/import-camt
// (CAMT-Dateien können bei vielen Buchungen mehrere MB groß werden).
bank.use(api.withRemult);

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

interface MatchCandidate {
  invoice: Invoice;
  score: number;
  reasons: string[];
}

/**
 * Sucht passende Rechnung für eine credit-Transaktion.
 * Score 0-100:
 *   +50 wenn Betrag exakt (±0,01 €) matched
 *   +30 wenn Rechnungsnr im Memo erscheint
 *   +20 wenn Datum-Differenz <= 30 Tage
 *   −20 pro €100 Betrags-Differenz (außer exakt)
 *   +10 wenn Customer-Name im Memo
 *   +10 wenn IBAN identisch (über Company.iban — out of scope für v1)
 *
 * Threshold für „Top-Vorschlag": Score >= 50.
 * Threshold für „valider Vorschlag" überhaupt: Score >= 20.
 */
function matchScore(tx: BankTransaction, inv: Invoice, customerName: string): MatchCandidate {
  const reasons: string[] = [];
  let score = 0;

  const grossTotal = (inv as any).grossTotal ?? 0; // Computed bei geladenen items, sonst fallback
  const invAmount = grossTotal > 0 ? grossTotal : 0;

  // Betrag-Match
  if (invAmount > 0) {
    const diff = Math.abs(tx.amount - invAmount);
    if (diff <= 0.01) {
      score += 50;
      reasons.push('Betrag exakt');
    } else if (diff <= 1) {
      score += 30;
      reasons.push('Betrag ±1 €');
    } else {
      score -= Math.min(40, Math.floor(diff / 100) * 20);
    }
  }

  // Rechnungs-Nr im Memo (case-insensitive, Wort-Grenze locker)
  if (inv.invoiceNumber) {
    const inum = inv.invoiceNumber.toLowerCase();
    const memoLow = (tx.memo || '').toLowerCase();
    if (memoLow.includes(inum)) {
      score += 30;
      reasons.push(`Re-Nr „${inv.invoiceNumber}" im Memo`);
    } else {
      // Nur Zahlenteil ohne Prefix/Suffix
      const numOnly = inum.replace(/[^\d]/g, '');
      if (numOnly && numOnly.length >= 3 && memoLow.includes(numOnly)) {
        score += 15;
        reasons.push(`Re-Nr-Zahl „${numOnly}" im Memo`);
      }
    }
  }

  // Datum
  const invDate = new Date(inv.invoiceDate).getTime();
  const txDate = new Date(tx.bookingDate).getTime();
  const days = Math.abs(txDate - invDate) / (1000 * 60 * 60 * 24);
  if (days <= 30) {
    score += 20;
    reasons.push(`${Math.round(days)} Tag(e) nach Rechnung`);
  } else if (days <= 90) {
    score += 10;
    reasons.push(`${Math.round(days)} Tag(e) nach Rechnung`);
  }

  // Customer-Name im Memo oder Gegenpartei
  if (customerName) {
    const lowName = customerName.toLowerCase();
    const memoLow = (tx.memo || '').toLowerCase();
    const cpLow = (tx.counterparty || '').toLowerCase();
    if (memoLow.includes(lowName) || cpLow.includes(lowName)) {
      score += 10;
      reasons.push(`Kunde „${customerName}" erkannt`);
    } else {
      // Hauptnamenstoken (z.B. Firmen-Hauptname) prüfen
      const tokens = lowName.split(/[\s,.-]+/).filter((t) => t.length >= 4);
      for (const t of tokens) {
        if (memoLow.includes(t) || cpLow.includes(t)) {
          score += 5;
          reasons.push(`Namensteil „${t}" erkannt`);
          break;
        }
      }
    }
  }

  return { invoice: inv, score, reasons };
}

async function loadInvoiceWithItems(id: string): Promise<Invoice | undefined> {
  const inv = await repo(Invoice).findFirst({ id });
  if (!inv) return undefined;
  // Items via Relation laden
  const items = await (repo(Invoice) as any).relations(inv).items.find();
  (inv as any).items = items;
  return inv;
}

async function findMatchCandidates(
  tx: BankTransaction,
  openInvoices: Invoice[],
  customerNameById: Map<string, string>,
): Promise<MatchCandidate[]> {
  const cands: MatchCandidate[] = [];
  for (const inv of openInvoices) {
    const customerName = customerNameById.get(inv.customerId) ?? '';
    const c = matchScore(tx, inv, customerName);
    if (c.score >= 20) cands.push(c);
  }
  cands.sort((a, b) => b.score - a.score);
  return cands.slice(0, 5);
}

/**
 * Import: CAMT.053-XML als Text-Body (multipart wäre overkill für
 * den Use-Case). Frontend sendet als `text/xml`-Body via raw fetch.
 */
bank.post('/api/bank/import-camt',
  express.text({ type: ['application/xml', 'text/xml', 'application/octet-stream'], limit: '50mb' }),
  async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const xml = req.body as string;
    if (!xml || typeof xml !== 'string') {
      res.status(400).json({ error: 'Kein XML-Body erkannt. Content-Type application/xml senden.' });
      return;
    }

    let parsed;
    try {
      parsed = parseCamt053(xml);
    } catch (e: any) {
      const msg = e instanceof CamtParseError ? e.message : 'Parse-Fehler';
      res.status(400).json({ error: msg });
      return;
    }

    // Dedup gegen vorhandene txIds
    const txRepo = repo(BankTransaction);
    const existing = await txRepo.find({
      where: { txId: parsed.entries.map((e) => e.txId).filter(Boolean) as any },
    });
    const seen = new Set(existing.map((e) => e.txId));

    let imported = 0;
    let duplicates = 0;
    for (const entry of parsed.entries) {
      if (!entry.txId || seen.has(entry.txId)) {
        duplicates++;
        continue;
      }
      const tx = txRepo.create();
      tx.txId = entry.txId;
      tx.bookingDate = new Date(entry.bookingDate);
      tx.amount = entry.amount;
      tx.currency = entry.currency;
      tx.direction = entry.direction;
      tx.counterparty = entry.counterparty;
      tx.counterpartyIban = entry.counterpartyIban;
      tx.memo = entry.memo;
      tx.statementIban = entry.statementIban;
      tx.status = 'open';
      tx.sourceStatementId = parsed.statementId;
      await txRepo.save(tx);
      seen.add(entry.txId);
      imported++;
    }

    res.json({
      ok: true,
      statementId: parsed.statementId,
      statementIban: parsed.statementIban,
      total: parsed.entries.length,
      imported,
      duplicates,
    });
  },
);

/**
 * Liste aller offenen (status=open) credit-Transaktionen MIT Match-
 * Vorschlägen. Debits werden aktuell nicht gematcht (out-of-scope für
 * v1 — Eingangsrechnungen-Matching wäre Phase 14.1).
 */
bank.get('/api/bank/unmatched', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const openTx = await repo(BankTransaction).find({
    where: { status: 'open', direction: 'credit' },
    orderBy: { bookingDate: 'desc' as any },
  });

  // Offene (finalized + nicht bezahlt + nicht archiviert) Rechnungen
  const allInvoices = await repo(Invoice).find({
    where: { finalized: true, paid: false, archived: false },
  });
  // Items laden für gross/netTotal-Computed-Properties
  for (const inv of allInvoices) {
    try {
      const items = await (repo(Invoice) as any).relations(inv).items.find();
      (inv as any).items = items;
    } catch {
      (inv as any).items = [];
    }
  }

  // Customer-Namen vorab cachen
  const customerIds = Array.from(new Set(allInvoices.map((i) => i.customerId).filter(Boolean)));
  const nameById = new Map<string, string>();
  if (customerIds.length) {
    const [persons, companies] = await Promise.all([
      repo(Person).find({ where: { id: customerIds } }),
      repo(Company).find({ where: { id: customerIds } }),
    ]);
    for (const p of persons) nameById.set(p.id, p.displayName);
    for (const c of companies) nameById.set(c.id, c.displayName);
  }

  const rows = await Promise.all(
    openTx.map(async (tx) => {
      const cands = await findMatchCandidates(tx, allInvoices, nameById);
      return {
        id: tx.id,
        txId: tx.txId,
        bookingDate: tx.bookingDate,
        amount: tx.amount,
        currency: tx.currency,
        direction: tx.direction,
        counterparty: tx.counterparty,
        counterpartyIban: tx.counterpartyIban,
        memo: tx.memo,
        candidates: cands.map((c) => ({
          invoiceId: c.invoice.id,
          invoiceNumber: c.invoice.invoiceNumber,
          invoiceDate: c.invoice.invoiceDate,
          customerName: nameById.get(c.invoice.customerId) ?? '',
          grossTotal: (c.invoice as any).grossTotal ?? 0,
          score: c.score,
          reasons: c.reasons,
        })),
      };
    }),
  );

  res.json({ count: rows.length, transactions: rows });
});

/** Übersicht aller Banktransaktionen (paged) — inkl. matched + ignored. */
bank.get('/api/bank/transactions', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const limit = Math.min(parseInt(String(req.query['limit'] ?? '100'), 10) || 100, 500);
  const rows = await repo(BankTransaction).find({
    orderBy: { bookingDate: 'desc' as any },
    limit,
  });
  res.json({
    count: rows.length,
    rows: rows.map((tx) => ({
      id: tx.id,
      txId: tx.txId,
      bookingDate: tx.bookingDate,
      amount: tx.amount,
      currency: tx.currency,
      direction: tx.direction,
      counterparty: tx.counterparty,
      memo: tx.memo,
      status: tx.status,
      matchedInvoiceId: tx.matchedInvoiceId,
      matchedAt: tx.matchedAt,
    })),
  });
});

/** Confirm: User bestätigt Match → Invoice.paid=true + Tx.status=matched. */
bank.post('/api/bank/:txId/assign/:invoiceId', express.json(), async (req, res) => {
  const user = requireAdmin(req, res);
  if (!user) return;
  const { txId, invoiceId } = req.params;
  const tx = await repo(BankTransaction).findFirst({ id: txId });
  if (!tx) {
    res.status(404).json({ error: 'Bank-Transaktion nicht gefunden' });
    return;
  }
  if (tx.status !== 'open') {
    res.status(400).json({ error: `Tx-Status ist „${tx.status}", nicht „open"` });
    return;
  }
  const inv = await repo(Invoice).findFirst({ id: invoiceId });
  if (!inv) {
    res.status(404).json({ error: 'Rechnung nicht gefunden' });
    return;
  }
  if (inv.paid) {
    res.status(400).json({ error: 'Rechnung ist bereits als bezahlt markiert' });
    return;
  }

  // Tx → matched
  tx.status = 'matched';
  tx.matchedInvoiceId = inv.id;
  tx.matchedAt = new Date();
  tx.matchedByUserId = user.id;
  await repo(BankTransaction).save(tx);

  // Invoice → paid (paidAt = Buchungsdatum der Bank-Tx)
  inv.paid = true;
  inv.paidAt = new Date(tx.bookingDate);
  await repo(Invoice).save(inv);

  res.json({
    ok: true,
    txId: tx.id,
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    paidAt: inv.paidAt,
  });
});

/** Ignorieren: User sagt „diese Tx gehört zu keiner Rechnung". */
bank.post('/api/bank/:txId/ignore', express.json(), async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const tx = await repo(BankTransaction).findFirst({ id: req.params['txId']! });
  if (!tx) {
    res.status(404).json({ error: 'Bank-Transaktion nicht gefunden' });
    return;
  }
  if (tx.status === 'matched') {
    res.status(400).json({ error: 'Match-bestätigte Tx kann nicht ignoriert werden — vorher entkoppeln' });
    return;
  }
  tx.status = 'ignored';
  await repo(BankTransaction).save(tx);
  res.json({ ok: true });
});

/** Entkoppeln: Match aufheben (Tx → open, Invoice.paid bleibt stehen weil ggf. trotzdem korrekt). */
bank.post('/api/bank/:txId/unmatch', express.json(), async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const tx = await repo(BankTransaction).findFirst({ id: req.params['txId']! });
  if (!tx) {
    res.status(404).json({ error: 'Bank-Transaktion nicht gefunden' });
    return;
  }
  tx.status = 'open';
  tx.matchedInvoiceId = '';
  tx.matchedAt = null;
  tx.matchedByUserId = '';
  await repo(BankTransaction).save(tx);
  res.json({ ok: true });
});
