import { describe, expect, it } from 'vitest';
import {
  allowsPairing,
  countConfirmedTeams,
  normalizeCompetitionType,
  normalizeFeeMode,
  occupiedSlots,
  parseCapacity,
  usesDoublesRanking,
  usesTeamCapacity,
} from '../preregCompetition';

describe('preregCompetition', () => {
  it('normalizeCompetitionType padá na singles', () => {
    expect(normalizeCompetitionType('doubles')).toBe('doubles');
    expect(normalizeCompetitionType('mixed')).toBe('mixed');
    expect(normalizeCompetitionType('random_doubles')).toBe('random_doubles');
    expect(normalizeCompetitionType('weird')).toBe('singles');
    expect(normalizeCompetitionType(null)).toBe('singles');
  });

  it('párování a kapacita v párech jen u doubles/mix', () => {
    expect(allowsPairing('doubles')).toBe(true);
    expect(allowsPairing('mixed')).toBe(true);
    expect(allowsPairing('singles')).toBe(false);
    expect(allowsPairing('random_doubles')).toBe(false);
    expect(usesTeamCapacity('doubles')).toBe(true);
    expect(usesTeamCapacity('random_doubles')).toBe(false);
  });

  it('ČP dvojice platí i pro losované páry', () => {
    expect(usesDoublesRanking('doubles')).toBe(true);
    expect(usesDoublesRanking('mixed')).toBe(true);
    expect(usesDoublesRanking('random_doubles')).toBe(true);
    expect(usesDoublesRanking('singles')).toBe(false);
  });

  it('occupiedSlots u mixu bere confirmedTeams, u singles confirmed', () => {
    expect(occupiedSlots({ meta: { competitionType: 'mixed' }, counters: { confirmed: 9, confirmedTeams: 4 } })).toBe(4);
    expect(occupiedSlots({ meta: { competitionType: 'singles' }, counters: { confirmed: 9, confirmedTeams: 4 } })).toBe(9);
  });

  it('parseCapacity: 0 / prázdné = neomezeno', () => {
    expect(parseCapacity({ meta: { capacity: 16 } })).toBe(16);
    expect(parseCapacity({ meta: { capacity: 0 } })).toBeNull();
    expect(parseCapacity({ meta: { capacity: null } })).toBeNull();
  });

  it('countConfirmedTeams počítá pár jednou (dva záznamy stejné dvojice)', () => {
    const regs = [
      { id: 'r1', status: 'CONFIRMED', pair: { status: 'CONFIRMED', partnerRegistrationId: 'r2' } },
      { id: 'r2', status: 'CONFIRMED', pair: { status: 'CONFIRMED', partnerRegistrationId: 'r1' } },
      { id: 'r3', status: 'WAITLIST', pair: { status: 'CONFIRMED', partnerRegistrationId: 'r4' } },
    ];
    expect(countConfirmedTeams(regs)).toBe(1);
  });

  it('normalizeFeeMode: pair jen při explicitním feeMode, jinak split', () => {
    expect(normalizeFeeMode({ finance: { feeMode: 'pair' } })).toBe('pair');
    expect(normalizeFeeMode({ finance: { feeMode: 'split' } })).toBe('split');
    expect(normalizeFeeMode({})).toBe('split');
  });
});
