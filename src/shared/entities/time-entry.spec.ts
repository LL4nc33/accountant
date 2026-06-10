import { TimeEntry } from './time-entry';

describe('TimeEntry.amount', () => {
  it('multiplies hours by hourlyRate', () => {
    const t = new TimeEntry();
    t.hours = 2.5;
    t.hourlyRate = 80;
    expect(t.amount).toBe(200);
  });
  it('returns 0 for zero hours', () => {
    const t = new TimeEntry();
    t.hourlyRate = 100;
    expect(t.amount).toBe(0);
  });
});
