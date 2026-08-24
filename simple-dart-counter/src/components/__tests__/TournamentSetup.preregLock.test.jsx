// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import TournamentSetup from '../TournamentSetup';

const draft = {
  name: 'Páteční open',
  format: 'groups_bracket',
  groupLegs: 2,
  bracketLegs: 3,
  startScore: 501,
  outMode: 'double',
  numBoards: 2,
  players: [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ],
  promotersCount: 2,
  boardAssignments: {},
  pin: '1234',
  cloudEnabled: false,
  tabletPassword: '',
  csoRankingGender: 'men',
  useCsoRanking: true,
  competitionType: 'singles',
};

describe('TournamentSetup z předregistrace', () => {
  it('zamkne název a typ soutěže, neukáže přidání hráče', () => {
    const { rerender } = render(
      <TournamentSetup
        lang="cs"
        step={1}
        tournamentDraft={draft}
        setTournamentDraft={() => {}}
        preRegTournamentId="tourn-1"
        onBackToPreRegAdmin={() => {}}
      />
    );

    expect(screen.getByText(/Nastavení živého běhu/i)).toBeTruthy();
    const nameField = document.getElementById('tournament-setup-tournament-name');
    expect(nameField).toBeTruthy();
    expect(nameField).toBeDisabled();
    expect(screen.getByText(/Typ soutěže je z předregistrace/i)).toBeTruthy();

    rerender(
      <TournamentSetup
        lang="cs"
        step={2}
        tournamentDraft={draft}
        setTournamentDraft={() => {}}
        preRegTournamentId="tourn-1"
        onBackToPreRegAdmin={() => {}}
      />
    );

    expect(screen.getByText(/Soupiska z předregistrace/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Přidat hráče/i })).toBeNull();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('u rychlého turnaje nechá název i přidání hráče odemčené', () => {
    const { rerender } = render(
      <TournamentSetup lang="cs" step={1} tournamentDraft={draft} setTournamentDraft={() => {}} />
    );

    expect(screen.getByText(/Krok 1: Založení/i)).toBeTruthy();
    const nameField = document.getElementById('tournament-setup-tournament-name');
    expect(nameField).not.toBeDisabled();

    rerender(
      <TournamentSetup lang="cs" step={2} tournamentDraft={draft} setTournamentDraft={() => {}} />
    );
    expect(screen.getByRole('button', { name: /Přidat hráče/i })).toBeTruthy();
  });
});
