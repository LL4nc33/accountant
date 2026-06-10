/**
 * CAMT.053 (Bank-To-Customer-Statement) Mini-Parser
 *
 * Extrahiert pro Buchung (Ntry):
 *   - txId (AcctSvcrRef oder EndToEndId — eindeutig pro Bank-Transaktion)
 *   - bookingDate (BookgDt/Dt) als YYYY-MM-DD
 *   - amount (Ntry/Amt) als positive Zahl
 *   - currency (Amt[@Ccy])
 *   - direction ('credit'|'debit') aus CdtDbtInd
 *   - counterparty (DbtrNm/CdtrNm)
 *   - counterpartyIban (DbtrAcct/CdtrAcct/IBAN)
 *   - memo (RmtInf/Ustrd, mehrere Zeilen zusammengeführt)
 *   - statementIban (Acct/Id/IBAN — Konto auf dem die Buchung steht)
 *
 * Verzichtet bewusst auf eine XML-Library — CAMT.053 hat deterministische
 * Tag-Struktur, und ein gepflegter Regex-Parser ist hier robust + zero-dep.
 * Akzeptiert sowohl camt.053.001.02 (klassisch SEPA) als auch .001.08.
 */

export interface CamtEntry {
  txId: string;
  bookingDate: string; // YYYY-MM-DD
  amount: number; // positiv
  currency: string;
  direction: 'credit' | 'debit';
  counterparty: string;
  counterpartyIban: string;
  memo: string;
  statementIban: string;
}

export interface CamtParseResult {
  statementId: string;
  statementIban: string;
  statementCreatedAt: string;
  entries: CamtEntry[];
}

export class CamtParseError extends Error {}

/**
 * Holt alle Vorkommen von Tag `<Name>...</Name>` (egal welche Children
 * dazwischen). Tag-Namen sind Namespace-tolerant: wir matchen am localname
 * indem wir optional `prefix:` davor erlauben.
 */
function findAll(xml: string, tagName: string): string[] {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${tagName}>`,
    'g',
  );
  const out: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1]!);
  }
  return out;
}

function findFirst(xml: string, tagName: string): string | null {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${tagName}>`,
  );
  const m = re.exec(xml);
  return m ? m[1]! : null;
}

/** Liest Attributs-Wert aus offenem Tag. Nutzt findOpenTag um den Tag zu finden. */
function attrOf(xml: string, tagName: string, attr: string): string | null {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${tagName}\\b[^>]*\\b${attr}\\s*=\\s*"([^"]*)"`,
  );
  const m = re.exec(xml);
  return m ? m[1]! : null;
}

