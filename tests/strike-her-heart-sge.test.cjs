/* SGE adapter regression on SIMULATED HTML, never the user's original page.
 * All browser requests are fulfilled/aborted by Playwright. No live-site access,
 * extension installation, user profile, or real quote data is involved.
 * Fixture labels and hrefs reflect a public-page observation on 2026-10-26.
 * No private observation export is required or included.
 * node --test tests/strike-her-heart-sge.test.cjs
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'skills/strike-her-heart/assets');
const output = path.join(root, 'test-results/strike-her-heart-sge');
const targetUrl = 'https://quote.fx678.com/exchange/SGE';
const mainHeaders = ['名称','最新价','涨跌','涨跌幅','最高','最低','昨收','更新时间'];
const heatHeaders = ['品种/周期','现价','1分钟','5分钟','15分钟','30分钟','1小时','4小时','天','周','月'];
const instruments = [
  ['黄金9999','AU9999'],['黄金延期','AUT%2BD'],['白银延期','AGT%2BD'],['铂金9995','PT9995'],
  ['100克金条','AU100G'],['黄金9995','AU9995'],['白银9999','AG9999'],['I黄金100G','IAU3'],
  ['I黄金9999','IAU2'],['I黄金995','IAU1'],['黄金双月延期','AUT%2BN2'],['黄金单月延期','AUT%2BN1'],['50克金条','AU50G'],['M黄金延期','MAUT%2BD']
];
const observedLinks = [
  ['首 页','https://fx678.com/'],['7x24快讯','https://fx678.com/kx'],['行情','https://quote.fx678.com/'],
  ['要闻','https://news.fx678.com/'],['日历','https://rl.fx678.com/'],['黄金','https://gold.fx678.com/'],
  ['登录','https://member.fx678.com/'],['注册','https://member.fx678.com/Login/login?login_type=register'],
  ['直盘','https://quote.fx678.com/exchange/WH'],['国际黄金','https://quote.fx678.com/exchange/WGJS'],
  ['上海黄金交易所',targetUrl],['基本面分析>','https://1qh.cn/markets/foreign/code/QGC.html'],
  ['栏目推荐','https://news.fx678.com/allColumn'],['数据接口','https://open.fx678.com/'],['意见反馈','https://fx678.com/feedBack']
];
const priceSentinels = ['908172.314159','765432.182736','654321.918273','543210.273819','432109.192837'];
const maliciousText = '<img src="bad" onerror="window.__fixtureXss=41"><script>window.__fixtureXss=42</script>';
const report = { fixtureOnly:true, targetUrlContext:targetUrl, startedAt:new Date().toISOString(), sourceHashes:{}, checks:[], screenshots:[], limitations:['Only simulated HTML using observed labels and hrefs, with artificial quote sentinels. The actual target page was not injected or annotated by this test.','No browser extension was installed. No user browser profile or authenticated session was accessed.','The fixture initially hides six artificial rows to exercise expansion; this does not assert that the original website initially hides exactly six rows.'] };
let browser;
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fixture({includeTargets=true, wrongHeaders=false, duplicateHeaders=false, dualTitles=false, plainBreadcrumb=false, ambiguousMainTitles=false, marketRegion=true, linkCount=0}={}) {
  const links=observedLinks.map(([label,href],i)=>`<a id="observed-link-${i}" href="${esc(href)}">${esc(label)}</a>`).join(' ');
  const extraLinks=Array.from({length:Math.max(0,linkCount-(observedLinks.length+1+8))},(_,i)=>`<a id="fixture-scale-link-${i}" href="https://quote.fx678.com/symbol/FIXTURE${String(i).padStart(3,'0')}">模拟扩展${String(i).padStart(2,'0')}</a>`).join(' ');
  const breadcrumb=`<div${plainBreadcrumb?'':' class="breadcrumb"'} id="fixture-breadcrumb"><a href="https://quote.fx678.com/">行情中心</a> / <span id="breadcrumb-title">${dualTitles?'上海金':'上海黄金交易所'}</span></div>`;
  const mainTitle=`<div id="fixture-quote-heading"><b id="sge-title">上海金</b>${ambiguousMainTitles?'<b id="ambiguous-main-title">上海金</b>':''}</div>`;
  const main=wrongHeaders?mainHeaders.map((x,i)=>i===1?'无关字段':x):mainHeaders;
  const heat=wrongHeaders?heatHeaders.map((x,i)=>i===1?'其他数值':x):heatHeaders;
  const headerRows=items=>`<tr>${items.map(x=>`<th>${esc(x)}</th>`).join('')}</tr>`.repeat(duplicateHeaders?2:1);
  const rows=instruments.map(([name,symbol],index)=>`<tr data-row-key="${symbol}" ${index>=8?'class="extra-quote-row" hidden':''}><td><a id="symbol-${index}" href="https://quote.fx678.com/symbol/${symbol}">${esc(name)}</a></td>${mainHeaders.slice(1).map((_,i)=>`<td>${priceSentinels[(index+i)%priceSentinels.length]}</td>`).join('')}</tr>`).join('');
  const heatRows=instruments.slice(0,10).map(([name],index)=>`<tr><th scope="row">${esc(name)}</th>${heatHeaders.slice(1).map((_,i)=>`<td>${priceSentinels[(index+i)%priceSentinels.length]}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>SGE 适配回归 · 模拟页面</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f6f8fb;color:#243548;font:13px/1.6 sans-serif;padding:20px 435px 60px 25px}a{color:#315c8d}nav{display:flex;gap:18px;flex-wrap:wrap;padding:16px 0}h1{font-size:24px}h2{font-size:18px;margin-top:30px}table{border-collapse:collapse;background:#fff;width:100%;font-size:12px;margin:14px 0}th,td{border:1px solid #dce2eb;padding:10px 7px;text-align:left}th{background:#edf2f8;font-weight:600}#fixture-controls{margin:24px 0;padding:18px;background:#fff;display:flex;gap:18px;align-items:end}label{display:block}input,select,button{font:inherit;padding:8px}#expand-toggle{cursor:pointer;display:block;width:120px;text-align:center;color:#315c8d;margin:22px 0;padding:8px;border:1px solid #dce2eb;background:white}footer{margin-top:30px}#fixture-notice{background:#fff0d5;padding:12px;font-weight:600}[hidden]{display:none!important}
  </style></head><body><p id="fixture-notice">模拟验收页面：复用已观察标签与链接，报价为人工哨兵值，未连接真实站点。</p>
  ${includeTargets?`<nav aria-label="已观察导航">${links}</nav>${extraLinks?`<nav id="fixture-scale-links" aria-label="模拟规模扩展链接">${extraLinks}</nav>`:''}${breadcrumb}${marketRegion?'<main id="fixture-market-main">':''}<section id="quote-area">${mainTitle}<table id="fixture-main-table"><thead>${headerRows(main)}</thead><tbody>${rows}</tbody></table><span id="expand-toggle" tabindex="0">展开全部</span></section><section id="heat-area"><h2>品种热力图 <small>(数据时间:2026-10-26 15:03:04)</small></h2><table id="fixture-heat-table"><thead>${headerRows(heat)}</thead><tbody>${heatRows}</tbody></table></section>${marketRegion?'</main>':''}`:'<h1>无 SGE 目标的模拟页面</h1><table id="unrelated"><tr><th>名称</th><th>其他数值</th></tr><tr><td>无关示例</td><td>普通文本</td></tr></table>'}
  <form id="fixture-controls"><div><label for="fixture-input">模拟搜索</label><input id="fixture-input" maxlength="30"></div><div><label for="fixture-select">模拟分类</label><select id="fixture-select"><option value="all">全部</option><option value="gold">黄金</option></select></div><button id="fixture-button" type="submit">模拟查询</button></form><p id="fixture-feedback" role="status">尚未查询</p><p id="untrusted-text">${esc(maliciousText)}</p>
  <script>window.__fixtureBusinessClicks=0;document.getElementById('fixture-controls').onsubmit=e=>{e.preventDefault();window.__fixtureBusinessClicks++;document.getElementById('fixture-feedback').textContent='模拟查询已执行'};const expand=document.getElementById('expand-toggle');if(expand)expand.onclick=()=>{const show=expand.textContent==='展开全部';document.querySelectorAll('.extra-quote-row').forEach(row=>row.hidden=!show);expand.textContent=show?'收起':'展开全部'};</script><script src="/__shh_fixture__/sge.js"></script><script src="/__shh_fixture__/overlay.js"></script></body></html>`;
}
async function isolated({url=targetUrl,viewport={width:1700,height:1150},...options}={}) {
  const context=await browser.newContext({viewport}),requests=[];
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());requests.push({url:url.origin+url.pathname,resourceType:route.request().resourceType(),fulfilledLocally:true});
    if(url.pathname==='/__shh_fixture__/sge.js'){await route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:fs.readFileSync(path.join(assets,'site-adapters/sge.js'),'utf8')});return;}
    if(url.pathname==='/__shh_fixture__/overlay.js'){await route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:fs.readFileSync(path.join(assets,'overlay.js'),'utf8')});return;}
    if(route.request().isNavigationRequest()){await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:fixture(options)});return;}
    await route.abort('blockedbyclient');
  });
  const page=await context.newPage();page.setDefaultTimeout(5000);await page.goto(url);await page.waitForFunction(()=>window.StrikeHerHeart?.getSnapshot()?.currentControlIds.length>=3);await settle(page);return {context,page,requests};
}
const state=page=>page.evaluate(()=>window.StrikeHerHeart.getSnapshot());
const current=s=>s.annotations.filter(a=>s.currentControlIds.includes(a.id));
const adapterTargets=s=>current(s).filter(a=>a.anchor.kind==='adapter');
const bubble=(page,a)=>page.locator(`[data-shh-bubble="${a.id}"]`);
const card=(page,a)=>page.locator(`[data-shh-card="${a.id}"]`);
async function settle(page){await page.evaluate(()=>window.StrikeHerHeart.scan());await page.waitForTimeout(180);}
async function assertPaintedColumnTextClear(page,phase){
  const result=await page.evaluate(phase=>{
    const host=document.getElementById('strike-her-heart-overlay'),sh=host.shadowRoot,s=window.StrikeHerHeart.getSnapshot();
    const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const onScreen=r=>r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight;
    const visible=n=>{const style=getComputedStyle(n);return !n.hidden&&style.display!=='none'&&style.visibility!=='hidden'&&onScreen(rect(n));};
    const badges=[...sh.querySelectorAll('[data-shh-bubble]')].filter(visible);
    const textTargets=[...document.querySelectorAll('#fixture-main-table thead th,#fixture-heat-table thead th,#sge-title,#heat-area h2')];
    const textRects=[];
    for(const element of textTargets){
      if(!visible(element))continue;
      const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
      let textNode;
      while((textNode=walker.nextNode())){
        if(!textNode.nodeValue.trim()||getComputedStyle(textNode.parentElement).visibility==='hidden')continue;
        const range=document.createRange();range.selectNodeContents(textNode);
        for(const r of range.getClientRects())if(onScreen(r))textRects.push({label:element.textContent.trim(),text:textNode.nodeValue.trim(),left:r.left,top:r.top,right:r.right,bottom:r.bottom});
      }
    }
    const overlaps=[];
    for(const text of textRects)for(const badge of badges){const q=rect(badge),w=Math.min(text.right,q.right)-Math.max(text.left,q.left),h=Math.min(text.bottom,q.bottom)-Math.max(text.top,q.top);if(w>.1&&h>.1)overlaps.push({text:text.text,target:text.label,bubble:badge.textContent,id:badge.getAttribute('data-shh-bubble'),area:w*h});}
    const columns=[];
    for(const [selector,prefix]of [['#fixture-main-table thead th','main-column-'],['#fixture-heat-table thead th','heat-column-']]){
      [...document.querySelectorAll(selector)].forEach((element,index)=>{
        if(!visible(element))return;
        const key='fx678-sge-v1:'+prefix+index,a=s.annotations.find(a=>a.anchor.kind==='adapter'&&a.anchor.key===key&&s.currentControlIds.includes(a.id));
        const badge=a?sh.querySelector(`[data-shh-bubble="${a.id}"]`):null;
        columns.push({label:element.textContent.trim(),key,annotationId:a?.id,bubbleVisible:!!badge&&visible(badge)});
      });
    }
    return {phase,drawerOpen:s.ui.drawerOpen,viewport:{width:innerWidth,height:innerHeight},visibleBubbleCount:badges.length,paintedTextRangeCount:textRects.length,visibleColumns:columns,overlaps,placementHiddenIds:s.ui.placementHiddenIds};
  },phase);
  assert.equal(result.visibleColumns.length,19,`${phase}: all 19 fixture column headers are in this viewport`);
  assert.deepEqual(result.visibleColumns.filter(x=>!x.bubbleVisible),[],`${phase}: each in-viewport header must keep its numbered bubble; hiding targets cannot satisfy text clearance`);
  assert.ok(result.paintedTextRangeCount>=21,`${phase}: checks real painted text for 19 headers and both page/heat titles`);
  assert.deepEqual(result.overlaps,[],`${phase}: no visible bubble may cover header/title painted text`);
  return result;
}
async function screenshot(page,name){fs.mkdirSync(output,{recursive:true});const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);return file;}
function hashes(){return Object.fromEntries(['overlay.js','site-adapters/sge.js'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(assets,name))).digest('hex')]));}
before(async()=>{report.sourceHashes=hashes();const options={headless:true};if(process.env.SHH_BROWSER_CHANNEL)options.channel=process.env.SHH_BROWSER_CHANNEL;if(process.env.SHH_BROWSER_EXECUTABLE)options.executablePath=process.env.SHH_BROWSER_EXECUTABLE;browser=await chromium.launch(options);});
after(async()=>{if(browser)await browser.close();report.finishedAt=new Date().toISOString();report.sourceHashesAfter=hashes();fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'sge-fixture-report.json'),JSON.stringify(report,null,2));});

test('observed SGE labels, links, 8 main columns, 11 heat columns and content regions get distinct detailed targets',async()=>{
  const {context,page,requests}=await isolated();try{
    const s=await state(page),targets=adapterTargets(s);assert.ok(targets.length>=22,'Content targets include 19 columns and two regions plus an expand target');
    for(const name of [...mainHeaders,...heatHeaders])assert.ok(targets.some(a=>a.label.includes(name)),`Adapter has a target for column ${name}`);
    const mainColumnTargets=targets.filter(a=>/主表|行情表|行情.*列/.test(a.label)&&mainHeaders.some(h=>a.label.includes(h)));
    const heatColumnTargets=targets.filter(a=>/热力/.test(a.label)&&heatHeaders.some(h=>a.label.includes(h)));
    assert.equal(mainColumnTargets.length,8,'Exactly eight main-table column annotations');assert.equal(heatColumnTargets.length,11,'Exactly eleven heat-table column annotations');
    for(const a of targets){assert.ok(a.anchor.key.startsWith('fx678-sge-v1:'));for(const field of ['content','function','limits','navigation']){assert.ok(a.fields[field]?.trim(),`${a.label}: ${field}`);assert.ok(a.evidence[field]?.trim(),`${a.label}: evidence ${field}`);}}
    for(const [name,symbol]of instruments.slice(0,8)){
      const matches=current(s).filter(a=>a.label===name);assert.equal(matches.length,1,`${name} matches the visible observed symbol link once`);
      assert.ok(matches[0].fields.navigation.includes('/symbol/'+symbol),`${name} maps its actual href, not a guessed destination`);
    }
    const login=current(s).find(a=>a.label==='登录');assert.ok(login?.fields.navigation.includes('member.fx678.com'));
    const registered=current(s).find(a=>a.label==='注册');assert.ok(registered?.fields.navigation.includes('member.fx678.com/Login/login'));
    for(const [label,href]of observedLinks){const expected=new URL(href),a=current(s).find(a=>a.label===label);assert.ok(a,`Observed navigation label ${label} is covered`);assert.ok(a.fields.navigation.includes(expected.origin+expected.pathname),`${label} retains its declared destination`);}
    assert.equal(new Set(current(s).map(a=>a.id)).size,current(s).length,'No duplicate content/control IDs');
    const inventory=await page.evaluate(()=>({mainColumns:document.querySelectorAll('#fixture-main-table thead th').length,heatColumns:document.querySelectorAll('#fixture-heat-table thead th').length,heatRows:document.querySelectorAll('#fixture-heat-table tbody tr').length}));
    assert.deepEqual(inventory,{mainColumns:8,heatColumns:11,heatRows:10});
    report.checks.push({name:'semantically matched content and observed hrefs',passed:true,inventory,adapterTargets:targets.map(a=>({label:a.label,key:a.anchor.key,id:a.id})),requestCount:requests.length});await screenshot(page,'sge-simulated-page-inventory');
  }finally{await context.close();}
});

test('expand/collapse adds the six originally hidden symbols without changing the expand target identity',async()=>{
  const {context,page}=await isolated();try{
    const before=await state(page),expand=adapterTargets(before).find(a=>/展开|收起/.test(a.label));assert.ok(expand,'Plain span expansion target is recognized');
    const paintedTextChecks=[await assertPaintedColumnTextClear(page,'collapsed rows / drawer open')];
    await page.evaluate(()=>window.StrikeHerHeart.toggleDrawer(false));await settle(page);paintedTextChecks.push(await assertPaintedColumnTextClear(page,'collapsed rows / drawer closed'));
    await page.locator('#expand-toggle').scrollIntoViewIfNeeded();await settle(page);await page.locator('#expand-toggle').click();await settle(page);
    const expanded=await state(page),after=expanded.annotations.find(a=>a.id===expand.id);assert.ok(expanded.currentControlIds.includes(expand.id));assert.equal(after.number,expand.number);assert.equal(after.label,expand.label);
    for(const [name,symbol]of instruments){const a=current(expanded).find(a=>a.label===name);assert.ok(a,`${name} is annotated after expansion`);assert.ok(a.fields.navigation.includes('/symbol/'+symbol));}
    await page.evaluate(()=>scrollTo(0,0));await settle(page);paintedTextChecks.push(await assertPaintedColumnTextClear(page,'expanded rows / drawer closed'));
    await page.evaluate(()=>window.StrikeHerHeart.toggleDrawer(true));await settle(page);paintedTextChecks.push(await assertPaintedColumnTextClear(page,'expanded rows / drawer open'));
    await page.evaluate(()=>window.StrikeHerHeart.toggleDrawer(false));await settle(page);await page.locator('#expand-toggle').click();await settle(page);const collapsed=await state(page);
    for(const [name]of instruments.slice(8))assert.equal(current(collapsed).some(a=>a.label===name),false,`${name} has no ghost bubble when row is hidden`);
    await page.evaluate(()=>scrollTo(0,0));await settle(page);paintedTextChecks.push(await assertPaintedColumnTextClear(page,'recollapsed rows / drawer closed'));
    await page.evaluate(()=>window.StrikeHerHeart.toggleDrawer(true));await settle(page);paintedTextChecks.push(await assertPaintedColumnTextClear(page,'recollapsed rows / drawer open'));
    assert.equal(collapsed.annotations.find(a=>a.id===expand.id).number,expand.number);report.checks.push({name:'expand collapse stable target',passed:true,expand:{id:expand.id,number:expand.number,label:expand.label},visibleSymbolsAfterExpand:14,paintedTextChecks});await screenshot(page,'sge-simulated-unobscured-column-text');
  }finally{await context.close();}
});

test('ordinary controls remain covered and human edits survive rescans, quote changes, hide/show and refresh',async()=>{
  const {context,page}=await isolated();try{
    const s=await state(page);for(const id of ['fixture-button','fixture-input','fixture-select'])assert.ok(current(s).some(a=>a.anchor.kind==='id'&&a.anchor.key===id),`Standard #${id} scanner target remains`);
    const a=adapterTargets(s).find(a=>/最新价/.test(a.label));assert.ok(a);await page.evaluate(()=>window.StrikeHerHeart.toggleDrawer(false));
    const targetSelector=await page.evaluate(id=>{const s=window.StrikeHerHeart.getSnapshot();return s.annotations.find(a=>a.id===id).anchor.key;},a.id);assert.ok(targetSelector);
    await page.locator('#fixture-main-table thead').scrollIntoViewIfNeeded();await settle(page);await bubble(page,a).click();assert.equal(await card(page,a).count(),1);
    const marker='人工确认：报价字段说明由用户维护，重扫保留。';await card(page,a).locator('[data-shh-field="function"]').fill(marker);await page.locator(`[data-shh-save="${a.id}"]`).click();
    await page.evaluate(()=>{document.querySelectorAll('#fixture-main-table tbody td:not(:first-child),#fixture-heat-table tbody td').forEach(n=>n.textContent='321098.765432');window.StrikeHerHeart.scan();});
    const rescanned=(await state(page)).annotations.find(x=>x.id===a.id);assert.equal(rescanned.fields.function,marker);assert.notEqual(rescanned.status,'needs-review','Changing quote cell readouts does not change the header target or its verified description');
    await page.evaluate(()=>window.StrikeHerHeart.toggle(false));assert.equal((await state(page)).ui.visible,false);
    await page.locator('#fixture-input').fill('测试输入值不会存入标注');await page.locator('#fixture-select').selectOption('gold');await page.locator('#fixture-button').click();assert.equal(await page.locator('#fixture-feedback').innerText(),'模拟查询已执行');
    await page.evaluate(()=>window.StrikeHerHeart.toggle(true));await settle(page);assert.equal((await state(page)).annotations.find(x=>x.id===a.id).fields.function,marker);
    await page.reload();await page.waitForFunction(()=>window.StrikeHerHeart?.getSnapshot()?.currentControlIds.length>3);await settle(page);const restored=(await state(page)).annotations.find(x=>x.id===a.id);assert.equal(restored.number,a.number);assert.equal(restored.fields.function,marker);
    report.checks.push({name:'standard controls and human edits preserved',passed:true,annotation:{id:a.id,number:a.number},marker});
  }finally{await context.close();}
});

test('adapter is restricted to exact host/path and ignores similar-looking pages with no matching targets',async()=>{
  const mismatches=['https://quote.fx678.com.evil.test/exchange/SGE','https://evilquote.fx678.com/exchange/SGE','https://quote.fx678.com/exchange/SGEX','https://quote.fx678.com/exchange/sge','https://quote.fx678.com/exchange/SGE/child'];
  const results=[];
  for(const url of mismatches){const {context,page}=await isolated({url});try{const s=await state(page);assert.deepEqual(adapterTargets(s),[],url);assert.ok(current(s).some(a=>a.anchor.kind==='id'&&a.anchor.key==='fixture-button'));results.push({url,adapterTargets:0});}finally{await context.close();}}
  for(const options of [{includeTargets:false},{wrongHeaders:true},{duplicateHeaders:true}]){const {context,page}=await isolated(options);try{const s=await state(page),targets=adapterTargets(s);const structuralTargets=targets.filter(a=>/^fx678-sge-v1:(main-table|heat-table|main-column-\d+|heat-column-\d+)$/.test(a.anchor.key));assert.equal(structuralTargets.length,0,JSON.stringify(options));if(options.includeTargets===false)assert.equal(targets.length,0,'No matching title/table/expansion target means no adapter content annotations');results.push({options,contentRegionOrColumnTargets:0,otherAdapterTargets:targets.map(a=>a.label)});}finally{await context.close();}}
  report.checks.push({name:'scope and no-target guards',passed:true,results});
});

test('untrusted HTML-shaped text stays inert and quote values are absent from exported annotations/history',async()=>{
  const {context,page}=await isolated();try{
    assert.equal(await page.evaluate(()=>window.__fixtureXss),undefined);assert.equal(await page.locator('#untrusted-text').innerText(),maliciousText);
    await page.evaluate(()=>{const link=document.createElement('a');link.id='fixture-private-link';link.href='https://example.invalid/fixture';link.textContent='模拟普通外链';const note=document.createElement('textarea');note.id='fixture-private-default';note.textContent='SGE-PRIVATE-TEXTAREA-DEFAULT-8261';link.appendChild(note);document.querySelector('nav').appendChild(link);window.StrikeHerHeart.scan();});
    const s=await state(page),a=adapterTargets(s).find(x=>/最新价/.test(x.label));assert.ok(a);const incoming={schemaVersion:1,pages:[{scope:s.scope,annotations:[{id:a.id,anchor:a.anchor,identity:a.identity,fields:{content:maliciousText},evidence:{content:'模拟不可信文本验收'},fieldStates:{content:'review'}}]}]};
    await page.evaluate(data=>window.StrikeHerHeart.importData(data),incoming);await page.evaluate(()=>window.StrikeHerHeart.toggleDrawer(false));await page.locator('#fixture-main-table thead').scrollIntoViewIfNeeded();await settle(page);await bubble(page,a).click();
    assert.equal(await card(page,a).locator('[data-shh-field="content"]').inputValue(),maliciousText);assert.equal(await page.evaluate(()=>window.__fixtureXss),undefined);
    const injectedNodes=await page.evaluate(()=>document.getElementById('strike-her-heart-overlay').shadowRoot.querySelectorAll('img,script,iframe').length);assert.equal(injectedNodes,0);
    let exported=await page.evaluate(()=>JSON.stringify(window.StrikeHerHeart.exportData()));for(const value of priceSentinels)assert.equal(exported.includes(value),false,`Quote sentinel ${value} must not be stored`);assert.equal(exported.includes('SGE-PRIVATE-TEXTAREA-DEFAULT-8261'),false,'Adapter link names must omit nested textarea defaults');
    await page.evaluate(()=>{document.querySelectorAll('#fixture-main-table tbody td:not(:first-child),#fixture-heat-table tbody td').forEach(n=>n.textContent='321098.765432');window.StrikeHerHeart.scan();});
    exported=await page.evaluate(()=>JSON.stringify(window.StrikeHerHeart.exportData()));assert.equal(exported.includes('321098.765432'),false);for(const value of priceSentinels)assert.equal(exported.includes(value),false);
    report.checks.push({name:'HTML inert and no quote persistence',passed:true,quoteSentinelsChecked:priceSentinels.length+1,shadowInjectedExecutableNodes:injectedNodes});await screenshot(page,'sge-simulated-inert-text');
  }finally{await context.close();}
});

async function selectedPageTargetId(page){
  return page.evaluate(()=>{
    const adapter=window.StrikeHerHeartConfig.siteAdapter;
    const isVisible=node=>{if(!node.isConnected||!node.getClientRects().length)return false;for(let n=node;n;n=n.parentElement){const style=getComputedStyle(n);if(n.hidden||style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;}return true;};
    return adapter.getPageTarget({document,isVisible})?.element.id||null;
  });
}
function assertPageHasNoQuoteData(annotation){
  const encoded=JSON.stringify(annotation);
  for(const value of [...priceSentinels,'314159.265358','271828.182845','321098.765432'])assert.equal(encoded.includes(value),false,'A page label, description, evidence, reviews or revision must not contain quote readouts');
}
function assertMainRegionFallback(snapshot,annotation){
  assert.ok(snapshot.currentControlIds.includes(annotation.id));
  const explanation=JSON.stringify({fields:annotation.fields,evidence:annotation.evidence});
  assert.match(explanation,/主内容区|主内容容器|主区/);assert.match(explanation,/未唯一识别|未唯一定位|未能唯一|标题.{0,12}歧义/);
  assert.ok(snapshot.coverage.some(text=>/主内容区|主内容容器|主区/.test(text)&&/未唯一/.test(text)),'Coverage explains a main-region page target while the precise title remains unresolved');
  assertPageHasNoQuoteData(annotation);
}

test('breadcrumb and main-heading names are disambiguated by the main-table context, while genuine ambiguity preserves saved records',async()=>{
  const results=[];
  for(const plainBreadcrumb of [false,true]){
    const {context,page}=await isolated({dualTitles:true,plainBreadcrumb});
    try{
      assert.equal(await page.locator('#breadcrumb-title').innerText(),'上海金');assert.equal(await page.locator('#sge-title').innerText(),'上海金');
      assert.equal(await selectedPageTargetId(page),'sge-title','Select the main-table heading b, not the breadcrumb span');
      const before=await state(page),pageAnnotation=current(before).find(a=>a.anchor.key==='fx678-sge-v1:page');assert.ok(pageAnnotation,'There is one page bubble with duplicate displayed names');assert.equal(pageAnnotation.anchor.tag,'b');
      const numbers=Object.fromEntries(before.annotations.map(a=>[a.id,a.number]));
      await page.evaluate(()=>window.StrikeHerHeart.toggleDrawer(false));await page.locator('#sge-title').scrollIntoViewIfNeeded();await settle(page);await bubble(page,pageAnnotation).click();
      const marker=`保留主标题说明：${plainBreadcrumb?'无类面包屑':'显式面包屑'}`;
      await card(page,pageAnnotation).locator('[data-shh-field="function"]').fill(marker);await page.locator(`[data-shh-save="${pageAnnotation.id}"]`).click();
      await page.evaluate(()=>{const other=document.createElement('b');other.id='ambiguous-main-title';other.textContent='上海金';document.getElementById('fixture-quote-heading').appendChild(other);window.StrikeHerHeart.scan();});
      assert.equal(await selectedPageTargetId(page),'fixture-market-main','An ambiguous precise title must use the verified common main region, never either b');await settle(page);
      const ambiguous=await state(page),regionPage=ambiguous.annotations.find(a=>a.id===pageAnnotation.id);assertMainRegionFallback(ambiguous,regionPage);
      assert.equal(regionPage.fields.function,marker,'A main-region fallback must not replace the saved page record or manual fields');
      assert.ok(ambiguous.coverage.some(text=>/上海金/.test(text)&&/多个|歧义/.test(text)),'Coverage reports the unresolved title ambiguity');
      await page.evaluate(()=>{document.getElementById('ambiguous-main-title').remove();window.StrikeHerHeart.scan();});await settle(page);
      assert.equal(await selectedPageTargetId(page),'sge-title');
      const restored=await state(page),restoredPage=current(restored).find(a=>a.id===pageAnnotation.id);assert.ok(restoredPage);assert.equal(restoredPage.number,pageAnnotation.number);assert.equal(restoredPage.fields.function,marker);
      for(const a of restored.annotations)if(numbers[a.id]!==undefined)assert.equal(a.number,numbers[a.id],`The existing number for ${a.label} is retained`);
      await page.reload();await page.waitForFunction(()=>window.StrikeHerHeart?.getSnapshot()?.currentControlIds.length>3);await settle(page);
      const refreshed=current(await state(page)).find(a=>a.id===pageAnnotation.id);assert.ok(refreshed);assert.equal(refreshed.number,pageAnnotation.number);assert.equal(refreshed.fields.function,marker);assert.equal(await selectedPageTargetId(page),'sge-title');
      results.push({plainBreadcrumb,selectedMainHeading:'sge-title',ambiguousPreciseHeadingsSkipped:true,fallbackTarget:'fixture-market-main',fallbackDoesNotReadQuoteText:true,pageId:pageAnnotation.id,pageNumber:pageAnnotation.number,savedText:marker});
    }finally{await context.close();}
  }
  // Model upgrading an already-annotated page whose old ambiguous title had no
  // page record: adding that missing record must append its number, not renumber.
  const {context,page}=await isolated({dualTitles:true,ambiguousMainTitles:true,marketRegion:false,linkCount:74,viewport:{width:1700,height:1600}});
  try{
    const existing=await state(page);assert.equal(await selectedPageTargetId(page),null,'The body/html common ancestor is never an acceptable page-region fallback');assert.equal(current(existing).some(a=>a.anchor.key==='fx678-sge-v1:page'),false);assert.equal(existing.annotations.length,100,'Migration begins with exactly one hundred existing annotations and no page bubble');
    const existingNumbers=Object.fromEntries(existing.annotations.map(a=>[a.id,a.number])),previousMax=Math.max(...Object.values(existingNumbers));
    const header=current(existing).find(a=>a.anchor.key==='fx678-sge-v1:main-column-1');assert.ok(header);
    await page.evaluate(()=>window.StrikeHerHeart.toggleDrawer(false));await page.locator('#fixture-main-table thead').scrollIntoViewIfNeeded();await settle(page);await bubble(page,header).click();
    const marker='标题补齐前已有的列说明人工修改';await card(page,header).locator('[data-shh-field="function"]').fill(marker);await page.locator(`[data-shh-save="${header.id}"]`).click();
    await page.evaluate(()=>{const main=document.createElement('main');main.id='fixture-market-main';const quote=document.getElementById('quote-area');quote.before(main);main.append(quote,document.getElementById('heat-area'));window.StrikeHerHeart.scan();});await settle(page);
    const repaired=await state(page),newPage=current(repaired).find(a=>a.anchor.key==='fx678-sge-v1:page');assert.ok(newPage);assert.equal(await selectedPageTargetId(page),'fixture-market-main');assert.equal(newPage.anchor.tag,'main');assertMainRegionFallback(repaired,newPage);
    assert.equal(newPage.number,previousMax+1,'A previously missing page bubble appends after all saved annotation numbers');
    for(const a of repaired.annotations)if(existingNumbers[a.id]!==undefined)assert.equal(a.number,existingNumbers[a.id],`Adding the page bubble keeps ${a.label} at its saved number`);
    assert.equal(repaired.annotations.find(a=>a.id===header.id).fields.function,marker);
    assert.equal(newPage.number,101);results.push({migrationFromMissingPage:true,previousAnnotationCount:existing.annotations.length,previousMaxNumber:previousMax,newPageTarget:'fixture-market-main',newPageId:newPage.id,newPageNumber:newPage.number,existingNumbersPreserved:true,savedHeaderText:marker,pageRecordContainsNoQuoteReadouts:true});
  }finally{await context.close();}
  for(const missingTable of ['#fixture-main-table','#fixture-heat-table']){
    const {context,page}=await isolated({dualTitles:true,ambiguousMainTitles:true});
    try{
      assert.equal(await selectedPageTargetId(page),'fixture-market-main');
      await page.locator(missingTable).evaluate(table=>table.remove());await settle(page);
      assert.equal(await selectedPageTargetId(page),null,`No main-region fallback is allowed when ${missingTable} is missing`);
      assert.equal(current(await state(page)).some(a=>a.anchor.key==='fx678-sge-v1:page'),false);
      results.push({missingTable,pageFallbackSkipped:true});
    }finally{await context.close();}
  }
  report.checks.push({name:'duplicate title context and retained records',passed:true,results});
});

test('100 locally simulated visible links remain responsive and retain all 19 unobscured header bubbles',async()=>{
  const started=Date.now(),{context,page}=await isolated({dualTitles:true,linkCount:100,viewport:{width:1700,height:1600}}),loadWallMs=Date.now()-started;
  try{
    const initialLinks=await page.locator('a:visible').count();assert.equal(initialLinks,100,'The fixture really renders one hundred links, rather than one hundred hidden records');
    assert.equal(await selectedPageTargetId(page),'sge-title');
    const before=await state(page),samples=[];
    assert.ok(before.currentControlIds.length>=120,'The performance fixture includes link/control targets plus content annotations');
    const geometryChecks=[await assertPaintedColumnTextClear(page,'100 links / initial drawer open')];
    for(let index=0;index<5;index++){
      const sample=await page.evaluate(index=>{
        document.querySelectorAll('#fixture-main-table tbody td:not(:first-child),#fixture-heat-table tbody td').forEach(n=>n.textContent=index%2?'314159.265358':'271828.182845');
        const begin=performance.now(),snapshot=window.StrikeHerHeart.scan();return {milliseconds:performance.now()-begin,currentTargets:snapshot.currentControlIds.length,placementHiddenIds:snapshot.ui.placementHiddenIds};
      },index);samples.push(sample);
    }
    const timings=samples.map(s=>s.milliseconds).sort((a,b)=>a-b),maxScanMs=timings.at(-1),medianScanMs=timings[Math.floor(timings.length/2)];
    assert.ok(maxScanMs<1500,`A 100-link fixture rescan must not monopolize the browser for seconds; max=${maxScanMs.toFixed(1)}ms`);
    await page.evaluate(()=>window.StrikeHerHeart.toggleDrawer(false));await settle(page);geometryChecks.push(await assertPaintedColumnTextClear(page,'100 links / drawer closed'));
    await page.locator('#expand-toggle').click();await settle(page);assert.equal(await page.locator('a:visible').count(),106);await page.evaluate(()=>scrollTo(0,0));await settle(page);geometryChecks.push(await assertPaintedColumnTextClear(page,'106 links / expanded'));
    await page.evaluate(()=>window.StrikeHerHeart.toggleDrawer(true));await settle(page);geometryChecks.push(await assertPaintedColumnTextClear(page,'106 links / expanded drawer open'));
    const readStart=Date.now();assert.ok((await page.locator('body').innerText({timeout:5000})).includes('模拟验收页面'));const domReadWallMs=Date.now()-readStart;
    const shotStart=Date.now();await screenshot(page,'sge-simulated-100-link-performance');const screenshotWallMs=Date.now()-shotStart;
    assert.ok(loadWallMs<10000,`Isolated fixture load exceeded its generous 10s budget (${loadWallMs}ms)`);assert.ok(domReadWallMs<5000);assert.ok(screenshotWallMs<5000);
    report.checks.push({name:'100-link fixture performance',passed:true,fixtureOnly:true,viewport:{width:1700,height:1600},initialVisibleLinkCount:initialLinks,currentTargets:before.currentControlIds.length,loadWallMs,samples,medianScanMs,maxScanMs,domReadWallMs,screenshotWallMs,geometryChecks,causalLimit:'These timings describe a locally simulated fixture only; they do not identify the cause of the original website/browser automation slowdown.'});
  }finally{await context.close();}
});
