/* Product regression in an isolated browser context. No user browser/network. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const source = fs.readFileSync(path.resolve(__dirname, '../skills/strike-her-heart/assets/overlay.js'), 'utf8');
const fixture = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Product review fixture</title>
<style>body{margin:35px;font:15px/1.5 sans-serif}main{width:850px}button,input,select{padding:9px;margin:12px}h1{margin-bottom:32px}</style>
<main><h1>原页面标注产品验收</h1>${Array.from({ length: 10 }, (_, i) => `<button id="action-${i + 1}" onclick="window.businessClicks++">业务操作 ${i + 1}</button>`).join('')}<label for="name">名称</label><input id="name" maxlength="20"><select id="owner" aria-label="负责人"><option>甲</option><option>乙</option></select></main>
<script>window.businessClicks=0</script><script src="/overlay.js"></script></html>`;
let browser;
const state = page => page.evaluate(() => window.StrikeHerHeart.getSnapshot());
const card = (page, annotation) => page.locator(`[data-shh-card="${annotation.id}"]`);
const badge = (page, annotation) => page.locator(`[data-shh-bubble="${annotation.id}"]`);
async function open(page, annotation) { await badge(page, annotation).click(); }
async function showCatalog(page) {
  if (!(await page.locator('[data-shh-search]').isVisible())) await page.locator('[data-shh-catalog-toggle]').click();
}
async function annotation(page, key = 'action-1') { return (await state(page)).annotations.find(item => item.anchor.kind === 'id' && item.anchor.key === key); }
async function load(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.route('http://product.fixture/**', route => route.fulfill({ contentType: route.request().url().endsWith('/overlay.js') ? 'text/javascript' : 'text/html', body: route.request().url().endsWith('/overlay.js') ? source : fixture }));
  await page.goto('http://product.fixture/page');
  await page.waitForFunction(() => window.StrikeHerHeart?.getSnapshot()?.currentControlIds.length > 10);
  return page;
}
before(async () => {
  const options = { headless: true };
  if (process.env.SHH_BROWSER_CHANNEL) options.channel = process.env.SHH_BROWSER_CHANNEL;
  if (process.env.SHH_BROWSER_EXECUTABLE) options.executablePath = process.env.SHH_BROWSER_EXECUTABLE;
  browser = await chromium.launch(options);
});
after(async () => { if (browser) await browser.close(); });

test('catalog remains reachable with open cards; canonical ID, number and name locate without business clicks or lost drafts', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  try {
    const page = await load(context);
    const first = await annotation(page);
    const ninth = (await state(page)).annotations.find(item => item.number === 9);
    await open(page, first);
    await card(page, first).locator('[data-shh-field="function"]').fill('目录切换仍需保留的草稿');
    await showCatalog(page);
    for (const query of ['A-009', '9', ninth.currentLabel || ninth.label]) {
      await page.locator('[data-shh-search]').fill(query);
      assert.equal(await page.locator('[data-shh-catalog-item]').count(), 1);
      assert.equal(await page.locator(`[data-shh-catalog-item="${ninth.id}"]`).count(), 1);
    }
    await page.locator(`[data-shh-catalog-item="${ninth.id}"]`).click();
    assert.equal(await card(page, ninth).count(), 1);
    assert.equal(await card(page, first).locator('[data-shh-field="function"]').inputValue(), '目录切换仍需保留的草稿');
    assert.ok((await state(page)).ui.dirtyIds.includes(first.id));
    assert.equal(await page.evaluate(() => window.businessClicks), 0);
  } finally { await context.close(); }
});

test('quality and status filters describe only currently presented targets, with overlapping manual/review states retained', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  try {
    const page = await load(context);
    const records = await page.evaluate(() => {
      const data = window.StrikeHerHeart.exportData();
      const items = data.pages[0].annotations;
      for (const item of items) item.fieldStates = { content: 'observed', function: 'observed', limits: 'observed', navigation: 'observed' };
      const unknown = items.find(item => item.anchor.key === 'action-1');
      const review = items.find(item => item.anchor.key === 'action-2');
      const manual = items.find(item => item.anchor.key === 'action-3');
      unknown.fieldStates.function = 'unknown';
      review.fieldStates.function = 'conflict';
      manual.fieldStates.function = 'user'; manual.manualFields = ['function'];
      window.StrikeHerHeart.importData(data);
      return { unknown: unknown.id, review: review.id, manual: manual.id, total: items.length };
    });
    // The fixture promotes every unlinked business field to "observed"; the
    // evidence gate correctly leaves each such record in the review queue.
    assert.deepEqual((await state(page)).ui.quality, { total: records.total, unknown: 1, review: records.total, manual: 1, dirty: 0, hidden: 0 });
    assert.match(await page.locator('[data-shh-quality]').innerText(), /当前呈现范围/);
    assert.match(await page.locator('.scope-note').innerText(), /未访问或未展开范围不代表已完成/);
    for (const filter of ['unknown', 'review', 'manual']) {
      await page.locator('[data-shh-filter]').selectOption(filter);
      assert.equal(await page.locator('[data-shh-catalog-item]').count(), filter === 'review' ? records.total : 1);
      assert.equal(await page.locator(`[data-shh-catalog-item="${records[filter]}"]`).count(), 1);
    }
    await page.evaluate(() => { document.getElementById('action-3').hidden = true; window.StrikeHerHeart.scan(); });
    const q = (await state(page)).ui.quality;
    assert.equal(q.total, records.total - 1); assert.equal(q.manual, 0);
    assert.ok((await state(page)).annotations.some(item => item.id === records.manual), 'Inactive saved records remain retained, not counted as current coverage');
  } finally { await context.close(); }
});

test('four core fields stay editable while evidence is progressively disclosed and retained through catalog switching', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  try {
    const page = await load(context);
    const item = await annotation(page);
    await open(page, item);
    for (const field of ['content', 'function', 'limits', 'navigation']) {
      assert.equal(await card(page, item).locator(`[data-shh-field="${field}"]`).isVisible(), true);
      assert.equal(await card(page, item).locator(`[data-shh-evidence="${field}"]`).isVisible(), false);
    }
    assert.ok((await card(page, item).boundingBox()).height < 800);
    await card(page, item).locator('[data-shh-evidence-details="function"] > summary').click();
    await card(page, item).locator('[data-shh-evidence="function"]').fill('显式展开后填写的来源');
    await showCatalog(page);
    assert.equal(await card(page, item).locator('[data-shh-evidence="function"]').inputValue(), '显式展开后填写的来源');
    assert.equal(await card(page, item).locator('[data-shh-evidence="function"]').isVisible(), true);
  } finally { await context.close(); }
});

test('storage failure preserves dirty UI draft and old record; retry commits exactly once and survives reload', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  try {
    const page = await load(context);
    const item = await annotation(page);
    await open(page, item);
    const initialRevisions = item.revisions.length;
    await page.evaluate(() => {
      window.originalStorageWrite = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('strike-her-heart:')) throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
        return window.originalStorageWrite.call(this, key, value);
      };
    });
    const marker = '写入失败后重试可恢复的人工说明';
    await card(page, item).locator('[data-shh-field="function"]').fill(marker);
    await card(page, item).locator(`[data-shh-save="${item.id}"]`).click();
    let snapshot = await state(page);
    assert.ok(snapshot.ui.dirtyIds.includes(item.id));
    assert.equal(snapshot.ui.storageAvailable, false);
    assert.equal(snapshot.annotations.find(record => record.id === item.id).fields.function, item.fields.function);
    assert.equal(snapshot.annotations.find(record => record.id === item.id).revisions.length, initialRevisions);
    assert.equal(await card(page, item).locator('[data-shh-field="function"]').inputValue(), marker);
    assert.match(await card(page, item).locator('.save-status').innerText(), /尚未写入本浏览器/);
    assert.doesNotMatch(await card(page, item).locator('.save-status').innerText(), /已保存/);
    const exported = await page.evaluate(() => window.StrikeHerHeart.exportData());
    assert.equal(exported.pages[0].annotations.find(record => record.id === item.id).fields.function, item.fields.function);
    await page.evaluate(() => { Storage.prototype.setItem = window.originalStorageWrite; });
    await card(page, item).getByRole('button', { name: '重试保存', exact: true }).click();
    snapshot = await state(page);
    assert.equal(snapshot.ui.dirtyIds.includes(item.id), false);
    assert.equal(snapshot.annotations.find(record => record.id === item.id).revisions.length, initialRevisions + 1);
    await page.reload(); await page.waitForFunction(() => !!window.StrikeHerHeart?.getSnapshot());
    const restored = (await state(page)).annotations.find(record => record.id === item.id);
    assert.equal(restored.fields.function, marker); assert.equal(restored.number, item.number);
  } finally { await context.close(); }
});

for (const previousState of ['conflict', 'review']) test(`editing and saving preserves ${previousState}; explicit state selection resolves it without losing manual ownership`, async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  try {
    const page = await load(context);
    const item = await annotation(page);
    await page.evaluate(({ id, previousState }) => {
      const data = window.StrikeHerHeart.exportData();
      const target = data.pages[0].annotations.find(record => record.id === id);
      target.fieldStates.function = previousState;
      window.StrikeHerHeart.importData(data);
    }, { id: item.id, previousState });
    await open(page, item);
    await card(page, item).locator('[data-shh-field="function"]').fill('保留待处理状态的人工补充');
    assert.equal(await card(page, item).locator('[data-shh-state="function"]').inputValue(), previousState);
    await card(page, item).locator(`[data-shh-save="${item.id}"]`).click();
    await page.reload(); await page.waitForFunction(() => !!window.StrikeHerHeart?.getSnapshot());
    let saved = (await state(page)).annotations.find(record => record.id === item.id);
    assert.equal(saved.fieldStates.function, previousState);
    assert.equal(saved.status, 'needs-review'); assert.ok(saved.manualFields.includes('function'));
    await open(page, saved);
    await card(page, saved).locator('[data-shh-state="function"]').selectOption('supported');
    await card(page, saved).locator(`[data-shh-save="${saved.id}"]`).click();
    await page.reload(); await page.waitForFunction(() => !!window.StrikeHerHeart?.getSnapshot());
    saved = (await state(page)).annotations.find(record => record.id === item.id);
    assert.equal(saved.fieldStates.function, 'review'); assert.equal(saved.status, 'needs-review');
    assert.ok(saved.manualFields.includes('function'));
  } finally { await context.close(); }
});
