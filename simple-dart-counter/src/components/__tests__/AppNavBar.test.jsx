// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppNavBar from '../AppNavBar';

describe('AppNavBar', () => {
  it('bez showBack/showHome tlačítka nemá', () => {
    render(<AppNavBar center={<span>Turnaj</span>} />);
    expect(screen.queryByLabelText('Zpět')).toBeNull();
    expect(screen.queryByLabelText('Domů')).toBeNull();
    expect(screen.getByText('Turnaj')).toBeTruthy();
  });

  it('Zpět a Domů volají callbacky', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onHome = vi.fn();
    render(<AppNavBar showBack showHome onBack={onBack} onHome={onHome} />);
    await user.click(screen.getByLabelText('Zpět'));
    await user.click(screen.getByLabelText('Domů'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onHome).toHaveBeenCalledTimes(1);
  });
});
