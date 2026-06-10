import express, { Router } from 'express';
import { remult } from 'remult';
import { api } from './api';
import { VatIdCheck } from '../shared/entities/vat-id-check';
import { Person } from '../shared/entities/person';
import { Company } from '../shared/entities/company';

export const vies = Router();
vies.use(express.json());
vies.use(api.withRemult);

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Persists vatIdVerifiedAt + vatIdVerifiedName onto the customer record.
 * Runs server-side so the `allowApiUpdate: ['admin']` field-level restriction
 * is not enforced on the API surface — instead Remult's `getUser` decides
 * whether the request has the 'admin' role. Returns true on success.
 */
async function persistVerificationOnCustomer(
  customerId: string,
  customerType: 'person' | 'company' | undefined,
  checkedAt: Date,
  returnedName: string
): Promise<boolean> {
  try {
    if (customerType === 'person') {
      const personRepo = remult.repo(Person);
      const person = await personRepo.findFirst({ id: customerId });
      if (!person) return false;
      person.vatIdVerifiedAt = checkedAt;
      person.vatIdVerifiedName = returnedName;
      await personRepo.save(person);
      return true;
    }
    if (customerType === 'company') {
      const companyRepo = remult.repo(Company);
      const company = await companyRepo.findFirst({ id: customerId });
      if (!company) return false;
      company.vatIdVerifiedAt = checkedAt;
      company.vatIdVerifiedName = returnedName;
      await companyRepo.save(company);
      return true;
    }
    return false;
  } catch {
    // Role gate or other failure — silently skip persistence; the VIES result
    // itself is still returned to the caller, which is a valid outcome.
    return false;
  }
}

vies.post('/api/vies/check', async (req, res) => {
  const sessionUser = (req.session as any)?.user;
  if (!sessionUser) {
    res.status(401).send('Unauthorized');
    return;
  }
  const { vatId, customerId, customerType } = (req.body ?? {}) as {
    vatId?: string;
    customerId?: string;
    customerType?: 'person' | 'company';
  };
  if (!vatId || vatId.length < 3) {
    res.status(400).json({ error: 'vatId required (min 3 chars including country code)' });
    return;
  }
  const normalized = vatId.toUpperCase().replace(/[\s.-]/g, '');
  const cc = normalized.slice(0, 2);
  // VIES expects the VAT-number-part as stored in the EU registry, including any
  // intermediate letter (e.g. AT registers 'U12345678'; AT/vat/U12345678 is correct).
  const num = normalized.slice(2);

  const repo = remult.repo(VatIdCheck);
  const cached = await repo.findFirst({ vatId: normalized });
  // Only serve the cache if the cached result was a positive validation.
  // Invalid results are never cached — re-check against VIES every time so
  // newly-registered UIDs aren't stuck in a 30-day false-negative window.
  if (cached && cached.valid && cached.checkedAt && (Date.now() - cached.checkedAt.getTime()) < CACHE_TTL_MS) {
    if (customerId) {
      await persistVerificationOnCustomer(
        customerId,
        customerType,
        cached.checkedAt,
        cached.returnedName
      );
    }
    res.json({
      cached: true,
      vatId: cached.vatId,
      valid: cached.valid,
      returnedName: cached.returnedName,
      checkedAt: cached.checkedAt,
    });
    return;
  }

  const url = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${cc}/vat/${encodeURIComponent(num)}`;

  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      res.status(503).json({ error: `VIES responded ${r.status}` });
      return;
    }
    const data: any = await r.json();
    const record = cached ?? repo.create();
    record.vatId = normalized;
    record.checkedAt = new Date();
    record.valid = !!data.isValid;
    record.returnedName = (data.name ?? '').trim();
    record.returnedAddress = (data.address ?? '').trim();
    record.rawResponse = JSON.stringify(data);
    await repo.save(record);
    if (customerId && record.valid) {
      await persistVerificationOnCustomer(
        customerId,
        customerType,
        record.checkedAt,
        record.returnedName
      );
    }
    res.json({
      cached: false,
      vatId: record.vatId,
      valid: record.valid,
      returnedName: record.returnedName,
      checkedAt: record.checkedAt,
    });
  } catch (e: any) {
    res.status(503).json({ error: 'VIES not reachable', detail: e?.message ?? String(e) });
  }
});