function text(s: string | null): string {
  if (!s) return '';
  // Trim + Entity-Decode (nur die SEPA-gängigen Entities; CAMT-XML ist
  // streng UTF-8 ohne exotische HTML-Entities).
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function num(s: string | null): number {
  if (!s) return 0;
  return parseFloat(s.replace(',', '.'));
}

function isoDate(s: string | null): string {
  if (!s) return '';
  // CAMT liefert Datums-Strings als YYYY-MM-DD oder als
  // YYYY-MM-DDTHH:MM:SS — wir reduzieren auf den Date-Teil.
  return s.trim().substring(0, 10);
}

/**
 * Parst RmtInf — die freitexte Verwendungszweck-Sektion. Mehrere <Ustrd>
 * werden mit Leerzeichen verbunden. Strukturierte RmtInf (Strd-Block)
 * wird best-effort dazugepackt (Creditor Reference, EndToEndId etc.).
 */
function extractMemo(txDtls: string): string {
  const rmtInf = findFirst(txDtls, 'RmtInf') ?? '';
  if (!rmtInf) return '';
  const unstrd = findAll(rmtInf, 'Ustrd').map(text).filter(Boolean);
  const refs: string[] = [];
  const strd = findFirst(rmtInf, 'Strd');
  if (strd) {
    const credRef = findFirst(strd, 'CdtrRefInf');
    if (credRef) {
      const ref = findFirst(credRef, 'Ref');
      if (ref) refs.push(text(ref));
    }
  }
  return [...unstrd, ...refs].join(' ').trim();
}

function extractTxId(txDtls: string): string {
  const refs = findFirst(txDtls, 'Refs') ?? '';
  // Priorität: AcctSvcrRef → EndToEndId → InstrId → TxId
  for (const tag of ['AcctSvcrRef', 'EndToEndId', 'InstrId', 'TxId']) {
    const v = findFirst(refs, tag);
    if (v) return text(v);
  }
  return '';
}

function extractCounterparty(
  txDtls: string,
  direction: 'credit' | 'debit',
): { name: string; iban: string } {
  const rltdPties = findFirst(txDtls, 'RltdPties') ?? '';
  // Beim Kredit (Geldeingang) = Debitor (zahlender Kunde)
  // Beim Debit (Geldausgang) = Kreditor (Empfänger der Zahlung)
  const partyTag = direction === 'credit' ? 'Dbtr' : 'Cdtr';
  const acctTag = direction === 'credit' ? 'DbtrAcct' : 'CdtrAcct';

  const party = findFirst(rltdPties, partyTag) ?? '';
  const name = text(findFirst(party, 'Nm'));

  const acct = findFirst(rltdPties, acctTag) ?? '';
  const acctId = findFirst(acct, 'Id') ?? '';
  const iban = text(findFirst(acctId, 'IBAN'));

  return { name, iban };
}

export function parseCamt053(xml: string): CamtParseResult {
  if (!xml || !xml.includes('<')) {
    throw new CamtParseError('Leeres oder kein XML');
  }
  if (!/camt[._]053/i.test(xml)) {
    // Bewusst weich — wir parsen trotzdem, aber loggen einen Hinweis.
    // Manche Banken liefern CAMT.053 ohne den Namespace im Header.
    console.warn('[camt] Kein camt.053-Namespace gefunden, parse trotzdem');
  }

  const stmt = findFirst(xml, 'Stmt');
  if (!stmt) {
    throw new CamtParseError('Kein <Stmt>-Block gefunden — ist das wirklich CAMT.053?');
  }

  const statementId = text(findFirst(stmt, 'Id'));
  const statementCreatedAt = text(findFirst(stmt, 'CreDtTm'));
  const acct = findFirst(stmt, 'Acct') ?? '';
  const acctId = findFirst(acct, 'Id') ?? '';
  const statementIban = text(findFirst(acctId, 'IBAN'));

  const ntries = findAll(stmt, 'Ntry');
  const entries: CamtEntry[] = [];

  for (const ntry of ntries) {
    const amount = num(findFirst(ntry, 'Amt'));
    const currency = attrOf(ntry, 'Amt', 'Ccy') ?? 'EUR';
    const cdtDbt = text(findFirst(ntry, 'CdtDbtInd')).toUpperCase();
    const direction: 'credit' | 'debit' = cdtDbt === 'DBIT' ? 'debit' : 'credit';
    const bookgBlock = findFirst(ntry, 'BookgDt') ?? '';
    const bookingDate = isoDate(findFirst(bookgBlock, 'Dt'));

    // TxDtls kann es 1 oder N mal geben — bei Sammelbuchungen mehrere.
    // Wir flatten das: pro TxDtls eine Entry-Zeile.
    const ntryDtls = findAll(ntry, 'NtryDtls');
    let txDtlsList: string[] = [];
    for (const nd of ntryDtls) {
      txDtlsList.push(...findAll(nd, 'TxDtls'));
    }
    if (txDtlsList.length === 0) {
      // Bank liefert Ntry ohne TxDtls — z.B. Spesen-Pauschalen.
      // Wir erzeugen eine synthetische Entry aus dem Ntry-Block selbst.
      txDtlsList = [ntry];
    }

    for (const tx of txDtlsList) {
      let txId = extractTxId(tx);
      if (!txId) {
        // Fallback: aus Datum + Betrag + memo Hash bauen
        const memo = extractMemo(tx);
        txId = `synth-${bookingDate}-${amount}-${memo.substring(0, 20)}`;
      }
      const memo = extractMemo(tx);
      const cp = extractCounterparty(tx, direction);
      entries.push({
        txId,
        bookingDate,
        amount: Math.abs(amount),
        currency,
        direction,
        counterparty: cp.name,
        counterpartyIban: cp.iban,
        memo,
        statementIban,
      });
    }
  }

  return {
    statementId,
    statementIban,
    statementCreatedAt,
    entries,
  };
}
