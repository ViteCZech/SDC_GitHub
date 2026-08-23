import { expect, test } from '@playwright/test';

test.describe('SDC smoke', () => {
  test('domovská obrazovka a Nová hra → setup X01', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'SIMPLE DART' })).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByRole('button', { name: 'Nová hra' })).toBeVisible();
    await page.getByRole('button', { name: 'Nová hra' }).click();
    await expect(page.getByRole('button', { name: 'X01' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'CRICKET' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'START ZÁPASU' })).toBeVisible();
  });

  test('veřejný katalog /tournaments se načte', async ({ page }) => {
    await page.goto('/tournaments');
    await expect(page.getByText('Katalog turnajů')).toBeVisible({ timeout: 25_000 });
  });

  test('TV obrazovka /tv/:pin se načte mimo hlavní menu', async ({ page }) => {
    await page.goto('/tv/0000');
    await expect(page.getByText('TV obrazovka')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole('heading', { name: 'SIMPLE DART' })).toHaveCount(0);
  });
});
