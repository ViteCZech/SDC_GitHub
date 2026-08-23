// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NumericStepper from '../NumericStepper';

describe('NumericStepper', () => {
  it('plus/minus drží min–max', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<NumericStepper value={1} min={1} max={3} onChange={onChange} />);
    expect(screen.getByLabelText('Snížit')).toBeDisabled();
    await user.click(screen.getByLabelText('Zvýšit'));
    expect(onChange).toHaveBeenCalledWith(2);

    rerender(<NumericStepper value={3} min={1} max={3} onChange={onChange} />);
    expect(screen.getByLabelText('Zvýšit')).toBeDisabled();
  });

  it('quick value nastaví číslo', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumericStepper value={1} min={1} max={21} onChange={onChange} quickValues={[501]} />);
    await user.click(screen.getByRole('button', { name: '501' }));
    expect(onChange).toHaveBeenCalledWith(21);
  });
});
