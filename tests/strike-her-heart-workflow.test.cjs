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
const lifecycleOutput = path.join(root, 'test-results/lifecycle');
const marker = '/*__SHH_WORKFLOW_DATA__*/null';
const checkKeys = ['coverage', 'multi_open', 'edit_save_refresh', 'navigation', 'manual_preserved'];
const checks = result => Object.fromEntries(checkKeys.map(key => [key, result]));
const phaseKeys = ['intake', 'access', 'discovery', 'annotation', 'presentation', 'acceptance'];
const stateKeys = [...phaseKeys, 'completed', 'blocked', 'failed', 'cancelled'];
const pageKeys = ['discovered', 'presented', 'verified', 'blocked', 'failed', 'cancelled'];
// Deliberately synthetic display fixtures, not a second definition of backend transition rules.
function contractFixtures() {
  return Object.fromEntries([['states', stateKeys], ['pages', pageKeys]].map(([kind, keys]) => [kind,
    Object.fromEntries(keys.map(key => [key, { label: `虚构 ${key}`, entryConditions: [`虚构进入条件 ${key}`],
      successConditions: [`虚构成功条件 ${key}`], failureStates: ['failed'], allowedNext: ['cancelled'] }]))]));
}
let browser;

function fixture() {
  return {
    taskId: 'T-workflow-test', revision: 14,
    scope: { description: '隔离测试：三个登记状态，不代表整站范围。', targets: ['https://example.invalid/app'] },
    capabilities: { read: { status: 'supported' }, write: { status: 'supported' } },
    registeredPageStates: 3,
    statusCounts: { discovered: 1, presented: 0, verified: 1, blocked: 1 },
    recordingOnly: true, wholeSystemComplete: false,
    taskComplete: false, stateContracts: contractFixtures(),
    execution: { state: 'blocked', recordedState: 'acceptance', resumeState: 'acceptance',
      reason: '隔离测试：当前证据已失效。', nextAction: '隔离测试：复核保存刷新证据后恢复验收。',
      attempt: 2, allowedNext: ['acceptance', 'cancelled'], evidenceIssues: ['隔离测试：验收证据已变化。'], legacy: false,
      phaseStates: { intake: 'succeeded', access: 'succeeded', discovery: 'succeeded', annotation: 'succeeded', presentation: 'succeeded', acceptance: 'stale' } },
    completion: { eligible: false, missingConditions: ['隔离测试：当前证据不足以完成任务。'] },
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

function queueFixture() {
  const data = fixture();
  const states = ['queued', 'running', 'retry_wait', 'blocked', 'blocked', 'failed', 'succeeded', 'cancelled'];
  data.scope.description = '虚构队列测试，仅用于界面验收，不代表真实执行。';
  data.workQueue = { enabled: true,
    policy: { maxAttempts: 3, baseDelaySeconds: 10, maxDelaySeconds: 300, timeoutSeconds: 90 },
    counts: { queued: 1, running: 1, retry_wait: 1, blocked: 2, failed: 1, succeeded: 1, cancelled: 1 },
    progress: { total: 8, completed: 1, required: 8, incompleteRequired: 7 },
    items: states.map((status, index) => ({ id: `Q-${index + 1}`, pageId: `P-${index + 1}`, pageLabel: `虚构队列页 ${index + 1}`,
      phase: 'annotation', status, recordedStatus: index === 2 ? 'running' : status,
      attempt: index === 0 ? 0 : 2, maxAttempts: 3,
      nextRetryAt: index === 2 ? 1793062800 : null, retryReady: false,
      lease: index === 1 ? { expiresAt: 1793062800.5, remainingSeconds: 42.3, expired: false }
        : index === 2 ? { expiresAt: 1793062700, remainingSeconds: 0, expired: true } : null,
      checkpoints: { total: 12, done: index === 6 ? 12 : 5, blocked: index === 3 ? 1 : 0, invalidated: index === 4 ? 2 : 0, ids: ['control-search', 'control-save'] },
      reconciliation: { required: index !== 6, status: index === 4 ? 'review_required' : index === 6 ? 'current' : 'missing',
        reason: index === 4 ? '虚构：保存按钮身份改变。' : '虚构：续跑前核对页面与检查点。', changedControls: index === 4 ? ['control-save'] : [] },
      lastError: index === 3 ? { code: 'LOGIN', category: 'manual', message: '虚构：会话已失效。', nextAction: '人工恢复授权会话。' }
        : index === 4 ? { code: 'CHANGED', category: 'review', message: '虚构：控件身份变化。', nextAction: '复核变化控件。' } : null,
      evidenceIssues: [], allowedActions: index === 6 || index === 7 ? [] : ['reconcile'],
    })) };
  return data;
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
  fs.mkdirSync(lifecycleOutput, { recursive: true });
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
    data.execution.reason = payload;
    data.execution.nextAction = payload;
    data.execution.evidenceIssues = [payload];
    data.completion.missingConditions = [payload];
    data.stateContracts.states.acceptance.entryConditions = [payload];
    const { page, errors, requests } = await load(context, data);
    assert.equal(await page.locator('#workflow-pwned').count(), 0);
    assert.equal(await page.evaluate(() => window.__workflowXss), undefined);
    assert.ok((await page.locator('[data-page="P-002"]').innerText()).includes(payload));
    assert.ok((await page.locator('#meta').innerText()).includes(payload));
    assert.ok((await page.locator('[data-execution]').innerText()).includes(payload));
    assert.ok((await page.locator('[data-stage-detail]').innerText()).includes(payload));
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
    delete data.execution;
    delete data.completion;
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
    for (const selector of ['[data-page-search]', '[data-page-filter]', '[data-stage-detail]', '[data-execution]']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 391, `${selector}: ${JSON.stringify(box)}`);
    }
    await page.screenshot({ path: path.join(output, 'workflow-mobile.png'), fullPage: true });
  } finally { await context.close(); }
});

