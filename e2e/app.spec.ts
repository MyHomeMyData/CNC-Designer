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

test('import a Sandify G-code file and choose its parts', async ({ page }) => {
  await openApp(page);
  await page.locator('.layer-add select').selectOption({ label: 'G-code import' });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Add layer' }).click(),
  ]);
  await chooser.setFiles('e2e/fixtures/sand.gcode');

  await expect(page.locator('.layer-name')).toHaveText(['sand']);
  await expect(page.getByText('180.0 × 80.0 mm, 13 points')).toBeVisible();
  // layers are worked, the ways between them are not
  await expect(page.getByLabel('1 square · 5 points')).toBeChecked();
  await page.getByText('Connectors: 0 of 2 worked').click();
  await expect(page.getByLabel('Connector 1 · 2 points')).not.toBeChecked();
  await expect(page.getByLabel('Size in X', { exact: true })).toHaveValue('160');

  const plunges = async () => {
    await page.getByRole('button', { name: /^G-code/ }).click();
    const file = await downloadText(page, () => page.locator('.program button').first().click());
    // nothing of the sand table's own start code reaches the mill
    expect(file.text).not.toMatch(/\$H|G10/);
    return file.text.split('\n').filter((line) => /^G1 Z-/.test(line)).length;
  };
  expect(await plunges()).toBe(2);

  // with the connector between them, square and triangle are one path
  await page.getByLabel('Connector 1 · 2 points').check();
  await expect(page.getByLabel('Size in X', { exact: true })).toHaveValue('160');
  expect(await plunges()).toBe(1);
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

  // drag the lower edge away from its middle: the layer moves by (200, 200)
  await page.mouse.move(at.x(20), at.y(0));
  await page.mouse.down();
  await page.mouse.move(at.x(120), at.y(100), { steps: 5 });
  await page.mouse.move(at.x(220), at.y(200), { steps: 5 });
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

test('pull the edges of a rectangle and round its corners', async ({ page }) => {
  await openApp(page);
  await addLayer(page, 'Basic shape'); // rectangle 100 × 60 at the zero point
  const at = await canvasMapper(page);
  const width = page.getByLabel('Width', { exact: true });
  const height = page.getByLabel('Height', { exact: true });
  const positionX = page.getByLabel('Position X', { exact: true });
  const positionY = page.getByLabel('Position Y', { exact: true });

  // right edge: only the width changes, the rectangle stays where it is
  await page.mouse.move(at.x(100), at.y(30));
  await page.mouse.down();
  await page.mouse.move(at.x(200), at.y(80), { steps: 8 });
  await page.mouse.up();
  await expect(width).toHaveValue('200');
  await expect(height).toHaveValue('60');
  await expect(positionX).toHaveValue('0');
  await expect(positionY).toHaveValue('0');

  // lower edge: the height changes and the upper edge stays, so the origin moves
  await page.mouse.move(at.x(100), at.y(0));
  await page.mouse.down();
  await page.mouse.move(at.x(100), at.y(20), { steps: 8 });
  await page.mouse.up();
  await expect(height).toHaveValue('40');
  await expect(positionY).toHaveValue('20');
  await expect(width).toHaveValue('200');

  // one drag is one undo step
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(height).toHaveValue('60');
  await expect(positionY).toHaveValue('0');

  // a radius that is too large is limited, and the panel says so
  await setNumber(page, 'Corner radius', 10);
  await expect(page.getByText('Limited to')).toHaveCount(0);
  await setNumber(page, 'Corner radius', 500);
  await expect(page.getByText('Limited to 30 mm')).toBeVisible();
});

