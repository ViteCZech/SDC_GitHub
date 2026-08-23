// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TournamentHub from '../TournamentHub';

describe('TournamentHub', () => {
  it('nabídne pořádat, připojit se a katalog', async () => {
    const user = userEvent.setup();
    const onOpenPreReg = vi.fn();
    const onOpenCatalog = vi.fn();
    render(
      <TournamentHub lang="cs" onOpenPreReg={onOpenPreReg} onOpenCatalog={onOpenCatalog} />
    );
    expect(screen.getByText('Pořádat turnaj')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Procházet turnaje/ }));
    expect(onOpenCatalog).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /Pořádat turnaj/ }));
    expect(onOpenPreReg).toHaveBeenCalledTimes(1);
  });

  it('tablet: PIN max 4 číslice, heslo max 5, volá onTabletJoin', async () => {
    const user = userEvent.setup();
    const onTabletJoin = vi.fn();
    render(<TournamentHub lang="cs" onTabletJoin={onTabletJoin} />);
    await user.click(screen.getByRole('button', { name: /Připojit se/ }));
    await user.click(screen.getByRole('button', { name: /Herní tablet/ }));

    const pin = screen.getByPlaceholderText('0000');
    const board = screen.getByPlaceholderText('1');
    const password = screen.getByPlaceholderText('•••');
    await user.type(pin, '12ab345');
    expect(pin).toHaveValue('1234');
    await user.type(board, '99');
    expect(board).toHaveValue('99');
    await user.type(password, 'abcdef');
    expect(password).toHaveValue('abcde');

    await user.click(screen.getByRole('button', { name: 'Připojit' }));
    expect(onTabletJoin).toHaveBeenCalledWith('1234', '99', 'abcde');
  });
});
