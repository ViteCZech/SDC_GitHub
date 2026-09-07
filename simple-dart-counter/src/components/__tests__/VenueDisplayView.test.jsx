// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { SyncAdapterProvider } from '../../context/SyncAdapterContext';

const listenMock = vi.fn();

import VenueDisplayView from '../VenueDisplayView';

function renderWithAdapter(ui) {
  const adapter = {
    listenTournament: (pin, cb) => listenMock(pin, cb),
  };
  return render(<SyncAdapterProvider adapter={adapter}>{ui}</SyncAdapterProvider>);
}

function liveDoc() {
  return {
    status: 'running',
    tournamentData: {
      name: 'Hala Cup',
      numBoards: 2,
      groups: [
        {
          groupId: 'A',
          name: 'Skupina A',
          boards: [1],
          players: [
            { id: 'p1', name: 'Jalůvka' },
            { id: 'p2', name: 'Armlich' },
            { id: 'p3', name: 'Novák' },
          ],
        },
      ],
    },
    groups: [
      {
        groupId: 'A',
        name: 'Skupina A',
        boards: [1],
        players: [
          { id: 'p1', name: 'Jalůvka' },
          { id: 'p2', name: 'Armlich' },
          { id: 'p3', name: 'Novák' },
        ],
      },
    ],
    groupMatches: [
      {
        matchId: 'm1',
        groupId: 'A',
        board: 1,
        status: 'playing',
        player1Id: 'p1',
        player2Id: 'p2',
        referee: { name: 'Novák' },
        result: { p1Legs: 1, p2Legs: 0 },
      },
    ],
    tournamentBracket: [],
  };
}

function finishedDoc() {
  return {
    ...liveDoc(),
    status: 'finished',
    groupMatches: [
      {
        matchId: 'm1',
        groupId: 'A',
        board: 1,
        status: 'completed',
        player1Id: 'p1',
        player2Id: 'p2',
        player1Name: 'Jalůvka',
        player2Name: 'Armlich',
        winnerId: 'p1',
        p1Avg: 71.5,
        p2Avg: 63.2,
        result: {
          p1Legs: 2,
          p2Legs: 1,
          p1High: { '180': 1, '140+': 2 },
          p2High: { '180': 0, '140+': 1 },
          p1HighCheckout: 112,
          p2HighCheckout: 76,
        },
      },
    ],
    tournamentBracket: [
      {
        round: 1,
        matches: [
          {
            id: 'b1',
            board: 1,
            status: 'completed',
            player1Id: 'p1',
            player2Id: 'p3',
            player1Name: 'Jalůvka',
            player2Name: 'Novák',
            winnerId: 'p3',
            p1Avg: 68.4,
            p2Avg: 73.9,
            result: {
              p1Legs: 1,
              p2Legs: 2,
              p1High: { '180': 0, '140+': 1 },
              p2High: { '180': 2, '140+': 1 },
              p1HighCheckout: 88,
              p2HighCheckout: 130,
            },
          },
        ],
      },
    ],
  };
}

function groupsDoc(groupCount, playersPerGroup) {
  const groups = Array.from({ length: groupCount }, (_v, idx) => {
    const letter = String.fromCharCode(65 + idx);
    const players = Array.from({ length: playersPerGroup }, (_p, pIdx) => ({
      id: `${letter}${pIdx + 1}`,
      name: `${letter} Hráč ${pIdx + 1}`,
    }));
    return {
      groupId: letter,
      name: `Skupina ${letter}`,
      boards: [((idx % 4) + 1)],
      players,
    };
  });
  return {
    status: 'running',
    tournamentData: {
      name: 'Density test',
      numBoards: 4,
      groups,
    },
    groups,
    groupMatches: [],
    tournamentBracket: [],
  };
}

