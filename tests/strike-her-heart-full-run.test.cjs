/* Demo-page renderer acceptance in a fresh, unauthenticated browser context.
 * No user browser, installed extension, external service, or production edit.
 * node --test tests/strike-her-heart-full-run.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'skills/strike-her-heart/assets');
const output = process.env.SHH_FULL_RUN_OUTPUT || path.join(root, 'test-results/full-run');
const fields = ['content', 'function', 'limits', 'navigation'];
const scenes = [
  { key: 'leads-all', route: '#/leads', expected: 21, edit: '#search-name' },
  { key: 'leads-mine', route: '#/leads', expected: 19, edit: '#search-name', setup: async p => p.locator('#tab-mine').click() },
  { key: 'projects-collapsed', route: '#/projects', expected: 8, edit: '#project-owner' },
  { key: 'projects-expanded', route: '#/projects', expected: 8, edit: '#view-project', setup: async p => p.locator('#view-project').click() },
  { key: 'settings', route: '#/settings', expected: 13, edit: '#workspace-name' },
  { key: 'lead-dialog', route: '#/leads', expected: 7, edit: '#lead-name', setup: async p => p.locator('#new-lead').click() },
];
const report = {
  renderer: 'Strike Her Heart', fixtureOnly: true,
  startedAt: new Date().toISOString(), status: 'running',
  sourceFiles: {}, environment: {}, scenes: [], interactionChecks: [], errors: [], observations: [], screenshots: [],
  limitations: [
    '仅验收本仓库无认证、虚构数据演示，不代表外部业务系统验收。',
    '原生 select/date/time 浏览器内置弹层内部选项不是 DOM 气泡覆盖范围；已验收其宿主控件。',
    '测试使用隔离 Chrome 的临时 browser context，localStorage 与用户浏览器分离。',
  ],
};
function sourceHashes() {
  return Object.fromEntries(['demo.html', 'overlay.js', 'demo-annotations.js'].map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(assets, name))).digest('hex')]));
}
function saveReport() { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'full-run-report.json'), JSON.stringify(report, null, 2)); }
function errorRecord(scope, action, error, extra = {}) {
  const item = { scope, action, message: error.message || String(error), ...extra };
  report.errors.push(item); return item;
}
async function attempt(scope, action, fn) {
  try { return { passed: true, result: await fn() }; }
  catch (e) { return { passed: false, error: errorRecord(scope, action, e) }; }
}
async function state(page) { return page.evaluate(() => window.StrikeHerHeart.getSnapshot()); }
async function settle(page) { await page.waitForTimeout(650); }
const bubble = (page, annotation) => page.locator(`[data-shh-bubble="${annotation.id}"]`);
const card = (page, annotation) => page.locator(`[data-shh-card="${annotation.id}"]`);
async function screenshot(page, name, fullPage = false) {
  const file = path.join(output, `${name}.png`);
  await page.screenshot({ path: file, fullPage }); report.screenshots.push(file); return file;
}
async function openScene(page, origin, scene) {
  await page.goto(`${origin}/demo.html${scene.route}`);
  await page.waitForFunction(() => window.StrikeHerHeart?.getSnapshot().currentControlIds.length > 5);
  if (scene.setup) await scene.setup(page);
  await settle(page);
}
async function inventory(page) {
  return page.evaluate(() => {
    const modal = document.querySelector('dialog:modal');
    const selector = 'button,input:not([type="hidden"]),textarea,select,a[href],summary,[contenteditable="true"],[role="button"],[role="link"],[role="textbox"],[role="combobox"],[role="listbox"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"],[role="slider"],[role="spinbutton"],[role="searchbox"]';
    return [...(modal || document).querySelectorAll(selector)].filter(node => {
      if (node.closest('#strike-her-heart-overlay')) return false;
      if (!node.getClientRects().length) return false;
      for (let p = node; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (p.hidden || p.inert || s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) === 0) return false;
      }
      return true;
    }).map(node => {
      let css;
      const row = node.closest('[data-row-key]');
      if (node.id) css = '#' + CSS.escape(node.id);
      else if (row) css = `[data-row-key="${CSS.escape(row.getAttribute('data-row-key'))}"] ${node.tagName.toLowerCase()}`;
      else {
        let p = node; const parts = [];
        while (p && p !== document.documentElement) {
          const peers = p.parentElement ? [...p.parentElement.children].filter(x => x.tagName === p.tagName) : [p];
          parts.unshift(p.tagName.toLowerCase() + ':nth-of-type(' + (peers.indexOf(p) + 1) + ')'); p = p.parentElement;
        }
        css = parts.join('>');
      }
      return { css, id: node.id, rowKey: row?.getAttribute('data-row-key') || '', tag: node.tagName.toLowerCase(), type: node.type || node.getAttribute('role') || node.tagName.toLowerCase(), disabled: !!node.disabled,
        label: node.getAttribute('aria-label') || [...(node.labels || [])].map(x => x.textContent.trim()).join(' ') || node.textContent.trim() || node.getAttribute('placeholder') || node.id };
    });
  });
}
async function annotationForControl(page, control, snapshot) {
  const candidates = [];
  for (const annotation of snapshot.annotations.filter(a => snapshot.currentControlIds.includes(a.id) && a.anchor.kind !== 'page')) {
    const match = await page.evaluate(({ control, anchor }) => {
      const target = document.querySelector(control.css);
      if (anchor.kind === 'id') return !!target && target.id === anchor.key;
      if (anchor.kind === 'row') return !!control.rowKey && anchor.key.startsWith('data-row-key:' + control.rowKey + '>') && anchor.tag === control.tag;
      if (anchor.kind === 'path') { try { return document.querySelector(anchor.key) === target; } catch (_) { return false; } }
      return false;
    }, { control, anchor: annotation.anchor });
    if (match) candidates.push(annotation);
  }
  return candidates;
}
async function geometry(page) {
  return page.evaluate(() => {
    const s = window.StrikeHerHeart.getSnapshot();
    const sh = document.getElementById('strike-her-heart-overlay').shadowRoot;
    const rect = n => { const r = n.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom }; };
    const visible = [...sh.querySelectorAll('[data-shh-bubble]')].filter(n => !n.hidden);
    const blockedCenters = [], bubbleOverlaps = [], nearControls = [], blockedBubbles = [];
    const controls = [...(document.querySelector('dialog:modal') || document).querySelectorAll('button,input:not([type="hidden"]),textarea,select,a[href]')].filter(n => n.getClientRects().length);
    for (const n of controls) {
      const r = rect(n), x=r.x+r.width/2, y=r.y+r.height/2;
      if (x<0 || y<0 || x>=innerWidth || y>=innerHeight) continue;
      const outer = document.elementFromPoint(x,y);
      const hit = outer?.id === 'strike-her-heart-overlay' ? sh.elementFromPoint(x,y) : outer;
      if (outer?.id === 'strike-her-heart-overlay' && hit && hit !== n && !n.contains(hit) && !hit.contains(n)) blockedCenters.push({ control:n.id || n.getAttribute('aria-label') || n.textContent.trim(), disabled:!!n.disabled, hit:hit.className, bubbleId:hit.getAttribute?.('data-shh-bubble') || '', x,y });
      for (const b of visible) {
        const q=rect(b), w=Math.min(r.right,q.right)-Math.max(r.x,q.x), h=Math.min(r.bottom,q.bottom)-Math.max(r.y,q.y);
        if(w>0 && h>0) nearControls.push({ control:n.id || n.getAttribute('aria-label') || n.textContent.trim(), bubbleId:b.getAttribute('data-shh-bubble'), overlapArea:Math.round(w*h) });
      }
    }
    for (const b of visible) {
      const r=rect(b), x=r.x+r.width/2, y=r.y+r.height/2, hit=sh.elementFromPoint(x,y);
      if(hit!==b && !b.contains(hit)) blockedBubbles.push({id:b.getAttribute('data-shh-bubble'),number:b.textContent,hit:hit?.className || '',x,y});
    }
    for(let i=0;i<visible.length;i++) for(let j=i+1;j<visible.length;j++) {
      const a=rect(visible[i]), b=rect(visible[j]), w=Math.min(a.right,b.right)-Math.max(a.x,b.x), h=Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y);
      if(w>0 && h>0) bubbleOverlaps.push({left:visible[i].textContent,right:visible[j].textContent,area:Math.round(w*h)});
    }
    return { viewport:{width:innerWidth,height:innerHeight}, scroll:{x:scrollX,y:scrollY}, controlCount:controls.length, visibleBubbleCount:visible.length, allBubbleCount:sh.querySelectorAll('[data-shh-bubble]').length, blockedCenters,bubbleOverlaps,nearControls,
      blockedBubbles,bubbleLabels:visible.map(n=>({id:n.getAttribute('data-shh-bubble'),text:n.textContent,aria:n.getAttribute('aria-label'),rect:rect(n)})), lineCount:sh.querySelectorAll('.leaders line').length, scope:s.scope };
  });
}
async function clearCards(page) {
  const button = page.getByRole('button', { name:'关闭全部详情', exact:true });
  if (await button.count()) await button.click();
}

async function checkAllControls(page, scene, entry) {
  const snapshot = await state(page), controls = await inventory(page);
  entry.scope = snapshot.scope; entry.controls = []; entry.controlCount = controls.length;
  entry.bubbleCount = await page.locator('[data-shh-bubble]').count();
  entry.pageAnnotationCount = snapshot.currentControlIds.map(id=>snapshot.annotations.find(a=>a.id===id)).filter(a=>a.anchor.kind==='page').length;
  entry.expectedControlCount = scene.expected;
  await attempt(scene.key,'independent control inventory',async()=>assert.equal(controls.length,scene.expected));
  await attempt(scene.key,'exactly one page bubble plus one per business control',async()=>assert.equal(entry.bubbleCount, controls.length+1));
  await attempt(scene.key,'unique stable numbers',async()=>assert.equal(new Set(snapshot.annotations.map(a=>a.number)).size,snapshot.annotations.length));
  for (const control of controls) {
    const item = { ...control, matchingAnnotations:[], bubbleVisible:false, bubbleClicked:false, detailsVerified:false, fields:{} }; entry.controls.push(item);
    const candidates = await annotationForControl(page,control,snapshot);
    item.matchingAnnotations = candidates.map(a=>({id:a.id,number:a.number,displayId:a.displayId,label:a.label,anchor:a.anchor}));
    if(candidates.length!==1) { errorRecord(scene.key,'unique annotation mapping',new Error(`${control.css}: found ${candidates.length}`)); continue; }
    const annotation=candidates[0];
    const result=await attempt(scene.key,`click bubble for ${control.css}`,async()=>{
      await page.locator(control.css).scrollIntoViewIfNeeded(); await page.waitForTimeout(70);
      item.bubbleVisible=await bubble(page,annotation).isVisible(); assert.equal(item.bubbleVisible,true);
      item.bubbleText=await bubble(page,annotation).innerText();
      assert.match(await bubble(page,annotation).getAttribute('aria-label'),/打开标注详情/);
      await bubble(page,annotation).click({timeout:1600}); item.bubbleClicked=true;
      assert.equal(await card(page,annotation).count(),1);
      assert.equal(await card(page,annotation).locator('.cardtitle strong').innerText(),annotation.currentLabel || annotation.label);
      assert.equal(await card(page,annotation).locator('.num').innerText(),annotation.displayId);
      for(const name of fields) {
        const value=await card(page,annotation).locator(`[data-shh-field="${name}"]`).inputValue();
        const evidence=await card(page,annotation).locator(`[data-shh-evidence="${name}"]`).inputValue();
        const fieldState=await card(page,annotation).locator(`[data-shh-state="${name}"]`).inputValue();
        item.fields[name]={value,evidence,state:fieldState}; assert.ok(value.trim()); assert.ok(evidence.trim());
      }
      const box=await page.locator('aside.panel').boundingBox(); assert.ok(box.x>=page.viewportSize().width/2);
      item.detailsVerified=true;
      await page.locator(`[data-shh-close="${annotation.id}"]`).click();
      assert.equal(await card(page,annotation).count(),0);
    });
    if(!result.passed) item.error=result.error;
  }
  entry.detailsCount=entry.controls.filter(x=>x.detailsVerified).length;
  entry.evidenceSummary={fullySupportedControls:entry.controls.filter(x=>fields.every(name=>x.fields[name]?.state==='supported')).length,controlsWithUnknownFields:entry.controls.filter(x=>fields.some(name=>x.fields[name]?.state==='unknown')).map(x=>({control:x.css,unknownFields:fields.filter(name=>x.fields[name]?.state==='unknown')}))};
  entry.clickedBubbleCount=entry.controls.filter(x=>x.bubbleClicked).length;
  entry.uncovered=entry.controls.filter(x=>!x.detailsVerified).map(x=>({control:x.css,reason:x.error?.message || '没有唯一标注'}));
  entry.pageBubbleDetails=await attempt(scene.key,'click page-level bubble and verify four fields/evidence',async()=>{
    await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100);
    const annotation=snapshot.annotations.find(a=>snapshot.currentControlIds.includes(a.id)&&a.anchor.kind==='page');
    await bubble(page,annotation).click({timeout:1600});
    for(const name of fields){assert.ok((await card(page,annotation).locator(`[data-shh-field="${name}"]`).inputValue()).trim());assert.ok((await card(page,annotation).locator(`[data-shh-evidence="${name}"]`).inputValue()).trim());}
    await page.locator(`[data-shh-close="${annotation.id}"]`).click();
    return {id:annotation.id,displayId:annotation.displayId,fieldsAndEvidence:4};
  });
  // Capture representative original page plus two simultaneously open details.
  await page.evaluate(()=>scrollTo(0,0)); await page.waitForTimeout(100);
  const first=entry.controls.filter(x=>x.detailsVerified).slice(0,2).map(x=>x.matchingAnnotations[0]);
  for(const annotation of first) await bubble(page,annotation).click({timeout:1600});
  entry.multipleDetails=await attempt(scene.key,'two independent cards and individual close',async()=>{
    assert.equal(await page.locator('[data-shh-card]').count(),2);
    await page.locator(`[data-shh-close="${first[0].id}"]`).click();
    assert.equal(await card(page,first[0]).count(),0); assert.equal(await card(page,first[1]).count(),1);
    await bubble(page,first[0]).click();
  });
  entry.initialGeometry=await geometry(page);
  entry.screenshot=await screenshot(page,scene.key);
  await clearCards(page);
}

async function editAndRefresh(page,origin,scene,entry) {
  entry.saveAndRefresh=await attempt(scene.key,'UI edit/save/reload and restore text',async()=>{
    const control=(await inventory(page)).find(x=>x.css===scene.edit);
    let annotation=(await annotationForControl(page,control,await state(page)))[0];
    const original={fields:annotation.fields,evidence:annotation.evidence};
    await page.locator(scene.edit).scrollIntoViewIfNeeded(); await page.waitForTimeout(60); await bubble(page,annotation).click();
    const marker=`本次隔离验收 ${scene.key} ${report.startedAt}`;
    for(const name of fields) {
      await card(page,annotation).locator(`[data-shh-field="${name}"]`).fill(marker+' '+name);
      await card(page,annotation).locator(`[data-shh-evidence="${name}"]`).fill('测试 UI 证据 '+scene.key+' '+name);
    }
    await page.locator(`[data-shh-save="${annotation.id}"]`).click();
    const saved=(await state(page)).annotations.find(x=>x.id===annotation.id);
    assert.ok(saved.revisions.length); assert.ok(fields.every(name=>saved.fields[name]===marker+' '+name));
    await page.reload(); await page.waitForFunction(()=>!!window.StrikeHerHeart);
    if(scene.setup) await scene.setup(page); await settle(page);
    annotation=(await state(page)).annotations.find(x=>x.id===annotation.id);
    assert.ok(annotation); assert.equal(annotation.number,saved.number); assert.equal(annotation.displayId,saved.displayId);
    for(const name of fields) {assert.equal(annotation.fields[name],marker+' '+name);assert.equal(annotation.evidence[name],'测试 UI 证据 '+scene.key+' '+name);}
    await page.locator(scene.edit).scrollIntoViewIfNeeded(); await page.waitForTimeout(60); await bubble(page,annotation).click();
    for(const name of fields) {
      assert.equal(await card(page,annotation).locator(`[data-shh-field="${name}"]`).inputValue(),marker+' '+name);
      await card(page,annotation).locator(`[data-shh-field="${name}"]`).fill(original.fields[name]);
      await card(page,annotation).locator(`[data-shh-evidence="${name}"]`).fill(original.evidence[name]);
    }
    await page.locator(`[data-shh-save="${annotation.id}"]`).click();
    const restored=(await state(page)).annotations.find(x=>x.id===annotation.id);
    assert.deepEqual(restored.fields,original.fields);assert.deepEqual(restored.evidence,original.evidence);
    await page.reload();await page.waitForFunction(()=>!!window.StrikeHerHeart);
    if(scene.setup) await scene.setup(page);await settle(page);
    const restoredReload=(await state(page)).annotations.find(x=>x.id===annotation.id);
    assert.deepEqual(restoredReload.fields,original.fields);assert.deepEqual(restoredReload.evidence,original.evidence);
    return {id:annotation.id,displayId:annotation.displayId,editedFields:fields,saved:true,refreshed:true,originalTextRestored:true,restoredTextRefreshed:true,revisions:restoredReload.revisions.length};
  });
}

async function layoutChecks(page,scene,entry) {
  entry.layout={};
  for(const spec of [{name:'desktop',width:1512,height:1000},{name:'narrow',width:390,height:844},{name:'narrow-scroll',width:390,height:844,scroll:true}]) {
    await page.setViewportSize({width:spec.width,height:spec.height});
    await page.evaluate(scroll=>scrollTo(0,scroll?document.body.scrollHeight:0),!!spec.scroll);await page.waitForTimeout(150);
    const result=await geometry(page);entry.layout[spec.name]=result;
    if(spec.name==='narrow') entry.narrowScreenshot=await screenshot(page,scene.key+'-narrow');
    const enabledBlocked=result.blockedCenters.filter(x=>!x.disabled);
    if(enabledBlocked.length && spec.name==='desktop') errorRecord(scene.key,`${spec.name} controls reachable with overlay`,new Error(`${enabledBlocked.length} enabled control centers are covered`),{controls:enabledBlocked});
    else if(enabledBlocked.length) report.observations.push({scope:scene.key,action:spec.name+' original controls with panel expanded',coveredCenters:enabledBlocked.length,explanation:'窄屏展开右栏会遮盖原控件；单独验证收起后的原交互。'});
    if(result.bubbleOverlaps.length) errorRecord(scene.key,`${spec.name} bubble separation`,new Error(`${result.bubbleOverlaps.length} bubble pairs overlap`),{pairs:result.bubbleOverlaps});
    if(spec.name==='narrow') {
      entry.narrowBubbleClick=await attempt(scene.key,'narrow actual bubble click with panel expanded',async()=>{
        const representative=result.blockedBubbles[0] || result.bubbleLabels[0];assert.ok(representative);
        await page.locator(`[data-shh-bubble="${representative.id}"]`).click({timeout:1000});
        assert.equal(await page.locator(`[data-shh-card="${representative.id}"]`).count(),1);
        return {id:representative.id,passed:true};
      });
      // This is a distinct requirement: the narrow panel must be collapsible.
      entry.narrowCollapse=await attempt(scene.key,'narrow collapse restores original UI',async()=>{
        await page.locator('[data-shh-toggle="off"]').click();assert.equal((await state(page)).ui.visible,false);
        assert.equal((await geometry(page)).blockedCenters.length,0);
        if(scene.key==='lead-dialog') {await page.locator('#lead-name').fill('窄屏可操作性');assert.equal(await page.locator('#lead-name').inputValue(),'窄屏可操作性');await page.locator('#lead-name').fill('');}
        else if(scene.route==='#/leads') {await page.locator('#new-lead').click();assert.equal(await page.locator('#lead-dialog').isVisible(),true);await page.locator('#cancel-dialog').click();}
        else if(scene.route==='#/projects') {const before=await page.locator('#project-detail').isVisible();await page.locator('#view-project').click();assert.equal(await page.locator('#project-detail').isVisible(),!before);await page.locator('#view-project').click();}
        else {await page.locator('#workspace-name').fill('窄屏可操作性');assert.equal(await page.locator('#workspace-name').inputValue(),'窄屏可操作性');await page.locator('#reset-settings').click();}
        await page.getByRole('button',{name:'♡ 打开页面标注',exact:true}).click();assert.equal((await state(page)).ui.visible,true);
        return {collapsed:true,originalInteraction:true,reopened:true};
      });
    }
  }
  await page.setViewportSize({width:1512,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100);
}

async function interactionChecks(browser,origin) {
  const context=await browser.newContext({viewport:{width:1512,height:1000}}),page=await context.newPage();
  try {
    async function run(name,fn) {const outcome=await attempt('interaction',name,fn);report.interactionChecks.push({name,...outcome});saveReport();}
    await run('route/tab/modal opened cards, drafts and bubble isolation',async()=>{
      await openScene(page,origin,scenes[0]);
      let a=(await state(page)).annotations.find(a=>a.anchor.kind==='id'&&a.anchor.key==='search-name');
      await bubble(page,a).click();await card(page,a).locator('[data-shh-field="function"]').fill('全部页签未保存草稿');
      await page.locator('#tab-mine').click();await settle(page);
      assert.equal(await card(page,a).count(),0);assert.equal((await state(page)).ui.dirtyIds.length,0);
      const current=await state(page);assert.equal(current.currentControlIds.length,20);
      const oldHidden=current.annotations.filter(x=>x.anchor.kind==='row'&&x.anchor.key.includes('NS-1027')).map(x=>x.id);
      assert.ok(oldHidden.every(id=>!current.currentControlIds.includes(id)));
      await page.locator('#tab-all').click();await settle(page);
      assert.equal(await card(page,a).locator('[data-shh-field="function"]').inputValue(),'全部页签未保存草稿');
      await page.locator('#new-lead').click();await settle(page);
      assert.equal(await card(page,a).count(),0);assert.equal((await state(page)).currentControlIds.length,8);
      const modal=await state(page);assert.ok(modal.currentControlIds.map(id=>modal.annotations.find(x=>x.id===id)).every(x=>x.anchor.kind==='page'?x.anchor.key.includes('|modal:'):['lead-name','lead-contact','lead-source','lead-note','close-dialog','cancel-dialog','save-lead'].includes(x.anchor.key)));
      await page.locator('#cancel-dialog').click();await settle(page);
      assert.equal(await card(page,a).locator('[data-shh-field="function"]').inputValue(),'全部页签未保存草稿');
      await page.locator('#nav-projects').click();await settle(page);assert.equal(await card(page,a).count(),0);assert.equal((await state(page)).scope.route,'#/projects');
      await page.locator('#nav-leads').click();await settle(page);
      const returned=await state(page);assert.equal(returned.annotations.find(x=>x.id===a.id).number,a.number);
      assert.equal(await card(page,a).locator('[data-shh-field="function"]').inputValue(),'全部页签未保存草稿');
      await page.getByRole('button',{name:'撤销未保存修改',exact:true}).click();
      return {tab:true,route:true,modal:true,stableNumber:true,draftRestored:true};
    });
    await run('saved human fields survive UI rescan and conflicting UI JSON import',async()=>{
      await openScene(page,origin,scenes[0]);
      const a=(await state(page)).annotations.find(a=>a.anchor.kind==='id'&&a.anchor.key==='search-name');
      await bubble(page,a).click();
      const original=a.fields.function,originalEvidence=a.evidence.function;
      await card(page,a).locator('[data-shh-field="function"]').fill('人工保护测试文字');
      await card(page,a).locator('[data-shh-evidence="function"]').fill('人工保护测试证据');
      await page.locator(`[data-shh-save="${a.id}"]`).click();
      await page.getByRole('button',{name:'重新识别',exact:true}).click();
      assert.equal((await state(page)).annotations.find(x=>x.id===a.id).fields.function,'人工保护测试文字');
      await page.getByRole('button',{name:'导出',exact:true}).click();
      const exported=JSON.parse(await page.locator('[data-shh-transfer="export"]').inputValue());
      await page.getByRole('button',{name:'关闭',exact:true}).click();
      const incoming=exported.pages.flatMap(p=>p.annotations).find(x=>x.id===a.id);
      incoming.fields.function='冲突 AI 建议';incoming.evidence.function='冲突来源';incoming.fieldStates.function='supported';
      await page.getByRole('button',{name:'导入',exact:true}).click();
      await page.locator('[data-shh-transfer="import"]').fill(JSON.stringify(exported));
      await page.getByRole('button',{name:'合并导入',exact:true}).click();
      let after=(await state(page)).annotations.find(x=>x.id===a.id);
      assert.equal(after.fields.function,'人工保护测试文字');assert.equal(after.evidence.function,'人工保护测试证据');assert.equal(after.suggestions.function.value,'冲突 AI 建议');
      await page.getByRole('button',{name:'关闭',exact:true}).click();
      assert.match(await card(page,a).innerText(),/冲突 AI 建议/);
      await card(page,a).getByRole('button',{name:'保留人工版本',exact:true}).click();
      await card(page,a).locator('[data-shh-field="function"]').fill(original);
      await card(page,a).locator('[data-shh-evidence="function"]').fill(originalEvidence);
      await page.locator(`[data-shh-save="${a.id}"]`).click();
      return {rescanPreserved:true,importPreserved:true,suggestionDisplayed:true,originalTextRestored:true};
    });
    await run('actual keyed lead row reorder preserves bubble identities',async()=>{
      await openScene(page,origin,scenes[0]);
      const before=(await state(page)).annotations.filter(x=>x.anchor.kind==='row').map(x=>({id:x.id,number:x.number,key:x.anchor.key}));
      // An isolated source-code software test mutates its own synthetic DOM only.
      await page.evaluate(()=>{const rows=document.getElementById('lead-rows');rows.insertBefore(rows.lastElementChild,rows.firstElementChild);});await settle(page);
      const after=(await state(page)).annotations.filter(x=>x.anchor.kind==='row').map(x=>({id:x.id,number:x.number,key:x.anchor.key}));
      assert.deepEqual(after,before);return {records:3,annotations:before.length,stable:true};
    });
    await run('desktop checkbox center click changes selection rather than opening annotation',async()=>{
      await openScene(page,origin,scenes[0]);
      const target=page.locator('#select-all'),before=await target.isChecked(),box=await target.boundingBox();
      await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
      const after=await target.isChecked(),openCards=await page.locator('[data-shh-card]').count();
      const file=await screenshot(page,'checkbox-center-click');
      assert.notEqual(after,before,`select-all before=${before}, after=${after}, opened annotation cards=${openCards}; screenshot=${file}`);
      return {before,after,openCards,screenshot:file};
    });
    await run('collapse overlay and original demo interactions including submit remain usable',async()=>{
      await openScene(page,origin,scenes[0]);
      await page.locator('[data-shh-toggle="off"]').click();assert.equal((await state(page)).ui.visible,false);
      await page.locator('#search-name').fill('青岚');await page.locator('#query-leads').click();
      assert.equal(await page.locator('#lead-rows tr').count(),1);
      await page.locator('#reset-filter').click();await page.locator('#new-lead').click();
      await page.locator('#lead-name').fill('隔离验收客户');await page.locator('#lead-contact').fill('demo@example.com');await page.locator('#save-lead').click();
      assert.equal(await page.locator('#lead-dialog').isVisible(),false);assert.match(await page.locator('#lead-rows').innerText(),/隔离验收客户/);
      await page.getByRole('button',{name:'♡ 打开页面标注',exact:true}).click();assert.equal((await state(page)).ui.visible,true);
      await page.locator('#nav-projects').click();await settle(page);await page.locator('#view-project').click();assert.equal(await page.locator('#project-detail').isVisible(),true);await page.locator('#view-project').click();assert.equal(await page.locator('#project-detail').isVisible(),false);
      await page.locator('#nav-settings').click();await settle(page);await page.locator('#notification-email').fill('team@example.com');await page.locator('#save-settings').click();assert.match(await page.locator('#toast').innerText(),/演示设置已确认/);
      return {filter:true,dialogSubmit:true,projectExpandCollapse:true,settingsSubmit:true,overlayReopened:true};
    });
    await run('browser zoom via Chrome page scale repositions target bubbles',async()=>{
      await openScene(page,origin,scenes[0]);
      const session=await context.newCDPSession(page);
      await session.send('Emulation.setPageScaleFactor',{pageScaleFactor:1.25});await page.waitForTimeout(200);
      const a=(await state(page)).annotations.find(a=>a.anchor.kind==='id'&&a.anchor.key==='search-name');
      await page.locator('#search-name').scrollIntoViewIfNeeded();await page.waitForTimeout(100);await bubble(page,a).click({timeout:1800});
      assert.equal(await card(page,a).count(),1);
      const shot=await screenshot(page,'zoom-125');
      await session.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await session.detach();
      return {scale:1.25,bubbleClickable:true,screenshot:shot,method:'CDP page scale; desktop UI browser zoom is a separate mechanism'};
    });
  } finally {await context.close();}
}

test('full original demo acceptance with per-control evidence and retained failures', {timeout:240000}, async()=>{
  let server,browser;
  fs.mkdirSync(output,{recursive:true});report.sourceFiles=sourceHashes();saveReport();
  try {
    server=http.createServer((req,res)=>{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(assets,'.'+pathname);
      if(!file.startsWith(assets+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
      res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(file));
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const origin=`http://127.0.0.1:${server.address().port}`;
    const launch={headless:true};
    if(process.env.SHH_BROWSER_CHANNEL)launch.channel=process.env.SHH_BROWSER_CHANNEL;
    if(process.env.SHH_BROWSER_EXECUTABLE)launch.executablePath=process.env.SHH_BROWSER_EXECUTABLE;
    browser=await chromium.launch(launch);
    report.environment={origin,browserVersion:browser.version(),headless:true,channel:launch.channel,node:process.version,viewport:{width:1512,height:1000},isolatedContext:true};
    for(const scene of scenes) {
      const context=await browser.newContext({viewport:{width:1512,height:1000}}),page=await context.newPage();
      const entry={key:scene.key,route:scene.route,status:'running',errors:[],consoleErrors:[]};report.scenes.push(entry);
      page.on('pageerror',error=>{entry.consoleErrors.push(error.message);errorRecord(scene.key,'pageerror',error);});
      const errorsBefore=report.errors.length;
      try {
        await openScene(page,origin,scene);
        await checkAllControls(page,scene,entry);
        await editAndRefresh(page,origin,scene,entry);
        await layoutChecks(page,scene,entry);
      } catch(error) {errorRecord(scene.key,'scene execution',error);try{entry.failureScreenshot=await screenshot(page,scene.key+'-failure');}catch(_){} }
      finally {entry.errors=report.errors.slice(errorsBefore);entry.status=entry.errors.length?'failed':'passed';await context.close();saveReport();}
    }
    await interactionChecks(browser,origin);
  } catch(error) {errorRecord('run','initialization/execution',error);}
  finally {
    if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
    report.finishedAt=new Date().toISOString();report.sourceFilesAfter=sourceHashes();
    if(JSON.stringify(report.sourceFiles)!==JSON.stringify(report.sourceFilesAfter))errorRecord('run','source stability',new Error('Source files changed during this run.'));
    report.summary={scenarios:report.scenes.length,businessControls:report.scenes.reduce((n,s)=>n+(s.controlCount||0),0),bubbleInstances:report.scenes.reduce((n,s)=>n+(s.bubbleCount||0),0),detailsVerified:report.scenes.reduce((n,s)=>n+(s.detailsCount||0),0),saveRefreshPassed:report.scenes.filter(s=>s.saveAndRefresh?.passed).length,interactionChecksPassed:report.interactionChecks.filter(x=>x.passed).length,interactionChecksTotal:report.interactionChecks.length,errorCount:report.errors.length};
    report.status=report.errors.length?'failed':'passed';saveReport();
    console.log('FULL_RUN_REPORT '+path.join(output,'full-run-report.json'));console.log(JSON.stringify(report.summary));
  }
  assert.equal(report.errors.length,0,`Acceptance recorded ${report.errors.length} failures; see full-run-report.json`);
});
