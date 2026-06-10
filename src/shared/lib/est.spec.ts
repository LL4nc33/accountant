import {
  EST_BRACKETS_2026,
  calculateEst,
  calculateGewinnfreibetrag,
} from './est';

describe('calculateGewinnfreibetrag()', () => {
  it('Grundfreibetrag: 15% bis 33k, max 4.950', () => {
    expect(calculateGewinnfreibetrag(20000).grund).toBeCloseTo(3000, 2);
    expect(calculateGewinnfreibetrag(33000).grund).toBeCloseTo(4950, 2);
    expect(calculateGewinnfreibetrag(100000).grund).toBeCloseTo(4950, 2);
  });
  it('Negativ → 0', () => {
    expect(calculateGewinnfreibetrag(-5000).total).toBe(0);
  });
  it('Investitionsbedingt nur wenn opt-in', () => {
    const without = calculateGewinnfreibetrag(100000, false);
    const withInv = calculateGewinnfreibetrag(100000, true);
    expect(without.investitionsbedingt).toBe(0);
    expect(withInv.investitionsbedingt).toBeGreaterThan(0);
    // BMG 100k: grund 4.950 + invest 13% × 67k = 8.710 → total 13.660
    expect(withInv.total).toBeCloseTo(13660, 1);
  });
  it('Investitionsbedingt: gestaffelt 13/7/4,5%', () => {
    // BMG 600k: grund 4.950 + 13%×145k + 7%×175k + 4.5%×230k = 4.950 + 18.850 + 12.250 + 10.350 = 46.400
    const max = calculateGewinnfreibetrag(600000, true);
    expect(max.total).toBeCloseTo(46400, 1);
  });
});

describe('calculateEst()', () => {
  it('Verlust → ESt = 0', () => {
    const r = calculateEst(-10000);
    expect(r.est).toBe(0);
    expect(r.taxableIncome).toBe(0);
  });

  it('Niedriger Gewinn unter Grundfreibetrag+Bracket1 → ESt = 0', () => {
    const r = calculateEst(13000);
    // Profit 13k, kein SVS, GFB 1.950 → taxable 11.050 in Bracket 1 (0%)
    expect(r.est).toBe(0);
    // Bracket 1 wird gelistet weil amountInBracket > 0, aber taxOnBracket = 0
    expect(r.bracketBreakdown.every(b => b.taxOnBracket === 0)).toBe(true);
  });

  it('Mittlerer Gewinn 50k ohne SVS, ohne Investitions-GFB', () => {
    const r = calculateEst(50000);
    // BMG 50.000, GFB 4.950, taxable 45.050
    // ESt = 0 + 8.453×0.20 + 14.466×0.30 + 8.592×0.40
    //     = 1.690,60 + 4.339,80 + 3.436,80 = 9.467,20
    expect(r.gewinnfreibetrag.grund).toBeCloseTo(4950, 1);
    expect(r.taxableIncome).toBeCloseTo(45050, 1);
    expect(r.est).toBeCloseTo(9467.20, 1);
    expect(r.marginalRate).toBe(0.40);
  });

  it('SVS-Kopplung: 50k Profit, 2k SVS, kein Investitions-GFB', () => {
    const r = calculateEst(50000, { svsAnnual: 2000 });
    expect(r.bemessungsgrundlage).toBeCloseTo(48000, 1);
    // GFB = min(48k, 33k) × 0.15 = 4.950
    expect(r.gewinnfreibetrag.grund).toBeCloseTo(4950, 1);
    expect(r.taxableIncome).toBeCloseTo(43050, 1);
  });

  it('Mit Investitions-GFB Spitzenbetrag-Reduktion', () => {
    const a = calculateEst(60000);
    const b = calculateEst(60000, { applyInvestitionsbedingtGfb: true });
    expect(b.est).toBeLessThan(a.est);
  });

  it('Hoher Gewinn 1.2M trifft Spitzensteuersatz 55%', () => {
    const r = calculateEst(1_200_000);
    expect(r.marginalRate).toBe(0.55);
    expect(r.bracketBreakdown.some(b => b.rate === 0.55)).toBe(true);
  });

  it('Bracket-Anteile summieren auf taxableIncome', () => {
    const r = calculateEst(80000);
    const sum = r.bracketBreakdown.reduce((s, b) => s + b.amountInBracket, 0);
    expect(sum).toBeCloseTo(r.taxableIncome, 1);
  });

  it('effectiveRate korrekt berechnet', () => {
    const r = calculateEst(50000);
    expect(r.effectiveRate).toBeCloseTo(r.est / r.taxableIncome, 4);
  });
});

describe('EST_BRACKETS_2026', () => {
  it('hat 7 Stufen', () => {
    expect(EST_BRACKETS_2026.length).toBe(7);
  });
  it('lückenlos und aufsteigend', () => {
    for (let i = 1; i < EST_BRACKETS_2026.length; i++) {
      const from = EST_BRACKETS_2026[i]!.from as number;
      const prevTo = EST_BRACKETS_2026[i - 1]!.to as number;
      expect(from === prevTo).toBe(true);
    }
  });
  it('Sätze in aufsteigender Reihenfolge', () => {
    for (let i = 1; i < EST_BRACKETS_2026.length; i++) {
      expect(EST_BRACKETS_2026[i]!.rate).toBeGreaterThan(EST_BRACKETS_2026[i - 1]!.rate);
    }
  });
});
