import { describe, expect, it } from 'vitest';
import { deepEqual } from '../deepEqual';

describe('deepEqual', () => {
  it('porovná primitiva a null', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it('ignoruje pořadí klíčů a undefined v objektech', () => {
    expect(deepEqual({ b: 2, a: 1 }, { a: 1, b: 2 })).toBe(true);
    expect(deepEqual({ a: 1, skip: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('porovná pole podle indexu a vnořené zápasy pavouka', () => {
    const left = [{ matches: [{ id: 'm1', board: 2, status: 'pending' }] }];
    const right = [{ matches: [{ status: 'pending', id: 'm1', board: 2 }] }];
    expect(deepEqual(left, right)).toBe(true);
    expect(deepEqual(left, [{ matches: [{ id: 'm1', board: 3, status: 'pending' }] }])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });
});
