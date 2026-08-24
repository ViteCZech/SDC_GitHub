import { describe, expect, it, vi } from 'vitest';
import {
  boardsOccupancySignature,
  buildVenueBoardSnapshots,
  buildVenueCarouselSlides,
  buildVenueDisplayUrl,
  detectVenueMatchCalls,
  parseVenueDisplayRouteFromUrl,
  playVenueGong,
  resolveVenueLang,
  unpackCloudTournament,
} from '../venueDisplay';

function cloudDoc(overrides = {}) {
  return {
    status: 'running',
    tournamentData: {
      name: 'Páteční open',
      numBoards: 2,
      groups: [
        {
          groupId: 'A',
          name: 'Skupina A',
          boards: [1, 2],
          players: [
            { id: 'p1', name: 'Jalůvka' },
            { id: 'p2', name: 'Armlich' },
            { id: 'p3', name: 'Novák' },
            { id: 'p4', name: 'Svoboda' },
          ],
        },
      ],
    },
    groups: [
      {
        groupId: 'A',
        name: 'Skupina A',
        boards: [1, 2],
        players: [
          { id: 'p1', name: 'Jalůvka' },
          { id: 'p2', name: 'Armlich' },
          { id: 'p3', name: 'Novák' },
          { id: 'p4', name: 'Svoboda' },
        ],
      },
    ],
    groupMatches: [
      {
        matchId: 'm1',
        groupId: 'A',
        round: 1,
        board: 1,
        status: 'playing',
        player1Id: 'p1',
        player2Id: 'p2',
        chalkerId: 'p3',
        result: { p1Legs: 2, p2Legs: 1 },
      },
      {
        matchId: 'm2',
        groupId: 'A',
        round: 2,
        status: 'pending',
        player1Id: 'p3',
        player2Id: 'p4',
        chalkerId: 'p1',
      },
    ],
    tournamentBracket: [],
    ...overrides,
  };
}

describe('venueDisplay routing', () => {
  it('parseVenueDisplayRouteFromUrl čte /tv/:pin a odmítne neplatný PIN', () => {
    expect(parseVenueDisplayRouteFromUrl({ pathname: '/tv/1234' })).toEqual({
      pin: '1234',
      invalid: false,
    });
    expect(parseVenueDisplayRouteFromUrl({ pathname: '/', hash: '#/tv/5678' })).toEqual({
      pin: '5678',
      invalid: false,
    });
    expect(parseVenueDisplayRouteFromUrl({ pathname: '/tv/1234/' })).toEqual({
      pin: '1234',
      invalid: false,
    });
    expect(parseVenueDisplayRouteFromUrl({ pathname: '/tv/12' })).toEqual({
      pin: null,
      invalid: true,
    });
    expect(parseVenueDisplayRouteFromUrl({ pathname: '/tablet' })).toBeNull();
    expect(parseVenueDisplayRouteFromUrl({ pathname: '/', hash: '#/tv/0000' })).toEqual({
      pin: '0000',
      invalid: false,
    });
  });

  it('buildVenueDisplayUrl složí veřejnou cestu', () => {
    expect(buildVenueDisplayUrl('4321', 'https://example.test')).toBe('https://example.test/tv/4321');
    expect(buildVenueDisplayUrl('4321', 'https://example.test', 'cs')).toBe(
      'https://example.test/tv/4321?lang=cs'
    );
  });

  it('resolveVenueLang bere query a fallback', () => {
    expect(resolveVenueLang('?lang=pl')).toBe('pl');
    const nav = String(globalThis.navigator?.language || '').toLowerCase();
    const expected = nav.startsWith('pl') ? 'pl' : nav.startsWith('en') ? 'en' : 'cs';
    expect(resolveVenueLang('?lang=de')).toBe(expected);
  });
});

describe('venueDisplay snapshot', () => {
  it('unpackCloudTournament preferuje top-level groups', () => {
    const u = unpackCloudTournament(cloudDoc());
    expect(u.name).toBe('Páteční open');
    expect(u.groups[0].groupId).toBe('A');
    expect(u.groupMatches).toHaveLength(2);
  });

  it('buildVenueBoardSnapshots: hraje + další + počtář', () => {
    const boards = buildVenueBoardSnapshots(unpackCloudTournament(cloudDoc()));
    expect(boards).toHaveLength(2);
    expect(boards[0].current.matchId).toBe('m1');
    expect(boards[0].current.player1Name).toBe('Jalůvka');
    expect(boards[0].current.player2Name).toBe('Armlich');
    expect(boards[0].current.refereeName).toBe('Novák');
    expect(boards[0].current.legsP1).toBe(2);
    expect(boards[0].current.legsP2).toBe(1);
    expect(boards[0].next?.player1Name).toBe('Novák');
    expect(boards[0].next?.player2Name).toBe('Svoboda');
  });

  it('detectVenueMatchCalls jen při novém zápase na terči', () => {
    const a = buildVenueBoardSnapshots(unpackCloudTournament(cloudDoc()));
    const b = buildVenueBoardSnapshots(
      unpackCloudTournament(
        cloudDoc({
          groupMatches: [
            {
              matchId: 'm9',
              groupId: 'A',
              round: 1,
              board: 1,
              status: 'pending',
              player1Id: 'p3',
              player2Id: 'p4',
              referee: { name: 'Jalůvka' },
            },
          ],
        })
      )
    );
    const calls = detectVenueMatchCalls(a, b);
    expect(calls).toEqual([
      {
        board: 1,
        player1Name: 'Novák',
        player2Name: 'Svoboda',
        refereeName: 'Jalůvka',
      },
    ]);
    expect(detectVenueMatchCalls(a, a)).toEqual([]);
    expect(boardsOccupancySignature(a)).not.toBe(boardsOccupancySignature(b));
  });

  it('carousel přidá skupiny a statistiky jen když jsou data', () => {
    const empty = buildVenueCarouselSlides(unpackCloudTournament(cloudDoc()));
    expect(empty[0]).toEqual({ type: 'boards' });
    expect(empty.some((s) => s.type === 'groups')).toBe(true);
    expect(empty.some((s) => s.type === 'top180s')).toBe(false);

    const withStats = buildVenueCarouselSlides(
      unpackCloudTournament(
        cloudDoc({
          groupMatches: [
            {
              matchId: 'm1',
              groupId: 'A',
              status: 'completed',
              player1Id: 'p1',
              player2Id: 'p2',
              player1Name: 'Jalůvka',
              player2Name: 'Armlich',
              result: {
                p1Legs: 2,
                p2Legs: 0,
                p1High: { 180: 2 },
                p2High: { 180: 0 },
                p1HighCheckout: 120,
                p2HighCheckout: 0,
              },
            },
          ],
        })
      )
    );
    expect(withStats.some((s) => s.type === 'top180s')).toBe(true);
    expect(withStats.some((s) => s.type === 'topCheckouts')).toBe(true);
  });

  it('playVenueGong spustí oscilátory na předaném AudioContext', () => {
    const ctx = {
      currentTime: 0,
      state: 'running',
      destination: {},
      createOscillator: vi.fn(() => ({
        type: '',
        frequency: { setValueAtTime: vi.fn() },
        detune: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      })),
    };
    playVenueGong(ctx);
    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(ctx.createGain).toHaveBeenCalled();
  });
});
