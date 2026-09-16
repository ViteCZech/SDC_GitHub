import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TabletKioskLockBadge from '../TabletKioskLockBadge';

describe('TabletKioskLockBadge', () => {
  it('renderuje zamčený stav s doporučením pro OS Kiosk', () => {
    const onToggle = vi.fn();
    render(<TabletKioskLockBadge lang="cs" locked onToggle={onToggle} />);

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button.getAttribute('title')).toContain('Asistovaný přístup');
    expect(button.getAttribute('title')).toContain('Připnutí aplikace');
    expect(button.getAttribute('aria-label')).toContain('Asistovaný přístup');
    expect(screen.getByText('Zamčeno')).toBeInTheDocument();
  });

  it('renderuje odemčený stav v angličtině', () => {
    const onToggle = vi.fn();
    render(<TabletKioskLockBadge lang="en" locked={false} onToggle={onToggle} />);

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button.getAttribute('title')).toContain('Guided Access');
    expect(button.getAttribute('title')).toContain('App Pinning');
    expect(screen.getByText('Unlocked')).toBeInTheDocument();
  });

  it('kliknutí volá onToggle callback', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<TabletKioskLockBadge lang="cs" locked onToggle={onToggle} />);

    await user.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
