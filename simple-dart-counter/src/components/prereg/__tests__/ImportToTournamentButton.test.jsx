// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ImportToTournamentButton from '../ImportToTournamentButton';

function registration(id, name) {
  return {
    id,
    status: 'CONFIRMED',
    attendance: { checkedIn: true },
    player: { name },
    pair: { status: 'NONE' },
  };
}

describe('ImportToTournamentButton', () => {
  it('blokuje import u turnaje se startem v budoucnu', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    render(
      <ImportToTournamentButton
        lang="en"
        registrations={[registration('r1', 'Alice'), registration('r2', 'Bob')]}
        tournament={{
          meta: {
            competitionType: 'singles',
            startsAt: { toDate: () => future },
          },
        }}
        onImport={() => {}}
      />
    );

    const button = screen.getByRole('button', { name: /import players/i });
    expect(button).toBeDisabled();
    expect(screen.getByText(/can be imported to live mode no earlier than/i)).toBeTruthy();
  });

  it('povolí import pokud je start turnaje aktuální nebo v minulosti', () => {
    const past = new Date(Date.now() - 60 * 1000);
    render(
      <ImportToTournamentButton
        lang="en"
        registrations={[registration('r1', 'Alice'), registration('r2', 'Bob')]}
        tournament={{
          meta: {
            competitionType: 'singles',
            startsAt: { toDate: () => past },
          },
        }}
        onImport={() => {}}
      />
    );

    const button = screen.getByRole('button', { name: /import players/i });
    expect(button).not.toBeDisabled();
  });
});