describe('VenueDisplayView', () => {
  beforeEach(() => {
    listenMock.mockReset();
    listenMock.mockImplementation(() => () => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('neplatný PIN nic neposlouchá a ukáže chybu', () => {
    renderWithAdapter(<VenueDisplayView pin={null} invalidPin lang="cs" />);
    expect(screen.getByTestId('venue-display')).toBeTruthy();
    expect(screen.getByTestId('venue-display-status').getAttribute('data-state')).toBe('empty');
    expect(screen.getAllByText('Neplatný PIN').length).toBeGreaterThan(0);
    expect(listenMock).not.toHaveBeenCalled();
  });

  it('odebírá active turnaj a kreslí terč, jména i počtáře', () => {
    vi.useFakeTimers();
    listenMock.mockImplementation((_pin, cb) => {
      cb(liveDoc());
      return () => {};
    });
    renderWithAdapter(<VenueDisplayView pin="1234" lang="cs" />);
    act(() => {
      vi.advanceTimersByTime(16_000);
    });
    expect(listenMock).toHaveBeenCalledWith('1234', expect.any(Function));
    expect(screen.getByText('Hala Cup')).toBeTruthy();
    expect(document.body.textContent).toContain('Jalůvka');
    expect(document.body.textContent).toContain('Armlich');
    expect(document.body.textContent).toContain('Novák');
    expect(document.body.textContent).toMatch(/1\s*:\s*0/);
    vi.useRealTimers();
  });

  it('chybějící dokument ukáže neaktivní turnaj', () => {
    listenMock.mockImplementation((_pin, cb) => {
      cb(null);
      return () => {};
    });
    renderWithAdapter(<VenueDisplayView pin="0000" lang="cs" />);
    expect(screen.getAllByText('Turnaj není aktivní').length).toBeGreaterThan(0);
  });

  it('při novém zápase na terči ukáže volací banner', () => {
    let push;
    listenMock.mockImplementation((_pin, cb) => {
      push = cb;
      cb(liveDoc());
      return () => {};
    });
    renderWithAdapter(<VenueDisplayView pin="1234" lang="cs" />);
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => push({
      ...liveDoc(),
      groupMatches: [
        {
          matchId: 'm2',
          groupId: 'A',
          board: 1,
          status: 'pending',
          player1Id: 'p2',
          player2Id: 'p3',
          referee: { name: 'Jalůvka' },
        },
      ],
    }));
    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('TERČ 1');
    expect(banner.textContent).toContain('Armlich');
    expect(banner.textContent).toContain('Novák');
    expect(banner.textContent).toContain('Jalůvka');
  });

  it('u timeout warning ukáže chybějící hráče/počtáře', () => {
    vi.useFakeTimers();
    listenMock.mockImplementation((_pin, cb) => {
      cb({
        ...liveDoc(),
        groupMatches: [
          {
            matchId: 'm3',
            groupId: 'A',
            board: 1,
            status: 'pending',
            tabletStatus: 'timeout_warning',
            tabletCheckInPresent: {
              p1: false,
              p2: true,
              referee: false,
            },
            player1Id: 'p1',
            player2Id: 'p2',
            referee: { name: 'Novák' },
          },
        ],
      });
      return () => {};
    });
    renderWithAdapter(<VenueDisplayView pin="1234" lang="cs" />);
    act(() => {
      vi.advanceTimersByTime(16_000);
    });
    expect(document.body.textContent).toContain('Chybí na prezentaci');
    expect(document.body.textContent).toContain('Jalůvka');
    expect(document.body.textContent).toContain('Novák');
    vi.useRealTimers();
  });

  it('bez pavouka neschovává hluchý blok a nemá posuvník', () => {
    listenMock.mockImplementation((_pin, cb) => {
      cb(liveDoc());
      return () => {};
    });
    renderWithAdapter(<VenueDisplayView pin="1234" lang="cs" />);
    const root = screen.getByTestId('venue-display');
    expect(root.className).toContain('overflow-hidden');
    expect(root.style.overflow).toBe('hidden');
    expect(root.style.height).toBe('100vh');
    expect(screen.queryByText('Pavouk čeká na vygenerování')).toBeNull();
    expect(document.body.textContent).toContain('Jalůvka');
  });

  it('po přepnutí na živé terče ukáže celé jméno a skóre legů', () => {
    vi.useFakeTimers();
    listenMock.mockImplementation((_pin, cb) => {
      cb(liveDoc());
      return () => {};
    });
    renderWithAdapter(<VenueDisplayView pin="1234" lang="cs" />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(document.body.textContent).toContain('Jalůvka');
    expect(document.body.textContent).toContain('Armlich');
    expect(document.body.textContent).toMatch(/TERČ\s*1/);
    expect(document.body.textContent).toMatch(/1\s*:\s*0/);
    expect(screen.queryByText('Pavouk čeká na vygenerování')).toBeNull();
    vi.useRealTimers();
  });

  it('vzdy vynucuje dark rezim na html elementu', () => {
    document.documentElement.classList.add('light');
    const { unmount } = render(<VenueDisplayView pin="1234" lang="cs" />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
    unmount();
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('po dokončení turnaje zobrazí celkové výsledky bez carouselu', () => {
    listenMock.mockImplementation((_pin, cb) => {
      cb(finishedDoc());
      return () => {};
    });
    renderWithAdapter(<VenueDisplayView pin="1234" lang="cs" />);
    expect(document.body.textContent).toContain('Celkové výsledky');
    expect(document.body.textContent).toContain('Nejvyšší zavření');
    expect(document.body.textContent).toContain('Celkem 180');
  });

  it('pro skupiny do 4 hráčů zobrazuje 8 tabulek na obrazovku', () => {
    listenMock.mockImplementation((_pin, cb) => {
      cb(groupsDoc(8, 4));
      return () => {};
    });
    renderWithAdapter(<VenueDisplayView pin="1234" lang="cs" />);
    expect(document.body.textContent).toContain('8 tabulek / obrazovka');
  });

  it('pro skupiny po 5 hráčích zobrazuje 6 tabulek na obrazovku', () => {
    listenMock.mockImplementation((_pin, cb) => {
      cb(groupsDoc(6, 5));
      return () => {};
    });
    renderWithAdapter(<VenueDisplayView pin="1234" lang="cs" />);
    expect(document.body.textContent).toContain('6 tabulek / obrazovka');
  });

  it('pro skupiny od 6 hráčů zobrazuje 4 tabulky na obrazovku', () => {
    listenMock.mockImplementation((_pin, cb) => {
      cb(groupsDoc(4, 6));
      return () => {};
    });
    renderWithAdapter(<VenueDisplayView pin="1234" lang="cs" />);
    expect(document.body.textContent).toContain('4 tabulek / obrazovka');
  });
});
