import { vatPresetFor } from './vat-presets';

describe('vatPresetFor', () => {
  it('AT default 20, options 20/13/10/0', () => {
    const p = vatPresetFor('AT');
    expect(p.default).toBe(20);
    expect(p.options).toEqual([20, 13, 10, 0]);
  });

  it('DE default 19, options 19/7/0', () => {
    const p = vatPresetFor('DE');
    expect(p.default).toBe(19);
    expect(p.options).toEqual([19, 7, 0]);
  });

  it('CH default 8.1', () => {
    const p = vatPresetFor('CH');
    expect(p.default).toBe(8.1);
    expect(p.options).toContain(2.6);
    expect(p.options).toContain(3.8);
  });

  it('unknown country falls back to 0', () => {
    expect(vatPresetFor('JP').default).toBe(0);
  });
});
