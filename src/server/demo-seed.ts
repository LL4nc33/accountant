/**
 * Demo-Seed (v0.17.x)
 *
 * Wenn `OA_DEMO_DATA=true` als Env-Var gesetzt ist UND in der DB keine
 * Personen / Firmen / Rechnungen existieren, wird beim Bootstrap eine
 * spielbare Demo-Datenbasis angelegt:
 *
 *  - 3 Personen + 2 Firmen mit ISO-Adressen
 *  - 2 Produkte (Beratungsstunde, Workshop-Tag)
 *  - 2 Projekte mit Stundenrate
 *  - 5 Rechnungen (Mix: Entwurf / festgeschrieben+bezahlt / festgeschrieben+offen / Storno)
 *  - 3 Time-Entries
 *  - 1 Expense
 *
 * Gedacht für Dev/Test/Demo. NIE in Production aktivieren.
 */
import { remult } from 'remult';
import { Person } from '../shared/entities/person';
import { Company } from '../shared/entities/company';
import { Address } from '../shared/entities/address';
import { Invoice } from '../shared/entities/invoice';
import { InvoiceItem } from '../shared/entities/invoice-item';
import { Product } from '../shared/entities/product';
import { Project } from '../shared/entities/project';
import { TimeEntry } from '../shared/entities/time-entry';
import { Expense } from '../shared/entities/expense';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}

