// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TournamentBoardAssignment from '../TournamentBoardAssignment';

function makePlayers(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Hráč ${i + 1}`,
    ranking: i + 1,
  }));
}

function makeTournamentData({ numGroups = 3, totalBoards = 3, extra = {} } = {}) {
  return {
    name: 'Test Cup',
    tournamentFormat: 'groups_bracket',
    players: makePlayers(numGroups * 3),
    numGroups,
    totalBoards,
    numBoards: totalBoards,
    ...extra,
  };
}

function Harness({ tournamentData, onComplete, initialDraft }) {
  const [draft, setDraft] = useState(initialDraft ?? { boardAssignments: {} });
  return (
    <TournamentBoardAssignment
      tournamentData={tournamentData}
      tournamentDraft={draft}
      setTournamentDraft={setDraft}
      lang="cs"
      onComplete={onComplete}
    />
  );
}

function boardInputs() {
  return screen.getAllByPlaceholderText(/prázdné = fronta/i);
}

describe('TournamentBoardAssignment – automatické přiřazení', () => {
  it('na začátku přiřadí skupinu A → terč 1, B → 2, C → 3', async () => {
    render(<Harness tournamentData={makeTournamentData({ numGroups: 3, totalBoards: 3 })} />);
    await waitFor(() => {
      const inputs = boardInputs();
      expect(inputs).toHaveLength(3);
      expect(inputs[0]).toHaveValue('1');
      expect(inputs[1]).toHaveValue('2');
      expect(inputs[2]).toHaveValue('3');
    });
    expect(screen.queryByText(/stejný terč u více skupin/i)).toBeNull();
  });

  it('přebytečné skupiny nechá ve frontě, když je terčů méně než skupin', async () => {
    render(<Harness tournamentData={makeTournamentData({ numGroups: 4, totalBoards: 2 })} />);
    await waitFor(() => {
      const inputs = boardInputs();
      expect(inputs).toHaveLength(4);
      expect(inputs[0]).toHaveValue('1');
      expect(inputs[1]).toHaveValue('2');
      expect(inputs[2]).toHaveValue('');
      expect(inputs[3]).toHaveValue('');
    });
    expect(boardInputs()[2]).toBeDisabled();
    expect(boardInputs()[3]).toBeDisabled();
  });

  it('ponechá ručně uložené přiřazení a nepřepisuje ho výchozím vzorem', async () => {
    render(
      <Harness
        tournamentData={makeTournamentData({ numGroups: 3, totalBoards: 3 })}
        initialDraft={{ boardAssignments: { A: '3', B: '1', C: '2' } }}
      />
    );
    await waitFor(() => {
      const inputs = boardInputs();
      expect(inputs[0]).toHaveValue('3');
      expect(inputs[1]).toHaveValue('1');
      expect(inputs[2]).toHaveValue('2');
    });
  });

  it('admin může ručně změnit terč a varování o duplicitě zůstane', async () => {
    const user = userEvent.setup();
    render(<Harness tournamentData={makeTournamentData({ numGroups: 3, totalBoards: 3 })} />);
    await waitFor(() => expect(boardInputs()[0]).toHaveValue('1'));

    const groupB = boardInputs()[1];
    await user.clear(groupB);
    await user.type(groupB, '1');

    await waitFor(() => {
      expect(screen.getByText(/Upozornění — stejný terč u více skupin/i)).toBeTruthy();
      expect(screen.getByText(/Terč 1: Skupiny A, B/i)).toBeTruthy();
    });

    const startButtons = screen.getAllByRole('button', { name: /Spustit turnaj/i });
    await user.click(startButtons[0]);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Sdílený terč mezi skupinami/i)).toBeTruthy();
  });

  it('po ruční změně jedné skupiny zachová automatické přiřazení ostatních', async () => {
    const user = userEvent.setup();
    render(<Harness tournamentData={makeTournamentData({ numGroups: 3, totalBoards: 3 })} />);
    await waitFor(() => expect(boardInputs()[0]).toHaveValue('1'));

    await user.clear(boardInputs()[0]);
    await user.type(boardInputs()[0], '3');

    await waitFor(() => {
      const inputs = boardInputs();
      expect(inputs[0]).toHaveValue('3');
      expect(inputs[1]).toHaveValue('2');
      expect(inputs[2]).toHaveValue('3');
    });
  });
});
