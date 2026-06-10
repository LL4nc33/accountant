/**
 * Einmalige Migration: Bestand aus JsonEntityFileStorage (data/db/<entity>.json)
 * in die neue SQLite-DB einlesen. Läuft beim Server-Start, prüft selbst ob
 * Migration nötig ist:
 *   - SQLite-Tabelle leer UND zugehörige JSON-Datei existiert → migrieren.
 * Nach erfolgreicher Migration werden die JSON-Dateien NICHT gelöscht, sondern
 * in data/db/legacy-json-backup/ verschoben. Damit ist Rollback möglich
 * (SQLite löschen → JSON zurück verschieben → alten Provider verwenden).
 */
import { remult } from 'remult';
import * as fs from 'fs';
import * as path from 'path';
import { Address } from '../shared/entities/address';
import { Company } from '../shared/entities/company';
import { CompanySettings } from '../shared/entities/company-settings';
import { Invoice } from '../shared/entities/invoice';
import { InvoiceItem } from '../shared/entities/invoice-item';
import { NumberRange } from '../shared/entities/number-range';
import { Person } from '../shared/entities/person';
import { Product } from '../shared/entities/product';
import { Project } from '../shared/entities/project';
import { TimeEntry } from '../shared/entities/time-entry';
import { User } from '../shared/entities/user';
import { VatIdCheck } from '../shared/entities/vat-id-check';

/**
 * Mapping JSON-Dateiname → Entity-Klasse.
 * Die JSON-Dateinamen müssen genau dem entsprechen, was JsonEntityFileStorage
 * früher angelegt hat — das ist die Remult-Entity-`key`.
 */
const ENTITY_MAP: Array<[string, any]> = [
  ['user', User],
  ['persons', Person],
  ['companys', Company],
  ['addresses', Address],
  ['numberrange', NumberRange],
  ['invoices', Invoice],
  ['invoice-items', InvoiceItem],
  ['company-settings', CompanySettings],
  ['vat-id-check', VatIdCheck],
  ['project', Project],
  ['time-entry', TimeEntry],
  ['products', Product],
];

export async function migrateJsonToSqliteIfNeeded(dbDir: string): Promise<void> {
  const backupDir = path.join(dbDir, 'legacy-json-backup');
  let migratedAny = false;

  for (const [jsonName, entityClass] of ENTITY_MAP) {
    const jsonPath = path.join(dbDir, `${jsonName}.json`);
    if (!fs.existsSync(jsonPath)) continue;

    const repo = remult.repo(entityClass);
    const existingCount = await repo.count();
    if (existingCount > 0) {
      // SQLite hat schon Daten — nichts zu tun. JSON nur ins Backup wenn nicht
      // schon dort, damit das Layout sauber bleibt.
      await moveToBackup(jsonPath, backupDir);
      continue;
    }

    let rows: any[];
    try {
      const raw = fs.readFileSync(jsonPath, 'utf8');
      rows = JSON.parse(raw);
      if (!Array.isArray(rows)) {
        console.warn(`[migrate] ${jsonName}.json ist kein Array — übersprungen.`);
        continue;
      }
    } catch (e) {
      console.error(`[migrate] ${jsonName}.json kann nicht gelesen werden:`, e);
      continue;
    }

    let inserted = 0;
    for (const row of rows) {
      try {
        // Date-Strings → Date-Objekte (Remult-Insert akzeptiert beides aber
        // konvertieren reduziert Type-Issues mit better-sqlite3).
        const cleaned: any = {};
        for (const [key, val] of Object.entries(row)) {
          if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
            cleaned[key] = new Date(val);
          } else {
            cleaned[key] = val;
          }
        }
        await repo.insert(cleaned);
        inserted++;
      } catch (e: any) {
        console.warn(
          `[migrate] ${jsonName} Eintrag konnte nicht migriert werden:`,
          e?.message ?? e,
        );
      }
    }
    console.log(`[migrate] ${jsonName}: ${inserted}/${rows.length} eingelesen.`);
    if (inserted > 0) migratedAny = true;

    await moveToBackup(jsonPath, backupDir);
  }

  if (migratedAny) {
    console.log(`[migrate] JSON → SQLite Migration abgeschlossen. Backup in ${backupDir}/`);
  }
}

async function moveToBackup(jsonPath: string, backupDir: string): Promise<void> {
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    const dest = path.join(backupDir, path.basename(jsonPath));
    fs.renameSync(jsonPath, dest);
  } catch (e) {
    console.warn(`[migrate] konnte ${jsonPath} nicht ins Backup verschieben:`, e);
  }
}
