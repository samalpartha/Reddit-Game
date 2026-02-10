import { describe, it, expect } from 'vitest';
import { SEED_CASES, getSeedCase, getSeedCaseForDate } from '../seed-cases';

describe('SEED_CASES', () => {
  it('has at least 30 cases', () => {
    expect(SEED_CASES.length).toBeGreaterThanOrEqual(30);
  });

  it('every case has required fields', () => {
    for (const seed of SEED_CASES) {
      expect(seed.title).toBeTruthy();
      expect(seed.title.length).toBeGreaterThan(0);
      expect(seed.text).toBeTruthy();
      expect(seed.text.length).toBeGreaterThan(30);
      expect(seed.labels).toHaveLength(4);
      for (const label of seed.labels) {
        expect(label).toBeTruthy();
        expect(label.length).toBeLessThanOrEqual(30);
      }
    }
  });

  it('no case text exceeds 600 characters', () => {
    for (const seed of SEED_CASES) {
      expect(seed.text.length).toBeLessThanOrEqual(600);
    }
  });

  it('all titles are unique', () => {
    const titles = SEED_CASES.map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('getSeedCase', () => {
  it('returns cases cyclically', () => {
    expect(getSeedCase(0)).toBe(SEED_CASES[0]);
    expect(getSeedCase(13)).toBe(SEED_CASES[13]);
    // Wraps around after all cases
    const len = SEED_CASES.length;
    expect(getSeedCase(len)).toBe(SEED_CASES[0]);
    expect(getSeedCase(len + 1)).toBe(SEED_CASES[1]);
  });
});

describe('getSeedCaseForDate', () => {
  it('returns a valid case for a cycle key', () => {
    const case1 = getSeedCaseForDate('2026020912');
    expect(case1).toBeTruthy();
    expect(case1.title).toBeTruthy();
    expect(case1.labels).toHaveLength(4);
  });

  it('returns a valid case for a legacy date key', () => {
    const case1 = getSeedCaseForDate('20260209');
    expect(case1).toBeTruthy();
    expect(case1.title).toBeTruthy();
    expect(case1.labels).toHaveLength(4);
  });

  it('returns the same case for the same cycle key', () => {
    const a = getSeedCaseForDate('2026020912');
    const b = getSeedCaseForDate('2026020912');
    expect(a).toBe(b);
  });

  it('returns different cases for different cycle keys on same day', () => {
    const a = getSeedCaseForDate('2026020900');
    const b = getSeedCaseForDate('2026020902');
    expect(a.title).not.toBe(b.title);
  });

  it('returns different cases for different dates', () => {
    const a = getSeedCaseForDate('2026020912');
    const b = getSeedCaseForDate('2026021012');
    // Consecutive days at same hour should differ
    expect(a.title).not.toBe(b.title);
  });
});
