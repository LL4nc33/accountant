import { Fields } from 'remult';
import { Base } from './base';
import { SearchableEntity } from './searchable-entity';
import { auditProxy } from './audit-proxy';

export const bankTxDirections = ['credit', 'debit'] as const;
export type BankTxDirection = (typeof bankTxDirections)[number];

export const bankTxStatuses = ['open', 'matched', 'ignored'] as const;
export type BankTxStatus = (typeof bankTxStatuses)[number];

/**
 * Bank-Transaktion aus einem CAMT.053-Import. Eindeutig per `txId`
 * (AcctSvcrRef oder EndToEndId der Bank). Bei Re-Import desselben
 * Statements wird über `txId` dedupliziert — keine Doppel-Buchung.
 *
 * Match-Workflow:
 *  - open: noch nicht zugewiesen
 *  - matched: an Invoice gebunden, paid+paidAt sind dort gesetzt
 *  - ignored: vom User explizit ausgeblendet (z.B. Eigenbuchung,
 *    Spesen, private Überweisung)
 */
@SearchableEntity(BankTransaction, 'bank-transactions', {
  allowApiCrud: ['admin'],
  searchFields: ['txId', 'counterparty', 'memo', 'matchedInvoiceId'],
  saved: async (entity, e) => {
    await auditProxy.log(
      e.isNew ? 'create' : 'update',
      'BankTransaction',
      entity.id,
      {
        txId: entity.txId,
        amount: entity.amount,
        direction: entity.direction,
        status: entity.status,
        matchedInvoiceId: entity.matchedInvoiceId,
      },
    );
  },
  deleted: async (entity) => {
    await auditProxy.log('delete', 'BankTransaction', entity.id, {
      txId: entity.txId,
    });
  },
})
export class BankTransaction extends Base {
  /** Eindeutige Transaktions-ID aus dem CAMT-Statement (AcctSvcrRef etc.). */
  @Fields.string({ caption: 'Tx-ID (CAMT)' })
  txId = '';

  @Fields.dateOnly({ caption: 'Buchungsdatum' })
  bookingDate = new Date();

  @Fields.number({ caption: 'Betrag' })
  amount = 0;

  @Fields.string({ caption: 'Währung' })
  currency = 'EUR';

  @Fields.literal(() => bankTxDirections, { caption: 'Richtung' })
  direction: BankTxDirection = 'credit';

  @Fields.string({ caption: 'Gegenpartei' })
  counterparty = '';

  @Fields.string({ caption: 'Gegenpartei IBAN' })
  counterpartyIban = '';

  @Fields.string({ caption: 'Verwendungszweck', inputType: 'multiline' })
  memo = '';

  @Fields.string({ caption: 'Statement IBAN (eigenes Konto)' })
  statementIban = '';

  @Fields.literal(() => bankTxStatuses, { caption: 'Status' })
  status: BankTxStatus = 'open';

  @Fields.string({ caption: 'Verknüpfte Rechnungs-ID' })
  matchedInvoiceId = '';

  @Fields.date({ caption: 'Verknüpft am', allowNull: true })
  matchedAt: Date | null = null;

  @Fields.string({ caption: 'Verknüpft von User-ID' })
  matchedByUserId = '';

  @Fields.string({ caption: 'Statement-Quelle' })
  sourceStatementId = '';
}
