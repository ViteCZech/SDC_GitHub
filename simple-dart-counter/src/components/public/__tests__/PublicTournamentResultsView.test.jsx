import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PublicTournamentResultsView from '../PublicTournamentResultsView';

vi.mock('../../../services/publicResultsService', () => ({
  getPublicResultById: vi.fn(),
}));

import { getPublicResultById } from '../../../services/publicResultsService';

describe('PublicTournamentResultsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders knockout from final to early rounds and resolves player names from group mapping', async () => {
    getPublicResultById.mockResolvedValue({
      id: 'live-1234',
      name: 'Test Cup',
      location: 'Ostrava',
      eventStartAt: '2026-08-27T10:15:00.000Z',
      playersCount: 4,
      matchesCount: 5,
      tournamentData: { name: 'Test Cup' },
      groups: [
        {
          groupId: 'A',
          players: [
            { id: 'p_alpha', name: 'Pepa' },
            { id: 'p_beta', name: 'Karel' },
            { id: 'p_gamma', name: 'Roman' },
            { id: 'p_delta', name: 'Milan' },
          ],
        },
      ],
      groupMatches: [
        {
          matchId: 'g-1',
          groupId: 'A',
          player1Id: 'p_alpha',
          player2Id: 'p_beta',
          result: { p1Legs: 2, p2Legs: 1 },
        },
      ],
      tournamentBracket: [
        {
          round: 1,
          matches: [
            {
              id: 'r1m1',
              player1Id: 'p_alpha',
              player2Id: 'p_delta',
              score: { p1: 3, p2: 1 },
            },
            {
              id: 'r1m2',
              player1Id: 'p_beta',
              player2Id: 'p_gamma',
              score: { p1: 3, p2: 2 },
            },
          ],
        },
        {
          round: 2,
          matches: [
            {
              id: 'r2m1',
              player1Id: 'p_alpha',
              player2Id: 'p_beta',
              score: { p1: 4, p2: 2 },
            },
          ],
        },
      ],
    });

    const { container } = render(
      <PublicTournamentResultsView resultId="live-1234" lang="cs" onBack={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getByText('Test Cup')).toBeInTheDocument();
    });

    const knockoutSection = screen.getByText('Vyřazovací část').closest('section');
    const knockoutText = knockoutSection?.textContent || '';
    expect(knockoutText.indexOf('Finále')).toBeGreaterThanOrEqual(0);
    expect(knockoutText.indexOf('Semifinále')).toBeGreaterThanOrEqual(0);
    expect(knockoutText.indexOf('Finále')).toBeLessThan(knockoutText.indexOf('Semifinále'));

    expect(screen.getAllByText('Pepa vs Karel').length).toBeGreaterThan(0);
    expect(screen.queryByText(/p_alpha/)).not.toBeInTheDocument();

    const allText = container.textContent || '';
    expect(allText.indexOf('Vyřazovací část')).toBeLessThan(allText.indexOf('Skupiny (zápasy)'));
  });
});
