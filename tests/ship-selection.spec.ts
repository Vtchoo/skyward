import { test, expect } from '@playwright/test';

test('menu keeps ships hidden; selection previews all four designs and returns to menu', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Multiplayer (soon)' })).toBeDisabled();
  await expect(page.locator('.ship-screen')).toHaveCount(0);
  await page.getByRole('button', { name: 'Free flight' }).click();
  await expect(page.getByRole('heading', { name: 'Select your ship' })).toBeVisible();
  await expect(page.locator('.ship-canvas canvas')).toBeVisible();
  await expect(page.locator('.preview-error')).toHaveCount(0);
  for (const [id, name] of [['poco', 'Poco'], ['largo', 'Largo'], ['scout', 'Scout'], ['m-bot', 'M-Bot']]) {
    const button = page.locator(`[data-ship="${id}"]`);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.ship-screen')).toHaveAttribute('data-busy', 'false');
    await expect(page.locator('#ship-name')).toHaveText(name);
    await page.getByRole('button', { name: 'Perspective', exact: true }).click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: testInfo.outputPath(`${id}-perspective.png`) });
    await page.getByRole('button', { name: 'Top', exact: true }).click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: testInfo.outputPath(`${id}-top.png`) });
    await page.getByRole('button', { name: 'View design reference' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const reference = page.getByRole('dialog').getByRole('img');
    await expect(reference).toHaveJSProperty('complete', true);
    await expect(reference).not.toHaveJSProperty('naturalWidth', 0);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Side', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: testInfo.outputPath('m-bot-side.png') });
  await page.getByRole('button', { name: 'Front', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: testInfo.outputPath('m-bot-front.png') });
  await page.getByRole('button', { name: 'Main menu' }).click();
  await expect(page.locator('.ship-screen')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Free flight' })).toBeFocused();
  await page.getByRole('button', { name: 'Free flight' }).click();
  await expect(page.locator('[data-ship="poco"]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('ship selection fits a phone and supports keyboard navigation', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Free flight' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Main menu' })).toBeFocused();
  await page.locator('[data-ship="m-bot"]').click();
  await expect(page.locator('.ship-screen')).toHaveAttribute('data-busy', 'false');
  await expect(page.locator('#ship-name')).toHaveText('M-Bot');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'View design reference' }).click();
  await page.getByRole('button', { name: 'Close design reference' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('hangar carousel slides between ships, wraps, updates stats, and respects reduced motion', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Free flight' }).click();
  await expect(page.locator('#ship-name')).toHaveText('Poco');
  const initialSpeed = await page.getByRole('meter', { name: 'Speed', exact: true }).getAttribute('aria-valuenow');
  await page.getByRole('button', { name: 'Next ship', exact: true }).click();
  await expect(page.locator('#ship-name')).toHaveText('Largo');
  await expect(page.locator('.ship-screen')).toHaveAttribute('data-busy', 'true');
  await page.screenshot({ path: testInfo.outputPath('transition.png') });
  await expect(page.locator('.ship-screen')).toHaveAttribute('data-busy', 'false');
  await expect(page.getByRole('meter', { name: 'Speed', exact: true })).not.toHaveAttribute('aria-valuenow', initialSpeed!);
  await page.screenshot({ path: testInfo.outputPath('hangar-largo.png') });
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#ship-name')).toHaveText('Poco');
  await expect(page.locator('.ship-screen')).toHaveAttribute('data-busy', 'false');
  await page.getByRole('button', { name: 'Previous ship', exact: true }).click();
  await expect(page.locator('#ship-name')).toHaveText('M-Bot');
  await expect(page.locator('.ship-screen')).toHaveAttribute('data-busy', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Next ship', exact: true }).click();
  await expect(page.locator('#ship-name')).toHaveText('Poco');
  await expect(page.locator('.ship-screen')).toHaveAttribute('data-busy', 'false');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Free flight' })).toBeFocused();
});
