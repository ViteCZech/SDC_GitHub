import { describe, expect, it } from 'vitest';
import { filterPlaces, regionForCity } from '../preregPlaces';

describe('preregPlaces', () => {
  it('filterPlaces řadí přesnou shodu před prefix', () => {
    const items = [
      { name: 'Brno', region: 'Jihomoravský kraj' },
      { name: 'Brandýs nad Labem', region: 'Středočeský kraj' },
    ];
    const hits = filterPlaces(items, 'brno', { limit: 5 });
    expect(hits[0].name).toBe('Brno');
  });

  it('regionForCity mapuje známé město na kraj', () => {
    expect(regionForCity('Ostrava')).toBe('Moravskoslezský kraj');
    expect(regionForCity('Neexistující')).toBeNull();
  });
});
