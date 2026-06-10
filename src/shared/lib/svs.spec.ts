/**
 * SVS-Kernel Unit-Tests. Werte gegen WKO-Tabelle 2026 verifiziert.
 */
import {
  SVS_2026,
  calculateSvs,
  estimateNachbemessung,
  svsQuarters,
  svsVersicherungsgrenzeEligible,
} from './svs';

describe('calculateSvs()', () => {
  it('Jahr 1: vorläufig auf Mindest-BGL unabhängig vom Gewinn', () => {
    const r = calculateSvs(0, 1);
    expect(r.isVorlaeufig).toBe(true);
    expect(r.bgMonthly).toBe(SVS_2026.minBgMonthly);
    expect(r.capped).toBe('min');
    expect(r.kv).toBeCloseTo(551.10 * 0.068 * 12, 1);   // ≈ 449,70
    expect(r.pv).toBeCloseTo(551.10 * 0.185 * 12, 1);   // ≈ 1.223,44
    expect(r.uv).toBeCloseTo(155.40, 2);                 //   155,40 (gerundet)
    expect(r.sv).toBeCloseTo(551.10 * 0.0153 * 12, 1);  // ≈ 101,18
  });

  it('Jahr 1: hoher Gewinn ändert nichts (vorläufig)', () => {
    const lo = calculateSvs(0, 1);
    const hi = calculateSvs(100_000, 1);
    expect(lo.total).toBe(hi.total);
  });

  it('Jahr 2: ebenfalls vorläufig auf Mindest-BGL', () => {
    const r = calculateSvs(50_000, 2);
    expect(r.isVorlaeufig).toBe(true);
    expect(r.bgMonthly).toBe(SVS_2026.minBgMonthly);
  });

  it('Jahr 3: BGL = Gewinn × 1.0833 / 12', () => {
    const profit = 50_000;
    const r = calculateSvs(profit, 3);
    expect(r.isVorlaeufig).toBe(false);
    const expectedBg = round2((profit * 1.0833) / 12);
    expect(r.bgMonthly).toBeCloseTo(expectedBg, 1);
    expect(r.capped).toBe('none');
  });

  it('Jahr 3: Gewinn unter Mindest-BGL wird gecapped', () => {
    const r = calculateSvs(1_000, 3);
    expect(r.bgMonthly).toBe(SVS_2026.minBgMonthly);
    expect(r.capped).toBe('min');
  });

  it('Jahr 3: Gewinn über Höchst-BGL wird gecapped', () => {
    const r = calculateSvs(1_000_000, 3);
    expect(r.bgMonthly).toBe(SVS_2026.maxBgMonthly);
    expect(r.capped).toBe('max');
    // Höchstbeitrag ≈ 26.186 EUR
    expect(r.total).toBeGreaterThan(26_000);
    expect(r.total).toBeLessThan(26_500);
  });

  it('Jahr 3: Negativer Gewinn wird wie 0 behandelt → Mindestbeitrag', () => {
    const r = calculateSvs(-5_000, 3);
    expect(r.bgMonthly).toBe(SVS_2026.minBgMonthly);
    expect(r.capped).toBe('min');
  });

  it('total = kv + pv + uv + sv (round2)', () => {
    const r = calculateSvs(40_000, 3);
    expect(round2(r.kv + r.pv + r.uv + r.sv)).toBeCloseTo(r.total, 2);
  });
});

describe('svsQuarters()', () => {
  it('liefert 4 Quartalsraten mit korrekten Fälligkeiten', () => {
    const q = svsQuarters(2026, 4000);
    expect(q.length).toBe(4);
    expect(q[0]!.dueDate).toBe('2026-02-28');
    expect(q[1]!.dueDate).toBe('2026-05-31');
    expect(q[2]!.dueDate).toBe('2026-08-31');
    expect(q[3]!.dueDate).toBe('2026-11-30');
    expect(q[0]!.amount).toBe(1000);
  });

  it('Schaltjahr: Q1 fällt auf 29. Februar', () => {
    const q = svsQuarters(2028, 4000); // 2028 ist Schaltjahr
    expect(q[0]!.dueDate).toBe('2028-02-29');
  });
});

describe('svsVersicherungsgrenzeEligible()', () => {
  it('eligible: beide Schwellen unterschritten', () => {
    const r = svsVersicherungsgrenzeEligible(5000, 30000);
    expect(r.eligible).toBe(true);
  });
  it('not eligible: Gewinn zu hoch', () => {
    const r = svsVersicherungsgrenzeEligible(10000, 30000);
    expect(r.eligible).toBe(false);
    expect(r.explanation).toContain('Gewinn');
  });
  it('not eligible: Umsatz zu hoch', () => {
    const r = svsVersicherungsgrenzeEligible(5000, 60000);
    expect(r.eligible).toBe(false);
    expect(r.explanation).toContain('Umsatz');
  });
});

describe('estimateNachbemessung()', () => {
  it('liefert Differenz zwischen Jahr-3-Endabrechnung und Mindestbeitrag', () => {
    const profit = 50_000;
    const nb = estimateNachbemessung(profit);
    const endgueltig = calculateSvs(profit, 3).total;
    const vorlaeufig = calculateSvs(0, 1).total;
    expect(nb).toBeCloseTo(endgueltig - vorlaeufig, 1);
    expect(nb).toBeGreaterThan(0);
  });
  it('niedriger Gewinn → Nachbemessung 0 (Mindestbeitrag bleibt Mindestbeitrag)', () => {
    const nb = estimateNachbemessung(2_000);
    expect(nb).toBeCloseTo(0, 1);
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
