import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../index.css'),
  'utf8'
);

describe('light theme CSS overlay', () => {
  it('přebarví i poloprůhledné slate karty, ne jen solid /80–/95', () => {
    expect(css).toContain('[class*="bg-slate-900/"]');
    expect(css).toContain('[class*="bg-slate-800/"]');
    expect(css).toContain('[class*="bg-slate-950/"]');
    expect(css).toContain('[class*="bg-slate-700/"]');
  });

  it('ve světlém režimu ztmaví bílý text uvnitř poloprůhledných karet', () => {
    expect(css).toContain('[class*="bg-slate-900/"] .text-white');
    expect(css).toContain('[class*="bg-slate-950/"] .text-white');
  });
});