test('execution status, retry position and phase states come from lifecycle records, never page counts', async () => {
  const context = await browser.newContext();
  try {
    const data = fixture();
    data.pages = [data.pages[0]]; // Every registered page is verified, but discovery is still active.
    data.execution = { state: 'discovery', recordedState: 'discovery', resumeState: null,
      reason: '虚构测试：还需盘点隐藏页签。', nextAction: '虚构测试：继续发现隐藏状态。', attempt: 3,
      allowedNext: ['annotation', 'blocked', 'failed', 'cancelled'], evidenceIssues: [], legacy: false,
      phaseStates: { intake: 'succeeded', access: 'succeeded', discovery: 'active', annotation: 'pending', presentation: 'pending', acceptance: 'pending' } };
    const { page } = await load(context, data);
    assert.equal(await countFor(page, '交互已验收'), 1);
    assert.equal(await page.locator('[data-execution]').getAttribute('data-state'), 'discovery');
    assert.match(await page.locator('[data-execution-status]').innerText(), /有效状态：发现页面 · discovery.*尝试 3/);
    assert.match(await page.locator('[data-workflow-stages] button[aria-pressed="true"]').innerText(), /发现页面.*进行中/s);
    assert.match(await page.locator('[data-workflow-stages] button').last().innerText(), /未进入/);
    assert.match(await page.locator('[data-execution]').innerText(), /任务尚未完成/);
    assert.match(await page.locator('[data-next-action]').innerText(), /继续发现隐藏状态/);
    assert.match(await page.locator('[data-execution-field="allowed"]').innerText(), /annotation.*blocked.*failed.*cancelled/s);
  } finally { await context.close(); }
});

