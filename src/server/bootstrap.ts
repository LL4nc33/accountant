import { remult } from 'remult';
import * as path from 'path';
import { bootstrapNumberRanges } from '../shared/entities/number-range';
import { bootstrapFirstAdminUser } from '../shared/entities/user';
import { bootstrapCompanySettings } from '../shared/entities/company-settings';
import { Address } from '../shared/entities/address';
import { isEU, allCountries } from '../shared/entities/country';
import { migrateJsonToSqliteIfNeeded } from './migrate-json-to-sqlite';
import { bootstrapDemoData } from './demo-seed';

const COUNTRY_ALIASES: Record<string, string> = {
  'OESTERREICH': 'AT', 'ÖSTERREICH': 'AT', 'AUSTRIA': 'AT', 'A': 'AT',
  'DEUTSCHLAND': 'DE', 'GERMANY': 'DE', 'D': 'DE',
  'SCHWEIZ': 'CH', 'SWITZERLAND': 'CH', 'SUISSE': 'CH',
  'ITALIEN': 'IT', 'ITALIA': 'IT', 'ITALY': 'IT',
  'FRANKREICH': 'FR', 'FRANCE': 'FR',
  'SPANIEN': 'ES', 'SPAIN': 'ES', 'ESPAÑA': 'ES',
  'NIEDERLANDE': 'NL', 'HOLLAND': 'NL', 'NL': 'NL',
  'GROSSBRITANNIEN': 'GB', 'UK': 'GB', 'UNITED KINGDOM': 'GB',
  'USA': 'US', 'AMERIKA': 'US', 'UNITED STATES': 'US',
};

async function migrateAddressCountries() {
  const repo = remult.repo(Address);
  const all = await repo.find();
  let migrated = 0;
  for (const addr of all) {
    const raw = (addr.country ?? '').toString().trim().toUpperCase();
    if (!raw) continue;
    if ((allCountries as readonly string[]).includes(raw)) continue; // already ISO

    const mapped = COUNTRY_ALIASES[raw];
    if (mapped && mapped !== addr.country) {
      addr.country = mapped;
      await repo.save(addr);
      migrated++;
    }
  }
  if (migrated > 0) {
    console.log(`[bootstrap] migrated ${migrated} Address.country values to ISO-3166`);
  }
}

export async function bootstrap() {
  const dataDir = process.env['DATA_DIR'] ?? './data';
  const dbDir = path.join(dataDir, 'db');
  await migrateJsonToSqliteIfNeeded(dbDir);
  await bootstrapNumberRanges();
  await bootstrapFirstAdminUser();
  await bootstrapCompanySettings();
  await migrateAddressCountries();
  await bootstrapDemoData();
}
