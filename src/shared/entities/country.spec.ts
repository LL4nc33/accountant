import { isEU, vatIdPrefix, allCountries, euCountries } from './country';

describe('country helpers', () => {
  it('isEU returns true for AT, DE, FR; false for CH, US, GB', () => {
    expect(isEU('AT')).toBe(true);
    expect(isEU('DE')).toBe(true);
    expect(isEU('FR')).toBe(true);
    expect(isEU('CH')).toBe(false);
    expect(isEU('US')).toBe(false);
    expect(isEU('GB')).toBe(false);
  });

  it('vatIdPrefix returns expected codes', () => {
    expect(vatIdPrefix('AT')).toBe('ATU');
    expect(vatIdPrefix('DE')).toBe('DE');
    expect(vatIdPrefix('CH')).toBe('CHE');
  });

  it('allCountries contains all EU countries', () => {
    for (const c of euCountries) {
      expect(allCountries.includes(c)).toBe(true);
    }
  });
});