test('snap to a grid while dragging, and remember the setting', async ({ page }) => {
  await openApp(page);
  await addLayer(page, 'Basic shape'); // rectangle 100 × 60 at the zero point
  const at = await canvasMapper(page);
  const positionX = page.getByLabel('Position X', { exact: true });
  const positionY = page.getByLabel('Position Y', { exact: true });
  const snap = page.getByLabel('Snap', { exact: true });
  const grid = page.getByLabel('Snap grid', { exact: true });
  const drag = async (fromX: number, fromY: number, toX: number, toY: number, alt = false) => {
    await page.mouse.move(at.x(fromX), at.y(fromY));
    await page.mouse.down();
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.move(at.x(toX), at.y(toY), { steps: 6 });
    await page.mouse.up();
    if (alt) await page.keyboard.up('Alt');
  };

  // the grid starts at 10 mm: a move by (33, 58) ends at (30, 60)
  await expect(snap).toBeChecked();
  await expect(grid).toHaveValue('10');
  await drag(20, 0, 53, 58);
  await expect(positionX).toHaveValue('30');
  await expect(positionY).toHaveValue('60');

  // a wider grid, typed with a fraction: whole millimetres only
  await setNumber(page, 'Snap grid', '24,6');
  await expect(grid).toHaveValue('25');
  await drag(50, 60, 100, 100); // origin from (30, 60) to about (80, 100)
  await expect(positionX).toHaveValue('75');
  await expect(positionY).toHaveValue('100');

  // the right edge, at 175, lands on a grid line: 200
  await drag(175, 130, 207, 130);
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('125');

  // Alt moves freely
  await drag(95, 100, 108, 100, true);
  await expect(positionX).not.toHaveValue('75');
  await expect(positionX).not.toHaveValue('100');

  // the setting survives a reload, also when switched off
  await snap.uncheck();
  await expect(grid).toBeDisabled();
  page.on('dialog', (dialog) => void dialog.accept());
  await page.reload();
  await expect(page.getByLabel('Snap', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Snap grid', { exact: true })).toHaveValue('25');
});

test('design string art from a template and export the drilling program', async ({ page }) => {
  await openApp(page);
  await addLayer(page, 'String art');
  // a new string art layer starts in the middle of the workpiece
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('400');
  await expect(page.getByLabel('Position Y', { exact: true })).toHaveValue('300');

  // the default is the circle with two axes
  await expect(page.getByText('197 nails to drill.')).toBeVisible();
  await expect(page.getByText(/Star: [\d.]+ m of thread\./)).toBeVisible();

  // fewer repetitions, fewer nails; one undo brings them back
  await setNumber(page, 'Repetitions', 2);
  await expect(page.getByText('101 nails to drill.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('197 nails to drill.')).toBeVisible();

  // a template is changed by its own few parameters
  await page.getByLabel('Template', { exact: true }).selectOption({ label: 'Parabola star' });
  await expect(page.getByText('288 nails to drill.')).toBeVisible();
  await setNumber(page, 'Triangles', 6);
  await setNumber(page, 'Triangle height', 80);
  await expect(page.getByText('216 nails to drill.')).toBeVisible();
  await expect(page.getByText(/Opening angle [\d.]+°/)).toBeVisible();
  // changing the repetitions by hand makes it a design of its own
  await setNumber(page, 'Repetitions', 3);
  await expect(page.getByLabel('Triangles', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Template', { exact: true })).toHaveValue('');

  // another template replaces rows and threads
  await page.getByLabel('Template', { exact: true }).selectOption({ label: 'Cardioid' });
  await expect(page.getByText('120 nails to drill.')).toBeVisible();

  // the instructions open as a page of their own, with the way of the thread
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Stringing instructions' }).click();
  const instructions = await popup;
  await expect(instructions.getByRole('heading', { name: 'Times table' })).toBeVisible();
  await expect(
    instructions.getByText(/Tie it to A\d+; it ends at A\d+ after \d+ nails\./),
  ).toBeVisible();
  await expect(instructions.getByRole('img', { name: 'Nail template' })).toBeVisible();
  await instructions.close();

  // the nails are drilled: one program with 120 holes
  await page.getByRole('button', { name: /^G-code/ }).click();
  const file = await downloadText(page, () => page.locator('.program button').first().click());
  expect(file.name).toMatch(/\.(gcode|nc)$/);
  const plunges = file.text.split('\n').filter((line) => /^G1 Z-5/.test(line));
  expect(plunges.length).toBeGreaterThanOrEqual(120);
});
