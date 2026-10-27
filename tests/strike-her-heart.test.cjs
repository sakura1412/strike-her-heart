/*
 * Real DOM/browser checks. No authenticated user browser or external service.
 * npm ci && npx playwright install chromium && npm test
 * Optional: SHH_BROWSER_CHANNEL=chrome or SHH_BROWSER_EXECUTABLE=/path/to/browser.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');

const skill = path.resolve(__dirname, '../skills/strike-her-heart');
const assets = path.join(skill, 'assets');
let browser, server, origin;

async function newDemo(context) {
  const page = await context.newPage();
  await page.goto(`${origin}/demo.html#/leads`);
  await page.waitForFunction(() => window.StrikeHerHeart?.getSnapshot().annotations.length > 10);
  return page;
}

async function snapshot(page) { return page.evaluate(() => window.StrikeHerHeart.getSnapshot()); }
function annotationFor(state, id) {
  return state.annotations.find(item => item.anchor?.key === `#${id}` || item.anchor?.key === id || item.anchor?.key === `id:${id}`);
}
function bubble(page, annotation) { return page.locator(`[data-shh-bubble="${annotation.id}"]`); }
function card(page, annotation) { return page.locator(`[data-shh-card="${annotation.id}"]`); }
async function openEvidence(page, annotation, field) {
  const evidence = card(page, annotation).locator(`[data-shh-evidence="${field}"]`);
  if (!(await evidence.isVisible())) await card(page, annotation).locator(`[data-shh-evidence-details="${field}"] > summary`).click();
}
async function readyAnnotation(page, id) {
  await page.waitForFunction(id => window.StrikeHerHeart.getSnapshot().annotations.some(item => [id, `#${id}`, `id:${id}`].includes(item.anchor?.key)), id);
  const found = annotationFor(await snapshot(page), id);
  assert.ok(found, `Missing annotation for #${id}`);
  return found;
}

before(async () => {
  const { chromium } = require('playwright');
  server = http.createServer((req, res) => {
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(assets, '.' + requested);
    if (!file.startsWith(assets + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const opts = { headless: true };
  if (process.env.SHH_BROWSER_CHANNEL) opts.channel = process.env.SHH_BROWSER_CHANNEL;
  if (process.env.SHH_BROWSER_EXECUTABLE) opts.executablePath = process.env.SHH_BROWSER_EXECUTABLE;
  browser = await chromium.launch(opts);
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

test('scan creates stable page/control numbering across DOM rerender and route return', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  try {
    const page = await newDemo(context);
    const before = await readyAnnotation(page, 'search-name');
    const first = await snapshot(page);
    assert.ok(first.annotations.some(item => item.anchor?.kind === 'page'), 'Page-level annotation must exist');
    assert.equal(new Set(first.annotations.map(item => item.number)).size, first.annotations.length, 'Numbers are unique per page');
    await page.locator('#reset-filter').click();
    await page.waitForTimeout(350);
    await page.evaluate(() => window.StrikeHerHeart.scan());
    const after = await readyAnnotation(page, 'search-name');
    assert.equal(after.id, before.id);
    assert.equal(after.number, before.number);
    await page.locator('#nav-projects').click();
    await readyAnnotation(page, 'project-owner');
    assert.equal((await snapshot(page)).scope.route, '#/projects');
    await page.locator('#nav-leads').click();
    assert.equal((await readyAnnotation(page, 'search-name')).id, before.id);
  } finally { await context.close(); }
});

test('multiple numbered bubbles open independent cards on the right without blocking original inputs', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  try {
    const page = await newDemo(context);
    const search = await readyAnnotation(page, 'search-name');
    const stage = await readyAnnotation(page, 'filter-stage');
    await bubble(page, search).click();
    await bubble(page, stage).click();
    assert.equal(await card(page, search).count(), 1);
    assert.equal(await card(page, stage).count(), 1);
    if (process.env.SHH_SCREENSHOT_DIR) {
      await page.setViewportSize({ width: 1512, height: 1700 });
      await page.waitForFunction(id => window.StrikeHerHeart.getSnapshot().annotations.find(item=>item.id===id)?.fieldStates.function==='supported', search.id);
      const screenshotDir = path.resolve(process.env.SHH_SCREENSHOT_DIR);
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.evaluate(() => { document.getElementById('strike-her-heart-overlay').shadowRoot.querySelector('.body').scrollTop = 0; });
      await page.screenshot({ path: path.join(screenshotDir, 'strike-her-heart-preview.png'), fullPage: true });
      await page.setViewportSize({ width: 1512, height: 1000 });
    }
    const box = await card(page, search).boundingBox();
    assert.ok(box.x > 900, 'Details are displayed in a right-side panel');
    await page.locator(`[data-shh-close="${search.id}"]`).click();
    assert.equal(await card(page, search).count(), 0);
    assert.equal(await card(page, stage).count(), 1);
    await page.locator('#search-name').fill('青岚');
    await page.locator('#query-leads').click();
    assert.equal(await page.locator('#lead-rows tr').count(), 1);
    assert.match(await page.locator('#lead-rows').innerText(), /青岚设计工作室/);
  } finally { await context.close(); }
});

test('edited text, evidence and stable identifiers persist after refresh, and JSON export/import restores them', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  try {
    const page = await newDemo(context);
    const search = await readyAnnotation(page, 'search-name');
    await bubble(page, search).click();
    await card(page, search).locator('textarea[data-shh-field="function"]').fill('测试修订：以客户名称过滤当前列表。');
    await openEvidence(page, search, 'function');
    await card(page, search).locator('textarea[data-shh-evidence="function"]').fill('测试证据：demo.html #filter-form 提交事件。');
    await page.locator(`[data-shh-save="${search.id}"]`).click();
    const edited = annotationFor(await snapshot(page), 'search-name');
    assert.equal(edited.fields.function, '测试修订：以客户名称过滤当前列表。');
    assert.ok(edited.revisions.length >= 1);
    const exported = await page.evaluate(() => window.StrikeHerHeart.exportData());
    assert.equal(exported.agent, 'Strike Her Heart');
    await page.reload();
    const refreshed = await readyAnnotation(page, 'search-name');
    assert.equal(refreshed.id, search.id);
    assert.equal(refreshed.number, search.number);
    assert.equal(refreshed.fields.function, edited.fields.function);
    await page.evaluate(data => window.StrikeHerHeart.importData(data), exported);
    assert.equal((await readyAnnotation(page, 'search-name')).fields.function, edited.fields.function);
    const conflicting = JSON.parse(JSON.stringify(exported));
    const importedSearch = conflicting.pages.flatMap(item => item.annotations).find(item => item.id === search.id);
    importedSearch.fields.function = 'AI 新建议：直接跳转客户详情。';
    importedSearch.evidence.function = '测试的冲突来源。';
    importedSearch.fieldStates.function = 'supported';
    await page.evaluate(data => window.StrikeHerHeart.importData(data), conflicting);
    const protectedEdit = await readyAnnotation(page, 'search-name');
    assert.equal(protectedEdit.fields.function, edited.fields.function, 'AI imports must not replace saved manual text');
    assert.equal(protectedEdit.suggestions.function.value, importedSearch.fields.function, 'The conflicting suggestion remains reviewable');
    await assert.rejects(page.evaluate(() => window.StrikeHerHeart.importData('{bad json')));
    assert.equal((await readyAnnotation(page, 'search-name')).fields.function, edited.fields.function, 'Malformed imports must not destroy annotations');
  } finally { await context.close(); }
});

test('dialogs, field constraints and runtime hide preserve original page interactions', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  try {
    const page = await newDemo(context);
    const pageAnnotation = (await snapshot(page)).annotations.find(item=>item.anchor.kind==='page');
    await page.locator('#new-lead').click();
    await page.locator('#lead-dialog').waitFor({ state: 'visible' });
    const name = await readyAnnotation(page, 'lead-name');
    assert.ok((await snapshot(page)).annotations.some(item=>item.anchor.kind==='page' && item.id!==pageAnnotation.id), 'Native dialogs have a distinct page annotation');
    assert.match(name.fields.limits, /40/);
    await bubble(page, name).click();
    assert.equal(await card(page, name).count(), 1, 'Native dialog fields have clickable bubbles');
    await page.evaluate(() => window.StrikeHerHeart.toggle(false));
    assert.equal((await snapshot(page)).ui.visible, false);
    await page.locator('#lead-name').fill('标注测试客户');
    await page.locator('#lead-contact').fill('demo@example.com');
    await page.locator('#save-lead').click();
    await page.locator('#lead-dialog').waitFor({ state: 'hidden' });
    await page.evaluate(() => window.StrikeHerHeart.scan());
    const originalPage=(await snapshot(page)).annotations.find(item=>item.id===pageAnnotation.id);
    assert.notEqual(originalPage.status, 'needs-review', 'Opening and closing a dialog does not change the original page anchor');
    assert.match(await page.locator('#lead-rows').innerText(), /标注测试客户/);
    await page.evaluate(() => window.StrikeHerHeart.toggle(true));
    assert.equal((await snapshot(page)).ui.visible, true);
    await page.locator('#nav-settings').click();
    const email = await readyAnnotation(page, 'notification-email');
    assert.match(email.fields.limits, /email|邮箱/i);
    await page.locator('#notification-email').fill('team@example.com');
    await page.locator('#save-settings').click();
    assert.match(await page.locator('#toast').innerText(), /演示设置已确认/);
  } finally { await context.close(); }
});

test('in-page tabs keep opened cards and unsaved drafts in their own view', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  try {
    const page = await newDemo(context);
    const search = await readyAnnotation(page, 'search-name');
    await bubble(page, search).click();
    await card(page, search).locator('textarea[data-shh-field="function"]').fill('尚未保存：全部线索页签的独立草稿。');
    await page.locator('#tab-mine').click();
    await page.evaluate(() => window.StrikeHerHeart.scan());
    assert.equal(await card(page, search).count(), 0, 'A different in-page tab does not show this open card');
    assert.equal((await snapshot(page)).ui.dirtyIds.length, 0, 'The draft is not applied to another tab');
    await page.locator('#tab-all').click();
    await page.evaluate(() => window.StrikeHerHeart.scan());
    assert.equal(await card(page, search).count(), 1);
    assert.equal(await card(page, search).locator('textarea[data-shh-field="function"]').inputValue(), '尚未保存：全部线索页签的独立草稿。');
  } finally { await context.close(); }
});

test('keyed repeated-row annotations stay attached to the same record after reorder', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  try {
    const page = await newDemo(context);
    const before = await page.evaluate(() => {
      const wrapper=document.createElement('section'); wrapper.id='keyed-rows';
      wrapper.innerHTML='<div data-row-key="alpha"><button>处理客户</button></div><div data-row-key="beta"><button>处理客户</button></div>';
      document.getElementById('main').prepend(wrapper);
      return window.StrikeHerHeart.scan().annotations.filter(item=>item.label==='处理客户');
    });
    assert.equal(before.length, 2);
    assert.notEqual(before[0].id, before[1].id);
    const after = await page.evaluate(() => {
      const rows=document.getElementById('keyed-rows'); rows.insertBefore(rows.lastElementChild,rows.firstElementChild);
      return window.StrikeHerHeart.scan().annotations.filter(item=>item.label==='处理客户');
    });
    assert.deepEqual(after.map(item=>[item.anchor.key,item.id,item.number]).sort(), before.map(item=>[item.anchor.key,item.id,item.number]).sort());
    const associated = await page.evaluate(() => {
      const root=document.getElementById('strike-her-heart-overlay').shadowRoot;
      return window.StrikeHerHeart.getSnapshot().annotations.filter(item=>item.label==='处理客户').map(item=>({key:item.anchor.key, bubble:root.querySelector(`[data-shh-bubble="${item.id}"]`)?.getAttribute('aria-label')}));
    });
    assert.ok(associated.every(item=>item.bubble?.includes('处理客户')));
  } finally { await context.close(); }
});

test('browser tab UI is isolated and exports never collect entered form values or nested textarea defaults', async () => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  try {
    const page = await newDemo(context);
    const search = await readyAnnotation(page, 'search-name');
    await page.locator('#search-name').fill('PRIVATE-FORM-VALUE-4516');
    await page.evaluate(() => {
      const label = document.createElement('label'); label.textContent = '授权密码';
      const password = document.createElement('input'); password.type = 'password'; password.id = 'privacy-password'; password.value = 'SECRET-CREDENTIAL-4516';
      label.appendChild(password); document.getElementById('main').prepend(label);
      const notes = document.createElement('label'); notes.textContent='私密备注';
      const textarea=document.createElement('textarea'); textarea.id='privacy-notes'; textarea.textContent='SECRET-TEXTAREA-DEFAULT-4516'; notes.appendChild(textarea); document.getElementById('main').prepend(notes);
      window.StrikeHerHeart.scan();
    });
    await bubble(page, search).click();
    await page.evaluate(() => window.StrikeHerHeart.toggle(false));
    const second = await newDemo(context);
    assert.equal((await snapshot(second)).ui.visible, true);
    assert.equal((await snapshot(second)).ui.openedIds.length, 0, 'A second tab does not inherit opened details');
    const exported = await page.evaluate(() => JSON.stringify(window.StrikeHerHeart.exportData()));
    assert.ok(!exported.includes('PRIVATE-FORM-VALUE-4516'));
    assert.ok(!exported.includes('SECRET-CREDENTIAL-4516'));
    assert.ok(!exported.includes('SECRET-TEXTAREA-DEFAULT-4516'));
  } finally { await context.close(); }
});

test('MV3 toolbar loads the local adapter before one shared runtime and reuses the runtime', async () => {
  // The wrapper runs in a sandboxed VM; real extension installation is a separate browser action.
  const listeners = [], calls = [];
  const pageWindow = {};
  let scans = 0, toggles = 0;
  const chrome = {
    action: { onClicked: { addListener: fn => listeners.push(fn) }, setBadgeText: async args => calls.push(['badge',args]), setTitle: async args => calls.push(['title',args]), setBadgeBackgroundColor: async args => calls.push(['color',args]) },
    scripting: { executeScript: async args => {
      calls.push(['script',args]);
      if (args.files) {
        if (args.files.includes('overlay.js')) pageWindow.StrikeHerHeart = { scan: () => scans++, toggle: () => toggles++ };
        return [];
      }
      return [{ result: args.func() }];
    } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(assets,'extension/service-worker.js'),'utf8'), {chrome, window: pageWindow});
  assert.equal(listeners.length, 1);
  await listeners[0]({id:12});
  await listeners[0]({id:12});
  assert.deepEqual(calls.filter(([type,args]) => type==='script' && args.files).map(([,args]) => args.files.join(',')), ['site-adapters/sge.js', 'overlay.js', 'site-adapters/sge.js']);
  assert.equal(scans, 1, 'The second click scans the existing runtime');
  assert.equal(toggles, 1, 'The second click toggles the existing runtime');
  const manifest=JSON.parse(fs.readFileSync(path.join(assets,'extension/manifest.json'),'utf8'));
  assert.deepEqual(manifest.permissions, ['activeTab','scripting']);
  assert.equal(manifest.host_permissions, undefined);
});