test('blocked, failed and cancelled remain distinct and page filters include unsuccessful states', async () => {
  const context = await browser.newContext();
  try {
    for (const [state, title] of [['blocked', '受阻'], ['failed', '失败'], ['cancelled', '已取消']]) {
      const data = fixture();
      data.execution.state = state; data.execution.recordedState = state;
      data.execution.reason = `虚构 ${state} 原因`; data.execution.nextAction = `虚构 ${state} 下一步`;
      data.execution.phaseStates.acceptance = state;
      data.pages.push({ ...data.pages[2], id: 'P-004', status: 'failed', recordedStatus: 'failed',
        label: '虚构失败页', checks: { ...checks('untested'), edit_save_refresh: 'fail' }, reason: '虚构保存失败原因' });
      data.pages.push({ ...data.pages[2], id: 'P-005', status: 'cancelled', recordedStatus: 'cancelled',
        label: '虚构取消页', reason: '虚构用户取消原因' });
      const { page } = await load(context, data);
      assert.match(await page.locator('[data-execution] h2').innerText(), new RegExp(title));
      assert.match(await page.locator('[data-execution-field="reason"]').innerText(), new RegExp(`虚构 ${state} 原因`));
      assert.match(await page.locator('[data-workflow-stages] button[aria-pressed="true"]').innerText(), new RegExp(`验收与续接.*${title}`, 's'));
      assert.equal(await countFor(page, '失败'), 1);
      assert.equal(await countFor(page, '已取消'), 1);
      assert.equal(await countFor(page, '交互已验收'), 1);
      for (const [filter, id] of [['blocked', 'P-002'], ['failed', 'P-004'], ['cancelled', 'P-005']]) {
        await page.locator('[data-page-filter]').selectOption(filter);
        assert.equal(await page.locator('[data-page]').count(), 1);
        assert.equal(await page.locator('[data-page]').getAttribute('data-page'), id);
      }
      const cancelled = page.locator('[data-page="P-005"]');
      await cancelled.locator('summary').click();
      assert.equal(await cancelled.locator('[data-result="pass"]').count(), 0);
      assert.match(await cancelled.innerText(), /虚构用户取消原因/);
      await page.locator('[data-page-filter]').selectOption('failed');
      assert.equal(await page.locator('[data-page="P-004"] [data-result="fail"]').count(), 1);
      assert.equal(await page.locator('[data-page="P-004"] [data-result="pass"]').count(), 0);
      await page.close();
    }
  } finally { await context.close(); }
});

test('all ten execution states and six page states expose the four supplied contract fields', async () => {
  const context = await browser.newContext();
  try {
    const { page } = await load(context, fixture());
    await page.locator('[data-state-contracts] > summary').click();
    for (const [kind, keys] of [['states', stateKeys], ['pages', pageKeys]]) {
      for (const key of keys) {
        const contract = page.locator(`[data-contract-kind="${kind}"][data-contract-state="${key}"]`);
        assert.equal(await contract.locator('[data-contract-field]').count(), 4);
        assert.match(await contract.innerText(), new RegExp(`虚构进入条件 ${key}`));
        assert.match(await contract.innerText(), new RegExp(`虚构成功条件 ${key}`));
        assert.match(await contract.locator('[data-contract-field="failureStates"]').innerText(), /失败.*failed/s);
        assert.match(await contract.locator('[data-contract-field="allowedNext"]').innerText(), /已取消.*cancelled/s);
      }
    }
    for (let index = 0; index < phaseKeys.length; index++) {
      await page.locator('[data-workflow-stages] button').nth(index).click();
      const contract = page.locator('[data-stage-contract]');
      assert.equal(await contract.getAttribute('data-stage-contract'), phaseKeys[index]);
      assert.equal(await contract.locator('[data-contract-field]').count(), 4);
      for (const label of ['进入条件', '成功条件', '失败或受阻状态', '允许下一步']) assert.ok((await contract.innerText()).includes(label));
    }
  } finally { await context.close(); }
});

