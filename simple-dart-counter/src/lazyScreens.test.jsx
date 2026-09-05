import { describe, expect, it } from 'vitest';
import { prefetchCricket, prefetchOnlineHub, prefetchTournamentScreens } from './lazyScreens';

describe('lazyScreens prefetch', () => {
  it('prefetch funkce vrací thenable na stejné chunky', async () => {
    const cricket = prefetchCricket();
    const online = prefetchOnlineHub();
    const tournament = prefetchTournamentScreens();
    expect(typeof cricket.then).toBe('function');
    expect(typeof online.then).toBe('function');
    expect(typeof tournament.then).toBe('function');
    const [cricketMod, onlineMod, tournamentMods] = await Promise.all([cricket, online, tournament]);
    expect(cricketMod.default).toBeTypeOf('function');
    expect(onlineMod.default).toBeTypeOf('function');
    expect(Array.isArray(tournamentMods)).toBe(true);
    expect(tournamentMods.length).toBeGreaterThan(3);
    tournamentMods.forEach((mod) => expect(mod.default).toBeTypeOf('function'));
  });
});
