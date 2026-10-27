/* Strike Her Heart — local, original-page annotation overlay. No dependencies/network. */
(() => {
  'use strict';
  if (window.StrikeHerHeart && window.StrikeHerHeart.__runtime) {
    window.StrikeHerHeart.toggle(true);
    window.StrikeHerHeart.scan();
    return;
  }

  const VERSION = 1;
  const ROOT_ID = 'strike-her-heart-overlay';
  const STORE_PREFIX = 'strike-her-heart:v1:';
  const DRAWER_BREAKPOINT = 1100;
  const FIELD_NAMES = { content: '页面内容', function: '功能与触发', limits: '限制与状态', navigation: '跳转与去向' };
  const STATE_NAMES = { observed: '页面可见', unknown: '待确认', supported: '有来源支持', conflict: '来源冲突', review: '需复核', user: '人工修改' };
  const LEVEL_NAMES = { tested: 'L1 已实测', page: 'L2 页面声明', prd: 'L3 PRD 依据', guess: 'L4 模型猜测', unclassified: '未分级' };
  const PROVENANCE_NAMES = { source: '来源名称', locator: '来源定位', action: '验证动作', result: '观察结果', observedAt: '验证时间（ISO）' };
  const SELECTOR = 'button,input:not([type="hidden"]),textarea,select,a[href],summary,[contenteditable="true"],[role="button"],[role="link"],[role="textbox"],[role="combobox"],[role="listbox"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"],[role="slider"],[role="spinbutton"],[role="searchbox"]';
  const config = window.StrikeHerHeartConfig || {};
  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.setAttribute('data-shh-ignore', '');
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;isolation:isolate;';
  const shadow = root.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{all:initial;color-scheme:light;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#263049}
    *,*:before,*:after{box-sizing:border-box} button,input,textarea,select{font:inherit} button{cursor:pointer}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid #bda1ff;outline-offset:2px}
    .leaders{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}.leaders line{stroke:#6d38d4;stroke-width:1.5;stroke-dasharray:3 2;opacity:.72}.bubble{position:fixed;pointer-events:auto;min-width:25px;height:25px;padding:0 5px;border:2px solid white;border-radius:20px;background:#6d38d4;color:white;box-shadow:0 2px 8px #29134a40;font-size:11px;font-weight:750;line-height:21px;z-index:1;transition:background .1s}
    .bubble:hover,.bubble[aria-expanded=true]{background:#bd377c;box-shadow:0 0 0 3px #e8d9ff}.bubble.review{background:#b55d0a}.bubble:disabled{pointer-events:none}
    .panel{pointer-events:auto;position:fixed;right:14px;top:14px;bottom:14px;width:min(390px,calc(100vw - 28px));background:#fbfaff;border:1px solid #e3dced;border-radius:18px;box-shadow:0 10px 48px #31204430;display:flex;flex-direction:column;overflow:hidden;z-index:3}
    .head{padding:18px 18px 13px;border-bottom:1px solid #e8e1ef;background:linear-gradient(120deg,#f4edff,#fff6fb)}.brand{display:flex;align-items:center;gap:8px}.heart{font-size:21px;color:#a83b7b}.brand strong{font-size:17px;letter-spacing:-.3px;flex:1}.sub{margin:4px 0 12px;color:#756882;font-size:11px}.drawer-launcher{position:fixed;right:18px;bottom:18px;pointer-events:auto;border:1px solid #d9c6ee;background:#fff;color:#6836a2;padding:9px 12px;border-radius:24px;box-shadow:0 3px 15px #3f1f6328;font-size:12px;font-weight:650;z-index:3;white-space:nowrap}
    .row{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.btn{border:1px solid #dbd0e7;border-radius:8px;background:white;color:#5e3a7c;padding:5px 9px;font-size:12px;line-height:1.5}.btn:hover{background:#f0e7ff}.btn.primary{background:#6d38d4;color:white;border-color:#6d38d4}.icon{border:0;background:transparent;padding:3px 7px;color:#726180;border-radius:6px;font-size:17px}.icon:hover{background:#e9dff4}
    .stats{font-size:12px;color:#645773}.stats strong{color:#6436a3;font-size:18px}.body{overflow:auto;overscroll-behavior:contain;flex:1;padding:12px}.notice{border:1px solid #eadcc6;background:#fff9ed;color:#7c5c28;border-radius:9px;padding:9px 11px;font-size:11px;margin:0 0 10px;white-space:pre-line}.notice summary{cursor:pointer;font-weight:650}.coverage{margin:6px 0 0;padding-left:16px}.empty{padding:22px 13px;text-align:center;color:#82748e}.empty b{display:block;color:#5d4478;font-size:15px;margin-bottom:7px}.empty p{margin:5px 0}.catalog{margin-top:16px;text-align:left}.catalog button{display:flex;gap:8px;align-items:center;width:100%;border:0;border-bottom:1px solid #ede6f4;background:transparent;padding:8px 0;text-align:left;color:#58446b}.catalog button:hover{color:#7a35b7}.num{display:inline-flex;align-items:center;justify-content:center;flex:none;min-width:23px;height:23px;border-radius:20px;background:#efe4ff;color:#723bb8;font-weight:700;font-size:11px}.catalog .label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.muted{font-size:11px;color:#8d7b99}
    .card{background:white;border:1px solid #e5d9ef;border-radius:12px;margin-bottom:12px;padding:12px;box-shadow:0 2px 6px #40206005}.card:focus{outline:2px solid #caa5f2;outline-offset:2px}.cardhead{display:flex;gap:8px;align-items:flex-start}.cardtitle{min-width:0;flex:1}.cardtitle strong{display:block;overflow-wrap:anywhere;font-size:14px}.tag{font-size:10px;color:#8e719e}.review-note{margin:9px 0;padding:7px 9px;border-radius:7px;background:#fff5dd;color:#895807;font-size:11px}.field{margin-top:12px}.fieldbar{display:flex;gap:7px;justify-content:space-between;align-items:center;margin-bottom:4px}.fieldbar label{font-weight:650;font-size:12px}.state{font-size:10px;border:0;color:#796089;background:#f5effa;border-radius:5px;padding:2px 4px;max-width:125px}.field textarea{width:100%;min-height:60px;resize:vertical;border:1px solid #dfd4e9;border-radius:7px;padding:7px 8px;color:#382644;background:#fff;font-size:12px;line-height:1.5}.field .evidence{min-height:33px;background:#faf8fc;color:#7b6689;font-size:10px;margin-top:4px}.field .evidence-label{font-size:10px;color:#8c7898;margin-top:4px}.cardfoot{margin-top:11px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}.save-status{color:#8b7697;font-size:10px;flex:1}.history{font-size:11px;color:#8b729d;margin-top:9px}.history summary{cursor:pointer}.history ol{padding-left:20px}.history li{margin-top:6px;overflow-wrap:anywhere;white-space:pre-wrap}.footer{padding:9px 14px;border-top:1px solid #e8e1ef;background:white;color:#9a86a7;font-size:10px}.status{padding:7px 12px;color:#603b7f;background:#f1e7ff;font-size:11px;white-space:pre-line}.status:empty{display:none}.chip{position:fixed;right:18px;bottom:18px;pointer-events:auto;border:1px solid #e0c7f8;background:#6d38d4;color:white;padding:10px 15px;border-radius:30px;box-shadow:0 4px 15px #3f1f6340;font-weight:650;z-index:3}.jsonbox{width:100%;min-height:190px;border:1px solid #d8c6e7;border-radius:8px;padding:10px;font:11px/1.5 ui-monospace,monospace}.transfer{margin-bottom:12px;border:1px solid #d9c7ed;padding:12px;border-radius:12px;background:#f9f3ff}.transfer h3{margin:0 0 8px;font-size:13px}.transfer p{color:#806b90;font-size:11px;margin:5px 0 9px}.transfer .row{margin-top:7px}[hidden]{display:none!important}
    @media(max-width:650px){.panel{width:min(340px,calc(100vw - 24px));right:12px;top:12px;bottom:12px}.bubble{font-size:10px;min-width:23px;height:23px;line-height:19px}}
    .review-tools{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 6px;margin-top:8px}.review-toggle{grid-column:1/-1;display:flex;align-items:center;gap:7px;font-size:12px;color:#5e3a7c;font-weight:600;cursor:pointer;padding:3px 0}.review-toggle input{width:15px;height:15px;margin:0;accent-color:#6d38d4}.queue-count{font-size:11px;color:#795b8c;align-self:center;overflow-wrap:anywhere}.review-tools .btn{font-size:11px;padding:4px 7px}.btn:disabled{cursor:default;opacity:.5}.queue-title{font-size:12px;color:#66437d;margin:0 0 4px}.queue-reasons{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:10px;color:#91621c;overflow-wrap:anywhere}.catalog-box[data-shh-review-queue] .catalog{max-height:170px}.catalog-box[data-shh-review-queue] .scope-note{margin-bottom:7px}
    @media(prefers-reduced-motion:reduce){*{transition:none!important}}
    .evidence-details{margin-top:5px;font-size:10px;color:#806b90}.evidence-details>summary{cursor:pointer;padding:3px 0}.evidence-details .evidence-label{display:block}.save-status.error{color:#a34229;font-weight:650}.catalog-box{margin:0 0 12px;border:1px solid #e4d8ef;border-radius:10px;background:#fff;padding:10px}.catalog-tools{display:flex;gap:6px;margin-bottom:7px}.catalog-search{min-width:0;flex:1;width:100%;border:1px solid #dacce8;border-radius:7px;padding:6px 8px;font-size:12px;color:#382644}.catalog-filter{max-width:118px;border:1px solid #dacce8;border-radius:7px;padding:5px;font-size:11px;color:#654778;background:white}.catalog-box .catalog{margin:0;max-height:210px;overflow:auto}.catalog-box .num{min-width:45px}.catalog-meta{font-size:10px;color:#8b6c9d;display:block;overflow-wrap:anywhere}.catalog-text{flex:1;min-width:0}.catalog-text>.label{display:block}.scope-note{font-size:10px;color:#8a7699;margin:4px 0 0}.catalog-count{font-size:10px;color:#8a7699;margin:6px 0 0}.catalog-empty{padding:14px 5px;color:#8a7699;font-size:11px}
    .fieldbar{flex-wrap:wrap}.level-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:3px 0 6px}.level-badge{display:inline-block;font-size:10px;font-weight:650;padding:2px 6px;border:1px solid #cfc5db;border-radius:5px;background:#f4f0f8;color:#655671;overflow-wrap:anywhere}.level-badge[data-level=tested]{background:#eaf6ef;color:#246646;border-color:#9bc6af}.level-badge[data-level=page]{background:#edf4ff;color:#315f91;border-color:#b2c7e1}.level-badge[data-level=prd]{background:#f4edff;color:#744a9e;border-color:#d1bce5}.level-badge[data-level=guess]{background:#fff4dd;color:#8a5b12;border-color:#dfbf7c}.level-state{font-size:10px;color:#766283}.level-hint{font-size:10px;color:#806b90;margin:3px 0;overflow-wrap:anywhere}.level-hint.warning{color:#915319;font-weight:600}.provenance-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;margin:7px 0}.provenance-grid label{display:block;color:#705d7d;font-size:10px;min-width:0}.provenance-grid input,.provenance-grid select{display:block;width:100%;min-width:0;margin-top:3px;border:1px solid #dfd4e9;border-radius:6px;padding:6px;background:white;color:#382644;font-size:11px}.evidence-summary{font-size:10px;color:#705c83;margin:5px 0;overflow-wrap:anywhere}.level-legend{font-size:10px;color:#806b90;margin:5px 0}.level-legend summary{cursor:pointer}.level-legend p{margin:5px 0;overflow-wrap:anywhere}
  `;
  shadow.append(style);
  const bubblesLayer = document.createElement('div');
  bubblesLayer.setAttribute('aria-label', '页面控件标注');
  const leaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  leaders.classList.add('leaders');
  leaders.setAttribute('aria-hidden', 'true');
  bubblesLayer.append(leaders);
  const panel = document.createElement('aside');
  panel.className = 'panel';
  panel.id = 'shh-details-drawer';
  panel.setAttribute('aria-label', 'Strike Her Heart 页面标注详情');
  const drawerLauncher = document.createElement('button');
  drawerLauncher.type = 'button';
  drawerLauncher.className = 'drawer-launcher';
  drawerLauncher.textContent = '♡ 展开标注详情';
  drawerLauncher.setAttribute('data-shh-drawer', 'open');
  drawerLauncher.setAttribute('aria-label', '展开标注详情，保留页面编号气泡');
  drawerLauncher.setAttribute('aria-controls', panel.id);
  drawerLauncher.addEventListener('click', () => toggleDrawer(true));
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      toggleDrawer(false);
      drawerLauncher.focus({ preventScroll: true });
    }
  });
  const chip = document.createElement('button');
  chip.className = 'chip';
  chip.textContent = '♡ 打开页面标注';
  chip.hidden = true;
  chip.addEventListener('click', () => toggle(true));
  shadow.append(bubblesLayer, panel, drawerLauncher, chip);

  let currentPage;
  let currentScopeKey = '';
  let currentUIKey = '';
  let activeModal = null;
  let opened = new Set();
  let drafts = new Map();
  let visible = true;
  let narrow = innerWidth <= DRAWER_BREAKPOINT;
  let drawerOpen = !narrow;
  let placementHiddenIds = [];
  let destroyed = false;
  let scanTimer;
  let positionFrame;
  let mutationObserver;
  let resizeObserver;
  let storageWarning = '';
  let transferMode = '';
  let transferValue = '';
  let noticeText = '';
  let catalogOpen = true;
  let catalogQuery = '';
  let catalogFilter = 'all';
  let reviewOnly = false;
  let reviewCursor = '';
  let refreshCatalog = null;
  const expandedEvidence = new Set();
  let nextNumber = 1;
  const targets = new Map();
  const bubbles = new Map();
  const badgePlacements = new Map();
  const pageCache = new Map();
  const uiCache = new Map();
  const watchedRoots = new WeakSet();
  const identitySession = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const nodeIdentities = new WeakMap();
  const modalLifetimes = new WeakMap();
  let identitySequence = 0;
  let currentStateId = '';
  const ENTITY_ATTRIBUTES = ['data-record-id', 'data-entity-id', 'data-row-key', 'data-key', 'data-id', 'data-customer-key', 'data-shh-state-key'];
  const copy = value => JSON.parse(JSON.stringify(value));
  const text = (value, max = 1200) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
  const hash = value => {
    let a = 2166136261;
    let b = 5381;
    for (let i = 0; i < value.length; i++) { a = Math.imul(a ^ value.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ value.charCodeAt(i); }
    return (a >>> 0).toString(36) + (b >>> 0).toString(36);
  };
  // SHA-256 over safe DOM descriptors, never input values. Synchronous so scan and
  // queue snapshots share the same observation without an asynchronous race.
  function digest(value) {
    const bytes = new TextEncoder().encode(String(value));
    const size = Math.ceil((bytes.length + 9) / 64) * 64;
    const padded = new Uint8Array(size); padded.set(bytes); padded[bytes.length] = 128;
    const view = new DataView(padded.buffer); view.setUint32(size - 4, bytes.length * 8 >>> 0); view.setUint32(size - 8, Math.floor(bytes.length / 0x20000000));
    const initial = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const constants = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const rotate = (x,n) => (x >>> n) | (x << (32-n));
    for (let offset=0; offset<size; offset+=64) {
      const words = new Uint32Array(64);
      for(let i=0;i<16;i++) words[i]=view.getUint32(offset+i*4);
      for(let i=16;i<64;i++){const x=words[i-15],y=words[i-2];words[i]=(words[i-16]+(rotate(x,7)^rotate(x,18)^(x>>>3))+words[i-7]+(rotate(y,17)^rotate(y,19)^(y>>>10)))>>>0;}
      let [a,b,c,d,e,f,g,h]=initial;
      for(let i=0;i<64;i++){const first=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+constants[i]+words[i])>>>0;const second=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+first)>>>0;d=c;c=b;b=a;a=(first+second)>>>0;}
      [a,b,c,d,e,f,g,h].forEach((word,i)=>{initial[i]=(initial[i]+word)>>>0;});
    }
    return initial.map(word=>word.toString(16).padStart(8,'0')).join('');
  }
  const el = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const button = (title, handler, className = 'btn') => {
    const node = el('button', className, title);
    node.type = 'button';
    node.addEventListener('click', handler);
    return node;
  };
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  function validObservedAt(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!match || !Number.isFinite(Date.parse(value))) return false;
    const [, year, month, day, hour, minute, second] = match.map(Number);
    return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && hour < 24 && minute < 60 && second < 60;
  }
  function evidenceRecord(value, legacyState = 'unknown', locator = '') {
    const provided = value !== undefined;
    const supplied = value && typeof value === 'object' && !Array.isArray(value);
    const meta = { level: supplied && hasOwn(LEVEL_NAMES, value.level) ? value.level : 'unclassified', source: '', locator: '', action: '', result: '', observedAt: '', derivation: 'explicit' };
    if (supplied) {
      for (const [key, max] of Object.entries({ source: 2000, locator: 2000, action: 3000, result: 3000, observedAt: 50 })) meta[key] = typeof value[key] === 'string' ? text(value[key], max) : '';
      if (value.derivation === 'inferred') meta.derivation = 'inferred';
    } else if (!provided && legacyState === 'observed') {
      meta.level = 'page'; meta.source = '旧版页面记录'; meta.locator = text(locator, 2000);
    }
    const issues = [];
    if (provided && !supplied) issues.push('有效的结构化来源记录');
    if (['tested', 'page', 'prd'].includes(meta.level)) {
      for (const key of ['source', 'locator']) if (!meta[key]) issues.push(PROVENANCE_NAMES[key]);
    }
    if (meta.level === 'tested') {
      for (const key of ['action', 'result']) if (!meta[key]) issues.push(PROVENANCE_NAMES[key]);
      if (!validObservedAt(meta.observedAt)) issues.push('有效的 ISO 验证时间');
    }
    if (meta.level === 'prd' && !['explicit', 'inferred'].includes(value?.derivation)) issues.push('PRD 直接定义 / 推断类型');
    if (supplied && !hasOwn(LEVEL_NAMES, value.level)) issues.push('有效的证据等级');
    return { meta, issues };
  }
  function normalizeEvidence(value, state, locator) {
    const normalized = evidenceRecord(value, state, locator);
    if (normalized.issues.length) {
      normalized.meta.level = 'unclassified';
      state = state === 'conflict' ? 'conflict' : 'review';
    } else if (normalized.meta.level === 'guess' && !['conflict', 'review'].includes(state)) state = 'unknown';
    return { ...normalized, state };
  }
  function normalizeAnnotationEvidence(annotation, anchor = annotation.anchor) {
    annotation.fieldStates = annotation.fieldStates || {};
    annotation.evidence = annotation.evidence || {};
    const previous = annotation.evidenceMeta || {};
    annotation.evidenceMeta = {};
    for (const name of Object.keys(FIELD_NAMES)) {
      const state = hasOwn(STATE_NAMES, annotation.fieldStates[name]) ? annotation.fieldStates[name] : 'unknown';
      const normalized = normalizeEvidence(previous[name], state, anchor?.key || '');
      annotation.evidenceMeta[name] = normalized.meta;
      annotation.fieldStates[name] = normalized.state;
      if (typeof annotation.evidence[name] !== 'string') annotation.evidence[name] = '';
      if (normalized.issues.length) {
        annotation.status = 'needs-review';
        annotation.reviewReason = `「${FIELD_NAMES[name]}」的来源记录不完整，已降为未分级：${normalized.issues.join('、')}。原说明保留，请补齐后复核。`;
      }
      const suggestion = annotation.suggestions?.[name];
      if (suggestion) {
        const candidate = normalizeEvidence(suggestion.evidenceMeta, suggestion.fieldState || 'unknown', anchor?.key || '');
        suggestion.evidenceMeta = candidate.meta; suggestion.fieldState = candidate.state;
      }
      if (annotation.fieldReviewMeta?.[name]) annotation.fieldReviewMeta[name] = normalizeEvidence(annotation.fieldReviewMeta[name], 'unknown', anchor?.key || '').meta;
    }
  }
  const evidenceLabelFor = meta => (LEVEL_NAMES[meta?.level] || LEVEL_NAMES.unclassified) + (meta?.level === 'prd' ? ' · ' + (meta.derivation === 'inferred' ? '推断' : '直接定义') : '');
  const sameScope = (left, right) => left && right && ['origin', 'path', 'route', 'custom'].every(key => (left[key] || '') === (right[key] || ''));
  let adapterIssues = [];
  function adapterCall(adapter, name, ...args) {
    try { return typeof adapter?.[name] === 'function' ? adapter[name](...args) : null; }
    catch (_) { adapterIssues.push(`站点适配 ${name} 执行失败；已跳过该部分，基础控件扫描仍保留。`); return null; }
  }
  function pageAdapter() {
    const adapter = (window.StrikeHerHeartConfig || config).siteAdapter;
    return adapter && typeof adapter.id === 'string' && /^[a-z0-9_-]{1,80}$/i.test(adapter.id) && adapterCall(adapter, 'matches') === true ? adapter : null;
  }
  function validDescriptor(value) {
    return value && value.element instanceof Element && value.element.ownerDocument === document && value.element.isConnected && isVisible(value.element) && typeof value.key === 'string' && /^[a-z0-9_.:/-]{1,160}$/i.test(value.key) && typeof value.label === 'string' && value.label.trim().length > 0;
  }
  function mergeDescription(observed, description, locator) {
    if (!description || typeof description !== 'object') return;
    for (const name of Object.keys(FIELD_NAMES)) {
      if (typeof description.fields?.[name] === 'string') observed.fields[name] = description.fields[name].slice(0, 12000);
      if (typeof description.evidence?.[name] === 'string') observed.evidence[name] = description.evidence[name].slice(0, 12000);
      if (hasOwn(STATE_NAMES, description.fieldStates?.[name])) observed.fieldStates[name] = description.fieldStates[name];
      if ((description.evidenceMeta && hasOwn(description.evidenceMeta, name)) || typeof description.fields?.[name] === 'string' || typeof description.evidence?.[name] === 'string') {
        const normalized = normalizeEvidence(description.evidenceMeta?.[name], hasOwn(STATE_NAMES, description.fieldStates?.[name]) ? description.fieldStates[name] : 'unknown', locator);
        observed.evidenceMeta[name] = normalized.meta;
        if (normalized.issues.length || normalized.meta.level === 'guess') observed.fieldStates[name] = normalized.state;
      }
    }
  }

  function scopeNow() {
    const hashPath = location.hash.split('?')[0];
    const route = /^#!?\/[A-Za-z0-9_./%~:@-]*$/.test(hashPath) ? hashPath : '';
    // Never retain search parameters, URL credentials, fragment tokens or form values.
    const scope = { origin: location.origin, path: location.pathname, route };
    if (typeof config.scopeKey === 'string' && /^[A-Za-z0-9_.:/-]{1,100}$/.test(config.scopeKey)) scope.custom = config.scopeKey;
    return scope;
  }

  function cacheUIState() {
    if (currentUIKey) uiCache.set(currentUIKey, { opened: new Set(opened), drafts: new Map(drafts), reviewOnly, reviewCursor, catalogOpen, catalogQuery, catalogFilter });
  }

  function savePage() {
    if (!currentPage) return;
    pageCache.set(currentScopeKey, currentPage);
    cacheUIState();
    try {
      localStorage.setItem(STORE_PREFIX + hash(currentScopeKey), JSON.stringify(currentPage));
      storageWarning = '';
      return true;
    } catch (_) {
      storageWarning = '当前浏览器写入失败。未保存编辑仍保留在本次会话，请恢复存储后重试；普通导出不包含未保存草稿。';
      return false;
    }
  }

  function switchScope(scope) {
    const key = JSON.stringify(scope);
    if (key === currentScopeKey) return false;
    savePage();
    currentScopeKey = key;
    let stored = pageCache.get(key);
    if (!stored) {
      try {
        const candidate = JSON.parse(localStorage.getItem(STORE_PREFIX + hash(key)) || 'null');
        if (candidate && candidate.schemaVersion === VERSION && sameScope(candidate.scope, scope) && Array.isArray(candidate.annotations)) {
          candidate.annotations = candidate.annotations.filter(annotation => annotation && typeof annotation.id === 'string' && /^shh-[a-z0-9]+$/.test(annotation.id) && Number.isInteger(annotation.number) && annotation.number > 0 && annotation.anchor && typeof annotation.anchor.kind === 'string' && typeof annotation.anchor.key === 'string' && annotation.fields && Object.keys(FIELD_NAMES).every(name => typeof annotation.fields[name] === 'string'));
          stored = candidate;
        }
      } catch (_) { /* A bad local record must not prevent inspection. */ }
    }
    currentPage = stored || { schemaVersion: VERSION, scope, annotations: [], coverage: [], updatedAt: new Date().toISOString() };
    for (const annotation of currentPage.annotations) {
      normalizeAnnotationEvidence(annotation);
      if (Array.isArray(annotation.revisions)) for (const revision of annotation.revisions) if (revision && typeof revision === 'object') normalizeAnnotationEvidence(revision, annotation.anchor);
    }
    currentUIKey = '';
    opened = new Set();
    drafts = new Map();
    transferMode = '';
    transferValue = '';
    noticeText = '';
    catalogOpen = true;
    catalogQuery = '';
    catalogFilter = 'all';
    reviewOnly = false;
    reviewCursor = '';
    nextNumber = Math.max(0, ...currentPage.annotations.map(a => Number(a.number) || 0)) + 1;
    targets.clear();
    bubbles.forEach(node => node.remove());
    bubbles.clear();
    badgePlacements.clear();
    return true;
  }

  function switchUIContext() {
    const selected = Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"],[role="tab"][data-state="active"]')).map(node => {
      const list = node.closest('[role="tablist"]');
      return [list ? list.id || pathFor(list) : '', node.id || node.getAttribute('aria-controls') || pathFor(node)].join(':');
    }).sort();
    const entities = activeModal ? entityContext(activeModal) : [];
    const modalKey = activeModal ? entities.length ? ['entity', entities.map(item=>item.key)] : ['lifetime', identitySession, modalLifetime(activeModal), labelOf(activeModal.querySelector('h1,h2,[role="heading"]') || activeModal)] : '';
    currentStateId = digest(JSON.stringify([selected, modalKey]));
    const key = currentScopeKey + '|ui:' + currentStateId;
    if (key === currentUIKey) return false;
    cacheUIState();
    currentUIKey = key;
    const saved = uiCache.get(key);
    opened = saved ? new Set(saved.opened) : new Set();
    drafts = saved ? new Map(saved.drafts) : new Map();
    reviewOnly = saved?.reviewOnly === true;
    reviewCursor = saved?.reviewCursor || '';
    catalogOpen = saved?.catalogOpen ?? true;
    catalogQuery = saved?.catalogQuery || '';
    catalogFilter = saved?.catalogFilter || 'all';
    return true;
  }

  function composedParent(node) {
    return node.parentElement || (node.getRootNode && node.getRootNode().host) || null;
  }

  function isIgnored(node) {
    for (let n = node; n; n = composedParent(n)) {
      if (n === root || n.hasAttribute('data-shh-ignore') || n.closest && n.closest('#' + ROOT_ID)) return true;
    }
    return false;
  }

  function isVisible(node) {
    if (!node.isConnected || isIgnored(node) || !node.getClientRects().length) return false;
    if (activeModal) {
      let inModal = false;
      for (let n = node; n; n = composedParent(n)) if (n === activeModal) { inModal = true; break; }
      if (!inModal) return false;
    }
    for (let n = node; n; n = composedParent(n)) {
      if (n.hidden || n.inert || n.getAttribute('aria-hidden') === 'true') return false;
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || s.contentVisibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function observeTree(tree) {
    if (!mutationObserver || watchedRoots.has(tree)) return;
    watchedRoots.add(tree);
    mutationObserver.observe(tree, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['id','class','style','hidden','open','data-state','aria-hidden','aria-label','aria-labelledby','aria-expanded','aria-selected','aria-disabled','disabled','required','readonly','min','max','maxlength','minlength','pattern','type','role','href','data-testid','data-test','data-qa',...ENTITY_ATTRIBUTES] });
  }

  function collectControls(tree, controls, coverage) {
    observeTree(tree);
    for (const node of tree.querySelectorAll(SELECTOR)) if (isVisible(node)) controls.push(node);
    for (const node of tree.querySelectorAll('*')) {
      if (node === root || isIgnored(node)) continue;
      if (node.shadowRoot) {
        coverage.openShadow++;
        collectControls(node.shadowRoot, controls, coverage);
      }
      if (node.tagName === 'IFRAME' && isVisible(node)) coverage.frames++;
      if (node.tagName === 'CANVAS' && isVisible(node)) coverage.canvas++;
    }
  }

  function labelOf(node) {
    const safeLabel = ref => {
      const clone = ref.cloneNode(true);
      if (clone.matches('input,textarea,select,[contenteditable],script,style')) return '';
      for (const field of clone.querySelectorAll('input,textarea,select,[contenteditable],script,style')) field.remove();
      return text(clone.textContent, 180);
    };
    const aria = node.getAttribute('aria-label');
    if (aria) return text(aria, 180);
    const labelledBy = node.getAttribute('aria-labelledby');
    if (labelledBy) {
      const tree = node.getRootNode();
      const refs = labelledBy.split(/\s+/).map(id => tree.getElementById && tree.getElementById(id)).filter(Boolean);
      const label = refs.map(safeLabel).join(' ');
      if (label) return label.slice(0, 180);
    }
    if (node.labels && node.labels.length) {
      const label = Array.from(node.labels).map(safeLabel).join(' ');
      if (label) return label.slice(0, 180);
    }
    if (!['INPUT','TEXTAREA','SELECT'].includes(node.tagName) && !node.isContentEditable) {
      const label = safeLabel(node);
      if (label) return label;
    }
    return text(node.getAttribute('title') || node.getAttribute('placeholder') || node.getAttribute('name') || node.id || `${node.tagName.toLowerCase()} ${node.getAttribute('type') || node.getAttribute('role') || ''}`, 180);
  }

  function pathFor(node) {
    const parts = [];
    let n = node;
    while (n && n !== document.documentElement && parts.length < 18) {
      const parent = n.parentElement;
      if (!parent) {
        const host = n.getRootNode().host;
        if (host) { parts.unshift(n.tagName.toLowerCase()); parts.unshift('::shadow'); n = host; continue; }
        parts.unshift(n.tagName.toLowerCase()); break;
      }
      const peers = Array.from(parent.children).filter(item => item.tagName === n.tagName);
      parts.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${peers.indexOf(n) + 1})`);
      n = parent;
    }
    return parts.join('>');
  }

  function anchorFor(node, label, indexByKey) {
    const tag = node.tagName.toLowerCase();
    const type = node.getAttribute('type') || node.getAttribute('role') || tag;
    let kind = 'path';
    let key = pathFor(node);
    const attrs = ['data-testid', 'data-test', 'data-qa', 'id'];
    for (const attr of attrs) {
      const value = node.getAttribute(attr);
      if (!value) continue;
      const tree = node.getRootNode();
      const matches = Array.from(tree.querySelectorAll('[' + attr + ']')).filter(other => other.getAttribute(attr) === value);
      if (matches.length === 1) {
        kind = attr;
        key = value;
        if (tree.host) key = pathFor(tree.host) + '::shadow:' + value;
        break;
      }
    }
    if (kind === 'path') {
      let row = composedParent(node);
      while (row && row !== document.documentElement) {
        const rowAttr = ENTITY_ATTRIBUTES.find(attribute => row.hasAttribute(attribute));
        if (rowAttr) {
          const rowValue = row.getAttribute(rowAttr);
          const semantic = semanticFor(node, label);
          const peers = Array.from(row.querySelectorAll(SELECTOR)).filter(other=>semanticFor(other,labelOf(other))===semantic);
          if(entityContext(node).some(item=>item.node===row) && peers.length===1){kind = 'row';key = rowAttr + ':' + rowValue + '>semantic:' + hash(semantic);}
          break;
        }
        row = composedParent(row);
      }
    }
    // Duplicate or invalid anchors must never silently merge separate controls.
    const baseKey = kind + ':' + key;
    const count = indexByKey.get(baseKey) || 0;
    indexByKey.set(baseKey, count + 1);
    if (count) { kind = 'path'; key = pathFor(node); }
    return { kind, key, tag, type, positional: kind === 'path', fingerprint: hash([tag, type, label, safeDestination(node)].join('|')) };
  }

  function modalLifetime(node) {
    if(!modalLifetimes.has(node))modalLifetimes.set(node,++identitySequence);
    return modalLifetimes.get(node);
  }
  function identityMutations(records) {
    for(const record of records)if(record.type==='attributes'&&['open','hidden','aria-hidden'].includes(record.attributeName)&&record.target.matches?.('dialog,[role="dialog"]'))modalLifetimes.set(record.target,++identitySequence);
  }
  function entityContext(node) {
    const result=[];
    for(let current=node;current&&current!==document.documentElement;current=composedParent(current)){
      for(const attribute of ENTITY_ATTRIBUTES){
        const value=current.getAttribute(attribute);
        if(!value||!/^[A-Za-z0-9_.:/-]{1,160}$/.test(value))continue;
        const matches=Array.from(current.getRootNode().querySelectorAll('['+attribute+']')).filter(other=>other.getAttribute(attribute)===value);
        if(matches.length===1)result.unshift({node:current,key:attribute+':'+value});
        break;
      }
    }return result;
  }
  function semanticFor(node,label) { return JSON.stringify([node.tagName,node.getAttribute('type')||node.getAttribute('role')||'',node.getAttribute('name')||'',label,safeDestination(node)]); }
  function identityFor(node,anchor,label,duplicateKey=false) {
    const entities=entityContext(node).map(item=>item.key);
    const stable=['id','data-testid','data-test','data-qa','row','adapter','page'].includes(anchor.kind)&&!duplicateKey;
    const reusable=stable&&(!activeModal||entityContext(activeModal).length>0);
    let key=JSON.stringify([anchor.kind,anchor.key,entities]),confidence=reusable?1:0.25;
    if(!stable){
      const container=node.closest('tr,[role="row"],li,section,article')||composedParent(node)||node;
      const context=container.cloneNode(true);context.querySelectorAll('input,textarea,select,[contenteditable],script,style,#'+ROOT_ID).forEach(child=>child.remove());
      const location=pathFor(node)+'|'+text(context.textContent,500);
      let record=nodeIdentities.get(node);
      if(!record||record.location!==location){record={location,key:identitySession+':'+(++identitySequence)};nodeIdentities.set(node,record);}
      key='session:'+record.key;
    }
    const descriptor={tag:anchor.tag,type:anchor.type,label,destination:safeDestination(node),attributes:Object.fromEntries(['required','disabled','readonly','min','max','minlength','maxlength','pattern','multiple','aria-disabled'].map(name=>[name,node.getAttribute(name)]))};
    return {page_id:digest(currentScopeKey),state_id:currentStateId,element_id:digest(key),selector_fingerprint:digest(JSON.stringify(anchor.type==='page'?[key,'page']:[key,anchor.tag,anchor.type])),content_hash:digest(JSON.stringify(descriptor)),mapping_confidence:confidence,match_status:reusable?'matched':'session-only',reason:reusable?'页面、状态、实体上下文与控件语义唯一匹配。':'缺少可靠的稳定实体或控件键；仅绑定本次DOM实例，重排、刷新或弹窗新生命周期后不继承旧内容。'};
  }
  function validIdentity(identity) {return !!identity&&typeof identity==='object'&&['page_id','state_id','element_id','selector_fingerprint','content_hash'].every(key=>typeof identity[key]==='string'&&/^[a-f0-9]{64}$/.test(identity[key]))&&typeof identity.mapping_confidence==='number'&&identity.mapping_confidence>=0&&identity.mapping_confidence<=1;}
  function identityMatches(left,right,includeContent=false) {return validIdentity(left)&&validIdentity(right)&&['page_id','state_id','element_id','selector_fingerprint',...(includeContent?['content_hash']:[])].every(key=>left[key]===right[key]);}
  function unresolvedRecord(annotation) {return annotation.identity?.match_status==='unresolved';}
  function legacyCompatible(annotation,anchor,identity,node) {
    return !annotation.identity&&['id','data-testid','data-test','data-qa'].includes(anchor.kind)&&!activeModal&&!entityContext(node).length&&annotation.anchor?.kind===anchor.kind&&annotation.anchor?.key===anchor.key&&identity.mapping_confidence===1;
  }

  function safeDestination(node) {
    const href = node.getAttribute('href');
    if (!href) return '';
    if (href.startsWith('#')) return /^#!?\/[A-Za-z0-9_./%~:@-]*$/.test(href.split('?')[0]) ? href.split('?')[0] : (/^#[A-Za-z_][\w-]*$/.test(href) ? href : '页内地址（参数已省略）');
    try {
      const url = new URL(href, location.href);
      if (!['http:', 'https:'].includes(url.protocol)) return `${url.protocol}链接（具体地址已省略）`;
      return url.origin + url.pathname + (url.search || url.hash ? '（参数 / 片段已省略）' : '');
    } catch (_) { return '链接地址待确认'; }
  }

  function observedFor(node, label) {
    const tag = node.tagName.toLowerCase();
    const type = node.getAttribute('type') || node.getAttribute('role') || tag;
    const constraints = [];
    const evidence = [];
    const nativeTypes = { email: '邮箱格式', url: 'URL 格式', number: '数字格式', date: '日期格式', time: '时间格式', 'datetime-local': '本地日期与时间格式', month: '月份格式', week: '周格式', range: '范围选择', color: '颜色选择' };
    if (tag === 'input' && nativeTypes[type]) {
      constraints.push(`HTML 声明 type=${type}（${nativeTypes[type]}；实际提交校验取决于浏览器及表单配置）`);
      evidence.push('type=' + type);
    }
    const add = (attribute, value, explanation) => {
      if (!node.hasAttribute(attribute)) return;
      constraints.push(explanation || `${attribute}：${value}`);
      evidence.push(`${attribute}=${value}`);
    };
    add('required', 'true', '页面声明为必填');
    add('disabled', 'true', '当前为禁用状态');
    add('readonly', 'true', '当前为只读状态');
    for (const attribute of ['min','max','minlength','maxlength','pattern','step','accept','multiple']) {
      if (node.hasAttribute(attribute)) add(attribute, text(node.getAttribute(attribute), 180));
    }
    if (node.getAttribute('aria-disabled') === 'true') { constraints.push('ARIA 声明为禁用状态'); evidence.push('aria-disabled=true'); }
    if (type === 'password') constraints.push('密码输入控件；不读取或保存输入值');
    const fields = {
      content: `可见控件「${label}」；类型：${type}${node.tagName === 'SELECT' ? `；共 ${node.options.length} 个选项（不读取选中值）` : ''}。`,
      function: `待确认：仅从页面识别到${type === 'password' ? '密码输入' : '此'}控件。具体业务效果需依据 PRD、原型说明或经授权验证。`,
      limits: constraints.length ? constraints.join('；') + '。其他业务限制待确认。' : '待确认：页面未声明可识别的必填、长度或范围限制；业务规则需要来源支持。',
      navigation: safeDestination(node) ? `页面声明的链接去向：${safeDestination(node)}${node.target === '_blank' ? '；在新窗口或标签页打开' : ''}。实际权限及到达状态未验证。` : '待确认：页面未声明可直接读取的跳转地址；不根据按钮文字推断去向。'
    };
    const fieldStates = { content: 'observed', function: 'unknown', limits: constraints.length ? 'observed' : 'unknown', navigation: safeDestination(node) ? 'observed' : 'unknown' };
    const evidenceMeta = Object.fromEntries(Object.keys(FIELD_NAMES).map(name => {
      const meta = evidenceRecord(undefined).meta;
      if (fieldStates[name] === 'observed') { meta.level = 'page'; meta.source = '当前DOM'; meta.locator = node.id ? '#' + text(node.id, 180) : text(pathFor(node), 2000); }
      return [name, meta];
    }));
    return { fields, fieldStates, evidenceMeta, evidence: { content: `当前 DOM：${tag}${node.getAttribute('role') ? '，role=' + node.getAttribute('role') : ''}；可访问名称 / 可见标签。未读取输入值。`, function: '无 PRD 或行为验证来源。', limits: evidence.length ? '当前 DOM 属性：' + evidence.join('；') : '未观察到相关 DOM 属性。', navigation: safeDestination(node) ? '当前 DOM 的 href / target；链接中的参数及凭据未保存。' : '未读取到可追溯的 href。' } };
  }

  function scan() {
    if (destroyed) return null;
    identityMutations(mutationObserver?.takeRecords() || []);
    adapterIssues = [];
    try { activeModal = Array.from(document.querySelectorAll('dialog:modal')).pop() || null; }
    catch (_) { activeModal = null; }
    const hostParent = activeModal || document.documentElement;
    if (root.parentElement !== hostParent) hostParent.append(root);
    const switched = switchScope(scopeNow());
    const uiSwitched = switchUIContext();
    const coverageCounts = { frames: 0, canvas: 0, openShadow: 0 };
    const controls = [];
    collectControls(document, controls, coverageCounts);
    const adapter = pageAdapter();
    const adapterContext = { document, isVisible };
    const pageCandidate = adapterCall(adapter, 'getPageTarget', adapterContext);
    const pageDescriptor = validDescriptor(pageCandidate) ? pageCandidate : null;
    if (pageCandidate && !pageDescriptor) adapterIssues.push('站点适配页面目标无效、不可见或不属于当前文档，已跳过。');
    const pageTree = activeModal || document;
    const pageTarget = pageDescriptor?.element || (!adapter ? pageTree.querySelector('h1,[role="heading"][aria-level="1"]') || pageTree.querySelector('main,[role="main"]') || activeModal || document.body : null);
    const entries = [...new Set(controls)].filter(element => element !== pageTarget).map(element => ({ element, isPage: false, descriptor: null }));
    if (pageTarget && isVisible(pageTarget)) entries.unshift({ element: pageTarget, isPage: true, descriptor: pageDescriptor });
    const extraCandidates = adapterCall(adapter, 'getAdditionalTargets', adapterContext);
    const extraSeen = new Set(pageTarget ? [pageTarget] : []);
    if (Array.isArray(extraCandidates)) for (const descriptor of extraCandidates) {
      if (!validDescriptor(descriptor)) { adapterIssues.push('站点适配额外目标无效、不可见或不属于当前文档，已跳过。'); continue; }
      if (extraSeen.has(descriptor.element)) continue;
      extraSeen.add(descriptor.element);
      const existing = entries.find(entry => !entry.isPage && entry.element === descriptor.element);
      if (existing) existing.descriptor = descriptor;
      else entries.push({ element: descriptor.element, isPage: false, descriptor });
    }
    const indexByKey = new Map();
    const seenIds = new Set();
    const previousVisible = new Set(targets.keys());
    resizeObserver?.disconnect();
    targets.clear();
    let changed = switched;
    for (const entry of entries) {
      const node = entry.element;
      const isPage = entry.isPage;
      const descriptor = entry.descriptor;
      let label = descriptor ? text(descriptor.label, 180) : labelOf(node);
      const specific = !descriptor ? adapterCall(adapter, 'describeTarget', node, { isPage, label, document }) : null;
      if (typeof specific?.label === 'string' && specific.label.trim()) label = text(specific.label, 180);
      const pageKey = currentScopeKey + (activeModal ? '|modal:' + (activeModal.id || pathFor(activeModal)) : '');
      const anchor = descriptor ? { kind: 'adapter', key: adapter.id + ':' + descriptor.key, tag: node.tagName.toLowerCase(), type: isPage ? 'page' : descriptor.kind === 'control' ? 'control' : 'content', fingerprint: hash([node.tagName, descriptor.key, label, safeDestination(node)].join('|')) } : isPage ? { kind: 'page', key: pageKey, tag: node.tagName.toLowerCase(), type: 'page', fingerprint: hash(label) } : anchorFor(node, label, indexByKey);
      const duplicateKey=!!descriptor&&entries.filter(item=>item.descriptor?.key===descriptor.key).length>1;
      const identity=identityFor(node,anchor,label,duplicateKey);
      const matches=currentPage.annotations.filter(item=>!unresolvedRecord(item)&&identityMatches(item.identity,identity));
      if(matches.length>1)for(const item of matches){item.identity.match_status='unresolved';item.identity.reason='存在多个相同身份记录，无法唯一匹配；已保留但不绑定。';item.status='needs-review';item.reviewReason=item.identity.reason;}
      let annotation=matches.length===1?matches[0]:null;
      if(!annotation){const legacy=currentPage.annotations.filter(item=>legacyCompatible(item,anchor,identity,node));if(legacy.length===1)annotation=legacy[0];}
      const priorIdentity=annotation?.identity;
      const legacyId='shh-'+hash(anchor.kind+':'+anchor.key);
      let id=annotation?.id || (!currentPage.annotations.some(item=>item.id===legacyId)?legacyId:'shh-'+hash(JSON.stringify([identity.page_id,identity.state_id,identity.element_id])));
      if(!annotation&&currentPage.annotations.some(item=>item.id===id))id='shh-'+hash(id+':'+identitySession+':'+(++identitySequence));
      const observed = observedFor(node, label);
      if (isPage) {
        observed.fields.content = `当前页面 / 弹窗标题：${label}。页面整体业务含义需结合 PRD 或原型说明。`;
        observed.fields.function = '待确认：页面的业务目标、角色权限和入口条件需要有来源的说明。';
        observed.fields.limits = '待确认：页面级权限、数据范围及异常状态需要 PRD、原型或经授权验证。';
        observed.fields.navigation = '待确认：页面入口、返回路径及跳转关系需要有来源的说明。';
        observed.fieldStates = { content: 'observed', function: 'unknown', limits: 'unknown', navigation: 'unknown' };
        for (const name of ['function', 'limits', 'navigation']) observed.evidenceMeta[name] = evidenceRecord(undefined).meta;
      }
      mergeDescription(observed, descriptor?.description || specific, anchor.key);
      const signatures = Object.fromEntries(Object.keys(FIELD_NAMES).map(name => [name, hash(observed.fields[name] + '|' + observed.evidence[name] + '|' + JSON.stringify(observed.evidenceMeta[name]))]));
      if (!annotation) {
        const number = nextNumber++;
        annotation = { id, number, displayId: 'A-' + String(number).padStart(3, '0'), anchor, identity, label, controlType: anchor.type, ...observed, observedSignatures: signatures, manualFields: [], status: identity.mapping_confidence<1 ? 'needs-review' : 'observed', revisions: [], createdAt: new Date().toISOString() };
        if (identity.mapping_confidence<1) annotation.reviewReason = identity.reason;
        if (Object.values(annotation.fieldStates).some(state => ['review', 'conflict'].includes(state))) annotation.status = 'needs-review';
        currentPage.annotations.push(annotation);
        changed = true;
      } else {
        if(!priorIdentity){identity.match_status='legacy-migrated';identity.reason='旧记录仅以当前唯一、无实体上下文的稳定ID迁移。';changed=true;}
        if(priorIdentity&&priorIdentity.content_hash!==identity.content_hash){identity.match_status='content-changed';identity.reason='控件身份仍匹配，但页面内容或约束已变化；保留原说明，需复核。';annotation.status='needs-review';annotation.reviewReason=identity.reason;changed=true;}
        annotation.identity=identity;
        annotation.displayId = annotation.displayId || 'A-' + String(annotation.number).padStart(3, '0');
        annotation.fieldStates = annotation.fieldStates || observed.fieldStates;
        annotation.evidence = annotation.evidence || observed.evidence;
        annotation.revisions = annotation.revisions || [];
        annotation.manualFields = annotation.manualFields || [];
        if (annotation.anchor.fingerprint !== anchor.fingerprint && annotation.status !== 'needs-review') {
          annotation.status = 'needs-review';
          annotation.reviewReason = `控件的标签、类型或地址已变化。原标签：${annotation.label}；当前标签：${label}。请复核现有说明与对象是否仍对应。`;
          changed = true;
        }
        annotation.currentFingerprint = anchor.fingerprint;
        annotation.currentLabel = label;
        for (const name of Object.keys(FIELD_NAMES)) {
          const state = annotation.fieldStates[name];
          if (['observed', 'unknown'].includes(state) && ['page', 'unclassified'].includes(annotation.evidenceMeta[name].level) && !annotation.manualFields.includes(name)) {
            if (annotation.fields[name] !== observed.fields[name] || annotation.evidence[name] !== observed.evidence[name] || state !== observed.fieldStates[name] || JSON.stringify(annotation.evidenceMeta[name]) !== JSON.stringify(observed.evidenceMeta[name])) {
              const sourceChanged = annotation.evidenceMeta[name].source !== '旧版页面记录' && JSON.stringify(annotation.evidenceMeta[name]) !== JSON.stringify(observed.evidenceMeta[name]);
              annotation.fields[name] = observed.fields[name];
              annotation.evidence[name] = observed.evidence[name];
              annotation.fieldStates[name] = observed.fieldStates[name];
              annotation.evidenceMeta[name] = copy(observed.evidenceMeta[name]);
              if (sourceChanged && !['review', 'conflict'].includes(annotation.fieldStates[name])) {
                annotation.fieldStates[name] = 'review';
                annotation.status = 'needs-review';
                annotation.reviewReason = `「${FIELD_NAMES[name]}」的来源分级或来源记录已变化，请复核当前说明。`;
              }
              if (['review', 'conflict'].includes(observed.fieldStates[name])) annotation.status = 'needs-review';
              changed = true;
            }
          } else if (annotation.observedSignatures && annotation.observedSignatures[name] !== signatures[name]) {
            annotation.status = 'needs-review';
            annotation.reviewReason = `「${FIELD_NAMES[name]}」相关的可见信息已变化，现有人工 / 来源说明已保留，请复核。`;
            annotation.fieldReviews = annotation.fieldReviews || {};
            annotation.fieldReviews[name] = observed.fields[name];
            annotation.fieldReviewMeta = annotation.fieldReviewMeta || {};
            annotation.fieldReviewMeta[name] = copy(observed.evidenceMeta[name]);
            changed = true;
          }
        }
        annotation.observedSignatures = signatures;
      }
      const draft = drafts.get(id);
      if (draft) for (const name of Object.keys(FIELD_NAMES)) {
        if (!(draft.touched || []).includes(name)) {
          draft.fields[name] = annotation.fields[name];
          draft.evidence[name] = annotation.evidence[name];
          draft.fieldStates[name] = annotation.fieldStates[name];
          draft.evidenceMeta[name] = copy(annotation.evidenceMeta[name]);
        }
      }
      seenIds.add(id);
      targets.set(id, node);
      if (resizeObserver) resizeObserver.observe(node);
      if (!bubbles.has(id)) {
        const badge = button(String(annotation.number), () => openCard(id), 'bubble');
        badge.setAttribute('data-shh-bubble', id);
        badge.setAttribute('aria-controls', 'shh-card-' + id);
        bubblesLayer.append(badge);
        bubbles.set(id, badge);
      }
      const badge = bubbles.get(id);
      badge.textContent = String(annotation.number);
      badge.setAttribute('aria-label', `${annotation.number}，${label}，打开标注详情`);
      badge.setAttribute('aria-expanded', String(cardIsShown(annotation)));
      badge.classList.toggle('review', annotation.status === 'needs-review');
    }
    for(const annotation of currentPage.annotations)if(!seenIds.has(annotation.id)){
      const uncertain=!validIdentity(annotation.identity)||annotation.identity.mapping_confidence<1;
      if(uncertain&&!unresolvedRecord(annotation)){
        annotation.identity={...(annotation.identity||{}),match_status:'unresolved',reason:'旧记录无法唯一匹配当前控件，已隔离保留；未把人工说明或草稿迁移到新对象。'};
        annotation.status='needs-review';annotation.reviewReason=annotation.identity.reason;changed=true;
      }else if(!unresolvedRecord(annotation)&&annotation.identity.match_status!=='detached'){annotation.identity.match_status='detached';annotation.identity.reason='控件不在当前可见状态，记录保留但未绑定到任何新对象。';changed=true;}
    }
    for (const [id, badge] of bubbles) if (!seenIds.has(id)) { badge.remove(); bubbles.delete(id); badgePlacements.delete(id); }
    const coverage = [
      '只识别当前已呈现的控件；请逐一打开页面、页签、弹窗及折叠区域，新的可见控件会自动补充。',
      '跨域 / 内嵌 iframe、关闭的 Shadow DOM、Canvas 绘制内容和浏览器原生弹层无法保证覆盖；未标注部分需要人工核查。'
    ];
    if (coverageCounts.frames) coverage.push(`当前可见 iframe：${coverageCounts.frames} 个；内部控件未扫描，请在对应框架页面单独运行。`);
    if (coverageCounts.canvas) coverage.push(`当前可见 Canvas：${coverageCounts.canvas} 个；内部绘制控件无法从 DOM 识别。`);
    if (coverageCounts.openShadow) coverage.push(`已扫描 ${coverageCounts.openShadow} 个开放的 Shadow DOM。关闭的 Shadow DOM 不可检测。`);
    if (location.search || location.hash.includes('?') || location.hash && !scopeNow().route) coverage.push('URL 查询参数 / 非路由片段已省略，不写入标注。同路径的查询状态默认共用范围；需要区分时可配置 scopeKey。');
    if (config.scopeKey && !scopeNow().custom) coverage.push('scopeKey 含不允许的字符，未采用。请使用字母、数字、下划线、点、冒号、斜线或连字符，最长 100 字符。');
    const extraCoverage = adapterCall(adapter, 'getCoverage');
    if (Array.isArray(extraCoverage)) coverage.push(...extraCoverage.filter(item => typeof item === 'string').map(item => item.slice(0, 1200)));
    coverage.push(...new Set(adapterIssues));
    if (JSON.stringify(coverage) !== JSON.stringify(currentPage.coverage)) { currentPage.coverage = coverage; changed = true; }
    if (changed) { currentPage.updatedAt = new Date().toISOString(); savePage(); }
    const visibleChanged = previousVisible.size !== seenIds.size || [...seenIds].some(id => !previousVisible.has(id));
    if (changed || visibleChanged || uiSwitched || !panel.firstChild) renderPanel();
    positionBubbles();
    return getSnapshot();
  }

  function positionBubbles() {
    if (destroyed) return;
    if (positionFrame) { cancelAnimationFrame(positionFrame); positionFrame = null; }
    leaders.replaceChildren();
    placementHiddenIds = [];
    const gap = 4;
    const viewport = { left: 2, top: 2, right: Math.min(innerWidth, document.documentElement.clientWidth || innerWidth) - 2, bottom: innerHeight - 2 };
    const obstacles = [];
    const occupied = [];
    const onScreen = rect => rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    const intersects = (a, b, padding = gap) => a.left < b.right + padding && a.right > b.left - padding && a.top < b.bottom + padding && a.bottom > b.top - padding;
    const rectAt = (x, y, width, height) => ({ left: x, top: y, right: x + width, bottom: y + height, width, height });
    const protectPaintedText = target => {
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      let part;
      while ((part = walker.nextNode())) {
        if (part.parentElement?.closest('input,textarea,select,[contenteditable],script,style')) continue;
        if (!part.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(part);
        for (const rect of range.getClientRects()) if (onScreen(rect)) obstacles.push(rect);
      }
    };
    // Protect every rendered application control, including controls intentionally excluded
    // from annotation. The aggregate page annotation is never an obstacle itself.
    const collectObstacles = tree => {
      for (const control of tree.querySelectorAll(SELECTOR)) {
        if (control === root || root.contains(control)) continue;
        const rect = control.getBoundingClientRect();
        if (!onScreen(rect) || !control.getClientRects().length) continue;
        let rendered = true;
        for (let parent = control; parent; parent = composedParent(parent)) {
          const css = getComputedStyle(parent);
          if (parent.hidden || parent.inert || css.display === 'none' || css.visibility !== 'visible' || Number(css.opacity) === 0) { rendered = false; break; }
        }
        if (rendered) obstacles.push(rect);
      }
      // Text beside a small checkbox/radio is part of its readable label. Protect
      // the painted text rectangles without reserving an entire layout-wide label.
      for (const label of tree.querySelectorAll('label')) {
        if (!isVisible(label)) continue;
        protectPaintedText(label);
      }
      for (const host of tree.querySelectorAll('*')) if (host !== root && host.shadowRoot) collectObstacles(host.shadowRoot);
    };
    collectObstacles(activeModal || document);
    // Content annotations must keep adjacent headings and column labels readable.
    // Walk only their mapped text targets, never table/row regions or quote cells.
    const annotationsById = new Map((currentPage?.annotations || []).map(annotation => [annotation.id, annotation]));
    const protectedTargets = new Set();
    for (const [id, target] of targets) {
      const annotation = annotationsById.get(id);
      if (annotation?.anchor.kind !== 'adapter' || !isVisible(target) || protectedTargets.has(target)) continue;
      if (target.matches('table,thead,tbody,tfoot,tr,[role="table"],[role="grid"],[role="row"],[role="rowgroup"]') || target.querySelector('table,[role="table"],[role="grid"]')) continue;
      protectedTargets.add(target);
      protectPaintedText(target);
    }
    if (visible && drawerOpen && !panel.hidden) obstacles.push(panel.getBoundingClientRect());

    // Index rectangles once per layout pass. Every accepted position still checks
    // all nearby controls/text/badges, without scanning the complete page each time.
    const bucketSize = 64;
    const buckets = new Map();
    const forCells = (rect, padding, callback) => {
      const left = Math.floor(Math.max(viewport.left, rect.left - padding) / bucketSize);
      const right = Math.floor(Math.min(viewport.right, rect.right + padding) / bucketSize);
      const top = Math.floor(Math.max(viewport.top, rect.top - padding) / bucketSize);
      const bottom = Math.floor(Math.min(viewport.bottom, rect.bottom + padding) / bucketSize);
      for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) if (callback(x + ':' + y) === false) return false;
      return true;
    };
    const indexRect = rect => forCells(rect, 0, key => {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(rect);
    });
    obstacles.forEach(indexRect);
    const fits = rect => rect.left >= viewport.left && rect.top >= viewport.top && rect.right <= viewport.right && rect.bottom <= viewport.bottom && forCells(rect, gap, key => {
      for (const other of buckets.get(key) || []) if (intersects(rect, other)) return false;
      return true;
    });
    const reserve = rect => { occupied.push(rect); indexRect(rect); };
    const freePools = new Map();

    function freeSlots(width, height) {
      const poolKey = width + ':' + height;
      if (freePools.has(poolKey)) return freePools.get(poolKey);
      const slots = [];
      const seen = new Set();
      let checks = 0;
      const maxChecks = 4096;
      const add = (x, y) => {
        if (checks >= maxChecks) return;
        const key = x.toFixed(2) + ':' + y.toFixed(2);
        if (seen.has(key)) return;
        seen.add(key); checks++;
        const rect = rectAt(x, y, width, height);
        if (fits(rect)) slots.push(rect);
      };
      add(viewport.left, viewport.top);
      add(viewport.right - width, viewport.top);
      add(viewport.left, viewport.bottom - height);
      add(viewport.right - width, viewport.bottom - height);
      // Boundary neighbours help tight gaps; a bounded viewport grid supplies
      // shared fallback slots. Never form a Cartesian product of all page edges.
      for (const rect of obstacles.concat(occupied)) {
        if (checks >= 1024) break;
        add(rect.left - width - gap, rect.top);
        add(rect.right + gap, rect.top);
        add(rect.left, rect.top - height - gap);
        add(rect.right - width, rect.top - height - gap);
        add(rect.left, rect.bottom + gap);
        add(rect.right - width, rect.bottom + gap);
      }
      const area = Math.max(1, (viewport.right - viewport.left) * (viewport.bottom - viewport.top));
      const coarseStep = Math.ceil(Math.sqrt(area / 3000));
      const stepX = Math.max(width + gap, coarseStep);
      const stepY = Math.max(height + gap, coarseStep);
      for (let y = viewport.top; y <= viewport.bottom - height && checks < maxChecks; y += stepY) {
        for (let x = viewport.left; x <= viewport.right - width && checks < maxChecks; x += stepX) add(x, y);
      }
      freePools.set(poolKey, slots);
      return slots;
    }

    function findSpace(width, height, anchor, candidates) {
      const clamp = (x, y) => rectAt(Math.max(viewport.left, Math.min(viewport.right - width, x)), Math.max(viewport.top, Math.min(viewport.bottom - height, y)), width, height);
      for (const [x, y] of candidates) {
        const rect = clamp(x, y);
        if (fits(rect)) return rect;
      }
      const distance = rect => {
        const x = rect.left + width / 2, y = rect.top + height / 2;
        const targetX = Math.max(anchor.left, Math.min(anchor.right, x));
        const targetY = Math.max(anchor.top, Math.min(anchor.bottom, y));
        return (x - targetX) ** 2 + (y - targetY) ** 2;
      };
      let best = null;
      let bestDistance = Infinity;
      for (const rect of freeSlots(width, height)) {
        const score = distance(rect);
        if (score < bestDistance && fits(rect)) { best = rect; bestDistance = score; }
      }
      return best;
    }

    // The compact drawer / full-overlay reopen controls also avoid business fields.
    for (const entry of [drawerLauncher, chip]) {
      if (entry.hidden) continue;
      const width = entry.offsetWidth, height = entry.offsetHeight;
      const anchor = rectAt(viewport.right - width - 16, viewport.bottom - height - 16, width, height);
      const placement = findSpace(width, height, anchor, [[anchor.left, anchor.top], [viewport.right - width - 16, viewport.top + 16], [viewport.left + 16, viewport.bottom - height - 16]]);
      if (placement) {
        entry.style.left = placement.left + 'px'; entry.style.top = placement.top + 'px';
        entry.style.right = 'auto'; entry.style.bottom = 'auto';
        reserve(placement);
      }
    }

    for (const [id, badge] of bubbles) {
      const node = targets.get(id);
      if (!node || !node.isConnected) { badge.hidden = true; continue; }
      const rect = node.getBoundingClientRect();
      const shown = visible && onScreen(rect) && isVisible(node);
      badge.hidden = !shown;
      if (!shown) continue;
      const width = badge.offsetWidth, height = badge.offsetHeight;
      const previous = badgePlacements.get(id);
      const nearby = [
        [rect.right + gap, rect.top + (rect.height - height) / 2],
        [rect.right - width, rect.top - height - gap],
        [rect.left, rect.top - height - gap],
        [rect.left - width - gap, rect.top + (rect.height - height) / 2],
        [rect.right - width, rect.bottom + gap],
        [rect.left, rect.bottom + gap]
      ];
      if (previous && previous.width === width && previous.height === height) nearby.unshift([previous.left + rect.left - previous.targetLeft, previous.top + rect.top - previous.targetTop]);
      const placement = findSpace(width, height, rect, nearby);
      if (!placement) {
        badge.hidden = true;
        badge.setAttribute('data-shh-placement', 'no-safe-space');
        placementHiddenIds.push(id);
        continue;
      }
      badge.removeAttribute('data-shh-placement');
      reserve(placement);
      badgePlacements.set(id, { left: placement.left, top: placement.top, width, height, targetLeft: rect.left, targetTop: rect.top });
      badge.style.left = placement.left + 'px';
      badge.style.top = placement.top + 'px';
      const centerX = placement.left + width / 2, centerY = placement.top + height / 2;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(centerX));
      line.setAttribute('y1', String(centerY));
      line.setAttribute('x2', String(Math.max(rect.left, Math.min(rect.right, centerX))));
      line.setAttribute('y2', String(Math.max(rect.top, Math.min(rect.bottom, centerY))));
      leaders.append(line);
    }
    renderQuality();
  }

  function schedulePosition() {
    if (positionFrame) return;
    positionFrame = requestAnimationFrame(() => { positionFrame = null; positionBubbles(); });
  }

  function applyDrawerVisibility() {
    panel.hidden = !visible || !drawerOpen;
    drawerLauncher.hidden = !visible || drawerOpen;
    drawerLauncher.setAttribute('aria-expanded', String(drawerOpen));
    chip.hidden = visible;
  }

  function toggleDrawer(value) {
    if (destroyed) return false;
    drawerOpen = typeof value === 'boolean' ? value : !drawerOpen;
    applyDrawerVisibility();
    positionBubbles();
    return drawerOpen;
  }

  function onResize() {
    const nextNarrow = innerWidth <= DRAWER_BREAKPOINT;
    if (nextNarrow && !narrow) drawerOpen = false;
    narrow = nextNarrow;
    applyDrawerVisibility();
    schedulePosition();
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 160);
  }

  function openCard(id) {
    const annotation = currentPage.annotations.find(item => item.id === id);
    if (!annotation || !targets.has(id)&&!unresolvedRecord(annotation)) return;
    if(unresolvedRecord(annotation))reviewOnly=true;
    if (reviewOnly && !reviewDetails(annotation).pending) {
      reviewOnly = false;
      reviewCursor = '';
      catalogQuery = '';
      catalogFilter = 'all';
      noticeText = '此项没有待确认或冲突信息，已切换为查看全部标注。原草稿继续保留。';
    }
    if (reviewDetails(annotation).pending) reviewCursor = id;
    opened.add(id);
    catalogOpen = reviewOnly;
    drawerOpen = true;
    renderPanel();
    const card = shadow.getElementById('shh-card-' + id);
    if (card) { card.scrollIntoView({ block: 'nearest' }); card.focus({ preventScroll: true }); }
    bubbles.get(id)?.setAttribute('aria-expanded', 'true');
    positionBubbles();
    savePage();
  }

  function closeCard(id) {
    opened.delete(id);
    if (![...opened].some(openId => targets.has(openId))) catalogOpen = true;
    if (narrow && !reviewOnly && ![...opened].some(openId => targets.has(openId))) drawerOpen = false;
    renderPanel();
    positionBubbles();
    bubbles.get(id)?.setAttribute('aria-expanded', 'false');
    bubbles.get(id)?.focus({ preventScroll: true });
    savePage();
  }

  function draftFor(annotation) {
    if (!drafts.has(annotation.id)) drafts.set(annotation.id, { fields: copy(annotation.fields), evidence: copy(annotation.evidence), evidenceMeta: copy(annotation.evidenceMeta), fieldStates: copy(annotation.fieldStates), touched: [], stateTouched: [], acceptedSuggestions: [], dirty: false, saveError: '' });
    return drafts.get(annotation.id);
  }

  function makeField(annotation, draft, name) {
    const field = el('div', 'field');
    const bar = el('div', 'fieldbar');
    const label = el('label', '', FIELD_NAMES[name]);
    label.htmlFor = annotation.id + '-' + name;
    const state = el('select', 'state');
    state.setAttribute('aria-label', FIELD_NAMES[name] + '的证据状态');
    state.setAttribute('data-shh-state', name);
    Object.entries(STATE_NAMES).forEach(([value, title]) => { const option = el('option', '', title); option.value = value; state.append(option); });
    state.value = draft.fieldStates[name] || 'unknown';
    state.addEventListener('change', () => {
      draft.fieldStates[name] = state.value;
      if (draft.evidenceMeta[name].level === 'guess' && !['conflict', 'review'].includes(state.value)) draft.fieldStates[name] = 'unknown';
      draft.stateTouched = [...new Set([...(draft.stateTouched || []), name])];
      dirty();
    });
    bar.append(label, state);
    const input = el('textarea');
    input.id = label.htmlFor;
    input.setAttribute('data-shh-field', name);
    input.value = draft.fields[name] || '';
    input.setAttribute('aria-label', FIELD_NAMES[name]);
    input.addEventListener('input', () => {
      draft.fields[name] = input.value;
      if (!['conflict', 'review'].includes(draft.fieldStates[name])) draft.fieldStates[name] = draft.evidenceMeta[name].level === 'tested' ? 'review' : draft.evidenceMeta[name].level === 'guess' ? 'unknown' : 'user';
      state.value = draft.fieldStates[name];
      dirty();
    });
    const evidenceLabel = el('label', 'evidence-label', '来源 / 证据（请写明 PRD 段落、原型页或验证过程）');
    evidenceLabel.htmlFor = annotation.id + '-evidence-' + name;
    const evidence = el('textarea', 'evidence');
    evidence.id = evidenceLabel.htmlFor;
    evidence.setAttribute('data-shh-evidence', name);
    evidence.setAttribute('aria-label', FIELD_NAMES[name] + '的来源证据');
    evidence.rows = 1;
    evidence.value = draft.evidence[name] || '';
    evidence.addEventListener('input', () => { draft.evidence[name] = evidence.value; dirty(); });
    const evidenceDetails = el('details', 'evidence-details');
    evidenceDetails.setAttribute('data-shh-evidence-details', name);
    const evidenceKey = currentUIKey + ':' + annotation.id + ':' + name;
    evidenceDetails.open = expandedEvidence.has(evidenceKey);
    evidenceDetails.addEventListener('toggle', () => {
      if (evidenceDetails.open) expandedEvidence.add(evidenceKey); else expandedEvidence.delete(evidenceKey);
    });
    evidenceDetails.append(el('summary', '', '来源依据与状态说明'), evidenceLabel, evidence);
    const levelRow = el('div', 'level-row');
    const badge = el('span', 'level-badge');
    badge.setAttribute('data-shh-level', name);
    const currentState = el('span', 'level-state');
    levelRow.append(badge, currentState);
    const hint = el('p', 'level-hint');
    const structured = el('div', 'provenance-grid');
    const levelLabel = el('label', '', '证据来源等级');
    const level = el('select');
    level.id = annotation.id + '-level-' + name;
    level.setAttribute('data-shh-level-select', name);
    level.setAttribute('aria-label', FIELD_NAMES[name] + '的来源等级');
    Object.entries(LEVEL_NAMES).forEach(([value, title]) => { const option = el('option', '', title); option.value = value; level.append(option); });
    level.value = draft.evidenceMeta[name].level;
    levelLabel.append(level);
    structured.append(levelLabel);
    const testedInputs = [];
    for (const [key, title] of Object.entries(PROVENANCE_NAMES)) {
      const wrapper = el('label', '', title);
      const provenance = el('input');
      provenance.type = 'text';
      provenance.id = annotation.id + '-provenance-' + name + '-' + key;
      provenance.setAttribute('data-shh-provenance', name + ':' + key);
      provenance.setAttribute('aria-label', FIELD_NAMES[name] + '的' + title);
      provenance.maxLength = key === 'observedAt' ? 50 : ['action', 'result'].includes(key) ? 3000 : 2000;
      provenance.value = draft.evidenceMeta[name][key];
      provenance.placeholder = key === 'observedAt' ? '2026-10-27T09:00:00.000Z' : key === 'locator' ? '如 #email、PRD §3.2 或验证记录条目' : '';
      provenance.addEventListener('input', () => { draft.evidenceMeta[name][key] = provenance.value; dirty(); });
      wrapper.append(provenance); structured.append(wrapper);
      if (['action', 'result', 'observedAt'].includes(key)) testedInputs.push(wrapper);
    }
    const derivationLabel = el('label', '', 'PRD 依据类型');
    const derivation = el('select');
    derivation.id = annotation.id + '-derivation-' + name;
    derivation.setAttribute('data-shh-derivation', name);
    derivation.setAttribute('aria-label', FIELD_NAMES[name] + '的 PRD 依据类型');
    for (const [value, title] of [['explicit', '直接定义'], ['inferred', '推断']]) { const option = el('option', '', title); option.value = value; derivation.append(option); }
    derivation.value = draft.evidenceMeta[name].derivation;
    derivation.addEventListener('change', () => { draft.evidenceMeta[name].derivation = derivation.value; dirty(); });
    derivationLabel.append(derivation); structured.append(derivationLabel);
    level.addEventListener('change', () => {
      draft.evidenceMeta[name].level = level.value;
      if (level.value === 'guess' && !['conflict', 'review'].includes(draft.fieldStates[name])) draft.fieldStates[name] = 'unknown';
      dirty();
    });
    evidenceDetails.append(structured, el('p', 'level-hint', '等级表示来源方法，系统仅检查记录完整性，不认证其真实性。同一字段混合多种来源时请选择最弱等级，并在来源说明中逐条注明；未验证部分应标为猜测或未分级。'));
    if (['conflict', 'review'].includes(draft.fieldStates[name])) evidenceDetails.append(el('p', 'muted', '编辑文字不会自动解除冲突或待复核。核对后，请在字段状态中明确选择。'));
    field.append(bar, levelRow, input, hint, evidenceDetails);
    if (annotation.fieldReviews && annotation.fieldReviews[name]) field.append(el('p', 'review-note', '当前页面观察' + (annotation.fieldReviewMeta?.[name] ? '（' + evidenceLabelFor(annotation.fieldReviewMeta[name]) + '）' : '') + '：' + annotation.fieldReviews[name]));
    if (annotation.suggestions && annotation.suggestions[name]) {
      const suggestion = annotation.suggestions[name];
      const review = el('div', 'review-note');
      review.append(el('div', '', '导入的不同建议（人工修改已保留）：' + suggestion.value), el('div', 'muted', '建议证据：' + suggestion.evidence), el('div', 'muted', '建议分级：' + evidenceLabelFor(suggestion.evidenceMeta)));
      const actions = el('div', 'row');
      actions.append(button('采用建议为草稿', () => {
        draft.fields[name] = suggestion.value;
        draft.evidence[name] = suggestion.evidence;
        draft.evidenceMeta[name] = copy(suggestion.evidenceMeta || evidenceRecord(undefined).meta);
        draft.fieldStates[name] = suggestion.fieldState;
        draft.touched = [...new Set([...(draft.touched || []), name])];
        draft.acceptedSuggestions = [...new Set([...(draft.acceptedSuggestions || []), name])];
        draft.dirty = true;
        renderPanel();
      }), button('保留人工版本', () => {
        const previousSuggestion = annotation.suggestions[name];
        delete annotation.suggestions[name];
        if (!savePage()) {
          annotation.suggestions[name] = previousSuggestion;
          setNotice('尚未保存“保留人工版本”的决定；原建议与来源记录仍保留，请恢复存储后重试。');
        }
        renderPanel();
      }));
      review.append((draft.acceptedSuggestions || []).includes(name) ? el('p', 'muted', '建议已纳入未保存草稿；保存成功后生效，撤销或保存失败仍保留原建议。') : actions);
      field.append(review);
    }
    function dirty() {
      draft.dirty = true;
      draft.saveError = '';
      draft.touched = [...new Set([...(draft.touched || []), name])];
      const card = shadow.querySelector('[data-shh-card="' + annotation.id + '"]');
      if (card) card.querySelector('.save-status').textContent = '有未保存修改';
      refreshEvidenceUI();
      renderQuality();
      cacheUIState();
    }
    function refreshEvidenceUI() {
      const meta = draft.evidenceMeta[name];
      const incomplete = evidenceRecord(meta).issues;
      badge.textContent = evidenceLabelFor(meta) + (incomplete.length ? ' · 草稿待补全' : '');
      badge.setAttribute('data-level', meta.level);
      currentState.textContent = '状态：' + STATE_NAMES[draft.fieldStates[name]] + (['supported','observed'].includes(draft.fieldStates[name]) && claimIssues(annotation,name).length ? ' · 结论待复核' : '');
      state.value = draft.fieldStates[name];
      testedInputs.forEach(wrapper => { wrapper.hidden = meta.level !== 'tested'; });
      derivationLabel.hidden = meta.level !== 'prd';
      hint.className = 'level-hint' + (incomplete.length || meta.level === 'guess' || meta.level === 'tested' && ['review', 'conflict'].includes(draft.fieldStates[name]) ? ' warning' : '');
      hint.textContent = incomplete.length ? '来源记录未完整 / 未保存，缺少：' + incomplete.join('、') + '。请补齐后保存。' : meta.level === 'guess' ? '未验证的模型猜测，不能作为正式业务规则；仍需确认。' : meta.level === 'tested' && ['review', 'conflict'].includes(draft.fieldStates[name]) ? '已保留原实测记录；当前说明存在冲突或需复核，旧验证不自动证明修改后的文字。' : meta.level === 'unclassified' ? '尚无可分级的结构化来源，请补充记录。' : '';
      hint.hidden = !hint.textContent;
    }
    refreshEvidenceUI();
    const claimNote=el('p','level-hint',claimIssues(annotation,name).length?'结论关联待复核：'+claimIssues(annotation,name).join('；')+'。':'结论已关联来源记录；文件与实际事实仍须独立核验。');
    claimNote.setAttribute('data-shh-claim-status',name);evidenceDetails.append(claimNote);
    return field;
  }

  function revisionOf(annotation, action) {
    return { at: new Date().toISOString(), action, fields: copy(annotation.fields), evidence: copy(annotation.evidence || {}), evidenceMeta: copy(annotation.evidenceMeta || {}), claimRecords: copy(annotation.claimRecords || {}), claimSources: copy(annotation.claimSources || {}), fieldStates: copy(annotation.fieldStates || {}), status: annotation.status, anchor: copy(annotation.anchor), identity: copy(annotation.identity || null) };
  }

  const CLAIM_KINDS = {DOM_OBSERVED:['visible_content','dom_constraint','declared_destination'],INTERACTION_VERIFIED:['observed_behavior','permission_outcome','observed_effect'],DOCUMENT_SUPPORTED:['specification'],INFERRED:[],UNKNOWN:[]};
  function claimIssues(annotation, name) {
    const claims=annotation.claimRecords?.[name], sources=annotation.claimSources||{}, value=annotation.fields?.[name]||'';
    if(!Array.isArray(claims)||!claims.length)return ['尚未建立逐条结论与来源的关联'];
    const problems=[];
    if(claims.map(c=>c?.text||'').join('')!==value)problems.push('结论未完整覆盖当前文字');
    for(const claim of claims){
      if(!claim||typeof claim.text!=='string'||claim.textSha256!==digest(claim.text))problems.push('结论文字已变化');
      if(!CLAIM_KINDS[claim?.type]?.includes(claim?.kind))problems.push('证据类型不能支持此结论');
      if(claim?.controlFingerprint!==annotation.identity?.selector_fingerprint)problems.push('结论与控件身份不一致');
      if(claim?.type==='DOCUMENT_SUPPORTED'&&(claim.scope!=='specification'||claim.derivation!=='explicit')||claim?.type==='INTERACTION_VERIFIED'&&claim.scope!=='observed_session')problems.push('结论超出证据作用范围或并非文档直接定义');
      if(!Array.isArray(claim?.sourceRefs)||!claim.sourceRefs.length||claim.sourceRefs.some(ref=>!sources[ref]||sources[ref].type!==claim.type||!sources[ref].locator||!sources[ref].path||!/^[a-f0-9]{64}$/.test(sources[ref].sha256||'')))problems.push('来源记录不完整');
    }
    return [...new Set(problems)];
  }

  function saveAnnotation(id, confirmTarget = false) {
    const annotation = currentPage.annotations.find(a => a.id === id);
    const draft = drafts.get(id);
    if (!annotation || !draft) return;
    if(confirmTarget&&(!targets.has(id)||unresolvedRecord(annotation))){setNotice('此历史记录尚未唯一绑定当前控件，不能通过确认按钮建立对应关系。');return;}
    if (draft.dirty || confirmTarget) {
      const normalizedMeta = {};
      const issues = [];
      for (const name of Object.keys(FIELD_NAMES)) {
        const normalized = evidenceRecord(draft.evidenceMeta[name]);
        normalizedMeta[name] = normalized.meta;
        if (normalized.issues.length) issues.push(`${FIELD_NAMES[name]}：请补充${normalized.issues.join('、')}`);
      }
      if (issues.length) {
        draft.dirty = true;
        draft.saveError = '未保存，草稿已保留。' + issues.join('；') + '。';
        renderPanel();
        return;
      }
      const previous = copy(annotation);
      const previousPageTime = currentPage.updatedAt;
      annotation.revisions.push(revisionOf(annotation, confirmTarget ? '确认当前控件并保存' : '人工保存前版本'));
      annotation.fields = copy(draft.fields);
      annotation.evidence = copy(draft.evidence);
      for (const name of Object.keys(FIELD_NAMES)) {
        if (normalizedMeta[name].level === 'guess' && !['conflict', 'review'].includes(draft.fieldStates[name])) draft.fieldStates[name] = 'unknown';
        const oldMeta = annotation.evidenceMeta[name];
        if (oldMeta.level === 'tested' && normalizedMeta[name].level === 'tested' && previous.fields[name] !== draft.fields[name] && ['action', 'result', 'observedAt'].every(key => oldMeta[key] === normalizedMeta[name][key]) && draft.fieldStates[name] !== 'conflict') draft.fieldStates[name] = 'review';
      }
      annotation.evidenceMeta = copy(normalizedMeta);
      draft.evidenceMeta = copy(normalizedMeta);
      annotation.fieldStates = copy(draft.fieldStates);
      for(const name of Object.keys(FIELD_NAMES)) if(previous.fields[name]!==annotation.fields[name]&&annotation.claimRecords?.[name]?.length&&claimIssues(annotation,name).length&&annotation.fieldStates[name]!=='conflict') annotation.fieldStates[name]='review';
      for(const name of Object.keys(FIELD_NAMES)) if(['supported','observed'].includes(annotation.fieldStates[name])&&((draft.touched||[]).includes(name)||(draft.stateTouched||[]).includes(name))&&claimIssues(annotation,name).length) annotation.fieldStates[name]='review';
      annotation.manualFields = [...new Set([...(annotation.manualFields || []), ...(draft.touched || [])])];
      for (const name of draft.acceptedSuggestions || []) if (annotation.suggestions) delete annotation.suggestions[name];
      for (const name of draft.stateTouched || []) {
        if (!['conflict', 'review'].includes(annotation.fieldStates[name]) && annotation.fieldReviews) delete annotation.fieldReviews[name];
      }
      if (confirmTarget) {
        annotation.anchor.fingerprint = annotation.currentFingerprint || annotation.anchor.fingerprint;
        annotation.label = annotation.currentLabel || annotation.label;
        delete annotation.reviewReason;
      }
      const unresolved = unresolvedRecord(annotation) || Object.values(annotation.fieldStates).some(value => ['conflict', 'review'].includes(value)) || Object.keys(annotation.suggestions || {}).length > 0;
      const changedTarget = annotation.currentFingerprint && annotation.anchor.fingerprint !== annotation.currentFingerprint;
      const observedReviews = Object.keys(annotation.fieldReviews || {}).length > 0;
      if (unresolved) {
        annotation.status = 'needs-review';
        annotation.reviewReason = annotation.reviewReason || '仍有字段冲突、待复核或待处理建议。核对后，请显式选择字段状态或处理建议。';
      } else if (confirmTarget || annotation.status !== 'needs-review' || (draft.stateTouched?.length && !changedTarget && !observedReviews)) {
        annotation.status = 'enriched';
        delete annotation.reviewReason;
      }
      annotation.updatedAt = new Date().toISOString();
      currentPage.updatedAt = annotation.updatedAt;
      if (savePage()) {
        draft.fieldStates = copy(annotation.fieldStates);
        draft.dirty = false;
        draft.saveError = '';
        draft.stateTouched = [];
        draft.acceptedSuggestions = [];
      } else {
        currentPage.annotations[currentPage.annotations.findIndex(item => item.id === id)] = previous;
        currentPage.updatedAt = previousPageTime;
        draft.dirty = true;
        draft.saveError = '尚未写入本浏览器；草稿仍在，请重试保存。';
      }
    }
    renderPanel();
  }

  function renderCard(annotation) {
    const draft = draftFor(annotation);
    const card = el('section', 'card');
    card.id = 'shh-card-' + annotation.id;
    card.tabIndex = -1;
    card.setAttribute('data-shh-card', annotation.id);
    const head = el('div', 'cardhead');
    const title = el('div', 'cardtitle');
    title.append(el('strong', '', annotation.currentLabel || annotation.label), el('span', 'tag', `${annotation.controlType} · ${targets.has(annotation.id) ? '当前页面可见' : '当前状态不可见'} · ${annotation.status === 'needs-review' ? '需复核' : annotation.status === 'enriched' ? '已补充说明' : '自动识别'}`));
    const close = button('×', () => closeCard(annotation.id), 'icon');
    close.setAttribute('aria-label', `关闭 ${annotation.number} 号详情`);
    close.setAttribute('data-shh-close', annotation.id);
    const identifier = el('span', 'num', annotation.displayId || annotation.number);
    identifier.style.minWidth = '45px';
    head.append(identifier, title, close);
    card.append(head);
    const identityNote=el('p','review-note',unresolvedRecord(annotation)?'未绑定历史记录：保留原说明与修订，不会显示在任何新控件上。':`身份匹配：${annotation.identity?.match_status||'未登记'} · 匹配置信度 ${Math.round((annotation.identity?.mapping_confidence||0)*100)}%（不表示说明正确率）`);
    identityNote.setAttribute('data-shh-identity',annotation.id);if(unresolvedRecord(annotation))card.append(identityNote);
    const identityDetails=el('details','history');identityDetails.setAttribute('data-shh-identity-details',annotation.id);identityDetails.append(el('summary','','查看控件身份与匹配依据'));
    if(!unresolvedRecord(annotation))identityDetails.append(identityNote);
    for(const key of ['page_id','state_id','element_id','selector_fingerprint','content_hash','mapping_confidence','match_status','reason']){const line=el('p','',key+'：'+(annotation.identity?.[key]??'未登记'));line.style.overflowWrap='anywhere';identityDetails.append(line);}card.append(identityDetails);
    if (reviewOnly && draft.dirty && !reviewDetails(annotation).pending) {
      const retained = el('p', 'review-note', '未保存草稿暂留。保存或撤销后，将按筛选条件收起此详情。');
      retained.setAttribute('data-shh-retained-draft', annotation.id);
      card.append(retained);
    }
    if (annotation.status === 'needs-review') card.append(el('p', 'review-note', annotation.reviewReason || '控件已变化，请核对标注与当前对象是否仍对应。'));
    for (const name of Object.keys(FIELD_NAMES)) card.append(makeField(annotation, draft, name));
    const foot = el('div', 'cardfoot');
    const saveStatus = el('span', 'save-status' + (draft.saveError ? ' error' : ''), draft.saveError || (draft.dirty ? '有未保存修改' : storageWarning ? '会话记录 · 本地保存尚未确认' : `已保存 · ${annotation.revisions.length} 次修订`));
    saveStatus.setAttribute('role', 'status');
    saveStatus.setAttribute('aria-live', 'polite');
    foot.append(saveStatus);
    const save = button(draft.saveError ? '重试保存' : '保存修改', () => saveAnnotation(annotation.id), 'btn primary');
    save.setAttribute('data-shh-save', annotation.id);
    foot.append(save);
    if (annotation.status === 'needs-review'&&targets.has(annotation.id)&&!unresolvedRecord(annotation)) foot.append(button('确认当前控件', () => saveAnnotation(annotation.id, true)));
    if (draft.dirty) foot.append(button('撤销未保存修改', () => { drafts.delete(annotation.id); renderPanel(); }));
    card.append(foot);
    if (annotation.revisions.length) {
      const history = el('details', 'history');
      history.append(el('summary', '', '查看已保存的历史版本（可从 JSON 恢复）'));
      const list = el('ol');
      annotation.revisions.slice().reverse().forEach(revision => {
        const item = el('li', '', `${revision.at} · ${revision.action}\n${Object.entries(FIELD_NAMES).map(([key, title]) => title + '：' + (revision.fields[key] || '')).join('\n')}`);
        list.append(item);
      });
      history.append(list);
      card.append(history);
    }
    return card;
  }

  function renderTransfer() {
    const box = el('section', 'transfer');
    box.append(el('h3', '', transferMode === 'export' ? '导出可编辑标注 JSON' : '导入有来源的补充说明'), el('p', '', transferMode === 'export' ? '包含本次运行中已缓存的页面记录、说明、证据与修订历史。整页跳转前的其他页面不一定包含在内；未保存草稿不包含在内，请先保存。' : '仅合并当前 origin / path / route / scopeKey 的同一控件。导入前请保存当前草稿；其他范围不会覆盖当前页面。'));
    const area = el('textarea', 'jsonbox');
    area.setAttribute('data-shh-transfer', transferMode);
    area.setAttribute('aria-label', transferMode === 'export' ? '导出标注 JSON' : '待导入的标注 JSON');
    area.value = transferValue;
    area.readOnly = transferMode === 'export';
    area.addEventListener('input', () => { transferValue = area.value; });
    box.append(area);
    const row = el('div', 'row');
    if (transferMode === 'export') {
      row.append(button('复制 JSON', async () => {
        try { await navigator.clipboard.writeText(area.value); setNotice('已复制标注 JSON。'); }
        catch (_) { area.focus(); area.select(); setNotice('请复制已选中的 JSON。'); }
      }));
      row.append(button('下载 JSON', () => {
        const url = URL.createObjectURL(new Blob([area.value], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'strike-her-heart-annotations.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }));
    } else row.append(button('合并导入', () => {
      try { const result = importData(area.value); setNotice(`已导入 ${result.updated} 条标注；忽略 ${result.skipped} 条不匹配记录。`); }
      catch (error) { setNotice('导入失败：' + error.message); }
    }, 'btn primary'));
    row.append(button('关闭', () => { transferMode = ''; renderPanel(); }));
    box.append(row);
    return box;
  }

  function setNotice(value) {
    noticeText = value;
    const status = shadow.querySelector('.status');
    if (status) status.textContent = value;
  }

  // Review membership is deliberately based on saved records. Choosing a new
  // state in a draft must not make the item disappear before save succeeds.
  function reviewDetails(annotation) {
    const reasons = [];
    let conflict = false;
    let review = annotation.status === 'needs-review';
    for (const [name, label] of Object.entries(FIELD_NAMES)) {
      const state = annotation.fieldStates?.[name];
      if (['unknown', 'conflict', 'review'].includes(state)) reasons.push(label + '：' + STATE_NAMES[state]);
      if (state === 'conflict') conflict = true;
      if (state === 'review') review = true;
      if (annotation.suggestions?.[name]) { reasons.push(label + '：有待处理建议'); review = true; }
      if (annotation.fieldReviews?.[name]) { reasons.push(label + '：页面信息变化待核对'); review = true; }
    }
    if (Object.keys(annotation.suggestions || {}).length || Object.keys(annotation.fieldReviews || {}).length) review = true;
    if (annotation.status === 'needs-review') reasons.push(annotation.reviewReason || '控件对应关系需复核');
    if (review && !reasons.length) reasons.push('有待核对的来源或建议');
    return { pending: conflict || review || reasons.length > 0, priority: conflict ? 0 : review ? 1 : 2, reasons };
  }

  function pendingAnnotations() {
    return (currentPage?.annotations || []).filter(annotation => (targets.has(annotation.id)||unresolvedRecord(annotation)) && reviewDetails(annotation).pending)
      .sort((a, b) => reviewDetails(a).priority - reviewDetails(b).priority || a.number - b.number);
  }

  function cardIsShown(annotation) {
    return !!annotation && (targets.has(annotation.id)||reviewOnly&&unresolvedRecord(annotation)) && opened.has(annotation.id) && (!reviewOnly || reviewDetails(annotation).pending || !!drafts.get(annotation.id)?.dirty);
  }

  function shownAnnotations() {
    return [...opened].map(id => currentPage?.annotations.find(annotation => annotation.id === id)).filter(cardIsShown);
  }

  function reviewQueueSnapshot() {
    const pending = pendingAnnotations();
    const shown = shownAnnotations();
    return {
      enabled: reviewOnly, pendingIds: pending.map(annotation => annotation.id), count: pending.length,
      retainedDraftIds: reviewOnly ? shown.filter(annotation => !reviewDetails(annotation).pending && drafts.get(annotation.id)?.dirty).map(annotation => annotation.id) : [],
      visibleCardIds: shown.map(annotation => annotation.id)
    };
  }

  function setReviewOnly(value) {
    reviewOnly = !!value;
    reviewCursor = '';
    catalogQuery = '';
    catalogFilter = 'all';
    catalogOpen = true;
    noticeText = '';
    cacheUIState();
    renderPanel();
  }

  function openNextReview() {
    if (!reviewOnly) setReviewOnly(true);
    const queue = matchingCatalogAnnotations();
    if (!queue.length) return;
    const index = queue.findIndex(annotation => annotation.id === reviewCursor);
    const next = queue[(index + 1) % queue.length];
    targets.get(next.id)?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    openCard(next.id);
  }

  function matchingCatalogAnnotations() {
    const query = catalogQuery.trim().toLowerCase();
    const numeric = /^(?:a-?)?0*(\d+)$/i.exec(query);
    const requestedNumber = numeric ? Number(numeric[1]) : null;
    const current = reviewOnly ? pendingAnnotations() : currentPage.annotations.filter(annotation => targets.has(annotation.id));
    return current.filter(annotation => {
      const flags = annotationFlags(annotation, !reviewOnly);
      const stateMatches = catalogFilter === 'all' || !!flags[catalogFilter];
      const label = (annotation.currentLabel || annotation.label).toLowerCase();
      const textMatches = !query || (requestedNumber > 0 ? annotation.number === requestedNumber : label.includes(query) || (annotation.displayId || '').toLowerCase().includes(query));
      return stateMatches && textMatches;
    });
  }

  function annotationFlags(annotation, useDraft = true) {
    const draft = drafts.get(annotation.id);
    const states = Object.values((useDraft && draft?.fieldStates) || annotation.fieldStates || {});
    const levels = Object.values((useDraft && draft?.evidenceMeta) || annotation.evidenceMeta || {}).map(meta => meta.level);
    return {
      ...Object.fromEntries(Object.keys(LEVEL_NAMES).map(level => [level, levels.includes(level)])),
      unknown: states.includes('unknown'),
      review: annotation.status === 'needs-review' || states.some(value => ['conflict', 'review'].includes(value)) || Object.keys(annotation.suggestions || {}).length > 0 || Object.keys(annotation.fieldReviews || {}).length > 0,
      manual: !!(annotation.manualFields?.length || draft?.touched?.length || states.includes('user')),
      dirty: !!draft?.dirty
    };
  }

  function qualitySnapshot() {
    const counts = { total: 0, unknown: 0, review: 0, manual: 0, dirty: 0, hidden: placementHiddenIds.filter(id => targets.has(id)).length };
    for (const annotation of currentPage?.annotations || []) {
      if (!targets.has(annotation.id)) continue;
      counts.total++;
      const flags = annotationFlags(annotation);
      for (const key of ['unknown', 'review', 'manual', 'dirty']) if (flags[key]) counts[key]++;
    }
    return counts;
  }

  function renderQuality() {
    const node = shadow.querySelector('[data-shh-quality]');
    if (!node) return;
    const q = qualitySnapshot();
    const openedCount = [...opened].filter(id => targets.has(id)).length;
    const line = `当前呈现范围 ${q.total} 项 · 已开 ${openedCount}${reviewOnly ? ' · 当前展示 ' + shownAnnotations().length : ''} · 未保存 ${q.dirty}\n待确认 ${q.unknown} · 待复核 ${q.review} · 人工修改 ${q.manual}${q.hidden ? ' · 气泡暂藏 ' + q.hidden : ''}`;
    if (node.textContent !== line) node.textContent = line;
    const queueCount = shadow.querySelector('[data-shh-review-count]');
    if (queueCount) queueCount.textContent = '当前范围待处理 ' + pendingAnnotations().length + ' 项';
    const next = shadow.querySelector('[data-shh-review-next]');
    if (next) next.disabled = (reviewOnly ? matchingCatalogAnnotations() : pendingAnnotations()).length === 0;
    if (refreshCatalog) refreshCatalog();
    const summary = shadow.querySelector('[data-shh-evidence-summary]');
    if (summary) {
      const levels = evidenceSummary();
      summary.textContent = '当前字段：' + Object.entries(LEVEL_NAMES).map(([level, title]) => title + ' ' + levels[level]).join(' · ');
    }
  }

  function evidenceSummary() {
    const counts = Object.fromEntries(Object.keys(LEVEL_NAMES).map(level => [level, 0]));
    for (const annotation of currentPage?.annotations || []) {
      if (!targets.has(annotation.id)) continue;
      const meta = drafts.get(annotation.id)?.evidenceMeta || annotation.evidenceMeta;
      for (const name of Object.keys(FIELD_NAMES)) counts[hasOwn(LEVEL_NAMES, meta?.[name]?.level) ? meta[name].level : 'unclassified']++;
    }
    return counts;
  }

  function renderCatalog() {
    const box = el('section', 'catalog-box');
    box.setAttribute('aria-label', reviewOnly ? '当前呈现范围待复核队列' : '当前呈现范围标注目录');
    box.setAttribute('data-shh-catalog', '');
    if (reviewOnly) {
      box.setAttribute('data-shh-review-queue', '');
      box.append(el('h3', 'queue-title', '待复核队列'), el('p', 'scope-note', '按已保存状态统计，保存后更新。先处理冲突，再处理复核与待确认。'));
    }
    const tools = el('div', 'catalog-tools');
    const search = el('input', 'catalog-search');
    search.type = 'search';
    search.id = 'shh-catalog-search';
    search.setAttribute('data-shh-search', '');
    search.setAttribute('aria-label', '按编号或名称查找标注');
    search.placeholder = '编号或名称，如 A-009 / 9';
    search.value = catalogQuery;
    const filter = el('select', 'catalog-filter');
    filter.id = 'shh-catalog-filter';
    filter.setAttribute('data-shh-filter', '');
    filter.setAttribute('aria-label', '按标注状态或证据等级筛选');
    for (const [value, title] of [['all', '全部状态'], ['unknown', '待确认'], ['review', '冲突 / 待复核'], ['manual', '人工修改'], ...Object.entries(LEVEL_NAMES)]) {
      const option = el('option', '', title); option.value = value; filter.append(option);
    }
    filter.value = catalogFilter;
    tools.append(search, filter);
    const list = el('div', 'catalog');
    const count = el('p', 'catalog-count');
    const update = () => {
      list.replaceChildren();
      const current = currentPage.annotations.filter(annotation => targets.has(annotation.id));
      const matching = matchingCatalogAnnotations();
      for (const annotation of matching) {
        const flags = annotationFlags(annotation, !reviewOnly);
        const item = button('', () => {
          targets.get(annotation.id)?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
          openCard(annotation.id);
        });
        item.setAttribute('data-shh-catalog-item', annotation.id);
        const content = el('span', 'catalog-text');
        content.append(el('span', 'label', annotation.currentLabel || annotation.label));
        const status = [flags.unknown && '待确认', flags.review && '待复核', flags.manual && '人工修改', flags.dirty && '未保存', placementHiddenIds.includes(annotation.id) && '气泡暂藏'].filter(Boolean).join(' · ');
        if (status) content.append(el('span', 'catalog-meta', status));
        if (reviewOnly) {
          const reason = el('span', 'queue-reasons', reviewDetails(annotation).reasons.join('；'));
          reason.setAttribute('data-shh-review-reasons', annotation.id);
          reason.title = reason.textContent;
          content.append(reason);
        }
        item.append(el('span', 'num', annotation.displayId || annotation.number), content, el('span', 'muted', '定位'));
        list.append(item);
      }
      if (!matching.length) list.append(el('p', 'catalog-empty', reviewOnly && !pendingAnnotations().length ? '当前呈现范围没有待确认或冲突项。' : '当前筛选没有匹配项。可清空名称或切换状态筛选。'));
      count.textContent = reviewOnly ? `显示 ${matching.length} / ${pendingAnnotations().length} 项待复核；仅当前呈现范围，未访问或未展开状态不计入。` : `显示 ${matching.length} / ${current.length} 项；未访问页面、未展开状态不计入。`;
      const next = shadow.querySelector('[data-shh-review-next]');
      if (next && reviewOnly) next.disabled = matching.length === 0;
    };
    search.addEventListener('input', () => { catalogQuery = search.value; update(); cacheUIState(); });
    filter.addEventListener('change', () => { catalogFilter = filter.value; update(); cacheUIState(); });
    refreshCatalog = update;
    box.append(tools, list, count);
    update();
    return box;
  }

  function renderPanel() {
    if (!currentPage || destroyed) return;
    const scroll = panel.querySelector('.body')?.scrollTop || 0;
    const focused = shadow.activeElement;
    const focusId = focused && focused.id;
    const selection = focused && focused.tagName === 'TEXTAREA' ? [focused.selectionStart, focused.selectionEnd] : null;
    refreshCatalog = null;
    panel.replaceChildren();
    applyDrawerVisibility();
    const head = el('header', 'head');
    const brand = el('div', 'brand');
    const hide = button('−', () => toggle(false), 'icon');
    hide.setAttribute('aria-label', '隐藏全部标注，保留重新打开入口');
    hide.setAttribute('data-shh-toggle', 'off');
    const collapse = button('›', () => { toggleDrawer(false); drawerLauncher.focus({ preventScroll: true }); }, 'icon');
    collapse.setAttribute('aria-label', '收起详情面板，保留页面编号气泡');
    collapse.setAttribute('data-shh-drawer', 'close');
    collapse.setAttribute('aria-controls', panel.id);
    brand.append(el('span', 'heart', '♡'), el('strong', '', 'Strike Her Heart'), collapse, hide);
    head.append(brand, el('p', 'sub', '在原页面标注 · 编号定位 · 多条详情 · 可编辑'));
    const row = el('div', 'row');
    const stats = el('span', 'stats');
    stats.style.whiteSpace = 'pre-line';
    stats.setAttribute('data-shh-quality', '');
    row.append(stats);
    head.append(row);
    head.append(el('p', 'scope-note', '仅此页当前呈现状态；未访问或未展开范围不代表已完成。'));
    const reviewTools = el('div', 'review-tools');
    const reviewLabel = el('label', 'review-toggle');
    const reviewInput = el('input');
    reviewInput.type = 'checkbox';
    reviewInput.id = 'shh-review-only';
    reviewInput.setAttribute('data-shh-review-only', '');
    reviewInput.checked = reviewOnly;
    reviewInput.addEventListener('change', () => setReviewOnly(reviewInput.checked));
    reviewLabel.append(reviewInput, el('span', '', '只看待确认／冲突项'));
    const queueCount = el('span', 'queue-count');
    queueCount.setAttribute('data-shh-review-count', '');
    const nextReview = button('下一项待复核', openNextReview);
    nextReview.setAttribute('data-shh-review-next', '');
    reviewTools.append(reviewLabel, queueCount, nextReview);
    head.append(reviewTools);
    const actions = el('div', 'row');
    actions.style.marginTop = '10px';
    actions.append(button('重新识别', () => { scan(); setNotice('已重新识别当前可见控件。'); }), button('导出', () => { transferMode = 'export'; transferValue = JSON.stringify(exportData(), null, 2); renderPanel(); }), button('导入', () => { transferMode = 'import'; transferValue = ''; renderPanel(); }));
    const catalogToggle = button(catalogOpen ? (reviewOnly ? '收起复核队列' : '收起目录') : (reviewOnly ? '打开复核队列' : '查找标注'), () => {
      catalogOpen = !catalogOpen;
      cacheUIState();
      renderPanel();
      if (catalogOpen) shadow.getElementById('shh-catalog-search')?.focus({ preventScroll: true });
    });
    catalogToggle.setAttribute('data-shh-catalog-toggle', '');
    catalogToggle.setAttribute('aria-expanded', String(catalogOpen));
    actions.prepend(catalogToggle);
    if (opened.size) actions.append(button('关闭全部详情', () => { opened.clear(); catalogOpen = true; renderPanel(); bubbles.forEach(b => b.setAttribute('aria-expanded', 'false')); savePage(); }));
    head.append(actions);
    const body = el('div', 'body');
    const coverage = el('details', 'notice');
    coverage.append(el('summary', '', '覆盖范围与待确认信息'));
    const items = el('ul', 'coverage');
    currentPage.coverage.forEach(item => items.append(el('li', '', item)));
    coverage.append(items);
    body.append(coverage);
    const summary = el('p', 'evidence-summary');
    summary.setAttribute('data-shh-evidence-summary', '');
    const legend = el('details', 'level-legend');
    legend.append(el('summary', '', '证据分级说明：L1 → L2 → L3 → L4'), el('p', '', 'L1：记录了操作、结果和时间；L2：页面 / DOM 或源码的明确声明；L3：PRD 直接定义或有来源的推断；L4：未验证的模型猜测。未分级表示缺少可分级记录。来源方法不等于真实性认证，冲突及待复核状态独立保留。'));
    body.append(summary, legend);
    if (storageWarning) body.append(el('p', 'notice', storageWarning));
    if (transferMode) body.append(renderTransfer());
    if (catalogOpen) body.append(renderCatalog());
    const openedAnnotations = shownAnnotations();
    for (const annotation of openedAnnotations) body.append(renderCard(annotation));
    if (!openedAnnotations.length) {
      const empty = el('div', 'empty');
      if (reviewOnly) empty.append(el('b', '', pendingAnnotations().length ? '选择一项开始复核' : '当前队列为空'), el('p', '', '可从复核队列或“下一项待复核”打开详情。'), el('p', '', '取消筛选可恢复其他已打开详情，原草稿保留。'));
      else empty.append(el('b', '', '点击页面上的编号气泡'), el('p', '', '每个气泡对应一个可见控件。'), el('p', '', '可同时打开多条说明，在右侧逐项修改与保存。'));
      body.append(empty);
    }
    const status = el('div', 'status', noticeText);
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const footer = el('footer', 'footer', '修改仅保存于本浏览器。请勿在说明中填写密码或敏感输入值。');
    panel.append(head, status, body, footer);
    renderQuality();
    body.scrollTop = scroll;
    if (focusId) {
      const replacement = shadow.getElementById(focusId);
      if (replacement) {
        replacement.focus({ preventScroll: true });
        if (selection) replacement.setSelectionRange(...selection);
      }
    }
    const shownIds = new Set(openedAnnotations.map(annotation => annotation.id));
    bubbles.forEach((badge, id) => badge.setAttribute('aria-expanded', String(shownIds.has(id))));
    schedulePosition();
  }

  function exportData() {
    savePage();
    return copy({ schemaVersion: VERSION, agent: 'Strike Her Heart', exportedAt: new Date().toISOString(), pages: [...pageCache.values()] });
  }

  function retainUnmatched(incoming,reason) {
    if(!incoming.fields||typeof incoming.fields!=='object')return false;
    const key=hash(JSON.stringify([incoming.id,incoming.identity,incoming.anchor,incoming.fields]));
    if(currentPage.annotations.some(item=>item.importKey===key))return false;
    const number=nextNumber++,anchor={kind:text(incoming.anchor?.kind||'unresolved',40),key:text(incoming.anchor?.key||'unresolved',2000),tag:text(incoming.anchor?.tag||'',30),type:text(incoming.anchor?.type||'',30),fingerprint:text(incoming.anchor?.fingerprint||'',100)};
    const annotation={id:'shh-'+hash('unresolved:'+key),number,displayId:'A-'+String(number).padStart(3,'0'),anchor,identity:{...(validIdentity(incoming.identity)?copy(incoming.identity):{}),match_status:'unresolved',reason},label:text(incoming.label||'未匹配的导入记录',180),controlType:text(incoming.controlType||anchor.type||'历史记录',40),fields:{},evidence:{},fieldStates:{},evidenceMeta:{},manualFields:listManual(incoming.manualFields),status:'needs-review',reviewReason:reason,revisions:[],importKey:key,createdAt:new Date().toISOString()};
    for(const name of Object.keys(FIELD_NAMES)){annotation.fields[name]=typeof incoming.fields[name]==='string'?incoming.fields[name].slice(0,12000):'';annotation.evidence[name]=typeof incoming.evidence?.[name]==='string'?incoming.evidence[name].slice(0,12000):'';annotation.fieldStates[name]=hasOwn(STATE_NAMES,incoming.fieldStates?.[name])?incoming.fieldStates[name]:'unknown';annotation.evidenceMeta[name]=incoming.evidenceMeta?.[name];}
    normalizeAnnotationEvidence(annotation);currentPage.annotations.push(annotation);return true;
  }
  function listManual(value){return Array.isArray(value)?[...new Set(value.filter(name=>hasOwn(FIELD_NAMES,name)))]:[];}

  function importData(data) {
    if (destroyed) throw new Error('标注已销毁，请重新运行。');
    if (typeof data === 'string') {
      if (data.length > 10 * 1024 * 1024) throw new Error('JSON 超过 10 MB，请分批导入。');
      data = JSON.parse(data);
    }
    if (!data || data.schemaVersion !== VERSION || !Array.isArray(data.pages)) throw new Error('需要 schemaVersion:1 和 pages 数组。');
    const dirty = [...drafts.values()].some(draft => draft.dirty);
    if (dirty) throw new Error('当前有未保存草稿，请先保存或撤销，避免导入覆盖草稿。');
    const previousPage = copy(currentPage);
    const previousDrafts = new Map(drafts);
    const previousNumber = nextNumber;
    let updated = 0;
    let skipped = 0;
    let retained = 0;
    const candidates=data.pages.filter(page=>page&&sameScope(page.scope,currentPage.scope)&&Array.isArray(page.annotations)).flatMap(page=>page.annotations).filter(item=>item&&typeof item==='object');
    const identityKey=item=>validIdentity(item.identity)?JSON.stringify(['page_id','state_id','element_id','selector_fingerprint','content_hash'].map(key=>item.identity[key])):JSON.stringify(['legacy',item.id,item.anchor?.kind,item.anchor?.key]);
    const frequencies=new Map();for(const incoming of candidates){const key=identityKey(incoming);frequencies.set(key,(frequencies.get(key)||0)+1);}
    for (const page of data.pages) {
      if (!page || !Array.isArray(page.annotations)) continue;
      if (!sameScope(page.scope, currentPage.scope)) { skipped += page.annotations.length; continue; }
      for (const incoming of page.annotations) {
        if (!incoming || typeof incoming !== 'object') { skipped++; continue; }
        const matches=currentPage.annotations.filter(annotation=>!unresolvedRecord(annotation)&&(validIdentity(incoming.identity)?identityMatches(annotation.identity,incoming.identity,true):!incoming.identity&&targets.has(annotation.id)&&legacyCompatible(incoming,annotation.anchor,annotation.identity,targets.get(annotation.id))&&incoming.anchor?.fingerprint===(annotation.currentFingerprint||annotation.anchor.fingerprint)));
        const collision=currentPage.annotations.some(annotation=>annotation.id===incoming.id&&!matches.includes(annotation));
        const target=matches.length===1&&!collision&&frequencies.get(identityKey(incoming))===1?matches[0]:null;
        if (!target) { skipped++;if(retainUnmatched(incoming,'导入身份缺失、不唯一或与当前页面、状态、实体、内容摘要不一致；原文已隔离保留，未覆盖当前控件。'))retained++;continue; }
        if (!incoming.fields || typeof incoming.fields !== 'object') { skipped++; continue; }
        if (Array.isArray(incoming.revisions)) {
          const existing = new Set(target.revisions.map(revision => JSON.stringify(revision)));
          for (const revision of incoming.revisions) {
            if (!revision || !revision.fields || typeof revision.fields !== 'object') continue;
            const restored = { at: text(revision.at, 40), action: text(revision.action, 100), fields: {}, evidence: {}, fieldStates: {}, evidenceMeta: {}, claimRecords: copy(revision.claimRecords || {}), claimSources: copy(revision.claimSources || {}), status: text(revision.status, 40), anchor: copy(target.anchor), identity:validIdentity(revision.identity)?copy(revision.identity):null };
            for (const name of Object.keys(FIELD_NAMES)) {
              restored.fields[name] = typeof revision.fields[name] === 'string' ? revision.fields[name].slice(0, 12000) : '';
              restored.evidence[name] = revision.evidence && typeof revision.evidence[name] === 'string' ? revision.evidence[name].slice(0, 12000) : '';
              restored.fieldStates[name] = revision.fieldStates && hasOwn(STATE_NAMES, revision.fieldStates[name]) ? revision.fieldStates[name] : 'unknown';
              const normalized = normalizeEvidence(revision.evidenceMeta?.[name], restored.fieldStates[name], target.anchor.key);
              restored.evidenceMeta[name] = normalized.meta;
              restored.fieldStates[name] = normalized.state;
            }
            const signature = JSON.stringify(restored);
            if (!existing.has(signature)) { target.revisions.push(restored); existing.add(signature); }
          }
        }
        target.revisions.push(revisionOf(target, '导入合并前版本'));
        let protectedConflict = false;
        for (const name of Object.keys(FIELD_NAMES)) {
          const incomingValue = typeof incoming.fields[name] === 'string' ? incoming.fields[name].slice(0, 12000) : target.fields[name];
          let incomingEvidence = target.evidence[name];
          if (incoming.evidence && hasOwn(incoming.evidence, name)) {
            const refs = incoming.evidence[name];
            if (typeof refs === 'string') incomingEvidence = refs.slice(0, 12000);
            else if (Array.isArray(refs) && refs.every(ref => typeof ref === 'string')) incomingEvidence = refs.join('\n').slice(0, 12000);
          }
          const incomingState = incoming.fieldStates && incoming.fieldStates[name];
          let state = incomingState && hasOwn(STATE_NAMES, incomingState) ? incomingState : incomingValue !== target.fields[name] ? 'review' : target.fieldStates[name];
          const changedText = incomingValue !== target.fields[name] || incomingEvidence !== target.evidence[name];
          const hasMeta = !!incoming.evidenceMeta && hasOwn(incoming.evidenceMeta, name);
          const normalized = hasMeta || changedText || hasOwn(STATE_NAMES, incomingState) ? normalizeEvidence(incoming.evidenceMeta?.[name], hasOwn(STATE_NAMES, incomingState) ? incomingState : 'unknown', target.anchor.key) : { meta: copy(target.evidenceMeta[name]), state, issues: [] };
          const metaChanged = JSON.stringify(normalized.meta) !== JSON.stringify(target.evidenceMeta[name]);
          const reusedObservation = target.evidenceMeta[name].level === 'tested' && normalized.meta.level === 'tested' && incomingValue !== target.fields[name] && ['action', 'result', 'observedAt'].every(key => target.evidenceMeta[name][key] === normalized.meta[key]);
          state = normalized.issues.length || normalized.meta.level === 'guess' ? normalized.state : state;
          if (target.fieldStates[name] === 'conflict') state = 'conflict';
          else if ((normalized.meta.level === 'guess' && target.fieldStates[name] === 'review') || (metaChanged && !changedText) || reusedObservation) state = 'review';
          const manuallyOwned = target.fieldStates[name] === 'user' || (target.manualFields || []).includes(name);
          if (manuallyOwned && (changedText || metaChanged || state !== target.fieldStates[name])) {
            target.suggestions = target.suggestions || {};
            target.suggestions[name] = { value: incomingValue, evidence: incomingEvidence, evidenceMeta: normalized.meta, fieldState: state, receivedAt: new Date().toISOString() };
            protectedConflict = true;
            continue;
          }
          if (!manuallyOwned) {
            target.fields[name] = incomingValue;
            target.evidence[name] = incomingEvidence;
            target.fieldStates[name] = state;
            target.evidenceMeta[name] = normalized.meta;
            if (normalized.issues.length || ['review', 'conflict'].includes(state)) {
              target.status = 'needs-review';
              target.reviewReason = normalized.issues.length ? `「${FIELD_NAMES[name]}」的来源记录不完整，已降为未分级：${normalized.issues.join('、')}。` : '字段来源或内容发生变化，仍有冲突或需复核；原记录保留在修订历史。';
            }
          }
        }
        if(!protectedConflict && incoming.claimRecords && incoming.claimSources){
          target.claimRecords=copy(incoming.claimRecords);target.claimSources=copy(incoming.claimSources);
        }
        const beforeImport=target.revisions[target.revisions.length-1];
        for(const name of Object.keys(FIELD_NAMES)) if(claimIssues(target,name).length&&(target.fieldStates[name]==='supported'||name!=='content'&&target.fieldStates[name]==='observed'&&(beforeImport?.fields?.[name]!==target.fields[name]||beforeImport?.fieldStates?.[name]!=='observed'))){target.fieldStates[name]='review';target.status='needs-review';target.reviewReason='结论与来源未通过结构核对，请复核。';}
        // A document from a prior UI version cannot silently certify the current control.
        if (incoming.anchor && incoming.anchor.fingerprint && incoming.anchor.fingerprint !== (target.currentFingerprint || target.anchor.fingerprint)) {
          target.status = 'needs-review';
          target.reviewReason = '导入记录与当前控件指纹不同，请复核对象及说明。';
        } else if (protectedConflict) {
          target.status = 'needs-review';
          target.reviewReason = '导入内容与已保存的人工字段不同。人工内容、证据及状态已保留；不同建议已单独列出，请逐项决定。';
        } else if (target.status !== 'needs-review') target.status = 'enriched';
        target.updatedAt = new Date().toISOString();
        if (Array.isArray(incoming.manualFields)) target.manualFields = [...new Set([...(target.manualFields || []), ...incoming.manualFields.filter(name => hasOwn(FIELD_NAMES, name))])];
        drafts.delete(target.id);
        updated++;
      }
    }
    currentPage.updatedAt = new Date().toISOString();
    if (!savePage()) {
      currentPage = previousPage;
      drafts = previousDrafts;
      nextNumber = previousNumber;
      pageCache.set(currentScopeKey, currentPage);
      cacheUIState();
      renderPanel();
      throw new Error('导入未保存：本浏览器写入失败，已恢复导入前的说明、来源分级、修订和建议。请恢复存储后重试。');
    }
    renderPanel();
    return { updated, skipped, retained };
  }

  function getSnapshot() {
    if (!currentPage) return null;
    return copy({ ...currentPage, currentControlIds: [...targets.keys()], ui: { openedIds: [...opened].filter(id => targets.has(id)), visible, drawerOpen, narrow, placementHiddenIds: [...placementHiddenIds], dirtyIds: [...drafts].filter(([id, draft]) => draft.dirty && targets.has(id)).map(([id]) => id), quality: qualitySnapshot(), evidenceSummary: evidenceSummary(), reviewQueue: reviewQueueSnapshot(), catalogOpen, storageAvailable: !storageWarning } });
  }

  function getQueueSnapshot({pageId,stateKey}={}) {
    if(destroyed||!currentPage)throw new Error('标注未运行。');
    if(typeof pageId!=='string'||!/^P-\d+$/.test(pageId)||typeof stateKey!=='string'||!stateKey.trim()||stateKey.length>200)throw new Error('需要任务登记的 pageId（P-编号）与非空 stateKey。');
    const controls=[];
    for(const [id,target] of targets){const annotation=currentPage.annotations.find(item=>item.id===id);if(!isVisible(target)||!validIdentity(annotation?.identity)||unresolvedRecord(annotation))continue;controls.push({id:annotation.displayId,fingerprint:annotation.identity.selector_fingerprint,contentHash:annotation.identity.content_hash});}
    return {pageId,url:location.origin+location.pathname,stateKey,pageFingerprint:digest(JSON.stringify([digest(currentScopeKey),currentStateId])),controls:controls.sort((a,b)=>a.id.localeCompare(b.id))};
  }

  function getVerificationSnapshot({pageId,stateKey}={}) {
    scan();
    const queue=getQueueSnapshot({pageId,stateKey});
    let persisted=null;
    try { persisted=JSON.parse(localStorage.getItem(STORE_PREFIX+hash(currentScopeKey))||'null'); } catch (_) { /* unavailable storage */ }
    const ids=[...targets.keys()];
    return {pageId,stateKey,url:queue.url,sessionId:identitySession,controls:currentPage.annotations.filter(a=>ids.includes(a.id)).map(copy),
      persisted: persisted&&sameScope(persisted.scope,currentPage.scope)?persisted.annotations:null,
      dirtyIds:[...drafts].filter(([id,draft])=>draft.dirty&&ids.includes(id)).map(([id])=>id),
      storageAvailable:!storageWarning&&Array.isArray(persisted?.annotations),coverage:copy(currentPage.coverage||[])};
  }

  // This gateway exposes only owned annotation operations. It never dispatches
  // business-form submission, deletion, approval, messaging or arbitrary clicks.
  function savedPageMatches() {
    try { return JSON.stringify(JSON.parse(localStorage.getItem(STORE_PREFIX+hash(currentScopeKey))||'null'))===JSON.stringify(currentPage); } catch (_) { return false; }
  }
  function performAction(request) {
    if(!request||typeof request!=='object')throw new Error('操作请求无效。');
    if(request.action==='read_snapshot')return {allowed:true,category:'read_only',verified:true,result:getSnapshot()};
    if(request.action==='scan_controls'){const result=scan();return {allowed:true,category:'annotation_write',verified:!storageWarning&&savedPageMatches(),result};}
    if(request.action==='write_annotations'){
      const data=request.data;
      if(!data||!Array.isArray(data.pages))throw new Error('标注写入需要完整数据。');
      if(data.pages.some(page=>!page||!sameScope(page.scope,currentPage.scope)||!Array.isArray(page.annotations)))throw new Error('写入范围与当前页面不一致。');
      const incoming=data.pages.flatMap(page=>sameScope(page.scope,currentPage.scope)&&Array.isArray(page.annotations)?page.annotations:[]);
      const keys=incoming.map(item=>JSON.stringify(['page_id','state_id','element_id','selector_fingerprint','content_hash'].map(key=>item?.identity?.[key])));
      if(!incoming.length||new Set(keys).size!==keys.length||incoming.some(item=>!item?.fields||!validIdentity(item?.identity)||currentPage.annotations.filter(a=>targets.has(a.id)&&identityMatches(a.identity,item.identity,true)).length!==1))throw new Error('标注身份未通过唯一匹配，拒绝写入。');
      const result=importData(data);
      if(result.skipped)throw new Error('部分记录未匹配；请检查原页后复核。');
      const verified=savedPageMatches();
      return {allowed:true,category:'annotation_write',verified,result,reason:verified?'':'写入后读取的数据不一致，需复核和重试。'};
    }
    return {allowed:false,category:['expand_readonly','open_details'].includes(request.action)?'low_risk':'high_risk',verified:false,reason:'当前执行器不支持此操作；业务提交、删除、审批、发送及任意点击默认拒绝。'};
  }

  function toggle(value) {
    if (destroyed) return false;
    visible = typeof value === 'boolean' ? value : !visible;
    applyDrawerVisibility();
    positionBubbles();
    return visible;
  }

  function onMutations(records) {
    if (records.every(record => record.target === root || root.contains(record.target))) return;
    identityMutations(records);
    scheduleScan();
  }

  function destroy() {
    if (destroyed) return;
    savePage();
    destroyed = true;
    clearTimeout(scanTimer);
    if (positionFrame) cancelAnimationFrame(positionFrame);
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    removeEventListener('resize', onResize);
    removeEventListener('scroll', schedulePosition, true);
    removeEventListener('hashchange', scheduleScan);
    removeEventListener('popstate', scheduleScan);
    document.removeEventListener('click', scheduleScan, true);
    document.removeEventListener('change', scheduleScan, true);
    if (history.pushState === patchedPush) history.pushState = originalPush;
    if (history.replaceState === patchedReplace) history.replaceState = originalReplace;
    root.remove();
    if (window.StrikeHerHeart === api) delete window.StrikeHerHeart;
  }

  const originalPush = history.pushState;
  const originalReplace = history.replaceState;
  function patchedPush(...args) { const result = Reflect.apply(originalPush, this, args); scheduleScan(); return result; }
  function patchedReplace(...args) { const result = Reflect.apply(originalReplace, this, args); scheduleScan(); return result; }
  history.pushState = patchedPush;
  history.replaceState = patchedReplace;
  const api = { __runtime: true, version: VERSION, scan, exportData, importData, getSnapshot, getQueueSnapshot, getVerificationSnapshot, performAction, toggle, toggleDrawer, destroy };
  window.StrikeHerHeart = api;
  mutationObserver = new MutationObserver(onMutations);
  if (typeof ResizeObserver !== 'undefined') resizeObserver = new ResizeObserver(schedulePosition);
  addEventListener('resize', onResize);
  addEventListener('scroll', schedulePosition, true);
  addEventListener('hashchange', scheduleScan);
  addEventListener('popstate', scheduleScan);
  document.addEventListener('click', scheduleScan, true);
  document.addEventListener('change', scheduleScan, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan, { once: true });
  else scan();
})();
