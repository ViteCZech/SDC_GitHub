// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DateTimeLocalFields, { joinDateTimeLocal, splitDateTimeLocal } from '../DateTimeLocalFields';

describe('DateTimeLocalFields helpers', () => {
  it('split/join datetime-local', () => {
    expect(splitDateTimeLocal('2026-08-29T10:05')).toEqual({
      date: '2026-08-29',
      hour: '10',
      minute: '05',
    });
    expect(joinDateTimeLocal('2026-08-29', '', '')).toBe('2026-08-29T12:00');
    expect(joinDateTimeLocal('', '10', '00')).toBe('');
  });
});

describe('DateTimeLocalFields', () => {
  it('výchozích 12:00 ve stejný den jako start ořízne na max (10:00)', () => {
    const onChange = vi.fn();
    render(
      <DateTimeLocalFields
        value=""
        onChange={onChange}
        max="2026-08-29T10:00"
        dateLabel="Uzávěrka"
        timeLabel="Čas"
      />
    );
    const dateInput = document.querySelector('input[type="date"]');
    fireEvent.change(dateInput, { target: { value: '2026-08-29' } });
    expect(onChange).toHaveBeenCalledWith('2026-08-29T10:00');
  });

  it('select hodin je disabled, dokud není datum', () => {
    render(<DateTimeLocalFields value="" onChange={() => {}} timeLabel="Čas" />);
    const hours = screen.getByRole('combobox', { name: 'Čas – hodiny' });
    expect(hours).toBeDisabled();
  });
});
