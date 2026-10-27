/* Review queue regression. All records and pages are fictional; no personal browser or network. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const source = fs.readFileSync(path.resolve(__dirname, '../skills/strike-her-heart/assets/overlay.js'), 'utf8');
const fields = ['content', 'function', 'limits', 'navigation'];
const output = path.resolve(__dirname, '../test-results/review-queue');
const controls = [
  ['unknown', '待确认：提交规则'], ['conflict', '冲突：归档权限'], ['review', '需复核：导出范围'],
  ['suggestion', '新建议：通知方式'], ['target-review', '目标待复核'], ['field-review', '字段待复核'],
  ['done', '已确认：查看详情'], ['done-two', '已确认：返回列表']
];
const fixture = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>虚构复核队列测试</title>
<style>body{margin:28px;background:#f6f7fb;color:#29374f;font:15px/1.6 sans-serif}main{max-width:850px}h1{font-size:25px}p{color:#62728a}button{font:inherit;padding:12px;border:1px solid #b8c8dc;border-radius:8px;background:white;color:#28466a;max-width:100%}.actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:24px;margin-top:28px}[role=tablist]{display:flex;gap:12px;margin:20px 0}[aria-selected=true]{background:#e7eef8}[hidden]{display:none!important}@media(max-width:500px){body{margin:18px}h1{font-size:21px}}</style>
<main><h1 id="fixture-title">虚构样本 · 集中复核</h1><p>此页面和证据均为测试数据，用于验证队列、草稿和保存行为。</p>
<div role="tablist" id="fixture-tabs"><button id="tab-a" role="tab" aria-selected="true" aria-controls="pane-a" onclick="window.setFixtureTab('a')">当前事项</button><button id="tab-b" role="tab" aria-selected="false" aria-controls="pane-b" onclick="window.setFixtureTab('b')">其他事项</button></div>
<section id="pane-a" role="tabpanel"><div class="actions">${controls.map(([id,label])=>`<button id="${id}" onclick="window.businessClicks++">${label}</button>`).join('')}</div></section>
<section id="pane-b" role="tabpanel" hidden><button id="other-action" onclick="window.businessClicks++">其他页面操作</button></section></main>
<script>window.businessClicks=0;window.setFixtureTab=id=>{for(const key of ['a','b']){document.getElementById('tab-'+key).setAttribute('aria-selected',String(key===id));document.getElementById('pane-'+key).hidden=key!==id;}};</script><script src="/overlay.js"></script></html>`;

let browser;
const snapshot = page => page.evaluate(() => window.StrikeHerHeart.getSnapshot());
const queue = async page => (await snapshot(page)).ui.reviewQueue;
const card = (page, item) => page.locator(`[data-shh-card="${item.id}"]`);
const bubble = (page, item) => page.locator(`[data-shh-bubble="${item.id}"]`);
const record = async (page, key) => (await snapshot(page)).annotations.find(item => item.anchor.kind === 'id' && item.anchor.key === key);
const catalogIds = page => page.locator('[data-shh-catalog-item]').evaluateAll(items=>items.map(item=>item.getAttribute('data-shh-catalog-item')));
const toggle = (page, value) => page.locator('[data-shh-review-only]').setChecked(value);
const save = (page, item) => card(page, item).locator(`[data-shh-save="${item.id}"]`).click();
async function open(page, item) { await bubble(page, item).click(); assert.equal(await card(page,item).count(),1); }
async function ensureDrawer(page) {
  if (!(await page.locator('[data-shh-review-only]').isVisible())) await page.locator('[data-shh-drawer="open"]').click();
}
async function load(context, withIssues = true) {
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://queue.fixture/**',route=>{
    const script=new URL(route.request().url()).pathname==='/overlay.js';
    return route.fulfill({contentType:script?'text/javascript':'text/html',body:script?source:fixture});
  });
  await page.goto('http://queue.fixture/page#/first');
  await page.waitForFunction(()=>!!window.StrikeHerHeart?.getSnapshot());
  // Seed stored records to exercise the public load path, without changing the
  // production agent or importing fixture conclusions into a real system.
  await page.evaluate(({withIssues,fields})=>{
    const data=window.StrikeHerHeart.exportData().pages[0];
    for(const item of data.annotations) {
      item.fieldStates=Object.fromEntries(fields.map(field=>[field,'supported']));
      item.evidenceMeta=Object.fromEntries(fields.map(field=>[field,{
        level:'page',source:'虚构夹具来源：仅模拟评审记录',locator:'#'+item.anchor.key,
        action:'',result:'',observedAt:'',derivation:'explicit'
      }]));
      item.manualFields=[]; item.status='enriched'; item.revisions=[];
      delete item.reviewReason; delete item.fieldReviews; delete item.suggestions;
    }
    const find=key=>data.annotations.find(item=>item.anchor.key===key);
    if(withIssues) {
      find('unknown').fieldStates.function='unknown';
      find('unknown').evidenceMeta.function={level:'guess',source:'',locator:'',action:'',result:'',observedAt:'',derivation:'explicit'};
      find('unknown').fields.function='模型猜测：提交可能通知负责人，仍需依据。';
      find('conflict').fieldStates.function='conflict';
      find('conflict').fieldStates.limits='unknown';
      // Keep this reviewer-owned unresolved field unchanged by an automatic
      // source refresh; the test deliberately covers overlapping reasons.
      find('conflict').manualFields=['limits'];
      find('conflict').evidenceMeta.function={level:'tested',source:'虚构实测记录，不是实际业务验收',locator:'#conflict',action:'虚构动作记录',result:'虚构结果与 PRD 相冲突',observedAt:'2026-10-27T09:00:00Z',derivation:'explicit'};
      find('review').fieldStates.function='review';
      find('suggestion').suggestions={function:{value:'虚构新建议',evidence:'测试来源',evidenceMeta:find('suggestion').evidenceMeta.function,fieldState:'supported',receivedAt:'2026-10-27T09:00:00Z'}};
      find('target-review').status='needs-review'; find('target-review').reviewReason='虚构控件定位变化，需确认当前对象。';
      find('field-review').fieldReviews={limits:'虚构页面限制已变化，需复核。'};
    }
    const key=Object.keys(localStorage).find(key=>key.startsWith('strike-her-heart:')&&JSON.parse(localStorage.getItem(key)).scope.route===data.scope.route);
    if(!key)throw new Error('Fixture could not locate its own storage record');
    localStorage.setItem(key,JSON.stringify(data));
  },{withIssues,fields});
  await page.reload();
  await page.waitForFunction(()=>!!window.StrikeHerHeart?.getSnapshot()?.ui.reviewQueue);
  assert.deepEqual(errors,[]);
  await ensureDrawer(page);
  return page;
}
async function blockStorage(page) {
  await page.evaluate(()=>{
    window.savedFixtureWrite=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(key.startsWith('strike-her-heart:'))throw new DOMException('Fictional quota failure','QuotaExceededError');
      return window.savedFixtureWrite.call(this,key,value);
    };
  });
}
async function restoreStorage(page) { await page.evaluate(()=>{Storage.prototype.setItem=window.savedFixtureWrite;}); }

before(async()=>{
  const options={headless:true};
  if(process.env.SHH_BROWSER_CHANNEL)options.channel=process.env.SHH_BROWSER_CHANNEL;
  if(process.env.SHH_BROWSER_EXECUTABLE)options.executablePath=process.env.SHH_BROWSER_EXECUTABLE;
  browser=await chromium.launch(options);
});
after(async()=>{if(browser)await browser.close();});

test('review queue deduplicates saved unknown, conflict, review, suggestions and target issues within the visible scope',async()=>{
  const context=await browser.newContext({viewport:{width:1512,height:1100}});
  try {
    const page=await load(context);
    const records=Object.fromEntries(await Promise.all(controls.map(async([key])=>[key,await record(page,key)])));
    const expected=['conflict','review','suggestion','target-review','field-review','unknown'].map(key=>records[key].id);
    const before=await queue(page);
    assert.equal(before.enabled,false);
    assert.deepEqual(before.pendingIds,expected);
    assert.equal(before.count,6,'Two pending fields on one annotation count once');
    assert.equal(records.conflict.fieldStates.limits,'unknown',JSON.stringify(records.conflict.fieldStates));
    assert.equal(records.conflict.evidenceMeta.function.level,'tested');
    assert.equal(records.unknown.evidenceMeta.function.level,'guess');
    await toggle(page,true);
    assert.deepEqual(await catalogIds(page),expected);
    assert.match(await page.locator(`[data-shh-catalog-item="${records.conflict.id}"]`).innerText(),/功能与触发.*冲突|冲突.*功能与触发/s);
    assert.match(await page.locator(`[data-shh-catalog-item="${records.suggestion.id}"]`).innerText(),/建议/);
    assert.deepEqual(Object.keys((await snapshot(page)).ui.quality).sort(),['dirty','hidden','manual','review','total','unknown']);
    await page.evaluate(()=>{document.getElementById('conflict').hidden=true;window.StrikeHerHeart.scan();});
    assert.equal((await queue(page)).count,5);
    assert.equal((await queue(page)).pendingIds.includes(records.conflict.id),false);
    assert.ok((await snapshot(page)).annotations.some(item=>item.id===records.conflict.id),'Inactive records stay saved but leave the current queue');
  } finally {await context.close();}
});

test('focus mode filters opened cards without losing clean views or unsaved drafts',async()=>{
  const context=await browser.newContext({viewport:{width:1512,height:1100}});
  try {
    const page=await load(context), done=await record(page,'done'), clean=await record(page,'done-two'), pending=await record(page,'unknown');
    await open(page,clean); await open(page,done); await open(page,pending);
    const input=card(page,done).locator('[data-shh-field="function"]');
    await input.fill('切换队列仍保留的人工草稿');
    assert.equal(await input.evaluate(node=>node.getRootNode().activeElement===node),true);
    await toggle(page,true);
    let current=await queue(page);
    assert.equal(await card(page,clean).count(),0);
    assert.ok(current.visibleCardIds.includes(done.id)); assert.ok(current.visibleCardIds.includes(pending.id));
    assert.deepEqual(current.retainedDraftIds,[done.id]);
    assert.match(await card(page,done).innerText(),/未保存草稿暂留/);
    assert.equal(await card(page,done).locator('[data-shh-field="function"]').inputValue(),'切换队列仍保留的人工草稿');
    assert.equal(await bubble(page,clean).getAttribute('aria-expanded'),'false');
    await toggle(page,false);
    assert.equal(await card(page,clean).count(),1);
    assert.equal(await bubble(page,clean).getAttribute('aria-expanded'),'true');
    assert.equal(await input.inputValue(),'切换队列仍保留的人工草稿');
    await toggle(page,true); await save(page,done);
    current=await queue(page);
    assert.equal(current.retainedDraftIds.includes(done.id),false);
    assert.equal(await card(page,done).count(),0,'Successfully saved non-pending draft no longer bypasses the filter');
    assert.equal((await record(page,'done')).fields.function,'切换队列仍保留的人工草稿');
  } finally {await context.close();}
});

test('only saving the last resolved reason removes an item; editing conflict prose never resolves it implicitly',async()=>{
  const context=await browser.newContext({viewport:{width:1512,height:1100}});
  try {
    const page=await load(context), item=await record(page,'review'), conflict=await record(page,'conflict');
    await toggle(page,true); await open(page,item);
    await card(page,item).locator('[data-shh-state="function"]').selectOption('supported');
    assert.ok((await queue(page)).pendingIds.includes(item.id),'Draft status does not remove saved work');
    assert.equal(await card(page,item).count(),1);
    await save(page,item);
    assert.equal((await queue(page)).pendingIds.includes(item.id),false);
    assert.equal(await card(page,item).count(),0);
    await open(page,conflict);
    await card(page,conflict).locator('[data-shh-field="function"]').fill('人工补充冲突说明，尚未作出裁决。');
    await save(page,conflict);
    assert.equal((await record(page,'conflict')).fieldStates.function,'conflict');
    assert.ok((await queue(page)).pendingIds.includes(conflict.id));
    await card(page,conflict).locator('[data-shh-state="limits"]').selectOption('supported');
    await save(page,conflict);
    assert.ok((await queue(page)).pendingIds.includes(conflict.id),'Resolving one of multiple reasons does not complete the annotation');
  } finally {await context.close();}
});

test('failed saves retain queue membership and drafts, and one successful retry removes the resolved item',async()=>{
  const context=await browser.newContext({viewport:{width:1512,height:1100}});
  try {
    const page=await load(context), item=await record(page,'review');
    await toggle(page,true); await open(page,item);
    await card(page,item).locator('[data-shh-state="function"]').selectOption('supported');
    await blockStorage(page); await save(page,item);
    assert.ok((await queue(page)).pendingIds.includes(item.id));
    assert.equal((await record(page,'review')).fieldStates.function,'review');
    assert.ok((await snapshot(page)).ui.dirtyIds.includes(item.id));
    assert.equal(await card(page,item).locator('[data-shh-state="function"]').inputValue(),'supported');
    assert.match(await card(page,item).locator('.save-status').innerText(),/尚未写入本浏览器/);
    await restoreStorage(page); await save(page,item);
    assert.equal((await queue(page)).pendingIds.includes(item.id),false);
    assert.equal((await record(page,'review')).revisions.length,item.revisions.length+1);
    await page.reload(); await page.waitForFunction(()=>!!window.StrikeHerHeart?.getSnapshot()?.ui.reviewQueue);
    assert.equal((await queue(page)).pendingIds.includes(item.id),false);
    assert.equal((await record(page,'review')).fieldStates.function,'supported');
  } finally {await context.close();}
});

test('next review item cycles through the queue without executing business actions and an empty scope stays explicit',async()=>{
  const context=await browser.newContext({viewport:{width:1512,height:1100}});
  try {
    const page=await load(context);
    await toggle(page,true);
    const pending=(await queue(page)).pendingIds;
    for(const id of [...pending,pending[0]]) {
      await page.locator('[data-shh-review-next]').click();
      assert.ok((await queue(page)).visibleCardIds.includes(id));
      const focused=await page.locator(`[data-shh-card="${id}"]`).evaluate(node=>node.getRootNode().activeElement===node);
      assert.equal(focused,true);
    }
    assert.equal(await page.evaluate(()=>window.businessClicks),0);
    const emptyContext=await browser.newContext({viewport:{width:1512,height:1100}});
    try {
      const empty=await load(emptyContext,false); await toggle(empty,true);
      assert.equal((await queue(empty)).count,0);
      assert.equal(await empty.locator('[data-shh-review-next]').isDisabled(),true);
      assert.equal(await empty.locator('[data-shh-catalog-item]').count(),0);
      assert.match(await empty.locator('.panel').innerText(),/当前呈现范围没有待确认或冲突项/);
      assert.doesNotMatch(await empty.locator('.panel').innerText(),/全站.*(?:完成|通过)/);
    } finally {await emptyContext.close();}
  } finally {await context.close();}
});

test('queue search combines with state and evidence filters and entering focus resets stale catalog restrictions',async()=>{
  const context=await browser.newContext({viewport:{width:1512,height:1100}});
  try {
    const page=await load(context), unknown=await record(page,'unknown'), conflict=await record(page,'conflict');
    await page.locator('[data-shh-search]').fill('不存在的控件');
    await page.locator('[data-shh-filter]').selectOption('manual');
    await toggle(page,true);
    assert.equal(await page.locator('[data-shh-search]').inputValue(),'');
    assert.equal(await page.locator('[data-shh-filter]').inputValue(),'all');
    assert.equal((await catalogIds(page)).length,6);
    await page.locator('[data-shh-filter]').selectOption('unknown');
    assert.deepEqual(new Set(await catalogIds(page)),new Set([conflict.id,unknown.id]));
    await page.locator('[data-shh-search]').fill(unknown.displayId);
    assert.deepEqual(await catalogIds(page),[unknown.id]);
    await page.locator('[data-shh-filter]').selectOption('tested');
    assert.deepEqual(await catalogIds(page),[]);
    assert.equal(await page.locator('[data-shh-review-next]').isDisabled(),true,'Next cannot escape a search with no matching pending items');
    await page.locator('[data-shh-search]').fill('');
    assert.deepEqual(await catalogIds(page),[conflict.id]);
    await page.locator('[data-shh-review-next]').click();
    assert.equal(await card(page,conflict).evaluate(node=>node.getRootNode().activeElement===node),true);
    await page.locator('[data-shh-filter]').selectOption('guess');
    assert.deepEqual(await catalogIds(page),[unknown.id]);
    await page.locator('[data-shh-review-next]').click();
    assert.equal(await card(page,unknown).evaluate(node=>node.getRootNode().activeElement===node),true);
    assert.equal((await queue(page)).count,6,'Search narrows the list, not the underlying pending count');
  } finally {await context.close();}
});

test('selecting a confirmed original-page bubble exits focus mode and opens that explanation visibly',async()=>{
  const context=await browser.newContext({viewport:{width:1512,height:1100}});
  try {
    const page=await load(context), confirmed=await record(page,'done'), pending=await record(page,'unknown');
    await toggle(page,true); await open(page,pending);
    const before=(await queue(page)).pendingIds;
    await open(page,confirmed);
    assert.equal((await queue(page)).enabled,false);
    assert.equal(await page.locator('[data-shh-review-only]').isChecked(),false);
    assert.ok((await queue(page)).visibleCardIds.includes(confirmed.id));
    assert.deepEqual((await queue(page)).pendingIds,before);
    assert.equal(await bubble(page,confirmed).getAttribute('aria-expanded'),'true');
    assert.match(await page.locator('.status').innerText(),/已(?:切换为查看|显示)全部标注/);
    assert.equal(await page.evaluate(()=>window.businessClicks),0);
  } finally {await context.close();}
});

test('focus preference and unsaved work are isolated across route and ARIA tab contexts',async()=>{
  const context=await browser.newContext({viewport:{width:1512,height:1100}});
  try {
    const page=await load(context), item=await record(page,'review');
    await toggle(page,true); await open(page,item);
    await card(page,item).locator('[data-shh-field="limits"]').fill('页签 A 的未保存说明');
    await page.locator('#tab-b').click();
    await page.waitForFunction(()=>window.StrikeHerHeart.getSnapshot().annotations.some(a=>a.anchor.key==='other-action'));
    assert.equal((await queue(page)).enabled,false);
    assert.equal(await card(page,item).count(),0);
    await page.locator('#tab-a').click();
    await page.waitForFunction(()=>window.StrikeHerHeart.getSnapshot().ui.reviewQueue.enabled===true);
    assert.equal(await card(page,item).locator('[data-shh-field="limits"]').inputValue(),'页签 A 的未保存说明');
    await page.evaluate(()=>{location.hash='/second';window.StrikeHerHeart.scan();});
    assert.equal((await queue(page)).enabled,false);
    assert.equal((await queue(page)).visibleCardIds.includes(item.id),false);
    await page.evaluate(()=>{location.hash='/first';window.StrikeHerHeart.scan();});
    assert.equal((await queue(page)).enabled,true);
    assert.equal(await card(page,item).locator('[data-shh-field="limits"]').inputValue(),'页签 A 的未保存说明');
  } finally {await context.close();}
});

test('desktop and 390px review controls stay reachable, editable and inside the viewport',async()=>{
  fs.mkdirSync(output,{recursive:true});
  for(const viewport of [{width:1512,height:1100},{width:390,height:844}]) {
    const context=await browser.newContext({viewport});
    try {
      const page=await load(context), item=await record(page,'review');
      await toggle(page,true);
      for(const selector of ['[data-shh-review-only]','[data-shh-review-next]','[data-shh-search]','[data-shh-filter]']) {
        const element=page.locator(selector); await element.scrollIntoViewIfNeeded();
        const box=await element.boundingBox();
        assert.ok(box&&box.x>=0&&box.x+box.width<=viewport.width+1,`${selector} fits ${viewport.width}px`);
      }
      await page.locator(`[data-shh-catalog-item="${item.id}"]`).click();
      assert.equal(await card(page,item).count(),1);
      await card(page,item).locator('[data-shh-field="function"]').fill('虚构评审备注：此规则仍需核实。');
      const box=await card(page,item).locator('[data-shh-field="function"]').boundingBox();
      assert.ok(box.width>=200&&box.x>=0&&box.x+box.width<=viewport.width+1);
      await save(page,item);
      assert.ok((await queue(page)).pendingIds.includes(item.id));
      assert.equal((await record(page,'review')).fields.function,'虚构评审备注：此规则仍需核实。');
      await page.locator('[data-shh-catalog]').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(output,viewport.width===390?'fictional-mobile.png':'fictional-desktop.png'),animations:'disabled'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    } finally {await context.close();}
  }
});
