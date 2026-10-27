/* Read-only workflow presentation in an isolated, unauthenticated browser.
 * Fixtures represent task records, not actual agent execution or site acceptance.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const templatePath = path.join(root, 'skills/strike-her-heart/assets/workflow.html');
const output = path.join(root, 'test-results/workflow');
const marker = '/*__SHH_WORKFLOW_DATA__*/null';
const checkKeys = ['coverage', 'multi_open', 'edit_save_refresh', 'navigation', 'manual_preserved'];
const checks = result => Object.fromEntries(checkKeys.map(key => [key, result]));
let browser;

function fixture() {
  return {
    taskId: 'T-workflow-test', revision: 14,
    scope: { description: '隔离测试：三个登记状态，不代表整站范围。', targets: ['https://example.invalid/app'] },
    capabilities: { read: { status: 'supported' }, write: { status: 'supported' } },
    registeredPageStates: 3,
    statusCounts: { discovered: 1, presented: 0, verified: 1, blocked: 1 },
    recordingOnly: true, wholeSystemComplete: false,
    nextAction: '保留未知业务规则，并处理待复验页面。',
    view: { generatedAt: '2026-10-27T01:00:00+00:00', name: '隔离工作流测试', mode: 'snapshot' },
    pages: [
      { id: 'P-001', label: '客户线索列表', stateKey: 'leads-all', url: 'https://example.invalid/app',
        status: 'verified', recordedStatus: 'verified', evidenceIssues: [],
        bindings: [{ displayId: 'A-009', runtimeId: 'shh-test-name', sourceKey: 'search-name' }],
        checks: checks('pass'), gaps: ['管理员权限来源尚未核实。'], nextAction: '补充权限来源，保留已验证交互。' },
      { id: 'P-002', label: '工作空间设置', stateKey: 'settings', url: 'https://example.invalid/settings',
        status: 'blocked', recordedStatus: 'verified', evidenceIssues: ['Evidence content changed; historical verification is not current.'],
        bindings: [{ displayId: 'A-008', runtimeId: 'shh-test-settings', sourceKey: 'workspace-name' }],
        checks: checks('pass'), gaps: [], blockedReason: '保存刷新证据已变化。', nextAction: '重新执行保存刷新检查。' },
      { id: 'P-003', label: '新增线索弹窗', stateKey: 'lead-dialog', url: 'https://example.invalid/app',
        status: 'discovered', recordedStatus: 'discovered', evidenceIssues: [], bindings: [],
        checks: checks('untested'), gaps: ['弹窗尚未呈现气泡。'], nextAction: '核对弹窗内控件。' },
    ],
  };
}

function inlineJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, char => ({
    '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029',
  }[char]));
}

async function load(context, data = null) {
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  const source = fs.readFileSync(templatePath, 'utf8');
  assert.equal(source.split(marker).length - 1, 1, 'The renderer exposes one data insertion point');
  const html = data === null ? source : source.replace(marker, inlineJson(data));
  await page.route('**/*', route => {
    if (route.request().url() === 'http://workflow.fixture/workflow.html') return route.fulfill({ contentType: 'text/html', body: html });
    return route.abort();
  });
  await page.goto('http://workflow.fixture/workflow.html');
  await page.locator('[data-workflow-stages] button').last().waitFor();
  assert.deepEqual(errors, []);
  return { page, errors, requests };
}

async function countFor(page, title) {
  return Number(await page.locator('[data-summary] .stat').filter({ has: page.locator('span', { hasText: new RegExp('^' + title + '$') }) }).locator('strong').innerText());
}

before(async () => {
  const options = { headless: true };
  if (process.env.SHH_BROWSER_CHANNEL) options.channel = process.env.SHH_BROWSER_CHANNEL;
  if (process.env.SHH_BROWSER_EXECUTABLE) options.executablePath = process.env.SHH_BROWSER_EXECUTABLE;
  browser = await chromium.launch(options);
  fs.mkdirSync(output, { recursive: true });
});
after(async () => { if (browser) await browser.close(); });

test('default workflow is explicitly fictional; all six stages explain their inputs, actions and outputs', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  try {
    const { page, requests } = await load(context);
    assert.match(await page.locator('[data-workflow-mode]').innerText(), /虚构/);
    assert.match(await page.locator('#notice').innerText(), /不代表 agent 正在执行/);
    const stages = page.locator('[data-workflow-stages] button');
    assert.equal(await stages.count(), 6);
    const details = new Set();
    for (let i = 0; i < 6; i++) {
      await stages.nth(i).click();
      assert.equal(await stages.nth(i).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-workflow-stages] button[aria-pressed="true"]').count(), 1);
      const text = await page.locator('[data-stage-detail]').innerText();
      for (const label of ['输入', 'agent 做什么', '可交付结果']) assert.ok(text.includes(label));
      details.add(text);
    }
    assert.equal(details.size, 6);
    assert.deepEqual(requests, ['http://workflow.fixture/workflow.html'], 'The workflow does not contact a service');
    await page.screenshot({ path: path.join(output, 'workflow-desktop.png'), fullPage: true });
  } finally { await context.close(); }
});

