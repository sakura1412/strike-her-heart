/* Structured evidence regression. Fictional fixtures only; no user browser or external network. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const source = fs.readFileSync(path.resolve(__dirname, '../skills/strike-her-heart/assets/overlay.js'), 'utf8');
const fields = ['content', 'function', 'limits', 'navigation'];
const levels = ['tested', 'page', 'prd', 'guess', 'unclassified'];
const screenshotDirectory = path.resolve(__dirname, '../test-results/evidence');
const fixture = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>虚构证据分级测试夹具</title>
<style>body{margin:24px;font:15px/1.6 sans-serif;color:#27324b;background:#f6f7fb}main{max-width:850px}h1{font-size:25px}p{color:#64728a}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:18px;margin-top:24px}label{display:flex;flex-direction:column;gap:8px}button,input,select,a{box-sizing:border-box;max-width:100%;padding:10px;border:1px solid #bdc9dd;border-radius:7px;background:white;color:#263c60}button{margin:16px 0}a{display:block;text-decoration:none}@media(max-width:500px){body{margin:18px}h1{font-size:21px}}</style>
<main><h1>虚构样本 · 证据等级验收</h1><p>此页仅验证标注系统，不代表真实系统或 Agent 实测基线。</p>
<button id="submit" onclick="window.fixtureClicks++">模拟提交</button>
<section><label for="name">名称（页面声明必填，最多 20 字符）<input id="name" required maxlength="20"></label>
<label for="owner">负责人<select id="owner"><option>演示甲</option><option>演示乙</option></select></label>
<a id="details" href="/details" target="_blank">查看虚构详情</a>
<button id="page-only">页面声明样本</button><button id="prd-only">PRD 样本</button><button id="guess-only">猜测样本</button><button id="unclassified-only">未分级样本</button></section></main>
<script>window.fixtureClicks=0;</script><script src="/overlay.js"></script></html>`;

let browser;
const state = page => page.evaluate(() => window.StrikeHerHeart.getSnapshot());
const card = (page, item) => page.locator(`[data-shh-card="${item.id}"]`);
const bubble = (page, item) => page.locator(`[data-shh-bubble="${item.id}"]`);
const exported = page => page.evaluate(() => window.StrikeHerHeart.exportData());
const imported = (page, data) => page.evaluate(data => window.StrikeHerHeart.importData(data), data);
async function annotation(page, key = 'submit') {
  return (await state(page)).annotations.find(item => item.anchor.kind === 'id' && item.anchor.key === key);
}
async function openCard(page, item) {
  await bubble(page, item).click();
  assert.equal(await card(page, item).count(), 1);
}
async function openEvidence(page, item, field) {
  const details = card(page, item).locator(`[data-shh-evidence-details="${field}"]`);
  if (!(await details.getAttribute('open')) && !(await details.evaluate(node => node.open))) await details.locator('summary').click();
  return details;
}
async function save(page, item) {
  await card(page, item).locator(`[data-shh-save="${item.id}"]`).click();
}
async function load(context) {
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.setDefaultTimeout(5000);
  await page.route('http://evidence.fixture/**', route => {
    const isScript = new URL(route.request().url()).pathname === '/overlay.js';
    return route.fulfill({ contentType: isScript ? 'text/javascript' : 'text/html', body: isScript ? source : fixture });
  });
  await page.goto('http://evidence.fixture/page');
  await page.waitForFunction(() => window.StrikeHerHeart?.getSnapshot()?.currentControlIds.length > 0).catch(error => {
    throw new Error(`Fixture runtime did not start: ${runtimeErrors.join('; ') || error.message}`);
  });
  assert.equal((await state(page)).currentControlIds.length, 9, 'Eight controls plus the page summary are in scope');
  return page;
}
async function reload(page) {
  await page.reload();
  await page.waitForFunction(() => window.StrikeHerHeart?.getSnapshot()?.currentControlIds.length === 9);
}
function meta(level, overrides = {}) {
  return {
    level,
    source: ['tested', 'page', 'prd'].includes(level) ? `虚构测试夹具：${level} 来源` : '',
    locator: ['tested', 'page', 'prd'].includes(level) ? (level === 'prd' ? 'fixture-prd §2.1' : '#submit') : '',
    action: level === 'tested' ? '虚构记录：点击模拟提交一次' : '',
    result: level === 'tested' ? '虚构记录：计数由 0 变为 1' : '',
    observedAt: level === 'tested' ? '2026-10-27T09:00:00.000Z' : '',
    derivation: 'explicit',
    ...overrides
  };
}
async function setFieldMeta(page, item, field, value) {
  await openEvidence(page, item, field);
  const box = card(page, item);
  await box.locator(`[data-shh-level-select="${field}"]`).selectOption(value.level);
  for (const key of ['source', 'locator', 'action', 'result', 'observedAt']) {
    const input = box.locator(`[data-shh-provenance="${field}:${key}"]`);
    if (await input.isVisible()) await input.fill(value[key]);
  }
  if (value.level === 'prd') await box.locator(`[data-shh-derivation="${field}"]`).selectOption(value.derivation);
}
async function patchField(page, key, field, patch) {
  const data = await exported(page);
  const item = data.pages[0].annotations.find(record => record.anchor.key === key);
  if (patch.value !== undefined) item.fields[field] = patch.value;
  if (patch.evidence !== undefined) item.evidence[field] = patch.evidence;
  if (patch.state !== undefined) item.fieldStates[field] = patch.state;
  if (patch.meta !== undefined) item.evidenceMeta[field] = patch.meta;
  await imported(page, data);
  return annotation(page, key);
}
async function blockStorage(page) {
  await page.evaluate(() => {
    window.fixtureStorageWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('strike-her-heart:')) throw new DOMException('Fictional evidence quota failure', 'QuotaExceededError');
      return window.fixtureStorageWrite.call(this, key, value);
    };
  });
}
async function restoreStorage(page) {
  await page.evaluate(() => { Storage.prototype.setItem = window.fixtureStorageWrite; });
}

before(async () => {
  const options = { headless: true };
  if (process.env.SHH_BROWSER_CHANNEL) options.channel = process.env.SHH_BROWSER_CHANNEL;
  if (process.env.SHH_BROWSER_EXECUTABLE) options.executablePath = process.env.SHH_BROWSER_EXECUTABLE;
  browser = await chromium.launch(options);
});
after(async () => { if (browser) await browser.close(); });

test('DOM required, maxlength and href are page declarations, never observed interaction evidence', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1100 } });
  try {
    const page = await load(context);
    const input = await annotation(page, 'name');
    const link = await annotation(page, 'details');
    assert.equal(input.evidenceMeta.limits.level, 'page');
    assert.match(input.evidence.limits, /required/);
    assert.match(input.evidence.limits, /maxlength/);
    assert.equal(link.evidenceMeta.navigation.level, 'page');
    for (const item of (await state(page)).annotations) {
      for (const field of fields) assert.notEqual(item.evidenceMeta[field].level, 'tested');
    }
    for (const entry of [input.evidenceMeta.limits, link.evidenceMeta.navigation]) {
      assert.ok(entry.source.trim()); assert.ok(entry.locator.trim());
      assert.equal(entry.action, ''); assert.equal(entry.result, ''); assert.equal(entry.observedAt, '');
    }
    await openCard(page, input);
    const badge = card(page, input).locator('[data-shh-level="limits"]');
    assert.equal(await badge.getAttribute('data-level'), 'page');
    assert.match(await badge.innerText(), /L2.*页面声明/);
    assert.equal(await page.evaluate(() => window.fixtureClicks), 0);
    assert.equal((await exported(page)).schemaVersion, 1);
  } finally { await context.close(); }
});

test('legacy local storage conservatively migrates observed to page and preserves IDs, manual prose and legacy history', async () => {
  const context = await browser.newContext();
  try {
    const page = await load(context);
    const original = await annotation(page);
    const data = await exported(page);
    const stored = data.pages[0];
    for (const item of stored.annotations) delete item.evidenceMeta;
    const item = stored.annotations.find(record => record.id === original.id);
    item.fields.content = '旧页面可见说明';
    item.fields.function = '旧人工说明必须原样保留';
    item.fieldStates = { content: 'observed', function: 'user', limits: 'supported', navigation: 'unknown' };
    item.evidence.limits = '旧自由文本提到已实测、PRD；不能据此猜测结构化等级';
    item.manualFields = ['content', 'function'];
    item.revisions = [{ at: '2026-10-01T00:00:00.000Z', action: 'legacy fixture', fields: { ...item.fields }, evidence: { ...item.evidence }, fieldStates: { ...item.fieldStates }, status: 'enriched', anchor: { ...item.anchor } }];
    await page.evaluate(stored => {
      const key = Object.keys(localStorage).find(key => key.startsWith('strike-her-heart:'));
      if (!key) throw new Error('Fixture storage key missing');
      localStorage.setItem(key, JSON.stringify(stored));
    }, stored);
    await reload(page);
    const migrated = await annotation(page);
    assert.equal(migrated.id, original.id); assert.equal(migrated.number, original.number);
    assert.equal(migrated.displayId, original.displayId);
    assert.equal(migrated.fields.function, item.fields.function);
    assert.ok(migrated.manualFields.includes('function'));
    assert.equal(migrated.evidenceMeta.content.level, 'page');
    assert.ok(migrated.evidenceMeta.content.source); assert.ok(migrated.evidenceMeta.content.locator);
    for (const field of ['function', 'limits', 'navigation']) assert.equal(migrated.evidenceMeta[field].level, 'unclassified');
    assert.equal(migrated.evidence.limits, item.evidence.limits);
    assert.ok(migrated.revisions.some(revision => revision.action === 'legacy fixture'));
    assert.equal((await exported(page)).schemaVersion, 1);
  } finally { await context.close(); }
});

test('legacy import without metadata does not infer tested or PRD tiers from old prose', async () => {
  const context = await browser.newContext();
  try {
    const page = await load(context);
    const original = await annotation(page);
    const data = await exported(page);
    const item = data.pages[0].annotations.find(record => record.id === original.id);
    delete item.evidenceMeta;
    item.fieldStates = { content: 'observed', function: 'supported', limits: 'user', navigation: 'unknown' };
    item.fields.limits = '导入的旧人工限制'; item.manualFields = ['limits'];
    item.evidence.function = '旧证据声称已点击验证且源自 PRD';
    await imported(page, data);
    const restored = await annotation(page);
    assert.equal(restored.id, original.id); assert.equal(restored.number, original.number);
    assert.equal(restored.evidenceMeta.content.level, 'page');
    for (const field of ['function', 'limits', 'navigation']) assert.equal(restored.evidenceMeta[field].level, 'unclassified');
    assert.equal(restored.fields.limits, item.fields.limits);
    assert.ok(restored.manualFields.includes('limits'));
    assert.equal(restored.evidence.function, item.evidence.function);
  } finally { await context.close(); }
});

test('incomplete or invalid imported provenance is downgraded without losing prose or hiding conflict', async () => {
  const context = await browser.newContext();
  try {
    const page = await load(context);
    const cases = [
      ['tested', meta('tested', { action: '', result: '', observedAt: '' }), 'supported'],
      ['tested invalid date', meta('tested', { observedAt: '2026-02-30T09:00:00.000Z' }), 'supported'],
      ['page', meta('page', { source: '' }), 'supported'],
      ['prd', meta('prd', { locator: '' }), 'supported'],
      ['prd conflict', meta('prd', { source: '' }), 'conflict']
    ];
    for (const [label, value, previousState] of cases) {
      const prose = `保留不完整 ${label} 的原文`;
      const result = await patchField(page, 'submit', 'function', { value: prose, state: previousState, meta: value });
      assert.equal(result.fields.function, prose, label);
      assert.equal(result.evidenceMeta.function.level, 'unclassified', label);
      assert.equal(result.fieldStates.function, previousState === 'conflict' ? 'conflict' : 'review', label);
      assert.equal(result.status, 'needs-review', label);
    }
  } finally { await context.close(); }
});

test('a proposed tested tier cannot save with missing action, result or valid ISO time; the draft survives', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1100 } });
  try {
    const page = await load(context);
    const original = await annotation(page);
    await openCard(page, original);
    const prose = '仅用于测试的拟验证说明';
    await card(page, original).locator('[data-shh-field="function"]').fill(prose);
    await setFieldMeta(page, original, 'function', meta('tested', { action: '', result: '', observedAt: '' }));
    await save(page, original);
    let current = await annotation(page);
    assert.equal(current.fields.function, original.fields.function);
    assert.equal(current.evidenceMeta.function.level, original.evidenceMeta.function.level);
    assert.equal(current.revisions.length, original.revisions.length);
    assert.ok((await state(page)).ui.dirtyIds.includes(original.id));
    assert.equal(await card(page, original).locator('[data-shh-field="function"]').inputValue(), prose);
    let error = await card(page, original).locator('.save-status').innerText();
    assert.match(error, /未保存/); assert.match(error, /验证动作/); assert.match(error, /观察结果/); assert.match(error, /ISO/);
    assert.doesNotMatch(error, /已保存/);
    assert.equal((await exported(page)).pages[0].annotations.find(item => item.id === original.id).fields.function, original.fields.function);
    await setFieldMeta(page, original, 'function', meta('tested', { observedAt: 'yesterday' }));
    await save(page, original);
    assert.equal((await annotation(page)).revisions.length, original.revisions.length);
    assert.match(await card(page, original).locator('.save-status').innerText(), /ISO/);
    await setFieldMeta(page, original, 'function', meta('tested'));
    await card(page, original).locator('[data-shh-state="function"]').selectOption('supported');
    await save(page, original);
    current = await annotation(page);
    assert.equal(current.fields.function, prose);
    assert.deepEqual(current.evidenceMeta.function, meta('tested'));
    assert.equal(current.revisions.length, original.revisions.length + 1);
    assert.equal((await state(page)).ui.dirtyIds.includes(original.id), false);
  } finally { await context.close(); }
});

test('PRD selection without source and locator remains an unsaved draft', async () => {
  const context = await browser.newContext();
  try {
    const page = await load(context);
    const original = await annotation(page);
    await openCard(page, original);
    await setFieldMeta(page, original, 'function', meta('prd', { source: '', locator: '', derivation: 'inferred' }));
    await save(page, original);
    assert.ok((await state(page)).ui.dirtyIds.includes(original.id));
    assert.equal((await annotation(page)).evidenceMeta.function.level, 'unclassified');
    const error = await card(page, original).locator('.save-status').innerText();
    assert.match(error, /来源名称/); assert.match(error, /来源定位/);
    assert.equal((await annotation(page)).revisions.length, original.revisions.length);
  } finally { await context.close(); }
});

test('tested evidence survives reload, export, import and revision history; changed prose requires review', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1100 } });
  let restoredContext;
  try {
    const page = await load(context);
    const original = await annotation(page);
    await openCard(page, original);
    await card(page, original).locator('[data-shh-field="function"]').fill('测试夹具：已记录的旧说明');
    await setFieldMeta(page, original, 'function', meta('tested'));
    await card(page, original).locator('[data-shh-state="function"]').selectOption('supported');
    await save(page, original);
    await reload(page);
    let saved = await annotation(page);
    assert.deepEqual(saved.evidenceMeta.function, meta('tested'));
    assert.equal(saved.fieldStates.function, 'supported');
    if (!(await card(page, saved).count())) await openCard(page, saved);
    await card(page, saved).locator('[data-shh-field="function"]').fill('人工改成的新说明，旧实测不认证此内容');
    assert.equal(await card(page, saved).locator('[data-shh-state="function"]').inputValue(), 'review');
    assert.equal(await card(page, saved).locator('[data-shh-level="function"]').getAttribute('data-level'), 'tested');
    assert.match(await card(page, saved).locator('.level-state').filter({ hasText: '需复核' }).first().innerText(), /需复核/);
    // Even an explicit state selection cannot re-certify changed text with the unchanged old action record.
    await card(page, saved).locator('[data-shh-state="function"]').selectOption('supported');
    await save(page, saved);
    saved = await annotation(page);
    assert.equal(saved.fieldStates.function, 'review');
    assert.deepEqual(saved.evidenceMeta.function, meta('tested'));
    const previous = saved.revisions.find(revision => revision.fields.function === '测试夹具：已记录的旧说明');
    assert.ok(previous); assert.deepEqual(previous.evidenceMeta.function, meta('tested'));
    const data = await exported(page);
    restoredContext = await browser.newContext();
    const restoredPage = await load(restoredContext);
    await imported(restoredPage, data);
    await reload(restoredPage);
    const restored = await annotation(restoredPage);
    assert.equal(restored.id, original.id);
    assert.equal(restored.fields.function, saved.fields.function);
    assert.equal(restored.fieldStates.function, 'review');
    assert.deepEqual(restored.evidenceMeta.function, meta('tested'));
    assert.ok(restored.manualFields.includes('function'));
    const restoredRevision = restored.revisions.find(revision => revision.fields.function === '测试夹具：已记录的旧说明');
    assert.ok(restoredRevision); assert.deepEqual(restoredRevision.evidenceMeta.function, meta('tested'));
  } finally { if (restoredContext) await restoredContext.close(); await context.close(); }
});

test('metadata-only imports preserve manual evidence, become suggestions, and transfer metadata on acceptance', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1100 } });
  try {
    const page = await load(context);
    const original = await annotation(page);
    await openCard(page, original);
    await card(page, original).locator('[data-shh-field="function"]').fill('人工维护且此次导入不改动的说明');
    await setFieldMeta(page, original, 'function', meta('page'));
    await save(page, original);
    const before = await annotation(page);
    const data = await exported(page);
    const candidate = data.pages[0].annotations.find(item => item.id === original.id);
    const suggestedMeta = meta('prd', { derivation: 'inferred' });
    candidate.evidenceMeta.function = suggestedMeta;
    await imported(page, data);
    let saved = await annotation(page);
    assert.equal(saved.fields.function, before.fields.function);
    assert.deepEqual(saved.evidenceMeta.function, before.evidenceMeta.function);
    assert.ok(saved.suggestions.function, 'A level-only difference must not silently overwrite manual evidence');
    assert.deepEqual(saved.suggestions.function.evidenceMeta, suggestedMeta);
    assert.equal(saved.status, 'needs-review');
    await card(page, saved).getByRole('button', { name: '采用建议为草稿', exact: true }).click();
    assert.ok((await state(page)).ui.dirtyIds.includes(saved.id));
    assert.equal(await card(page, saved).locator('[data-shh-level="function"]').getAttribute('data-level'), 'prd');
    assert.match(await card(page, saved).locator('[data-shh-level="function"]').innerText(), /推断/);
    await save(page, saved);
    saved = await annotation(page);
    assert.deepEqual(saved.evidenceMeta.function, suggestedMeta);
    assert.equal(saved.fields.function, before.fields.function);
    assert.ok(saved.manualFields.includes('function'));
    await reload(page);
    assert.deepEqual((await annotation(page)).evidenceMeta.function, suggestedMeta);
  } finally { await context.close(); }
});

test('metadata storage failure rolls back committed provenance and revisions, preserves the draft, and retries once', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1100 } });
  try {
    const page = await load(context);
    const original = await annotation(page);
    await openCard(page, original);
    await setFieldMeta(page, original, 'function', meta('page'));
    await save(page, original);
    const before = await annotation(page);
    const next = meta('prd', { source: '虚构修订 PRD v2', locator: 'fixture-prd §4.2', derivation: 'inferred' });
    await setFieldMeta(page, original, 'function', next);
    await blockStorage(page);
    await save(page, original);
    const failed = await annotation(page);
    assert.deepEqual(failed.evidenceMeta, before.evidenceMeta);
    assert.deepEqual(failed.revisions, before.revisions);
    assert.ok((await state(page)).ui.dirtyIds.includes(original.id));
    assert.equal(await card(page, original).locator('[data-shh-level-select="function"]').inputValue(), 'prd');
    assert.equal(await card(page, original).locator('[data-shh-provenance="function:source"]').inputValue(), next.source);
    assert.equal(await card(page, original).locator('[data-shh-provenance="function:locator"]').inputValue(), next.locator);
    assert.match(await card(page, original).locator('.save-status').innerText(), /尚未写入本浏览器/);
    const backup = await exported(page);
    assert.deepEqual(backup.pages[0].annotations.find(item => item.id === original.id).evidenceMeta, before.evidenceMeta);
    await restoreStorage(page);
    await card(page, original).getByRole('button', { name: '重试保存', exact: true }).click();
    const saved = await annotation(page);
    assert.deepEqual(saved.evidenceMeta.function, next);
    assert.equal(saved.revisions.length, before.revisions.length + 1);
    assert.deepEqual(saved.revisions.at(-1).evidenceMeta, before.evidenceMeta);
    assert.equal((await state(page)).ui.dirtyIds.includes(original.id), false);
    await reload(page);
    assert.deepEqual((await annotation(page)).evidenceMeta.function, next);
  } finally { await context.close(); }
});

test('importing new tested prose with only a changed source cannot reuse an old action result as certification', async () => {
  const context = await browser.newContext();
  try {
    const page = await load(context);
    const old = await patchField(page, 'submit', 'function', { value: '虚构原实测说明', state: 'supported', meta: meta('tested') });
    assert.equal(old.fieldStates.function, 'supported');
    const revised = meta('tested', { source: '另一份虚构记录名称', locator: '#submit revised-source' });
    const importedItem = await patchField(page, 'submit', 'function', { value: '导入的新业务规则与旧说明不同', state: 'supported', meta: revised });
    assert.equal(importedItem.fields.function, '导入的新业务规则与旧说明不同');
    assert.deepEqual(importedItem.evidenceMeta.function, revised);
    assert.equal(importedItem.fieldStates.function, 'review');
    assert.equal(importedItem.status, 'needs-review');
  } finally { await context.close(); }
});

test('accepted suggestion remains recoverable after draft discard and storage failure until a successful save', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1100 } });
  try {
    const page = await load(context);
    const original = await annotation(page);
    await openCard(page, original);
    await card(page, original).locator('[data-shh-field="function"]').fill('需要保护的人工版本');
    await setFieldMeta(page, original, 'function', meta('page'));
    await save(page, original);
    const before = await annotation(page);
    const suggestedMeta = meta('prd', { source: '虚构修订建议', derivation: 'inferred' });
    await patchField(page, 'submit', 'function', { value: '拟采用的新版本', state: 'supported', meta: suggestedMeta });
    const offered = await annotation(page);
    const suggestion = offered.suggestions.function;
    assert.deepEqual(suggestion.evidenceMeta, suggestedMeta);
    const accept = () => card(page, original).getByRole('button', { name: '采用建议为草稿', exact: true }).click();
    await accept();
    await card(page, original).getByRole('button', { name: '撤销未保存修改', exact: true }).click();
    let current = await annotation(page);
    assert.deepEqual(current.suggestions.function, suggestion);
    assert.deepEqual(current.evidenceMeta.function, before.evidenceMeta.function);
    assert.equal(current.fields.function, before.fields.function);
    assert.equal(await card(page, original).getByRole('button', { name: '采用建议为草稿', exact: true }).count(), 1);
    await accept();
    await blockStorage(page);
    await save(page, original);
    current = await annotation(page);
    assert.deepEqual(current.suggestions.function, suggestion);
    assert.deepEqual(current.evidenceMeta.function, before.evidenceMeta.function);
    assert.deepEqual(current.revisions, offered.revisions);
    assert.ok((await state(page)).ui.dirtyIds.includes(original.id));
    assert.equal(await card(page, original).locator('[data-shh-field="function"]').inputValue(), suggestion.value);
    assert.equal(await card(page, original).locator('[data-shh-level="function"]').getAttribute('data-level'), 'prd');
    await restoreStorage(page);
    await card(page, original).getByRole('button', { name: '重试保存', exact: true }).click();
    current = await annotation(page);
    assert.equal(current.suggestions?.function, undefined);
    assert.equal(current.fields.function, suggestion.value);
    assert.deepEqual(current.evidenceMeta.function, suggestedMeta);
    assert.equal(current.revisions.length, offered.revisions.length + 1);
    await reload(page);
    assert.deepEqual((await annotation(page)).evidenceMeta.function, suggestedMeta);
  } finally { await context.close(); }
});

test('failed import reports failure and rolls back text, metadata and history before a successful retry', async () => {
  const context = await browser.newContext();
  try {
    const page = await load(context);
    const before = await annotation(page);
    const data = await exported(page);
    const candidate = data.pages[0].annotations.find(item => item.id === before.id);
    candidate.fields.function = '拟导入的来源与新说明';
    candidate.fieldStates.function = 'supported';
    candidate.evidenceMeta.function = meta('prd');
    await blockStorage(page);
    await assert.rejects(() => imported(page, data), /存储|保存|写入|导入/);
    const failed = await annotation(page);
    assert.equal(failed.fields.function, before.fields.function);
    assert.deepEqual(failed.evidenceMeta, before.evidenceMeta);
    assert.deepEqual(failed.revisions, before.revisions);
    assert.equal((await state(page)).ui.dirtyIds.length, 0);
    const backup = await exported(page);
    assert.deepEqual(backup.pages[0].annotations.find(item => item.id === before.id).evidenceMeta, before.evidenceMeta);
    await restoreStorage(page);
    const result = await imported(page, data);
    assert.ok(result.updated > 0);
    const saved = await annotation(page);
    assert.equal(saved.fields.function, candidate.fields.function);
    assert.deepEqual(saved.evidenceMeta.function, candidate.evidenceMeta.function);
    assert.equal(saved.revisions.length, before.revisions.length + 1);
    await reload(page);
    assert.deepEqual((await annotation(page)).evidenceMeta.function, candidate.evidenceMeta.function);
  } finally { await context.close(); }
});

test('guess imports retain an existing conflict or review even when the incoming status claims support', async () => {
  const context = await browser.newContext();
  try {
    const page = await load(context);
    for (const [key, previousState] of [['submit', 'conflict'], ['page-only', 'review']]) {
      await patchField(page, key, 'function', { value: '已有待处理状态', state: previousState, meta: meta('page') });
      const result = await patchField(page, key, 'function', { value: '新的模型猜测', state: 'supported', meta: meta('guess') });
      assert.equal(result.evidenceMeta.function.level, 'guess');
      assert.equal(result.fieldStates.function, previousState);
      assert.equal(result.status, 'needs-review');
    }
  } finally { await context.close(); }
});

test('guess stays pending and stronger evidence never implicitly clears a conflict', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1100 } });
  try {
    const page = await load(context);
    let item = await patchField(page, 'submit', 'function', { value: '仅猜测的规则', state: 'supported', meta: meta('guess') });
    assert.equal(item.fieldStates.function, 'unknown');
    await openCard(page, item);
    await card(page, item).locator('[data-shh-state="function"]').selectOption('supported');
    assert.equal(await card(page, item).locator('[data-shh-state="function"]').inputValue(), 'unknown');
    await save(page, item);
    assert.equal((await annotation(page)).fieldStates.function, 'unknown');
    // Use a second untouched control so the conflict fixture is not diverted into a manual suggestion.
    item = await patchField(page, 'page-only', 'function', { value: '已有来源冲突', state: 'conflict', meta: meta('page') });
    await openCard(page, item);
    await setFieldMeta(page, item, 'function', meta('tested'));
    assert.equal(await card(page, item).locator('[data-shh-state="function"]').inputValue(), 'conflict');
    await card(page, item).locator('[data-shh-field="function"]').fill('修改正文仍保留来源冲突');
    assert.equal(await card(page, item).locator('[data-shh-state="function"]').inputValue(), 'conflict');
    await save(page, item);
    const saved = await annotation(page, 'page-only');
    assert.equal(saved.fieldStates.function, 'conflict');
    assert.equal(saved.evidenceMeta.function.level, 'tested');
    assert.equal(saved.status, 'needs-review');
  } finally { await context.close(); }
});

async function importDisplayFixture(page) {
  const data = await exported(page);
  const homogeneous = { 'page-only': 'page', 'prd-only': 'prd', 'guess-only': 'guess', 'unclassified-only': 'unclassified' };
  for (const item of data.pages[0].annotations) {
    if (item.anchor.key !== 'submit' && !homogeneous[item.anchor.key]) continue;
    for (const field of fields) {
      const level = item.anchor.key === 'submit' ? { content: 'page', function: 'tested', limits: 'prd', navigation: 'guess' }[field] : homogeneous[item.anchor.key];
      item.fields[field] = { tested: '虚构记录：点击后计数增加。', page: '页面声明：按钮名称为“模拟提交”。', prd: '测试 PRD §2.1 推断：操作前需要选择负责人。', guess: '模型猜测：提交后可能打开详情页，待确认。', unclassified: '历史说明：尚无结构化来源。' }[level];
      item.evidence[field] = '虚构测试来源，仅用于 UI 和数据协议验收。';
      item.evidenceMeta[field] = meta(level, level === 'prd' ? { derivation: 'inferred' } : {});
      item.fieldStates[field] = level === 'guess' || level === 'unclassified' ? 'unknown' : level === 'page' ? 'observed' : 'supported';
    }
  }
  await imported(page, data);
  return annotation(page);
}

test('tier badges, PRD derivation, filters and field counts are explicit without changing the quality shape', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1100 } });
  try {
    const page = await load(context);
    const item = await importDisplayFixture(page);
    let snapshot = await state(page);
    assert.deepEqual(Object.keys(snapshot.ui.quality).sort(), ['dirty', 'hidden', 'manual', 'review', 'total', 'unknown']);
    const expected = Object.fromEntries(levels.map(level => [level, 0]));
    for (const record of snapshot.annotations.filter(record => snapshot.currentControlIds.includes(record.id))) {
      for (const field of fields) expected[record.evidenceMeta[field].level]++;
    }
    assert.deepEqual(snapshot.ui.evidenceSummary, expected);
    for (const level of levels) {
      await page.locator('[data-shh-filter]').selectOption(level);
      const expectedIds = snapshot.annotations.filter(record => snapshot.currentControlIds.includes(record.id) && fields.some(field => record.evidenceMeta[field].level === level)).map(record => record.id).sort();
      const actualIds = await page.locator('[data-shh-catalog-item]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-shh-catalog-item')).sort());
      assert.deepEqual(actualIds, expectedIds, level);
    }
    await page.locator('[data-shh-filter]').selectOption('all');
    await openCard(page, item);
    for (const field of fields) {
      const expectedLevel = { content: 'page', function: 'tested', limits: 'prd', navigation: 'guess' }[field];
      const badge = card(page, item).locator(`[data-shh-level="${field}"]`);
      assert.equal(await badge.isVisible(), true);
      assert.equal(await badge.getAttribute('data-level'), expectedLevel);
      assert.match(await badge.innerText(), new RegExp(`L${levels.indexOf(expectedLevel) + 1}`));
      assert.equal(await card(page, item).locator(`[data-shh-field="${field}"]`).isVisible(), true);
      assert.equal(await card(page, item).locator(`[data-shh-level-select="${field}"]`).isVisible(), false);
    }
    assert.match(await card(page, item).locator('[data-shh-level="limits"]').innerText(), /推断/);
    await openEvidence(page, item, 'limits');
    await card(page, item).locator('[data-shh-derivation="limits"]').selectOption('explicit');
    assert.match(await card(page, item).locator('[data-shh-level="limits"]').innerText(), /直接定义/);
    await save(page, item);
    assert.equal((await annotation(page)).evidenceMeta.limits.derivation, 'explicit');
    await page.evaluate(() => { document.getElementById('guess-only').hidden = true; window.StrikeHerHeart.scan(); });
    snapshot = await state(page);
    assert.equal(snapshot.ui.evidenceSummary.guess, expected.guess - 4, 'Hidden retained records do not count as current scope');
  } finally { await context.close(); }
});

test('fictional desktop and 390px mobile evidence UI stays within the viewport and core fields remain editable', async () => {
  fs.mkdirSync(screenshotDirectory, { recursive: true });
  for (const viewport of [{ width: 1512, height: 1100 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    try {
      const page = await load(context);
      const item = await importDisplayFixture(page);
      await openCard(page, item);
      for (const field of fields) {
        const input = card(page, item).locator(`[data-shh-field="${field}"]`);
        await input.scrollIntoViewIfNeeded();
        assert.equal(await input.isVisible(), true);
        const box = await input.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1, `${viewport.width}px ${field} must not clip horizontally`);
        assert.ok(box.width >= 200, `${field} remains usable at ${viewport.width}px`);
        const badge = card(page, item).locator(`[data-shh-level="${field}"]`);
        const badgeBox = await badge.boundingBox();
        assert.ok(badgeBox.x >= 0 && badgeBox.x + badgeBox.width <= viewport.width + 1);
      }
      await card(page, item).locator('[data-shh-field="content"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(screenshotDirectory, viewport.width === 390 ? 'fictional-mobile-top.png' : 'fictional-desktop.png'), animations: 'disabled' });
      if (viewport.width === 390) {
        await card(page, item).locator('[data-shh-field="navigation"]').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(screenshotDirectory, 'fictional-mobile-lower.png'), animations: 'disabled' });
        await openEvidence(page, item, 'limits');
        const input = card(page, item).locator('[data-shh-provenance="limits:locator"]');
        await input.fill('fixture-prd §2.1，390px 编辑验收');
        const box = await input.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1);
        await save(page, item);
        assert.equal((await annotation(page)).evidenceMeta.limits.locator, 'fixture-prd §2.1，390px 编辑验收');
        assert.equal((await state(page)).ui.dirtyIds.includes(item.id), false);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } finally { await context.close(); }
  }
});
