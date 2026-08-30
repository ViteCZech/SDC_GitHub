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
});
