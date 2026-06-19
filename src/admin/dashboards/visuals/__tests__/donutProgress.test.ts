import { describe, it, expect } from 'vitest';
import { clampPercent, toResult } from '../donutProgressQuery';

/**
 * The donut arc can only draw 0–100, but the real percentage must survive for the
 * tooltip ("124% achieved"). And a filtered-to-empty denominator is a genuine 0% —
 * never a fall-back to all data. These lock both rules.
 */
describe('clampPercent', () => {
  it('clamps below 0 to 0', () => expect(clampPercent(-12)).toBe(0));
  it('clamps above 100 to 100', () => expect(clampPercent(124)).toBe(100));
  it('passes through an in-range value', () => expect(clampPercent(45)).toBe(45));
  it('treats non-finite as 0 (safe no-data default)', () => {
    expect(clampPercent(NaN)).toBe(0);
    expect(clampPercent(Infinity)).toBe(0);
  });
});

describe('toResult', () => {
  it('computes a normal ratio', () => {
    const r = toResult(30, 50);
    expect(r.rawPercent).toBe(60);
    expect(r.percent).toBe(60);
    expect(r.empty).toBe(false);
  });

  it('caps the arc but keeps the real value for over-100%', () => {
    const r = toResult(124, 100);
    expect(r.percent).toBe(100);
    expect(r.rawPercent).toBe(124);
  });

  it('an empty (zero) denominator is 0% — never all data', () => {
    const r = toResult(0, 0);
    expect(r.percent).toBe(0);
    expect(r.rawPercent).toBe(0);
    expect(r.empty).toBe(true);
  });

  it('a zero numerator over a real denominator is a real 0%', () => {
    const r = toResult(0, 80);
    expect(r.percent).toBe(0);
    expect(r.empty).toBe(false);
  });
});
