// src/server/api.ts

import { hash } from 'bcryptjs';
import * as express from 'express';
import { KnexDataProvider } from 'remult/remult-knex';
import { remultExpress } from 'remult/remult-express';
import knexFactory from 'knex';
import * as fs from 'fs';
import * as path from 'path';
import { Customer } from '../shared/entities/customer';
import { User } from '../shared/entities/user';
import { initSearch } from './search';
import { Address } from '../shared/entities/address';
import { Company } from '../shared/entities/company';
import { Person } from '../shared/entities/person';
import { NumberRange } from '../shared/entities/number-range';
import { bootstrap } from './bootstrap';
import { Invoice } from '../shared/entities/invoice';
import { InvoiceItem } from '../shared/entities/invoice-item';
import { CompanySettings } from '../shared/entities/company-settings';
import { VatIdCheck } from '../shared/entities/vat-id-check';
import { Project } from '../shared/entities/project';
import { TimeEntry } from '../shared/entities/time-entry';
import { Product } from '../shared/entities/product';
import { AuditLog } from '../shared/entities/audit-log';
import { Expense } from '../shared/entities/expense';
import { RecurringInvoice } from '../shared/entities/recurring-invoice';
import { Reminder } from '../shared/entities/reminder';
import { BankTransaction } from '../shared/entities/bank-transaction';
import { Offer } from '../shared/entities/offer';
import { OfferItem } from '../shared/entities/offer-item';
import { Conversation } from '../shared/entities/conversation';
import { Tag } from '../shared/entities/tag';
import { CustomerNote } from '../shared/entities/customer-note';
import { Asset } from '../shared/entities/asset';
import { TravelExpense } from '../shared/entities/travel-expense';
import { CashbookEntry } from '../shared/entities/cashbook-entry';
import { AgentMemory } from '../shared/entities/agent-memory';
// Side-effect Import: wires up `auditProxy.log` zum echten Writer.
import './audit';

const DATA_DIR = process.env['DATA_DIR'] ?? './data';
const DB_DIR = path.join(DATA_DIR, 'db');

// SQLite-File. Verzeichnis vorher anlegen — sonst meckert better-sqlite3 beim Open.
fs.mkdirSync(DB_DIR, { recursive: true });
const SQLITE_PATH = path.join(DB_DIR, 'accountant.sqlite');

// Migration: bis v0.48.x hiess die DB-Datei `on-accountant.sqlite`. Existiert
// die alte Datei und die neue noch nicht, benennen wir sie (samt WAL/SHM) um —
// bestehende Installationen behalten so ihre Daten ohne manuellen Eingriff.
{
  const legacy = path.join(DB_DIR, 'on-accountant.sqlite');
  if (fs.existsSync(legacy) && !fs.existsSync(SQLITE_PATH)) {
    try {
      for (const ext of ['', '-wal', '-shm']) {
        if (fs.existsSync(legacy + ext)) fs.renameSync(legacy + ext, SQLITE_PATH + ext);
      }
      console.log('DB-Datei migriert: on-accountant.sqlite -> accountant.sqlite');
    } catch (e) {
      console.error('DB-Migration fehlgeschlagen, nutze bestehende Datei:', e);
    }
  }
}

export const api = remultExpress({
  dataProvider: async () => {
    const knex = knexFactory({
      client: 'better-sqlite3',
      connection: { filename: SQLITE_PATH },
      useNullAsDefault: true,
    });
    return new KnexDataProvider(knex);
  },
  getUser: (req: express.Request) => (req.session as any)!['user'],
  entities: [User, Person, Company, Address, NumberRange, Invoice, InvoiceItem, CompanySettings, VatIdCheck, Project, TimeEntry, Product, AuditLog, Expense, RecurringInvoice, Reminder, BankTransaction, Offer, OfferItem, Conversation, Tag, CustomerNote, Asset, TravelExpense, CashbookEntry, AgentMemory],
  admin: true,
  initApi: async () => {
    console.log('initApi');
    try {
      await bootstrap();
      await initSearch();
    } catch (e) {
      console.error(e);
    }
  },
});

User.hash = (password: string) => hash(password, 10);
