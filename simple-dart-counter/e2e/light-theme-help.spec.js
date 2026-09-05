import { expect, test } from '@playwright/test';

function parseRgb(color) {
  const m = String(color || '').match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function relativeLuminance([r, g, b]) {
  const toLinear = (channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(fg, bg) {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

async function readColors(locator) {
  return locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      color: cs.color,
      backgroundColor: cs.backgroundColor,
    };
  });
}

test.describe('světlý režim — kontextová nápověda', () => {
  test('X01 nápověda má světlé pole a čitelný text', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'SIMPLE DART' })).toBeVisible({
      timeout: 25_000,
    });
    await page.getByRole('button', { name: 'Přepnout na světlý režim' }).click();
    await expect(page.locator('html')).toHaveClass(/light/);

    await page.getByRole('button', { name: 'Průvodce' }).click();
    const section = page.getByTestId('context-help-section');
    await expect(section).toBeVisible();
    await expect(section.getByRole('heading', { name: 'Kontextová nápověda' })).toBeVisible();
    await expect(section.getByRole('heading', { name: 'Herní režim X01' })).toBeVisible();

    const summary = section.locator('p').first();
    const title = section.getByRole('heading', { name: 'Herní režim X01' });
    const [sectionColors, summaryColors, titleColors] = await Promise.all([
      readColors(section),
      readColors(summary),
      readColors(title),
    ]);

    const sectionBg = parseRgb(sectionColors.backgroundColor);
    const summaryFg = parseRgb(summaryColors.color);
    const titleFg = parseRgb(titleColors.color);
    expect(sectionBg).toBeTruthy();
    expect(summaryFg).toBeTruthy();
    expect(titleFg).toBeTruthy();

    expect(relativeLuminance(sectionBg)).toBeGreaterThan(0.7);
    expect(contrastRatio(summaryFg, sectionBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(titleFg, sectionBg)).toBeGreaterThanOrEqual(4.5);
  });
});
