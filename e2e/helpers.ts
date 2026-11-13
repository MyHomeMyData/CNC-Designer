import { expect, type Page } from '@playwright/test';

/** Open the app and fail the test on any error in the browser console. */
export async function openApp(page: Page): Promise<void> {
  page.on('pageerror', (error) => {
    throw error;
  });
  page.on('console', (message) => {
    if (message.type() === 'error') throw new Error(`Console error: ${message.text()}`);
  });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
}

/** Type a value into a number field and commit it. */
export async function setNumber(page: Page, label: string, value: number | string): Promise<void> {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
}

export async function addLayer(page: Page, module: string): Promise<void> {
  await page.locator('.layer-add select').selectOption({ label: module });
  await page.getByRole('button', { name: 'Add layer' }).click();
}

/** Converts program coordinates (mm) of the default work area to page pixels. */
export async function canvasMapper(page: Page) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas not found');
  // The default work area of 800 × 600 mm is fitted with a margin of 40 px.
  const scale = Math.min((box.width - 80) / 800, (box.height - 80) / 600);
  return {
    x: (mm: number) => box.x + box.width / 2 + (mm - 400) * scale,
    y: (mm: number) => box.y + box.height / 2 - (mm - 300) * scale,
  };
}

export async function downloadText(page: Page, trigger: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return { name: download.suggestedFilename(), text: Buffer.concat(chunks).toString('utf8') };
}
