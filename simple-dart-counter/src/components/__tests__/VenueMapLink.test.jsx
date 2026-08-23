// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import VenueMapLink from '../VenueMapLink';

describe('VenueMapLink', () => {
  it('bez místa nic nerenderuje', () => {
    const { container } = render(<VenueMapLink tournament={{ meta: {} }} />);
    expect(container.firstChild).toBeNull();
  });

  it('s městem odkáže do Google Maps', () => {
    render(
      <VenueMapLink
        tournament={{ meta: { location: { venueName: 'Hospoda', city: 'Brno' } } }}
      />
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toContain('google.com/maps');
    expect(link.getAttribute('href')).toContain('Hospoda');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(screen.getByText('Hospoda · Brno')).toBeTruthy();
  });
});
