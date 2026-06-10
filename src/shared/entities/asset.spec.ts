import { Asset, calculateAssetDepreciation, assetAfaForYear, ASSET_GWG_LIMIT } from './asset';

function mkAsset(overrides: Partial<Asset> = {}): Asset {
  const a = new Asset();
  a.name = 'Test';
  a.category = 'IT-Hardware';
  a.acquisitionDate = new Date('2024-03-15');
  a.acquisitionCost = 3000;
  a.usefulLifeYears = 3;
  a.isGwg = false;
  a.disposalAmount = 0;
  a.notes = '';
  a.sourceExpenseId = '';
  Object.assign(a, overrides);
  return a;
}

describe('calculateAssetDepreciation()', () => {
  it('GWG (≤ 1.000 €): Sofortabschreibung im Anschaffungsjahr', () => {
    const a = mkAsset({ acquisitionCost: 800, acquisitionDate: new Date('2024-05-10') });
    const p = calculateAssetDepreciation(a);
    expect(p.isGwg).toBe(true);
    expect(p.schedule.length).toBe(1);
    expect(p.schedule[0]!.year).toBe(2024);
    expect(p.schedule[0]!.afa).toBe(800);
    expect(p.schedule[0]!.bookValue).toBe(0);
  });

  it('Lineare AfA Vollganzjahr: 3.000 / 3 Jahre = 1.000/Jahr, Anschaffung im 1.HJ', () => {
    const a = mkAsset({ acquisitionCost: 3000, usefulLifeYears: 3, acquisitionDate: new Date('2024-03-15') });
    const p = calculateAssetDepreciation(a);
    expect(p.isGwg).toBe(false);
    expect(p.schedule.length).toBe(3);
    expect(p.schedule[0]).toEqual({ year: 2024, afa: 1000, bookValue: 2000 });
    expect(p.schedule[1]).toEqual({ year: 2025, afa: 1000, bookValue: 1000 });
    expect(p.schedule[2]).toEqual({ year: 2026, afa: 1000, bookValue: 0 });
  });

  it('Halbjahresregel: Anschaffung 2.HJ → halbe AfA im 1. Jahr + halbe im letzten Jahr', () => {
    const a = mkAsset({ acquisitionCost: 3000, usefulLifeYears: 3, acquisitionDate: new Date('2024-08-15') });
    const p = calculateAssetDepreciation(a);
    expect(p.schedule.length).toBe(4); // 3 + 1 wegen Halbjahresregel
    expect(p.schedule[0]).toEqual({ year: 2024, afa: 500, bookValue: 2500 });
    expect(p.schedule[1]).toEqual({ year: 2025, afa: 1000, bookValue: 1500 });
    expect(p.schedule[2]).toEqual({ year: 2026, afa: 1000, bookValue: 500 });
    expect(p.schedule[3]).toEqual({ year: 2027, afa: 500, bookValue: 0 });
  });

  it('Summe der AfA-Beträge = Anschaffungskosten', () => {
    const a = mkAsset({ acquisitionCost: 2400, usefulLifeYears: 4, acquisitionDate: new Date('2025-01-15') });
    const p = calculateAssetDepreciation(a);
    const sum = p.schedule.reduce((s, e) => s + e.afa, 0);
    expect(sum).toBeCloseTo(2400, 2);
  });

  it('Letzter Buchwert immer 0', () => {
    const a = mkAsset({ acquisitionCost: 5000, usefulLifeYears: 7 });
    const p = calculateAssetDepreciation(a);
    expect(p.schedule[p.schedule.length - 1]!.bookValue).toBe(0);
  });

  it('GWG auto-detect über acquisitionCost ≤ GWG_LIMIT', () => {
    const a = mkAsset({ acquisitionCost: ASSET_GWG_LIMIT, isGwg: false });
    expect(calculateAssetDepreciation(a).isGwg).toBe(true);
  });

  it('GWG-Flag erzwingt Sofortabschreibung auch über Limit', () => {
    const a = mkAsset({ acquisitionCost: 2000, isGwg: true });
    const p = calculateAssetDepreciation(a);
    expect(p.isGwg).toBe(true);
    expect(p.schedule.length).toBe(1);
    expect(p.schedule[0]!.afa).toBe(2000);
  });
});

describe('assetAfaForYear()', () => {
  it('liefert AfA für Jahr im Plan', () => {
    const a: Asset = Object.assign(new Asset(), {
      name: 'X', category: 'IT-Hardware',
      acquisitionDate: new Date('2024-01-15'),
      acquisitionCost: 3000, usefulLifeYears: 3,
      isGwg: false, disposalAmount: 0, notes: '', sourceExpenseId: '',
    });
    expect(assetAfaForYear(a, 2024)).toBe(1000);
    expect(assetAfaForYear(a, 2025)).toBe(1000);
    expect(assetAfaForYear(a, 2030)).toBe(0); // außerhalb Plan
  });
});