test('missing execution or contracts are explicit unknowns even with every page verified', async () => {
  const context = await browser.newContext();
  try {
    const data = fixture(); data.pages = [data.pages[0]];
    delete data.execution; delete data.stateContracts; delete data.completion;
    data.taskComplete = true; // An ungrounded old flag must not override missing lifecycle evidence.
    const { page } = await load(context, data);
    assert.match(await page.locator('[data-execution] h2').innerText(), /执行状态未登记／需重核/);
    assert.match(await page.locator('[data-completion]').innerText(), /未提供完成条件核对结果/);
    assert.match(await page.locator('[data-stage-contract]').innerText(), /未提供此状态的契约/);
    assert.match(await page.locator('[data-workflow-stages] button[aria-pressed="true"]').innerText(), /接收任务/);
    assert.equal(await page.locator('[data-workflow-stages] button').filter({ hasText: '条件已通过' }).count(), 0);
    assert.equal(await page.locator('[data-execution]').filter({ hasText: '限定范围完成（记录）' }).count(), 0);
    assert.equal(await countFor(page, '交互已验收'), 1);
  } finally { await context.close(); }
});

test('effective blocked state overrides a recorded completed state and shows stale evidence', async () => {
  const context = await browser.newContext();
  try {
    const data = fixture();
    data.execution.recordedState = 'completed';
    const { page } = await load(context, data);
    assert.match(await page.locator('[data-execution] h2').innerText(), /^受阻 · blocked$/);
    assert.match(await page.locator('[data-recorded-state]').innerText(), /记录状态：已完成 · completed.*有效状态已变化/);
    assert.match(await page.locator('[data-completion]').innerText(), /证据问题：隔离测试：验收证据已变化/);
    assert.match(await page.locator('[data-workflow-stages] button[aria-pressed="true"]').innerText(), /证据失效 · 需重核/);
    assert.equal(await page.locator('[data-stage-detail] .tag.bad').count(), 1, 'Stale phase status cannot use a success-colored badge');
    assert.match(await page.locator('[data-page="P-002"]').innerText(), /记录状态：交互已验收；有效状态：受阻/);
  } finally { await context.close(); }
});

test('completed needs consistent completion evidence and remains distinct from stage success', async () => {
  const context = await browser.newContext();
  try {
    const data = fixture();
    data.execution = { ...data.execution, state: 'completed', recordedState: 'completed', resumeState: null,
      evidenceIssues: [], allowedNext: [], phaseStates: Object.fromEntries(phaseKeys.map(key => [key, 'succeeded'])) };
    data.completion = { eligible: true, missingConditions: [] }; data.taskComplete = true;
    let loaded = await load(context, data);
    assert.match(await loaded.page.locator('[data-execution]').innerText(), /限定范围完成（记录）/);
    assert.match(await loaded.page.locator('[data-completion]').innerText(), /完成门槛已通过（记录）/);
    assert.match(await loaded.page.locator('[data-workflow-stages] button[aria-pressed="true"]').innerText(), /验收与续接/);
    await loaded.page.close();
    for (const invalidation of [value => { value.taskComplete = false; }, value => { value.execution.recordedState = 'acceptance'; }, value => { value.completion.eligible = false; }, value => { value.completion.missingConditions = ['虚构：仍缺证据']; }]) {
      const invalid = structuredClone(data); invalidation(invalid);
      loaded = await load(context, invalid);
      assert.match(await loaded.page.locator('[data-execution] h2').innerText(), /完成记录待重核/);
      assert.equal(await loaded.page.locator('[data-execution]').filter({ hasText: '限定范围完成（记录）' }).count(), 0);
      await loaded.page.close();
    }
  } finally { await context.close(); }
});

