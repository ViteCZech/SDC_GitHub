// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActiveSessionBanner from '../ActiveSessionBanner';

describe('ActiveSessionBanner', () => {
  it('bez relace nic nerenderuje', () => {
    const { container } = render(
      <ActiveSessionBanner session={null} onResume={() => {}} onDismiss={() => {}} resumeLabel="Pokračovat" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('resume a dismiss', async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ActiveSessionBanner
        session={{ kind: 'tournament', title: 'Open' }}
        onResume={onResume}
        onDismiss={onDismiss}
        resumeLabel="Pokračovat v turnaji"
      />
    );
    expect(screen.getByText(/Open/)).toBeTruthy();
    await user.click(screen.getByText(/Pokračovat v turnaji/));
    expect(onResume).toHaveBeenCalledTimes(1);
    await user.click(screen.getByLabelText('Zavřít'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
