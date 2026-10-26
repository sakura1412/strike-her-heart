/* Real local DOM regression for unobstructed controls and responsive drawers.
 * Uses a new unauthenticated Playwright context for each test. No user profile.
 * node --test tests/strike-her-heart-drawer.test.cjs
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'skills/strike-her-heart/assets');
const output = path.join(root, 'test-results/strike-her-heart-drawer');
const report = { startedAt: new Date().toISOString(), sourceHash: '', checks: [], screenshots: [], limitations: ['Local fictitious demo and synthetic controls only; no installed extension or authenticated business system was used.'] };
let browser, server, origin;
const tinyFixture = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Small control hit targets</title>
<style>body{margin:0;padding:32px;font:14px/1.6 sans-serif;background:#f6f8fa}main{max-width:840px}h1{font-size:24px;margin:0 0 50px}section{background:white;border:1px solid #dce2e8;padding:24px;margin-bottom:40px}.choices{display:flex;gap:62px;align-items:center;margin:20px 0 50px}input[type=checkbox],input[type=radio]{width:13px;height:13px;margin:0 8px 0 0}label{display:inline-flex;align-items:center}input[type=text],select,button{font:inherit;padding:8px 12px;margin-right:30px}input[type=text]{width:210px}</style>
<main><h1>气泡不得占用业务控件点击区域</h1><section><div class="choices"><label><input id="tiny-check" type="checkbox"><span class="fixture-label-text">接收通知</span></label><label><input id="tiny-radio-a" type="radio" name="view" checked><span class="fixture-label-text">列表</span></label><label><input id="tiny-radio-b" type="radio" name="view"><span class="fixture-label-text">看板</span></label></div><label for="tiny-name">名称</label><input id="tiny-name" type="text"><select id="tiny-select" aria-label="负责人"><option>林澈</option><option>周宁</option></select><button id="tiny-action" type="button">执行演示</button><p id="feedback" role="status">尚未执行</p></section></main><script>document.getElementById('tiny-action').onclick=()=>document.getElementById('feedback').textContent='已执行';</script><script src="/overlay.js"></script></html>`;

const state = page => page.evaluate(() => window.StrikeHerHeart.getSnapshot());
const bubble = (page, a) => page.locator(`[data-shh-bubble="${a.id}"]`);
const card = (page, a) => page.locator(`[data-shh-card="${a.id}"]`);
const panel = page => page.locator('aside.panel');
const drawer = (page, action) => page.locator(`[data-shh-drawer="${action}"]`);
async function settle(page) { await page.evaluate(() => window.StrikeHerHeart.scan()); await page.waitForTimeout(180); }
async function load(context, file = '/demo.html#/leads') {
  const page = await context.newPage(); page.setDefaultTimeout(5000);
  await page.goto(origin + file);
  await page.waitForFunction(() => window.StrikeHerHeart?.getSnapshot()?.currentControlIds.length > 3);
  await settle(page); return page;
}
async function annotation(page, id) {
  const snapshot=await state(page), found=snapshot.annotations.find(a=>a.anchor.kind==='id' && a.anchor.key===id && snapshot.currentControlIds.includes(a.id));
  assert.ok(found, `Current annotation for #${id} exists`); return found;
}
async function evidence(page, name) {
  fs.mkdirSync(output, { recursive: true }); const file=path.join(output,name+'.png');
  await page.screenshot({path:file}); report.screenshots.push(file); return file;
}
async function geometry(page) {
  return page.evaluate(() => {
    const host=document.getElementById('strike-her-heart-overlay'), sh=host.shadowRoot;
    const visible=n=>{const r=n.getBoundingClientRect();return !n.hidden && getComputedStyle(n).visibility!=='hidden' && getComputedStyle(n).display!=='none' && r.width>0 && r.height>0 && r.bottom>0 && r.top<innerHeight && r.right>0 && r.left<innerWidth;};
    const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const controls=[...document.querySelectorAll('button,input:not([type=hidden]),textarea,select,a[href]')].filter(n=>!n.closest('#strike-her-heart-overlay') && visible(n));
    const badges=[...sh.querySelectorAll('[data-shh-bubble]')].filter(visible);
    const overlaps=[],centers=[],badgesBlocked=[];
    for(const control of controls){
      const r=rect(control),x=r.left+r.width/2,y=r.top+r.height/2;
      if(x>=0&&x<innerWidth&&y>=0&&y<innerHeight){const hit=document.elementFromPoint(x,y);centers.push({control:control.id||control.getAttribute('aria-label')||control.textContent.trim(),disabled:!!control.disabled,clear:hit===control||control.contains(hit),hit:hit?.id||hit?.tagName});}
      for(const badge of badges){const q=rect(badge),w=Math.min(r.right,q.right)-Math.max(r.left,q.left),h=Math.min(r.bottom,q.bottom)-Math.max(r.top,q.top);if(w>.1&&h>.1)overlaps.push({control:control.id||control.getAttribute('aria-label')||control.textContent.trim(),badge:badge.textContent,area:w*h});}
    }
    for(const badge of badges){const r=rect(badge),x=r.left+r.width/2,y=r.top+r.height/2,outer=document.elementFromPoint(x,y),hit=outer===host?sh.elementFromPoint(x,y):outer;if(hit!==badge&&!badge.contains(hit))badgesBlocked.push({number:badge.textContent,hit:hit?.className});}
    return {viewport:{width:innerWidth,height:innerHeight},visibleBubbleCount:badges.length,controlCount:controls.length,overlaps,centers,badgesBlocked,placementHiddenIds:window.StrikeHerHeart.getSnapshot().ui.placementHiddenIds};
  });
}
async function clickBusinessCenter(page, selector) {
  const target=page.locator(selector); await target.scrollIntoViewIfNeeded(); await settle(page);
  const hit=await target.evaluate(n=>{const r=n.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,top=document.elementFromPoint(x,y);return {x,y,clear:top===n||n.contains(top),hit:top?.id||top?.tagName,checked:n.checked};});
  assert.equal(hit.clear,true,`${selector} center must reach the business control; hit=${hit.hit}`);
  const openedBefore=(await state(page)).ui.openedIds;
  await page.mouse.click(hit.x,hit.y); await settle(page);
  assert.deepEqual((await state(page)).ui.openedIds,openedBefore,`${selector} center click must not open annotation details`);
  return {selector,before:hit.checked,after:await target.isChecked(),hit};
}

before(async () => {
  report.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(assets,'overlay.js'))).digest('hex');
  server=http.createServer((req,res)=>{
    const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(requested==='/tiny-controls.html'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(tinyFixture);return;}
    const file=path.resolve(assets,'.'+requested);
    if(!file.startsWith(assets+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  const options={headless:true};if(process.env.SHH_BROWSER_CHANNEL)options.channel=process.env.SHH_BROWSER_CHANNEL;if(process.env.SHH_BROWSER_EXECUTABLE)options.executablePath=process.env.SHH_BROWSER_EXECUTABLE;
  browser=await chromium.launch(options);
});
after(async () => {
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
  report.finishedAt=new Date().toISOString();report.sourceHashAfter=crypto.createHash('sha256').update(fs.readFileSync(path.join(assets,'overlay.js'))).digest('hex');
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'drawer-report.json'),JSON.stringify(report,null,2));
});

test('desktop checkbox and radio centers reach original controls, with no badge/control rectangle overlap', async () => {
  const context=await browser.newContext({viewport:{width:1512,height:1000}});
  try{
    const page=await load(context),clicks=[],scenes=[];
    let snapshot=await state(page);assert.equal(snapshot.ui.drawerOpen,true);assert.equal(snapshot.ui.narrow,false);
    for(const selector of ['#select-all','[data-row-key="NS-1028"] input','[data-row-key="NS-1027"] input','[data-row-key="NS-1026"] input']){
      const result=await clickBusinessCenter(page,selector);assert.notEqual(result.after,result.before);clicks.push(result);
    }
    scenes.push({route:'leads',geometry:await geometry(page)});
    await page.locator('#nav-settings').click();await settle(page);
    for(const selector of ['#enable-digest','#view-board','#view-list']){
      const result=await clickBusinessCenter(page,selector);assert.notEqual(result.after,result.before);clicks.push(result);
    }
    scenes.push({route:'settings',geometry:await geometry(page)});
    for(const scene of scenes){assert.deepEqual(scene.geometry.overlaps,[],`${scene.route}: badges must not overlap any visible business control`);assert.deepEqual(scene.geometry.centers.filter(x=>!x.disabled&&!x.clear),[],`${scene.route}: enabled control centers stay clear`);}
    await evidence(page,'desktop-original-control-centers');report.checks.push({name:'desktop original centers',passed:true,clicks,scenes});
  }finally{await context.close();}
});

test('small-control fixture reserves all control rectangles and keeps numbered bubbles clickable', async () => {
  const context=await browser.newContext({viewport:{width:1512,height:1000}});
  try{
    const page=await load(context,'/tiny-controls.html'),before=await geometry(page);
    assert.equal(before.visibleBubbleCount,7,'One page bubble and six business-control bubbles remain visible');
    assert.deepEqual(before.overlaps,[]);assert.deepEqual(before.badgesBlocked,[]);
    const coveredLabelText = await page.evaluate(() => {
      const badges = [...document.getElementById('strike-her-heart-overlay').shadowRoot.querySelectorAll('[data-shh-bubble]')].filter(n => !n.hidden);
      return [...document.querySelectorAll('.fixture-label-text')].flatMap(label => {
        const r = label.getBoundingClientRect();
        return badges.filter(b => { const q=b.getBoundingClientRect(); return Math.min(r.right,q.right)>Math.max(r.left,q.left) && Math.min(r.bottom,q.bottom)>Math.max(r.top,q.top); }).map(b => ({text:label.textContent,number:b.textContent}));
      });
    });
    assert.deepEqual(coveredLabelText,[], 'Checkbox and radio label text must remain readable beside the bubbles');
    for(const selector of ['#tiny-check','#tiny-radio-b','#tiny-radio-a']){const result=await clickBusinessCenter(page,selector);assert.notEqual(result.after,result.before);}
    await page.locator('#tiny-name').fill('原页面仍可输入');await page.locator('#tiny-select').selectOption({label:'周宁'});await page.locator('#tiny-action').click();
    assert.equal(await page.locator('#feedback').innerText(),'已执行');
    for(const id of ['tiny-check','tiny-radio-a','tiny-radio-b']){const a=await annotation(page,id);await bubble(page,a).click();assert.equal(await card(page,a).count(),1);await page.locator(`[data-shh-close="${a.id}"]`).click();}
    await evidence(page,'desktop-small-control-fixture');report.checks.push({name:'small control rectangle clearance',passed:true,geometry:before});
  }finally{await context.close();}
});

for(const width of [390,1000])test(`${width}px drawer starts collapsed; bubbles open details; collapse retains controls and saved edits through reload`, async () => {
  const context=await browser.newContext({viewport:{width,height:900}});
  try{
    const page=await load(context),initial=await state(page);
    assert.equal(initial.ui.narrow,true);assert.equal(initial.ui.drawerOpen,false);assert.equal(initial.ui.visible,true);
    assert.equal(await panel(page).isVisible(),false);assert.equal(await drawer(page,'open').isVisible(),true);
    const initialGeometry=await geometry(page);assert.ok(initialGeometry.visibleBubbleCount>0);assert.deepEqual(initialGeometry.badgesBlocked,[]);
    const a=await annotation(page,'search-name');await page.locator('#search-name').scrollIntoViewIfNeeded();await settle(page);await bubble(page,a).click();
    assert.equal((await state(page)).ui.drawerOpen,true);assert.equal(await panel(page).isVisible(),true);assert.equal(await card(page,a).count(),1);
    assert.equal(await card(page,a).locator('.cardtitle strong').innerText(),a.currentLabel||a.label);
    const marker=`${width}px 抽屉保存后回显的人工说明`;
    await card(page,a).locator('[data-shh-field="function"]').fill(marker);await page.locator(`[data-shh-save="${a.id}"]`).click();
    await evidence(page,`drawer-${width}-opened`);await drawer(page,'close').click();await settle(page);
    let collapsed=await state(page);assert.equal(collapsed.ui.drawerOpen,false);assert.equal(collapsed.ui.visible,true);assert.equal(await panel(page).isVisible(),false);
    const closedGeometry=await geometry(page);assert.ok(closedGeometry.visibleBubbleCount>0);assert.deepEqual(closedGeometry.overlaps,[]);assert.deepEqual(closedGeometry.badgesBlocked,[]);
    await page.locator('#search-name').fill('青岚');await page.locator('#query-leads').click();assert.equal(await page.locator('#lead-rows tr').count(),1);assert.match(await page.locator('#lead-rows').innerText(),/青岚设计工作室/);
    await page.locator('#search-name').scrollIntoViewIfNeeded();await settle(page);await bubble(page,a).click();
    assert.equal(await card(page,a).locator('[data-shh-field="function"]').inputValue(),marker);
    await drawer(page,'close').click();await page.reload();await page.waitForFunction(()=>window.StrikeHerHeart?.getSnapshot()?.currentControlIds.length>5);await settle(page);
    assert.equal((await state(page)).ui.drawerOpen,false,'Narrow refresh defaults to collapsed drawer');
    const restored=await annotation(page,'search-name');assert.equal(restored.id,a.id);assert.equal(restored.number,a.number);assert.equal(restored.fields.function,marker);
    await page.locator('#search-name').scrollIntoViewIfNeeded();await settle(page);await bubble(page,restored).click();
    assert.equal(await card(page,restored).locator('[data-shh-field="function"]').inputValue(),marker);
    await drawer(page,'close').click();await evidence(page,`drawer-${width}-collapsed`);
    report.checks.push({name:`${width}px drawer lifecycle`,passed:true,initialGeometry,closedGeometry,savedText:marker,stableId:a.id});
  }finally{await context.close();}
});

test('1512px uses a right aside; crossing to 1000px collapses only the drawer', async () => {
  const context=await browser.newContext({viewport:{width:1512,height:1000}});
  try{
    const page=await load(context),initial=await state(page);assert.equal(initial.ui.drawerOpen,true);assert.equal(initial.ui.narrow,false);
    const box=await panel(page).boundingBox();assert.ok(box.x>1000);assert.ok(box.x+box.width<=1512);assert.ok(box.width>=350&&box.width<=420);
    await page.setViewportSize({width:1000,height:900});await page.waitForFunction(()=>window.StrikeHerHeart.getSnapshot().ui.narrow===true);await settle(page);
    const resized=await state(page);assert.equal(resized.ui.drawerOpen,false);assert.equal(resized.ui.visible,true);assert.ok((await geometry(page)).visibleBubbleCount>0);
    await drawer(page,'open').click();assert.equal((await state(page)).ui.drawerOpen,true);await drawer(page,'close').click();assert.equal((await state(page)).ui.drawerOpen,false);
    report.checks.push({name:'desktop aside and responsive transition',passed:true,aside:box,resizedUi:resized.ui});
  }finally{await context.close();}
});

test('drawer collapse and whole-annotation hiding remain independent', async () => {
  const context=await browser.newContext({viewport:{width:1000,height:900}});
  try{
    const page=await load(context);await page.evaluate(()=>window.StrikeHerHeart.toggleDrawer(true));assert.equal((await state(page)).ui.drawerOpen,true);
    await drawer(page,'close').click();assert.equal((await state(page)).ui.visible,true);assert.ok((await geometry(page)).visibleBubbleCount>0);
    await page.evaluate(()=>window.StrikeHerHeart.toggle(false));assert.equal((await state(page)).ui.visible,false);assert.equal((await geometry(page)).visibleBubbleCount,0);
    await page.locator('#search-name').fill('远山');await page.locator('#query-leads').click();assert.match(await page.locator('#lead-rows').innerText(),/远山文化/);
    await page.evaluate(()=>window.StrikeHerHeart.toggle(true));await settle(page);assert.equal((await state(page)).ui.visible,true);assert.ok((await geometry(page)).visibleBubbleCount>0);
    report.checks.push({name:'collapse independent from full hide',passed:true});
  }finally{await context.close();}
});
