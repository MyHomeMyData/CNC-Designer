import { expect, test } from '@playwright/test';
import { addLayer, canvasMapper, downloadText, openApp, setNumber } from './helpers.ts';

test('design shapes and export one G-code file per tool', async ({ page }) => {
  await openApp(page);
  await addLayer(page, 'Basic shape');
  await setNumber(page, 'Position X', 100);
  await setNumber(page, 'Position Y', 100);
  await setNumber(page, 'Width', '300,5'); // decimal comma
  await addLayer(page, 'Basic shape');
  await page.getByLabel('Shape').selectOption('grid');
  await setNumber(page, 'Position X', 500);
  await setNumber(page, 'Position Y', 400);
  await page.getByLabel('Operation').selectOption({ label: 'Drill' });

  await page.getByRole('button', { name: /^G-code/ }).click();
  await expect(page.locator('.program h3')).toHaveText(['End mill 2 mm', 'Drill 2 mm']);
  await expect(page.locator('.issues li')).toHaveCount(0);

  const file = await downloadText(page, () => page.locator('.program button').first().click());
  expect(file.name).toBe('Untitled_1_End-mill-2-mm.gcode');
  expect(file.text).toContain('G21 ; millimetres');
  expect(file.text).toContain('G0 Z5.000\nG0 X100.000 Y100.000\nG1 Z-1.000 F200\nG1 X400.500 F600');
  expect(file.text).not.toMatch(/G10|G92|G54|M3\b/);
});

test('refuse to export moves outside the work area, and undo', async ({ page }) => {
  await openApp(page);
  await addLayer(page, 'Basic shape');
  await setNumber(page, 'Position X', 750);
  await page.getByRole('button', { name: /^G-code/ }).click();
  await expect(page.locator('.issues li.error').first()).toContainText('leaves the work area');
  await expect(page.locator('.program button')).toBeDisabled();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.issues li')).toHaveCount(0);
  await expect(page.locator('.program button')).toBeEnabled();
});

test('import an SVG file', async ({ page }) => {
  await openApp(page);
  await page.locator('.layer-add select').selectOption({ label: 'SVG import' });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Add layer' }).click(),
  ]);
  await chooser.setFiles('e2e/fixtures/drawing.svg');

  await expect(page.locator('.layer-name')).toHaveText(['drawing']);
  await expect(page.getByText('page 200.0 × 100.0 mm, 3 paths')).toBeVisible();
  await expect(page.getByText('Text was skipped')).toBeVisible();
  await expect(page.getByLabel('Size in X', { exact: true })).toHaveValue('180');
  await expect(page.getByLabel('Size in Y', { exact: true })).toHaveValue('80');
});

test('write text, save the project and open it again', async ({ page }) => {
  await openApp(page);
  await addLayer(page, 'Text');
  await page.getByLabel('Text', { exact: true }).fill('Jürgen\nMPCNC');
  await setNumber(page, 'Letter height', 40);
  await page.getByLabel('Font').selectOption({ label: 'Oswald' });
  await page.getByRole('button', { name: 'Centre on workpiece' }).click();
  const positionX = await page.getByLabel('Position X', { exact: true }).inputValue();

  const saved = await downloadText(page, () => page.getByRole('button', { name: 'Save' }).click());
  expect(saved.name).toBe('Untitled.cncd.json');
  expect(JSON.parse(saved.text).layers[0].params.text).toBe('Jürgen\nMPCNC');

  await page.getByRole('button', { name: 'New' }).click();
  await expect(page.locator('.layer-name')).toHaveCount(0);

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Open…' }).click(),
  ]);
  await chooser.setFiles({
    name: saved.name,
    mimeType: 'application/json',
    buffer: Buffer.from(saved.text),
  });
  await expect(page.locator('.layer-name')).toHaveText(['Text']);
  await page.locator('.layer-name').click();
  await expect(page.getByLabel('Font')).toHaveValue('oswald');
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue(positionX);
});

test('report a file that is not a project', async ({ page }) => {
  await openApp(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Open…' }).click(),
  ]);
  await chooser.setFiles({
    name: 'x.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  });
  await expect(page.getByRole('alert')).toContainText('could not be opened');
  await expect(page.getByRole('alert')).toContainText('not a CNC-Designer project');
});

test('move, scale and rotate a layer with the mouse', async ({ page }) => {
  await openApp(page);
  await addLayer(page, 'Basic shape'); // rectangle 100 × 60 at the zero point
  const at = await canvasMapper(page);
  const positionX = page.getByLabel('Position X', { exact: true });
  const positionY = page.getByLabel('Position Y', { exact: true });

  // drag the lower edge: the layer moves by (200, 200)
  await page.mouse.move(at.x(50), at.y(0));
  await page.mouse.down();
  await page.mouse.move(at.x(150), at.y(100), { steps: 5 });
  await page.mouse.move(at.x(250), at.y(200), { steps: 5 });
  await page.mouse.up();
  await expect(positionX).toHaveValue('200');
  await expect(positionY).toHaveValue('200');

  // pull the upper right corner away from the lower left one: twice the size
  await page.mouse.move(at.x(300), at.y(260));
  await page.mouse.down();
  await page.mouse.move(at.x(400), at.y(320), { steps: 8 });
  await page.mouse.up();
  await expect(page.getByLabel('Size in X', { exact: true })).toHaveValue('200');
  await expect(page.getByLabel('Size in Y', { exact: true })).toHaveValue('120');
  await expect(positionX).toHaveValue('200');

  // each drag is a single undo step
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Size in X', { exact: true })).toHaveValue('100');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(positionX).toHaveValue('0');

  // dragging empty space moves the view, not the layer
  await page.mouse.move(at.x(600), at.y(500));
  await page.mouse.down();
  await page.mouse.move(at.x(650), at.y(450), { steps: 3 });
  await page.mouse.up();
  await expect(positionX).toHaveValue('0');
});

test('export the design as SVG', async ({ page }) => {
  await openApp(page);
  await addLayer(page, 'Basic shape');
  const file = await downloadText(page, () =>
    page.getByRole('button', { name: 'Export SVG' }).click(),
  );
  expect(file.name).toBe('Untitled.svg');
  expect(file.text).toContain('viewBox="0 -600 800 600"');
  expect(file.text).toContain('<path d="M0 0 L100 0 L100 -60 L0 -60 Z"/>');
});