export async function bootstrapDemoData(): Promise<void> {
  if (process.env['OA_DEMO_DATA'] !== 'true') return;

  const [personCount, companyCount, invoiceCount] = await Promise.all([
    remult.repo(Person).count(),
    remult.repo(Company).count(),
    remult.repo(Invoice).count(),
  ]);
  if (personCount > 0 || companyCount > 0 || invoiceCount > 0) {
    console.log(
      `[demo-seed] DB bereits gefüllt (persons=${personCount} companies=${companyCount} invoices=${invoiceCount}), kein Seed.`,
    );
    return;
  }

  console.warn('⚠ OA_DEMO_DATA=true — lege Demo-Datensatz an. NIE in Production!');

  // ── Personen ──────────────────────────────────────────────────
  const persons: Person[] = [];
  for (const seed of [
    { firstname: 'Max', lastname: 'Mustermann', email: 'max@mustermann.example' },
    { firstname: 'Maria', lastname: 'Beispiel', email: 'maria@beispiel.example' },
    { firstname: 'Test', lastname: 'Test', email: '' },
  ]) {
    const p = remult.repo(Person).create();
    p.firstname = seed.firstname;
    p.lastname = seed.lastname;
    p.email = seed.email;
    p.salutation = seed.firstname.endsWith('a') ? 'Frau' : 'Herr';
    const saved = await remult.repo(Person).save(p);
    persons.push(saved);
  }

  // ── Firmen ────────────────────────────────────────────────────
  const companies: Company[] = [];
  for (const seed of [
    { name: 'Müller Beratung GmbH', vatId: 'ATU12345678', email: 'office@mueller-beratung.example' },
    { name: 'Schmid IT Solutions GmbH', vatId: 'ATU87654321', email: 'kontakt@schmid-it.example' },
  ]) {
    const c = remult.repo(Company).create();
    c.name = seed.name;
    c.vatId = seed.vatId;
    c.email = seed.email;
    const saved = await remult.repo(Company).save(c);
    companies.push(saved);
  }

  // ── Adressen ──────────────────────────────────────────────────
  const addresses: Array<{ customerId: string; street: string; zip: string; city: string; country: string }> = [
    { customerId: persons[0]!.id, street: 'Beispielstraße 1', zip: '1010', city: 'Wien', country: 'AT' },
    { customerId: persons[1]!.id, street: 'Hauptstraße 42', zip: '8010', city: 'Graz', country: 'AT' },
    { customerId: persons[2]!.id, street: 'Teststraße 99', zip: '5020', city: 'Salzburg', country: 'AT' },
    { customerId: companies[0]!.id, street: 'Mariahilferstraße 100', zip: '1060', city: 'Wien', country: 'AT' },
    { customerId: companies[1]!.id, street: 'Münchner Bundesstraße 7', zip: '5020', city: 'Salzburg', country: 'AT' },
  ];
  for (const a of addresses) {
    const ad = remult.repo(Address).create();
    ad.customerId = a.customerId;
    ad.street = a.street;
    ad.zip = a.zip;
    ad.city = a.city;
    ad.country = a.country;
    ad.addressType = 'Rechnungsanschrift';
    await remult.repo(Address).save(ad);
  }

  // ── Produkte ──────────────────────────────────────────────────
  const products: Product[] = [];
  for (const seed of [
    { name: 'Beratungsstunde', description: 'Beratung nach Aufwand', defaultPrice: 90, defaultVat: 20, unit: 'h' as const },
    { name: 'Workshop Tag', description: 'Ganztägiger Workshop', defaultPrice: 1200, defaultVat: 20, unit: 'Pauschal' as const },
  ]) {
    const p = remult.repo(Product).create();
    p.name = seed.name;
    p.description = seed.description;
    p.defaultPrice = seed.defaultPrice;
    p.defaultVat = seed.defaultVat;
    p.unit = seed.unit;
    products.push(await remult.repo(Product).save(p));
  }

  // ── Projekte (1 pro Firma) ────────────────────────────────────
  const projects: Project[] = [];
  for (const seed of [
    { customerId: companies[0]!.id, name: 'Müller-Webseite Relaunch', hourlyRate: 95 },
    { customerId: companies[1]!.id, name: 'Schmid-Inventarisierung', hourlyRate: 110 },
  ]) {
    const p = remult.repo(Project).create();
    p.customerId = seed.customerId;
    p.name = seed.name;
    p.hourlyRate = seed.hourlyRate;
    p.status = 'active';
    projects.push(await remult.repo(Project).save(p));
  }

  // ── Time-Entries (3 offene, projektbezogen) ───────────────────
  for (const seed of [
    { projectId: projects[0]!.id, date: daysAgo(15), hours: 4, description: 'Wireframes erstellt' },
    { projectId: projects[0]!.id, date: daysAgo(10), hours: 6, description: 'Frontend-Implementierung' },
    { projectId: projects[1]!.id, date: daysAgo(7), hours: 3, description: 'Erste Inventarliste' },
  ]) {
    const te = remult.repo(TimeEntry).create();
    te.projectId = seed.projectId;
    te.date = seed.date;
    te.hours = seed.hours;
    te.description = seed.description;
    await remult.repo(TimeEntry).save(te);
  }

  // ── Rechnungen ────────────────────────────────────────────────
  // Mix:
  //   #1 Festgeschrieben + bezahlt (vor 60 Tagen)
  //   #2 Festgeschrieben + bezahlt (vor 30 Tagen)
  //   #3 Festgeschrieben + offen + überfällig (vor 45 Tagen, Zahlungsziel 14)
  //   #4 Festgeschrieben + offen + nicht überfällig (vor 5 Tagen)
  //   #5 Entwurf (heute)
  const invoiceSeeds = [
    { customerId: companies[0]!.id, customerName: 'Müller Beratung GmbH',
      addr: 'Müller Beratung GmbH\nMariahilferstraße 100\n1060 Wien\nAT',
      subject: 'Beratung März', daysAgo: 60, daysPaid: 50,
      items: [{ name: 'Beratungsstunde', quantity: 8, price: 90, vat: 20 }],
      finalized: true, paid: true },
    { customerId: persons[1]!.id, customerName: 'Maria Beispiel',
      addr: 'Maria Beispiel\nHauptstraße 42\n8010 Graz\nAT',
      subject: 'Workshop Konzeption', daysAgo: 30, daysPaid: 20,
      items: [{ name: 'Workshop Tag', quantity: 1, price: 1200, vat: 20 }],
      finalized: true, paid: true },
    { customerId: companies[1]!.id, customerName: 'Schmid IT Solutions GmbH',
      addr: 'Schmid IT Solutions GmbH\nMünchner Bundesstraße 7\n5020 Salzburg\nAT',
      subject: 'Erste Inventur', daysAgo: 45,
      items: [
        { name: 'Beratungsstunde', quantity: 3, price: 110, vat: 20 },
        { name: 'Aufwand-Pauschale', quantity: 1, price: 150, vat: 20 },
      ],
      finalized: true, paid: false },
    { customerId: persons[0]!.id, customerName: 'Max Mustermann',
      addr: 'Max Mustermann\nBeispielstraße 1\n1010 Wien\nAT',
      subject: 'Coaching April', daysAgo: 5,
      items: [{ name: 'Beratungsstunde', quantity: 4, price: 90, vat: 20 }],
      finalized: true, paid: false },
    { customerId: companies[0]!.id, customerName: 'Müller Beratung GmbH',
      addr: 'Müller Beratung GmbH\nMariahilferstraße 100\n1060 Wien\nAT',
      subject: 'Beratung Mai (Entwurf)', daysAgo: 0,
      items: [{ name: 'Beratungsstunde', quantity: 2, price: 90, vat: 20 }],
      finalized: false, paid: false },
  ];

  for (const seed of invoiceSeeds) {
    const inv = remult.repo(Invoice).create();
    inv.customerId = seed.customerId;
    inv.address = seed.addr;
    inv.subject = seed.subject;
    inv.invoiceDate = daysAgo(seed.daysAgo);
    inv.vatType = 'Netto';
    inv.paymentTermsDays = 14;
    inv.isB2B = !!companies.find((c) => c.id === seed.customerId);
    const savedInv = await remult.repo(Invoice).save(inv);
    for (const it of seed.items) {
      const ii = remult.repo(InvoiceItem).create();
      ii.invoiceId = savedInv.id;
      ii.name = it.name;
      ii.quantity = it.quantity;
      ii.price = it.price;
      ii.vat = it.vat;
      ii.amountType = it.name.includes('Stunde') ? 'Std' : (it.name.includes('Tag') ? 'Tag(e)' : 'Stk');
      await remult.repo(InvoiceItem).save(ii);
    }
    if (seed.finalized) {
      savedInv.finalized = true;
      savedInv.finalizedAt = inv.invoiceDate;
      if (seed.paid) {
        savedInv.paid = true;
        savedInv.paidAt = daysAgo(seed.daysPaid ?? 0);
      }
      await remult.repo(Invoice).save(savedInv);
    }
  }

  // ── 1 Beispiel-Expense ────────────────────────────────────────
  const ex = remult.repo(Expense).create();
  ex.date = daysAgo(20);
  ex.vendor = 'A1 Telekom Austria AG';
  ex.reference = 'AR-2026-05-001';
  ex.category = 'Telefon / Internet';
  ex.description = 'Mobilfunk Mai 2026';
  ex.netTotal = 39.92;
  ex.vatRate = 20;
  ex.grossTotal = 47.90;
  ex.paymentStatus = 'bezahlt';
  ex.paidAt = daysAgo(18);
  await remult.repo(Expense).save(ex);

  console.log(
    `[demo-seed] erfolgreich angelegt: ${persons.length} Personen, ${companies.length} Firmen, ` +
    `${invoiceSeeds.length} Rechnungen, ${products.length} Produkte, ${projects.length} Projekte`,
  );
}