test('snapshot filters and search combine by page name, page ID and actual annotation ID', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  try {
    const { page } = await load(context, fixture());
    assert.match(await page.locator('[data-workflow-mode]').innerText(), /任务记录快照/);
    assert.match(await page.locator('#meta').innerText(), /T-workflow-test.*14.*2026-10-27/);
    assert.match(await page.locator('#notice').innerText(), /刷新不会重新读取任务/);
    assert.equal(await page.locator('[data-page]').count(), 3);
    for (const query of ['客户线索列表', 'P-001', 'A-009']) {
      await page.locator('[data-page-search]').fill(query);
      assert.equal(await page.locator('[data-page]').count(), 1);
      assert.equal(await page.locator('[data-page]').getAttribute('data-page'), 'P-001');
    }
    await page.locator('[data-page-filter]').selectOption('blocked');
    assert.equal(await page.locator('[data-page]').count(), 0, 'Search and status filtering are conjunctive');
    await page.locator('[data-page-search]').fill('');
    assert.equal(await page.locator('[data-page]').getAttribute('data-page'), 'P-002');
    await page.locator('[data-page-filter]').selectOption('discovered');
    assert.equal(await page.locator('[data-page]').getAttribute('data-page'), 'P-003');
    await page.locator('[data-page-filter]').selectOption('all');
    assert.equal(await page.locator('[data-page]').count(), 3);
  } finally { await context.close(); }
});

test('changed evidence keeps historical pass records visibly stale and excludes the page from current verified counts', async () => {
  const context = await browser.newContext();
  try {
    const { page } = await load(context, fixture());
    const stale = page.locator('[data-page="P-002"]');
    assert.equal(await stale.getAttribute('open'), '');
    assert.equal(await stale.locator('[data-check]').count(), 5);
    assert.equal(await stale.locator('[data-check][data-result="pass"]').count(), 0);
    assert.equal(await stale.locator('[data-check][data-result="stale"]').count(), 5);
    assert.match(await stale.innerText(), /历史通过.*待复验/s);
    assert.match(await stale.innerText(), /Evidence content changed/);
    assert.equal(await countFor(page, '交互已验收'), 1);
    assert.equal(await countFor(page, '受阻／待复验'), 1);
    const verified = page.locator('[data-page="P-001"]');
    await verified.locator('summary').click();
    assert.equal(await verified.locator('[data-check][data-result="pass"]').count(), 5);
    assert.match(await verified.innerText(), /管理员权限来源尚未核实/);
    assert.match(await page.locator('footer').innerText(), /业务规则正确性/);
  } finally { await context.close(); }
});

test('task labels, next actions and evidence notes render as text, not active HTML or script', async () => {
  const context = await browser.newContext();
  try {
    const data = fixture();
    const payload = '</script><script>window.__workflowXss=1</script><img id="workflow-pwned" src=x onerror="window.__workflowXss=2">';
    data.pages[1].label = payload;
    data.pages[1].nextAction = payload;
    data.pages[1].evidenceIssues = [payload];
    data.pages[1].gaps = [payload];
    data.nextAction = payload;
    data.scope.description = payload;
    const { page, errors, requests } = await load(context, data);
    assert.equal(await page.locator('#workflow-pwned').count(), 0);
    assert.equal(await page.evaluate(() => window.__workflowXss), undefined);
    assert.ok((await page.locator('[data-page="P-002"]').innerText()).includes(payload));
    assert.ok((await page.locator('#meta').innerText()).includes(payload));
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, ['http://workflow.fixture/workflow.html']);
  } finally { await context.close(); }
});

test('an empty task shows unknown work and zero verification without assuming a completed system', async () => {
  const context = await browser.newContext();
  try {
    const data = fixture();
    data.pages = []; data.registeredPageStates = 0;
    data.statusCounts = { discovered: 0, presented: 0, verified: 0, blocked: 0 };
    data.capabilities = { read: { status: 'unknown' }, write: { status: 'unknown' } };
    data.nextAction = '';
    const { page } = await load(context, data);
    assert.equal(await countFor(page, '已登记状态'), 0);
    assert.equal(await countFor(page, '交互已验收'), 0);
    assert.equal(await page.locator('[data-page]').count(), 0);
    assert.match(await page.locator('#pages').innerText(), /尚未登记页面/);
    assert.match(await page.locator('[data-next-action]').innerText(), /尚未记录/);
    assert.match(await page.locator('[data-workflow-stages]').innerText(), /尚未确认/);
    await page.locator('[data-workflow-stages] button').last().click();
    assert.match(await page.locator('[data-stage-detail]').innerText(), /不代表.*整站完成/);
  } finally { await context.close(); }
});

test('390px layout keeps stages, search and page details within the viewport', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  try {
    const { page } = await load(context);
    await page.locator('[data-page]').first().locator('summary').click();
    const dimensions = await page.evaluate(() => ({ width: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth }));
    assert.ok(dimensions.body <= dimensions.width + 1, JSON.stringify(dimensions));
    assert.ok(dimensions.document <= dimensions.width + 1, JSON.stringify(dimensions));
    for (const selector of ['[data-page-search]', '[data-page-filter]', '[data-stage-detail]']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 391, `${selector}: ${JSON.stringify(box)}`);
    }
    await page.screenshot({ path: path.join(output, 'workflow-mobile.png'), fullPage: true });
  } finally { await context.close(); }
});
