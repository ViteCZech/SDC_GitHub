// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DoublesThrowerPicker from '../DoublesThrowerPicker';

const settings = {
  doubles: true,
  teams: {
    p1: { name: 'Tým A', members: [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Bo' }] },
    p2: { name: 'Tým B', members: [{ id: 'c', name: 'Cy' }, { id: 'd', name: 'Di' }] },
  },
};

describe('DoublesThrowerPicker', () => {
  it('bez výběru nelze potvrdit; po kliknutí na hráče zavolá onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <DoublesThrowerPicker
        lang="cs"
        settings={settings}
        startingPlayer="p1"
        requiredSide="p1"
        onConfirm={onConfirm}
      />
    );
    const confirm = screen.getByRole('button', { name: 'Potvrdit házející' });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Ada' }));
    expect(confirm).not.toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ p1: 'a', p2: null });
  });
});
