import { validateVatId, normalizeVatId } from './vat-id';

describe('validateVatId', () => {
  it('accepts valid AT UID ATU12345678', () => {
    expect(validateVatId('ATU12345678', 'AT').ok).toBe(true);
  });

  it('accepts AT UID with whitespace, lowercased', () => {
    expect(validateVatId('atu 1234 5678', 'AT').ok).toBe(true);
  });

  it('rejects AT UID with wrong digit count', () => {
    expect(validateVatId('ATU1234567', 'AT').ok).toBe(false);
  });

  it('accepts valid DE USt-ID', () => {
    expect(validateVatId('DE123456789', 'DE').ok).toBe(true);
  });

  it('accepts valid CH MWST-Nr with dots and MWST suffix', () => {
    expect(validateVatId('CHE-123.456.789 MWST', 'CH').ok).toBe(true);
  });

  it('accepts CH MWST without dots', () => {
    expect(validateVatId('CHE123456789MWST', 'CH').ok).toBe(true);
  });

  it('returns ok=true with reason for unknown country (no format check)', () => {
    const r = validateVatId('whatever', 'JP');
    expect(r.ok).toBe(true);
    expect(r.reason).toBeDefined();
  });

  it('returns ok=true for empty vatId (UID is optional)', () => {
    expect(validateVatId('', 'AT').ok).toBe(true);
  });

  it('normalizeVatId strips whitespace and uppercases', () => {
    expect(normalizeVatId('atu 1234 5678')).toBe('ATU12345678');
  });
});
