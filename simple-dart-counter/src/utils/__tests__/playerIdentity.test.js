import { describe, expect, it } from 'vitest';
import {
  blocksNewPreregistration,
  findDuplicatePlayer,
  findDuplicateRegistration,
  playersAreSame,
  preferActivePreregistration,
  resolveCsoPlayerId,
} from '../playerIdentity';

describe('playerIdentity', () => {
  describe('stejné ČŠO ID', () => {
    it('vyhodnotí dva záznamy se stejným csoPlayerId jako stejného hráče i při jiném zápisu jména', () => {
      expect(
        playersAreSame(
          { name: 'Jan Novák', csoPlayerId: 'cso:12345' },
          { name: 'J. Novak', csoPlayerId: 'cso:12345' }
        )
      ).toBe(true);
    });
  });

  describe('různá ČŠO ID u jmenovců', () => {
    it('považuje dva hráče se stejným jménem a různým csoPlayerId za různé', () => {
      expect(
        playersAreSame(
          { name: 'Jan Novák', csoPlayerId: 'cso:111' },
          { name: 'Jan Novák', csoPlayerId: 'cso:222' }
        )
      ).toBe(false);
    });
  });

  describe('amatér bez ČŠO', () => {
    it('porovnává rekreační hráče podle normovaného jména (nameKey)', () => {
      expect(
        playersAreSame(
          { name: 'Petr  Svoboda', csoPlayerId: null },
          { name: 'petr svoboda', csoPlayerId: null }
        )
      ).toBe(true);

      expect(
        playersAreSame(
          { name: 'Petr Svoboda', csoPlayerId: null },
          { name: 'Pavel Svoboda', csoPlayerId: null }
        )
      ).toBe(false);
    });
  });

  describe('stornovaná přihláška', () => {
    it('stav CANCELLED neblokuje novou přihlášku', () => {
      expect(blocksNewPreregistration('CANCELLED')).toBe(false);
      expect(blocksNewPreregistration('CONFIRMED')).toBe(true);
    });

    it('findDuplicateRegistration ignoruje CANCELLED a najde jen aktivní duplicitu', () => {
      const cancelled = {
        id: 'old',
        status: 'CANCELLED',
        player: { name: 'Petr Svoboda', csoPlayerId: null },
      };
      const confirmed = {
        id: 'live',
        status: 'CONFIRMED',
        player: { name: 'Petr Svoboda', csoPlayerId: null },
      };
      const candidate = { name: 'Petr Svoboda', csoPlayerId: null };

      expect(findDuplicateRegistration([cancelled], candidate)).toBeNull();
      expect(findDuplicateRegistration([cancelled, confirmed], candidate)).toBe(confirmed);
    });
  });

  describe('ID a duplicity v soupisce', () => {
    it('resolveCsoPlayerId prefixuje číslo, name: nechá, jinak jméno', () => {
      expect(resolveCsoPlayerId({ regNumber: '42' })).toBe('cso:42');
      expect(resolveCsoPlayerId({ csoPlayerId: 'name:jan novak' })).toBe('name:jan novak');
      expect(resolveCsoPlayerId({ name: 'Jan Novák' })).toBe('name:jan novak');
    });

    it('findDuplicatePlayer přeskočí excludeIndex', () => {
      const list = [
        { name: 'Ada', csoPlayerId: 'cso:1' },
        { name: 'Ada', csoPlayerId: 'cso:1' },
      ];
      expect(findDuplicatePlayer(list, list[1], { excludeIndex: 1 })?.index).toBe(0);
      expect(findDuplicatePlayer(list, { name: 'Bo', csoPlayerId: 'cso:9' })).toBeNull();
    });

    it('preferActivePreregistration drží CONFIRMED před CANCELLED', () => {
      const live = { status: 'CONFIRMED', registrationId: 'a' };
      const dead = { status: 'CANCELLED', registrationId: 'b' };
      expect(preferActivePreregistration(dead, live)).toBe(live);
      expect(preferActivePreregistration(live, dead)).toBe(live);
    });
  });
});
