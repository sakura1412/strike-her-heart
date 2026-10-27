/* Real renderer → private task queue integration; isolated fictional page only. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'skills/strike-her-heart/scripts/task.py');
const source = fs.readFileSync(path.join(root, 'skills/strike-her-heart/assets/overlay.js'), 'utf8');
const html = '<!doctype html><meta charset="utf-8"><title>Fictional queue integration</title><h1>虚构队列集成</h1><input id="name" aria-label="名称" maxlength="20"><button id="view" type="button">查看</button><script src="/overlay.js"></script>';

test('current runtime identities drive a resumable page queue and a newly discovered control invalidates completion', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shh-queue-bridge-'));
  fs.mkdirSync(path.join(directory, 'evidence'));
  const options = {headless:true};
  if(process.env.SHH_BROWSER_CHANNEL) options.channel=process.env.SHH_BROWSER_CHANNEL;
  if(process.env.SHH_BROWSER_EXECUTABLE) options.executablePath=process.env.SHH_BROWSER_EXECUTABLE;
  const browser = await chromium.launch(options);
  const cli = (command, ...args) => {
    const input = [script,command,'--task-dir',directory];
    if(!['init','status','workflow'].includes(command)) input.push('--revision',String(JSON.parse(fs.readFileSync(path.join(directory,'task.json'),'utf8')).revision));
    const result = spawnSync(process.env.PYTHON || 'python3', [...input,...args], {encoding:'utf8'});
    assert.equal(result.status,0,result.stdout+result.stderr);
    return JSON.parse(result.stdout);
  };
  const evidence = ['--actual','--note','Isolated browser fixture observation, not a production run','--evidence','evidence/initial.json'];
  try {
    const context=await browser.newContext();
    const page=await context.newPage();
    await page.route('http://queue-bridge.fixture/**',route=>route.fulfill({contentType:route.request().url().endsWith('/overlay.js')?'text/javascript':'text/html',body:route.request().url().endsWith('/overlay.js')?source:html}));
    await page.goto('http://queue-bridge.fixture/page');
    await page.waitForFunction(()=>window.StrikeHerHeart?.getQueueSnapshot);
    const initial=await page.evaluate(()=>window.StrikeHerHeart.getSnapshot());
    fs.writeFileSync(path.join(directory,'evidence/initial.json'),JSON.stringify(initial));
    cli('init','--name','Fictional renderer queue test','--scope','Only this synthetic page','--target','http://queue-bridge.fixture/page');
    cli('transition','--to','access',...evidence);
    cli('capability','--read','supported','--write','supported','--method','Isolated fixture renderer','--evidence','evidence/initial.json');
    cli('transition','--to','discovery',...evidence);
    const pageId=cli('page','--url','http://queue-bridge.fixture/page','--state-key','fixture').pageId;
    const bind = (item, proof=evidence)=>cli('bind','--page-id',pageId,'--display-id',item.displayId,'--runtime-id',item.id,'--source-key',item.identity.element_id,...proof);
    for(const id of initial.currentControlIds) bind(initial.annotations.find(item=>item.id===id));
    cli('transition','--to','annotation','--scope-confirmed',...evidence);
    const queued=cli('queue','--action','enqueue','--page-id',pageId,'--phase','annotation','--side-effect','read_only');
    const jobId=queued.workQueue.items[0].id;
    const current=await page.evaluate(pageId=>window.StrikeHerHeart.getQueueSnapshot({pageId,stateKey:'fixture'}),pageId);
    assert.equal(current.controls.length,initial.currentControlIds.length);
    for(const item of current.controls){assert.match(item.fingerprint,/^[0-9a-f]{64}$/);assert.match(item.contentHash,/^[0-9a-f]{64}$/);}
    fs.writeFileSync(path.join(directory,'evidence/current.json'),JSON.stringify(current));
    cli('queue','--action','reconcile','--job-id',jobId,'--snapshot','evidence/current.json',...evidence);
    const claimed=cli('queue','--action','claim','--job-id',jobId);
    const leaseToken=claimed.queueResult.leaseToken;
    assert.ok(leaseToken);
    for(const item of current.controls) cli('queue','--action','checkpoint','--job-id',jobId,'--lease-token',leaseToken,'--binding-id',item.id,'--checkpoint-result','done',...evidence);
    const done=cli('queue','--action','report','--job-id',jobId,'--lease-token',leaseToken,'--outcome','succeeded',...evidence);
    assert.equal(done.workQueue.progress.completed,1);
    assert.equal(done.taskComplete,false);
    await page.evaluate(()=>{const button=document.createElement('button');button.id='new-control';button.textContent='新增控件';document.body.insertBefore(button,document.querySelector('button'));window.StrikeHerHeart.scan();});
    const after=await page.evaluate(()=>window.StrikeHerHeart.getSnapshot());
    const added=after.annotations.find(item=>item.anchor.key==='new-control');
    fs.writeFileSync(path.join(directory,'evidence/after.json'),JSON.stringify(after));
    const afterEvidence=['--actual','--note','Observed the inserted control in the isolated browser fixture','--evidence','evidence/after.json'];
    bind(added,afterEvidence);
    const next=await page.evaluate(pageId=>window.StrikeHerHeart.getQueueSnapshot({pageId,stateKey:'fixture'}),pageId);
    fs.writeFileSync(path.join(directory,'evidence/next.json'),JSON.stringify(next));
    const changed=cli('queue','--action','reconcile','--job-id',jobId,'--snapshot','evidence/next.json','--reviewed',...afterEvidence);
    assert.equal(changed.workQueue.progress.completed,0);
    assert.ok(changed.workQueue.items[0].checkpoints.done<next.controls.length);
    assert.equal(changed.taskComplete,false);
    await context.close();
  } finally {await browser.close();fs.rmSync(directory,{recursive:true,force:true});}
});
