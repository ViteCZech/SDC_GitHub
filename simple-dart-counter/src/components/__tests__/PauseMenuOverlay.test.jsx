// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PauseMenuOverlay from '../PauseMenuOverlay';

describe('PauseMenuOverlay', () => {
  it('zavřené menu nic nerenderuje', () => {
    const { container } = render(
      <PauseMenuOverlay open={false} onClose={() => {}} actions={[{ id: 'home', label: 'Domů', onClick: () => {} }]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('akce a křížek; klik na backdrop zavře', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onHome = vi.fn();
    render(
      <PauseMenuOverlay
        open
        onClose={onClose}
        title="Pauza"
        actions={[{ id: 'home', label: 'Domů', icon: 'home', onClick: onHome }]}
      />
    );
    expect(screen.getByRole('dialog', { name: 'Pauza' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Domů' }));
    expect(onHome).toHaveBeenCalledTimes(1);
    await user.click(screen.getByLabelText('Zavřít'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
