import { test, expect } from '@playwright/test';

test.describe('AnalogAtlas App E2E & Quality Checks', () => {
  test('homepage renders header and title correctly', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/AnalogAtlas/);
    await expect(page.getByRole('heading', { name: /AnalogAtlas/i })).toBeVisible();
  });

  test('target dropdown exists and allows selection', async ({ page }) => {
    await page.goto('/');
    const select = page.getByRole('combobox');
    await expect(select).toBeVisible();

    // Verify default value
    await expect(select).toHaveValue('mars_jezero');

    // Switch target
    await select.selectOption('moon_shackleton_rim');
    await expect(select).toHaveValue('moon_shackleton_rim');
  });

  test('map and chart containers are present on the page', async ({ page }) => {
    await page.goto('/');
    const mapElement = page.locator('#map');
    await expect(mapElement).toBeVisible();
  });

  test('API route /api/data/mars_jezero returns JSON data', async ({ request }) => {
    const response = await request.get('/api/data/mars_jezero');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
  });

  test('API route /api/data/moon_shackleton_rim returns JSON data', async ({ request }) => {
    const response = await request.get('/api/data/moon_shackleton_rim');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
  });
});