test('lifecycle details are keyboard accessible and stay within 390px with long untrusted text', async () => {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1100 }, deviceScaleFactor: 1 });
    try {
      const data = fixture();
      data.taskId = 'FICTIONAL / LIFECYCLE TEST';
      data.scope.description = '虚构测试记录，仅用于界面验收，不代表真实系统运行。';
      data.execution.reason += 'LongSyntheticEvidenceReference'.repeat(10);
      const { page } = await load(context, data);
      const toggle = page.locator('[data-current-contract] > summary');
      await toggle.focus(); await page.keyboard.press('Enter');
      assert.equal(await page.locator('[data-current-contract]').getAttribute('open'), '');
      await page.locator('[data-workflow-stages] button').first().focus(); await page.keyboard.press('Space');
      assert.equal(await page.locator('[data-workflow-stages] button').first().getAttribute('aria-pressed'), 'true');
      await page.locator('[data-workflow-stages] button').last().click();
      await page.locator('[data-state-contracts] > summary').click();
      const dimensions = await page.evaluate(() => ({ width: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth }));
      assert.ok(dimensions.body <= width + 1 && dimensions.document <= width + 1, JSON.stringify(dimensions));
      for (const selector of ['[data-execution]', '[data-current-contract]', '[data-stage-detail]', '[data-page-search]', '[data-page-filter]']) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1, `${selector}: ${JSON.stringify(box)}`);
      }
      await page.locator('[data-state-contracts] > summary').click();
      await page.screenshot({ path: path.join(lifecycleOutput, width === 390 ? 'mobile.png' : 'desktop.png'), fullPage: true });
    } finally { await context.close(); }
  }
});

test('work queue is explicitly disabled for legacy tasks and never inferred from verified pages', async () => {
  const context = await browser.newContext();
  try {
    const data = fixture(); data.pages = [data.pages[0]];
    const { page } = await load(context, data);
    assert.equal(await page.locator('[data-work-queue]').getAttribute('data-enabled'), 'false');
    assert.match(await page.locator('[data-queue-summary]').innerText(), /未启用/);
    await page.locator('[data-work-queue] > summary').click();
    assert.match(await page.locator('[data-queue-body]').innerText(), /没有可核对的调度记录/);
    assert.match(await page.locator('[data-queue-body]').innerText(), /不代表队列已经执行/);
    assert.equal(await page.locator('[data-queue-item]').count(), 0);
    assert.equal(await countFor(page, '交互已验收'), 1);
  } finally { await context.close(); }
});

test('queue progress, eight status filters and checkpoint details use the supplied queue records', async () => {
  const context = await browser.newContext();
  try {
    const { page } = await load(context, queueFixture());
    assert.equal(await page.locator('[data-work-queue]').getAttribute('open'), null, 'Long queue is collapsed by default');
    await page.locator('[data-work-queue] > summary').click();
    assert.match(await page.locator('[data-queue-summary]').innerText(), /已完成 1 \/ 8.*必要项待完成 7/);
    assert.match(await page.locator('[data-queue-body]').innerText(), /队列完成仍需通过任务状态机/);
    assert.equal(await page.locator('[data-queue-item]').count(), 8);
    for (const [index, state, label] of [[1, 'queued', '待执行'], [2, 'running', '运行中'], [3, 'retry_wait', '退避等待'], [4, 'manual', '需人工'], [5, 'review', '需复核'], [6, 'failed', '失败'], [7, 'succeeded', '已完成'], [8, 'cancelled', '已取消']]) {
      await page.locator('[data-queue-filter]').selectOption(state);
      const item = page.locator('[data-queue-item]');
      assert.equal(await item.count(), 1);
      assert.equal(await item.getAttribute('data-queue-item'), `Q-${index}`);
      assert.match(await item.locator('summary').first().innerText(), new RegExp(label));
      assert.match(await page.locator(`[data-queue-count="${state}"]`).innerText(), /1$/);
    }
    await page.locator('[data-queue-filter]').selectOption('review');
    const review = page.locator('[data-queue-item="Q-5"]'); await review.locator('summary').first().click();
    assert.match(await review.locator('[data-queue-field="attempt"]').innerText(), /尝试 2 \/ 3/);
    assert.match(await review.locator('[data-queue-checkpoints]').innerText(), /已完成 5 \/ 12.*已失效 2/);
    assert.match(await review.locator('[data-queue-reconciliation]').innerText(), /变化待复核.*保存按钮身份改变.*control-save/s);
    await review.locator('[data-queue-checkpoints] summary').click();
    assert.match(await review.locator('[data-queue-checkpoints]').innerText(), /control-search.*control-save/);
    await page.locator('[data-queue-filter]').selectOption('queued');
    const queued = page.locator('[data-queue-item="Q-1"]'); await queued.locator('summary').first().click();
    assert.match(await queued.locator('[data-queue-reconciliation]').innerText(), /续跑前需核对/);
    assert.match(await page.locator('[data-execution]').innerText(), /任务尚未完成/);
  } finally { await context.close(); }
});

