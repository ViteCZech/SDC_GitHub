// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listenMock = vi.fn();

vi.mock('../../services/tournamentSync', () => ({
  listenToCloudTournament: (pin, cb) => listenMock(pin, cb),
}));

import VenueDisplayView from '../VenueDisplayView';

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
    listenMock.mockImplementation((_pin, _cb) => () => {});
  });

  it('neplatný PIN nic neposlouchá a ukáže chybu', () => {
    render(<VenueDisplayView pin={null} invalidPin lang="cs" />);
    expect(screen.getByTestId('venue-display')).toBeTruthy();
    expect(screen.getByTestId('venue-display-status').getAttribute('data-state')).toBe('empty');
    expect(screen.getAllByText('Neplatný PIN').length).toBeGreaterThan(0);
    expect(listenMock).not.toHaveBeenCalled();
  });

  it('odebírá active turnaj a kreslí terč, jména i počtáře', () => {
    listenMock.mockImplementation((_pin, cb) => {
      cb(liveDoc());
      return () => {};
    });
    render(<VenueDisplayView pin="1234" lang="cs" />);
    expect(listenMock).toHaveBeenCalledWith('1234', expect.any(Function));
    expect(screen.getByText('Hala Cup')).toBeTruthy();
    expect(document.body.textContent).toContain('Jalůvka');
    expect(document.body.textContent).toContain('Armlich');
    expect(document.body.textContent).toContain('Novák');
    expect(document.body.textContent).toContain('1:0');
  });

  it('chybějící dokument ukáže neaktivní turnaj', () => {
    listenMock.mockImplementation((_pin, cb) => {
      cb(null);
      return () => {};
    });
    render(<VenueDisplayView pin="0000" lang="cs" />);
    expect(screen.getAllByText('Turnaj není aktivní').length).toBeGreaterThan(0);
  });

  it('při novém zápase na terči ukáže volací banner', () => {
    let push;
    listenMock.mockImplementation((_pin, cb) => {
      push = cb;
      cb(liveDoc());
      return () => {};
    });
    render(<VenueDisplayView pin="1234" lang="cs" />);
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

  it('tlačítko aktivuje zvuk', async () => {
    listenMock.mockImplementation((_pin, cb) => {
      cb(null);
      return () => {};
    });
    const user = userEvent.setup();
    render(<VenueDisplayView pin="0000" lang="cs" />);
    await user.click(screen.getByRole('button', { name: /Aktivovat zvuk/i }));
    expect(screen.getByRole('button', { name: /Zvuk zapnutý/i })).toBeTruthy();
  });
});
