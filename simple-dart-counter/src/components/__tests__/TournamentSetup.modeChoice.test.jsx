// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TournamentSetup from '../TournamentSetup';

function createDraft(overrides = {}) {
  return {
    name: 'Páteční open',
    format: 'groups_bracket',
    groupLegs: 2,
    bracketLegs: 3,
    startScore: 501,
    outMode: 'double',
    numBoards: 2,
    players: [{ id: 'p1', name: 'Alice' }],
    promotersCount: 1,
    boardAssignments: {},
    pin: '1234',
    cloudEnabled: false,
    tabletPassword: '',
    csoRankingGender: 'men',
    useCsoRanking: true,
    competitionType: 'singles',
    ...overrides,
  };
}

describe('TournamentSetup - volba cloud/offline režimu', () => {
  it('ukáže jen zvolený režim, ne dvě rovnocenné karty', () => {
    render(
      <TournamentSetup
        lang="cs"
        step={1}
        tournamentDraft={createDraft()}
        setTournamentDraft={() => {}}
        user={null}
      />
    );

    expect(screen.getByRole('status', { name: /Zvolený režim/i })).toHaveTextContent('Offline / lokální turnaj');
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('button', { name: /Změnit na cloud turnaj/i })).toBeTruthy();
    expect(screen.queryByText(/Online registrace, cloud synchronizace/)).toBeNull();
  });

  it('po vstupu do cloudu neukáže offline jako rovnocennou volbu', () => {
    render(
      <TournamentSetup
        lang="cs"
        step={1}
        tournamentDraft={createDraft({ cloudEnabled: true })}
        setTournamentDraft={() => {}}
        user={{ uid: 'u1', isAnonymous: false }}
      />
    );

    expect(screen.getByRole('status', { name: /Zvolený režim/i })).toHaveTextContent('Cloud turnaj');
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('button', { name: /Změnit na offline/i })).toBeTruthy();
    expect(screen.queryByText(/Běh na lokální Wi-Fi bez internetu/)).toBeNull();
  });

  it('u odhlášeného uživatele nabídne login hint až po kliknutí na změnu do cloudu', async () => {
    const user = userEvent.setup();
    const setTournamentDraft = vi.fn();
    render(
      <TournamentSetup
        lang="cs"
        step={1}
        tournamentDraft={createDraft()}
        setTournamentDraft={setTournamentDraft}
        user={null}
      />
    );

    expect(screen.getByText('Offline / lokální turnaj')).toBeTruthy();
    expect(screen.queryByText(/Cloud turnaj vyžaduje Google účet pořadatele/i)).toBeNull();
    setTournamentDraft.mockClear();
    await user.click(screen.getByRole('button', { name: /Změnit na cloud turnaj/i }));
    expect(setTournamentDraft).not.toHaveBeenCalled();
    expect(screen.getByText(/Cloud turnaj vyžaduje Google účet pořadatele/i)).toBeTruthy();
  });

  it('v cloudovém režimu bez přihlášení neshodí režim na offline', () => {
    const setTournamentDraft = vi.fn();
    render(
      <TournamentSetup
        lang="cs"
        step={1}
        tournamentDraft={createDraft({ cloudEnabled: true })}
        setTournamentDraft={setTournamentDraft}
        user={null}
      />
    );

    expect(screen.getByRole('status', { name: /Zvolený režim/i })).toHaveTextContent('Cloud turnaj');
    expect(screen.getByText(/Cloud turnaj vyžaduje Google účet pořadatele/i)).toBeTruthy();
    expect(setTournamentDraft).not.toHaveBeenCalled();
  });

  it('při přepnutí na offline režim vypne cloud a smaže heslo tabletů', async () => {
    const user = userEvent.setup();
    const setTournamentDraft = vi.fn();
    const current = createDraft({ cloudEnabled: true, tabletPassword: 'ab12' });

    render(
      <TournamentSetup
        lang="cs"
        step={1}
        tournamentDraft={current}
        setTournamentDraft={setTournamentDraft}
        user={{ uid: 'u1', isAnonymous: false }}
      />
    );

    await user.click(screen.getByRole('button', { name: /Změnit na offline/i }));
    expect(setTournamentDraft).toHaveBeenCalledTimes(1);
    const updater = setTournamentDraft.mock.calls[0][0];
    expect(updater(current)).toMatchObject({ cloudEnabled: false, tabletPassword: '' });
  });

  it('přihlášený uživatel může aktivovat cloud režim', async () => {
    const user = userEvent.setup();
    const setTournamentDraft = vi.fn();
    const current = createDraft({ cloudEnabled: false, tabletPassword: '' });

    render(
      <TournamentSetup
        lang="cs"
        step={1}
        tournamentDraft={current}
        setTournamentDraft={setTournamentDraft}
        user={{ uid: 'u1', isAnonymous: false }}
      />
    );

    await user.click(screen.getByRole('button', { name: /Změnit na cloud turnaj/i }));
    expect(setTournamentDraft).toHaveBeenCalledTimes(1);
    const updater = setTournamentDraft.mock.calls[0][0];
    expect(updater(current)).toMatchObject({ cloudEnabled: true });
  });

  it('z předregistrace zamkne cloud a nenechá přepnout na offline', () => {
    render(
      <TournamentSetup
        lang="cs"
        step={1}
        tournamentDraft={createDraft({ cloudEnabled: true })}
        setTournamentDraft={() => {}}
        user={{ uid: 'u1', isAnonymous: false }}
        preRegTournamentId="tourn-1"
      />
    );

    expect(screen.getByRole('status', { name: /Zvolený režim/i })).toHaveTextContent('Cloud turnaj');
    expect(screen.queryByRole('button', { name: /Změnit na offline/i })).toBeNull();
    expect(screen.getByText(/Živý běh z předregistrace běží v cloudu/i)).toBeTruthy();
  });
});