test('retry and expired lease information stays a read-only snapshot rather than a live countdown', async () => {
  const context = await browser.newContext();
  try {
    const { page, requests } = await load(context, queueFixture());
    await page.locator('[data-work-queue] > summary').click();
    const running = page.locator('[data-queue-item="Q-2"]'); await running.locator('summary').first().click();
    assert.match(await running.locator('[data-queue-field="lease"]').innerText(), /快照时剩余约 43 秒/);
    const retry = page.locator('[data-queue-item="Q-3"]'); await retry.locator('summary').first().click();
    assert.match(await retry.locator('[data-queue-field="retry"]').innerText(), /UTC.*快照时仍在等待/);
    assert.match(await retry.locator('[data-queue-field="lease"]').innerText(), /租约已过期（快照时）/);
    assert.match(await retry.locator('[data-queue-recorded-state]').innerText(), /记录状态：running；有效状态：retry_wait/);
    assert.match(await page.locator('[data-queue-body]').innerText(), /不会自动刷新、领取、续租或重试/);
    const initial = await page.locator('[data-queue-body]').innerText();
    await page.clock.install(); await page.clock.fastForward(120000);
    assert.equal(await page.locator('[data-queue-body]').innerText(), initial);
    assert.deepEqual(requests, ['http://workflow.fixture/workflow.html']);
  } finally { await context.close(); }
});

test('queue labels, failures, reconciliation reasons and checkpoint IDs render as safe text', async () => {
  const context = await browser.newContext();
  try {
    const data = queueFixture();
    const hostile = '</script><img id="queue-injected" src=x onerror="window.__queueXss=1">';
    const item = data.workQueue.items[4];
    item.pageLabel = hostile; item.reconciliation.reason = hostile; item.reconciliation.changedControls = [hostile];
    item.lastError.message = hostile; item.lastError.nextAction = hostile; item.checkpoints.ids = [hostile]; item.evidenceIssues = [hostile];
    const { page, errors, requests } = await load(context, data);
    await page.locator('[data-work-queue] > summary').click();
    const row = page.locator('[data-queue-item="Q-5"]'); await row.locator('summary').first().click();
    await row.locator('[data-queue-checkpoints] summary').click();
    assert.ok((await row.innerText()).includes(hostile));
    assert.equal(await page.locator('#queue-injected').count(), 0);
    assert.equal(await page.evaluate(() => window.__queueXss), undefined);
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, ['http://workflow.fixture/workflow.html']);
  } finally { await context.close(); }
});

test('queue disclosure and filtering work from the keyboard and fit a 390px viewport', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const data = queueFixture();
    data.workQueue.items[4].reconciliation.reason += 'LongSyntheticReconciliationReference'.repeat(8);
    const { page } = await load(context, data);
    await page.locator('[data-work-queue] > summary').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-work-queue]').getAttribute('open'), '');
    await page.locator('[data-queue-filter]').selectOption('review');
    await page.locator('[data-queue-item] > summary').focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('[data-queue-item]').getAttribute('open'), '');
    const dimensions = await page.evaluate(() => ({ width: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth }));
    assert.ok(dimensions.body <= 391 && dimensions.document <= 391, JSON.stringify(dimensions));
    for (const selector of ['[data-work-queue]', '[data-queue-filter]', '[data-queue-item]']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 391, `${selector}: ${JSON.stringify(box)}`);
    }
  } finally { await context.close(); }
});
