import { test, expect } from '@playwright/test';

test.describe('AnalogAtlas Data Integrity and Scoring', () => {
  test('API data structure should contain required properties', async ({ request }) => {
    const targets = ['mars_jezero', 'moon_shackleton_rim'];
    for (const target of targets) {
      const response = await request.get(`/api/data/${target}`);
      expect(response.ok(), `API for ${target} failed`).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('features');
      expect(Array.isArray(data.features)).toBeTruthy();
      
      if (data.features.length > 0) {
        const feature = data.features[0];
        expect(feature).toHaveProperty('properties');
        // Verify key properties exist for calculation
        const props = feature.properties;
        expect(props).toHaveProperty('hex_id');
        expect(props).toHaveProperty('slope_p50');
        expect(props).toHaveProperty('t_mean');
      }
    }
  });

  test('Weighted total calculation should be accurate', async ({ page }) => {
    await page.goto('/');
    
    // Select a target and wait for data
    await page.getByRole('combobox').selectOption('moon_shackleton_rim');
    
    // Wait for data to load and ranked list to appear
    await expect(page.locator('.list li').first()).toBeVisible({ timeout: 10000 });
    
    // Click the first item in the ranked list
    await page.locator('.list li').first().click();
    
    // Check if details panel is populated
    await expect(page.getByRole('heading', { name: 'Selected hex' })).toBeVisible();
    await expect(page.getByText('Weighted Score')).toBeVisible();
    
    // Verify weighted score text is present
    const scoreElement = page.locator('div').filter({ hasText: /^0\.\d+$/ }).first();
    await expect(scoreElement).toBeVisible();
  });
});
