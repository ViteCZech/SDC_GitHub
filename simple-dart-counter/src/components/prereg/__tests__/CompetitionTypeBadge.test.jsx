// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import CompetitionTypeBadge from '../CompetitionTypeBadge';

const t = (key) =>
  ({
    preregCompType_singles: 'Jednotlivci',
    preregCompType_doubles: 'Dvojice',
    preregCompType_mixed: 'Mix',
    preregCompType_random_doubles: 'Losované dvojice',
  })[key] || key;

describe('CompetitionTypeBadge', () => {
  it('zobrazí Mix a neznámý typ padne na jednotlivce', () => {
    const { rerender } = render(<CompetitionTypeBadge type="mixed" t={t} />);
    expect(screen.getByText('Mix')).toBeTruthy();
    rerender(<CompetitionTypeBadge type="weird" t={t} />);
    expect(screen.getByText('Jednotlivci')).toBeTruthy();
  });
});
