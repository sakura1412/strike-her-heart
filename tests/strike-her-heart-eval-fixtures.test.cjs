/* Validate the gold inventory against rendered synthetic states, not agent output. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../evals');

test('evaluation inventories exactly match visible interactive controls in all six rendered input states', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dataset.json'), 'utf8'));
  const options = { headless: true };
  if (process.env.SHH_BROWSER_CHANNEL) options.channel = process.env.SHH_BROWSER_CHANNEL;
  if (process.env.SHH_BROWSER_EXECUTABLE) options.executablePath = process.env.SHH_BROWSER_EXECUTABLE;
  const browser = await chromium.launch(options);
  try {
    const context = await browser.newContext();
    let total = 0;
    for (const sample of manifest.cases) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://**', route => route.abort());
      await page.route('http://**', route => route.abort());
      await page.goto(pathToFileURL(path.join(root, sample.page)).href);
      const observed = await page.evaluate(() => {
        const scope = document.querySelector('dialog:modal') || document;
        return [...scope.querySelectorAll('button,input:not([type=hidden]),textarea,select,a[href],[role=button],[role=tab]')]
          .filter(node => node.getClientRects().length && !node.closest('[hidden],[inert]') && getComputedStyle(node).visibility !== 'hidden')
          .map(node => { if (!node.id) throw new Error('Evaluation controls must have stable IDs'); return '#'+node.id; }).sort();
      });
      const expected = JSON.parse(fs.readFileSync(path.join(root, sample.gold), 'utf8'));
      assert.deepEqual(errors, [], sample.id);
      assert.deepEqual(observed, expected.controls.map(control => control.target).sort(), sample.id);
      total += observed.length;
      await page.close();
    }
    assert.equal(manifest.cases.length, 6);
    assert.equal(total, 24);
  } finally { await browser.close(); }
});
