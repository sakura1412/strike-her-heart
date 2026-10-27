/* Isolated renderer persistence and independent-verifier integration. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'skills/strike-her-heart/assets/overlay.js'),'utf8');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
test('real save and refresh snapshots are independently checked; failed storage cannot be reported successful',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shh-verify-browser-'));fs.writeFileSync(path.join(dir,'source.txt'),'Fictional PRD statement');
 const browser=await chromium.launch({headless:true});try{const context=await browser.newContext(),page=await context.newPage();
 await page.route('http://verify.fixture/**',r=>r.fulfill({contentType:r.request().url().endsWith('overlay.js')?'text/javascript':'text/html',body:r.request().url().endsWith('overlay.js')?source:'<!doctype html><h1>虚构测试</h1><button id="action">查看</button><script src="/overlay.js"></script>'}));
 await page.goto('http://verify.fixture/page');await page.waitForFunction(()=>window.StrikeHerHeart?.getSnapshot()?.currentControlIds.length>0);
 const exported=await page.evaluate(()=>window.StrikeHerHeart.exportData());const snap=await page.evaluate(()=>window.StrikeHerHeart.getSnapshot());
 const current=exported.pages[0].annotations.filter(a=>snap.currentControlIds.includes(a.id));
 for(const a of current){a.claimSources={S1:{type:'DOCUMENT_SUPPORTED',locator:'fixture §1',version:'1',quote:'statement',path:'source.txt',sha256:sha('Fictional PRD statement')}};a.claimRecords={};for(const field of ['content','function','limits','navigation']){const value='虚构文档规定：'+field;a.fields[field]=value;a.fieldStates[field]='supported';a.claimRecords[field]=[{text:value,textSha256:sha(value),type:'DOCUMENT_SUPPORTED',kind:'specification',scope:'specification',derivation:'explicit',sourceRefs:['S1'],controlFingerprint:a.identity.selector_fingerprint}];}}
 const imported=await page.evaluate(data=>window.StrikeHerHeart.importData(data),exported);assert.equal(imported.updated,current.length);
 const before=await page.evaluate(()=>window.StrikeHerHeart.getVerificationSnapshot({pageId:'P-001',stateKey:'default'}));
 await page.reload();await page.waitForFunction(()=>window.StrikeHerHeart?.getSnapshot()?.currentControlIds.length>0);
 let after=await page.evaluate(()=>window.StrikeHerHeart.getVerificationSnapshot({pageId:'P-001',stateKey:'default'}));
 const task={pages:[{id:'P-001',stateKey:'default',url:'http://verify.fixture/page',status:'verified',bindings:before.controls.map(a=>({runtimeId:a.id,displayId:a.displayId}))}]};
 const bundle={pages:[{pageId:'P-001',before:'before.json',after:'after.json'}],report:{pages:1,verifiedPages:1,controls:before.controls.length}};
 const run=()=>{fs.writeFileSync(path.join(dir,'before.json'),JSON.stringify(before));fs.writeFileSync(path.join(dir,'after.json'),JSON.stringify(after));fs.writeFileSync(path.join(dir,'task.json'),JSON.stringify(task));fs.writeFileSync(path.join(dir,'bundle.json'),JSON.stringify(bundle));const p=spawnSync('python3',['-c',`import importlib.util,json,sys\np=sys.argv[1]\ndef load(n):\n s=importlib.util.spec_from_file_location(n,p+'/'+n+'.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m\nr=sys.argv[2]; print(json.dumps(load('completion_verifier').verify(r,json.load(open(r+'/task.json')),json.load(open(r+'/bundle.json')),load('evidence_contract'))))`,path.join(root,'skills/strike-her-heart/scripts'),dir],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);};
 assert.deepEqual(run(),[]);
 const saveFailed=await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('fixture quota','QuotaExceededError')};const data=window.StrikeHerHeart.exportData();data.pages[0].annotations[0].fields.content='保存失败的修改';try{window.StrikeHerHeart.performAction({action:'write_annotations',data});return false}catch(_){return true}});assert.equal(saveFailed,true);after=await page.evaluate(()=>window.StrikeHerHeart.getVerificationSnapshot({pageId:'P-001',stateKey:'default'}));assert.equal(after.storageAvailable,false);assert.ok(run().some(issue=>/save/.test(issue)));
 await context.close();}finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
});
