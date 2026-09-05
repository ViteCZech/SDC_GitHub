import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('firebase hosting', () => {
  it('nemaže hashed assety do index.html a drží HTML/SW bez cache', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const json = JSON.parse(readFileSync(join(here, '../../../firebase.json'), 'utf8'));
    const hosting = json.hosting;
    const rewrites = hosting.rewrites || [];
    expect(rewrites.some((row) => row.destination === '/stale-chunk.js')).toBe(true);
    expect(rewrites.some((row) => row.source === '**' && row.destination === '/index.html')).toBe(true);
    const headers = hosting.headers || [];
    const indexHdr = headers.find((row) => row.source === '/index.html');
    const swHdr = headers.find((row) => row.source === '/sw.js');
    expect(JSON.stringify(indexHdr)).toMatch(/no-cache/);
    expect(JSON.stringify(swHdr)).toMatch(/no-cache/);
  });
});
