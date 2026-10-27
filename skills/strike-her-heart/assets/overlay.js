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
    *,*:before,*:after{box-sizing:border-box} button,input,textarea,select{font:inherit} button{cursor:pointer}button:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid #bda1ff;outline-offset:2px}
    .leaders{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}.leaders line{stroke:#6d38d4;stroke-width:1.5;stroke-dasharray:3 2;opacity:.72}.bubble{position:fixed;pointer-events:auto;min-width:25px;height:25px;padding:0 5px;border:2px solid white;border-radius:20px;background:#6d38d4;color:white;box-shadow:0 2px 8px #29134a40;font-size:11px;font-weight:750;line-height:21px;z-index:1;transition:background .1s}
    .bubble:hover,.bubble[aria-expanded=true]{background:#bd377c;box-shadow:0 0 0 3px #e8d9ff}.bubble.review{background:#b55d0a}.bubble:disabled{pointer-events:none}
    .panel{pointer-events:auto;position:fixed;right:14px;top:14px;bottom:14px;width:min(390px,calc(100vw - 28px));background:#fbfaff;border:1px solid #e3dced;border-radius:18px;box-shadow:0 10px 48px #31204430;display:flex;flex-direction:column;overflow:hidden;z-index:3}
    .head{padding:18px 18px 13px;border-bottom:1px solid #e8e1ef;background:linear-gradient(120deg,#f4edff,#fff6fb)}.brand{display:flex;align-items:center;gap:8px}.heart{font-size:21px;color:#a83b7b}.brand strong{font-size:17px;letter-spacing:-.3px;flex:1}.sub{margin:4px 0 12px;color:#756882;font-size:11px}.drawer-launcher{position:fixed;right:18px;bottom:18px;pointer-events:auto;border:1px solid #d9c6ee;background:#fff;color:#6836a2;padding:9px 12px;border-radius:24px;box-shadow:0 3px 15px #3f1f6328;font-size:12px;font-weight:650;z-index:3;white-space:nowrap}
    .row{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.btn{border:1px solid #dbd0e7;border-radius:8px;background:white;color:#5e3a7c;padding:5px 9px;font-size:12px;line-height:1.5}.btn:hover{background:#f0e7ff}.btn.primary{background:#6d38d4;color:white;border-color:#6d38d4}.icon{border:0;background:transparent;padding:3px 7px;color:#726180;border-radius:6px;font-size:17px}.icon:hover{background:#e9dff4}
    .stats{font-size:12px;color:#645773}.stats strong{color:#6436a3;font-size:18px}.body{overflow:auto;overscroll-behavior:contain;flex:1;padding:12px}.notice{border:1px solid #eadcc6;background:#fff9ed;color:#7c5c28;border-radius:9px;padding:9px 11px;font-size:11px;margin:0 0 10px;white-space:pre-line}.notice summary{cursor:pointer;font-weight:650}.coverage{margin:6px 0 0;padding-left:16px}.empty{padding:22px 13px;text-align:center;color:#82748e}.empty b{display:block;color:#5d4478;font-size:15px;margin-bottom:7px}.empty p{margin:5px 0}.catalog{margin-top:16px;text-align:left}.catalog button{display:flex;gap:8px;align-items:center;width:100%;border:0;border-bottom:1px solid #ede6f4;background:transparent;padding:8px 0;text-align:left;color:#58446b}.catalog button:hover{color:#7a35b7}.num{display:inline-flex;align-items:center;justify-content:center;flex:none;min-width:23px;height:23px;border-radius:20px;background:#efe4ff;color:#723bb8;font-weight:700;font-size:11px}.catalog .label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.muted{font-size:11px;color:#8d7b99}
    .card{background:white;border:1px solid #e5d9ef;border-radius:12px;margin-bottom:12px;padding:12px;box-shadow:0 2px 6px #40206005}.card:focus{outline:2px solid #caa5f2;outline-offset:2px}.cardhead{display:flex;gap:8px;align-items:flex-start}.cardtitle{min-width:0;flex:1}.cardtitle strong{display:block;overflow-wrap:anywhere;font-size:14px}.tag{font-size:10px;color:#8e719e}.review-note{margin:9px 0;padding:7px 9px;border-radius:7px;background:#fff5dd;color:#895807;font-size:11px}.field{margin-top:12px}.fieldbar{display:flex;gap:7px;justify-content:space-between;align-items:center;margin-bottom:4px}.fieldbar label{font-weight:650;font-size:12px}.state{font-size:10px;border:0;color:#796089;background:#f5effa;border-radius:5px;padding:2px 4px;max-width:125px}.field textarea{width:100%;min-height:60px;resize:vertical;border:1px solid #dfd4e9;border-radius:7px;padding:7px 8px;color:#382644;background:#fff;font-size:12px;line-height:1.5}.field .evidence{min-height:33px;background:#faf8fc;color:#7b6689;font-size:10px;margin-top:4px}.field .evidence-label{font-size:10px;color:#8c7898;margin-top:4px}.cardfoot{margin-top:11px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}.save-status{color:#8b7697;font-size:10px;flex:1}.history{font-size:11px;color:#8b729d;margin-top:9px}.history summary{cursor:pointer}.history ol{padding-left:20px}.history li{margin-top:6px;overflow-wrap:anywhere;white-space:pre-wrap}.footer{padding:9px 14px;border-top:1px solid #e8e1ef;background:white;color:#9a86a7;font-size:10px}.status{padding:7px 12px;color:#603b7f;background:#f1e7ff;font-size:11px;white-space:pre-line}.status:empty{display:none}.chip{position:fixed;right:18px;bottom:18px;pointer-events:auto;border:1px solid #e0c7f8;background:#6d38d4;color:white;padding:10px 15px;border-radius:30px;box-shadow:0 4px 15px #3f1f6340;font-weight:650;z-index:3}.jsonbox{width:100%;min-height:190px;border:1px solid #d8c6e7;border-radius:8px;padding:10px;font:11px/1.5 ui-monospace,monospace}.transfer{margin-bottom:12px;border:1px solid #d9c7ed;padding:12px;border-radius:12px;background:#f9f3ff}.transfer h3{margin:0 0 8px;font-size:13px}.transfer p{color:#806b90;font-size:11px;margin:5px 0 9px}.transfer .row{margin-top:7px}[hidden]{display:none!important}
    @media(max-width:650px){.panel{width:min(340px,calc(100vw - 24px));right:12px;top:12px;bottom:12px}.bubble{font-size:10px;min-width:23px;height:23px;line-height:19px}}
    @media(prefers-reduced-motion:reduce){*{transition:none!important}}
    .evidence-details{margin-top:5px;font-size:10px;color:#806b90}.evidence-details>summary{cursor:pointer;padding:3px 0}.evidence-details .evidence-label{display:block}.save-status.error{color:#a34229;font-weight:650}.catalog-box{margin:0 0 12px;border:1px solid #e4d8ef;border-radius:10px;background:#fff;padding:10px}.catalog-tools{display:flex;gap:6px;margin-bottom:7px}.catalog-search{min-width:0;flex:1;width:100%;border:1px solid #dacce8;border-radius:7px;padding:6px 8px;font-size:12px;color:#382644}.catalog-filter{max-width:118px;border:1px solid #dacce8;border-radius:7px;padding:5px;font-size:11px;color:#654778;background:white}.catalog-box .catalog{margin:0;max-height:210px;overflow:auto}.catalog-box .num{min-width:45px}.catalog-meta{font-size:10px;color:#8b6c9d;display:block;overflow-wrap:anywhere}.catalog-text{flex:1;min-width:0}.catalog-text>.label{display:block}.scope-note{font-size:10px;color:#8a7699;margin:4px 0 0}.catalog-count{font-size:10px;color:#8a7699;margin:6px 0 0}.catalog-empty{padding:14px 5px;color:#8a7699;font-size:11px}
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
  const expandedEvidence = new Set();
  let nextNumber = 1;
  const targets = new Map();
  const bubbles = new Map();
  const badgePlacements = new Map();
  const pageCache = new Map();
  const uiCache = new Map();
  const watchedRoots = new WeakSet();
  const copy = value => JSON.parse(JSON.stringify(value));
  const text = (value, max = 1200) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
  const hash = value => {
    let a = 2166136261;
    let b = 5381;
    for (let i = 0; i < value.length; i++) { a = Math.imul(a ^ value.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ value.charCodeAt(i); }
    return (a >>> 0).toString(36) + (b >>> 0).toString(36);
  };
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
  function mergeDescription(observed, description) {
    if (!description || typeof description !== 'object') return;
    for (const name of Object.keys(FIELD_NAMES)) {
      if (typeof description.fields?.[name] === 'string') observed.fields[name] = description.fields[name].slice(0, 12000);
      if (typeof description.evidence?.[name] === 'string') observed.evidence[name] = description.evidence[name].slice(0, 12000);
      if (hasOwn(STATE_NAMES, description.fieldStates?.[name])) observed.fieldStates[name] = description.fieldStates[name];
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

  function savePage() {
    if (!currentPage) return;
    pageCache.set(currentScopeKey, currentPage);
    if (currentUIKey) uiCache.set(currentUIKey, { opened: new Set(opened), drafts: new Map(drafts) });
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
    currentUIKey = '';
    opened = new Set();
    drafts = new Map();
    transferMode = '';
    transferValue = '';
    noticeText = '';
    catalogOpen = true;
    catalogQuery = '';
    catalogFilter = 'all';
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
    const modalKey = activeModal ? activeModal.id || pathFor(activeModal) : '';
    const key = currentScopeKey + '|ui:' + hash(JSON.stringify([selected, modalKey]));
    if (key === currentUIKey) return false;
    if (currentUIKey) uiCache.set(currentUIKey, { opened: new Set(opened), drafts: new Map(drafts) });
    currentUIKey = key;
    const saved = uiCache.get(key);
    opened = saved ? new Set(saved.opened) : new Set();
    drafts = saved ? new Map(saved.drafts) : new Map();
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
    mutationObserver.observe(tree, { childList: true, subtree: true, attributes: true, attributeFilter: ['id','class','style','hidden','open','data-state','aria-hidden','aria-label','aria-labelledby','aria-expanded','aria-selected','aria-disabled','disabled','required','readonly','min','max','maxlength','minlength','pattern','type','role','href','data-testid','data-test','data-qa'] });
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
        const rowAttr = ['data-row-key', 'data-key', 'data-id'].find(attribute => row.hasAttribute(attribute));
        if (rowAttr) {
          const rowValue = row.getAttribute(rowAttr);
          const relative = [];
          let child = node;
          while (child && child !== row) {
            const parent = composedParent(child);
            if (!parent) break;
            const peers = Array.from(parent.children || []).filter(item => item.tagName === child.tagName);
            relative.unshift(child.tagName.toLowerCase() + ':nth-of-type(' + (peers.indexOf(child) + 1) + ')');
            child = parent;
          }
          kind = 'row';
          key = rowAttr + ':' + rowValue + '>' + relative.join('>');
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
    return { fields, fieldStates, evidence: { content: `当前 DOM：${tag}${node.getAttribute('role') ? '，role=' + node.getAttribute('role') : ''}；可访问名称 / 可见标签。未读取输入值。`, function: '无 PRD 或行为验证来源。', limits: evidence.length ? '当前 DOM 属性：' + evidence.join('；') : '未观察到相关 DOM 属性。', navigation: safeDestination(node) ? '当前 DOM 的 href / target；链接中的参数及凭据未保存。' : '未读取到可追溯的 href。' } };
  }

  function scan() {
    if (destroyed) return null;
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
      const id = 'shh-' + hash(anchor.kind + ':' + anchor.key);
      let annotation = currentPage.annotations.find(item => item.id === id);
      const observed = observedFor(node, label);
      if (isPage) {
        observed.fields.content = `当前页面 / 弹窗标题：${label}。页面整体业务含义需结合 PRD 或原型说明。`;
        observed.fields.function = '待确认：页面的业务目标、角色权限和入口条件需要有来源的说明。';
        observed.fields.limits = '待确认：页面级权限、数据范围及异常状态需要 PRD、原型或经授权验证。';
        observed.fields.navigation = '待确认：页面入口、返回路径及跳转关系需要有来源的说明。';
        observed.fieldStates = { content: 'observed', function: 'unknown', limits: 'unknown', navigation: 'unknown' };
      }
      mergeDescription(observed, descriptor?.description || specific);
      const signatures = Object.fromEntries(Object.keys(FIELD_NAMES).map(name => [name, hash(observed.fields[name] + '|' + observed.evidence[name])]));
      if (!annotation) {
        const number = nextNumber++;
        annotation = { id, number, displayId: 'A-' + String(number).padStart(3, '0'), anchor, label, controlType: anchor.type, ...observed, observedSignatures: signatures, manualFields: [], status: anchor.positional ? 'needs-review' : 'observed', revisions: [], createdAt: new Date().toISOString() };
        if (anchor.positional) annotation.reviewReason = '此控件没有可用的稳定 ID 或行键，暂用 DOM 位置定位。列表重排或页面结构变化后必须复核对应关系。';
        currentPage.annotations.push(annotation);
        changed = true;
      } else {
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
          if (['observed', 'unknown'].includes(state) && !annotation.manualFields.includes(name)) {
            if (annotation.fields[name] !== observed.fields[name] || annotation.evidence[name] !== observed.evidence[name] || state !== observed.fieldStates[name]) {
              annotation.fields[name] = observed.fields[name];
              annotation.evidence[name] = observed.evidence[name];
              annotation.fieldStates[name] = observed.fieldStates[name];
              changed = true;
            }
          } else if (annotation.observedSignatures && annotation.observedSignatures[name] !== signatures[name]) {
            annotation.status = 'needs-review';
            annotation.reviewReason = `「${FIELD_NAMES[name]}」相关的可见信息已变化，现有人工 / 来源说明已保留，请复核。`;
            annotation.fieldReviews = annotation.fieldReviews || {};
            annotation.fieldReviews[name] = observed.fields[name];
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
      badge.setAttribute('aria-expanded', String(opened.has(id)));
      badge.classList.toggle('review', annotation.status === 'needs-review');
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
    opened.add(id);
    catalogOpen = false;
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
    if (narrow && ![...opened].some(openId => targets.has(openId))) drawerOpen = false;
    renderPanel();
    positionBubbles();
    bubbles.get(id)?.setAttribute('aria-expanded', 'false');
    bubbles.get(id)?.focus({ preventScroll: true });
    savePage();
  }

  function draftFor(annotation) {
    if (!drafts.has(annotation.id)) drafts.set(annotation.id, { fields: copy(annotation.fields), evidence: copy(annotation.evidence), fieldStates: copy(annotation.fieldStates), touched: [], stateTouched: [], dirty: false, saveError: '' });
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
      if (!['conflict', 'review'].includes(draft.fieldStates[name])) draft.fieldStates[name] = 'user';
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
    if (['conflict', 'review'].includes(draft.fieldStates[name])) evidenceDetails.append(el('p', 'muted', '编辑文字不会自动解除冲突或待复核。核对后，请在字段状态中明确选择。'));
    field.append(bar, input, evidenceDetails);
    if (annotation.fieldReviews && annotation.fieldReviews[name]) field.append(el('p', 'review-note', '当前页面观察：' + annotation.fieldReviews[name]));
    if (annotation.suggestions && annotation.suggestions[name]) {
      const suggestion = annotation.suggestions[name];
      const review = el('div', 'review-note');
      review.append(el('div', '', '导入的不同建议（人工修改已保留）：' + suggestion.value), el('div', 'muted', '建议证据：' + suggestion.evidence));
      const actions = el('div', 'row');
      actions.append(button('采用建议为草稿', () => {
        draft.fields[name] = suggestion.value;
        draft.evidence[name] = suggestion.evidence;
        draft.fieldStates[name] = suggestion.fieldState;
        draft.touched = [...new Set([...(draft.touched || []), name])];
        draft.dirty = true;
        delete annotation.suggestions[name];
        renderPanel();
      }), button('保留人工版本', () => { delete annotation.suggestions[name]; savePage(); renderPanel(); }));
      review.append(actions);
      field.append(review);
    }
    function dirty() {
      draft.dirty = true;
      draft.saveError = '';
      draft.touched = [...new Set([...(draft.touched || []), name])];
      const card = shadow.querySelector('[data-shh-card="' + annotation.id + '"]');
      if (card) card.querySelector('.save-status').textContent = '有未保存修改';
      renderQuality();
      uiCache.set(currentUIKey, { opened: new Set(opened), drafts: new Map(drafts) });
    }
    return field;
  }

  function revisionOf(annotation, action) {
    return { at: new Date().toISOString(), action, fields: copy(annotation.fields), evidence: copy(annotation.evidence || {}), fieldStates: copy(annotation.fieldStates || {}), status: annotation.status, anchor: copy(annotation.anchor) };
  }

  function saveAnnotation(id, confirmTarget = false) {
    const annotation = currentPage.annotations.find(a => a.id === id);
    const draft = drafts.get(id);
    if (!annotation || !draft) return;
    if (draft.dirty || confirmTarget) {
      const previous = copy(annotation);
      const previousPageTime = currentPage.updatedAt;
      annotation.revisions.push(revisionOf(annotation, confirmTarget ? '确认当前控件并保存' : '人工保存前版本'));
      annotation.fields = copy(draft.fields);
      annotation.evidence = copy(draft.evidence);
      annotation.fieldStates = copy(draft.fieldStates);
      annotation.manualFields = [...new Set([...(annotation.manualFields || []), ...(draft.touched || [])])];
      for (const name of draft.stateTouched || []) {
        if (!['conflict', 'review'].includes(draft.fieldStates[name]) && annotation.fieldReviews) delete annotation.fieldReviews[name];
      }
      if (confirmTarget) {
        annotation.anchor.fingerprint = annotation.currentFingerprint || annotation.anchor.fingerprint;
        annotation.label = annotation.currentLabel || annotation.label;
        delete annotation.reviewReason;
      }
      const unresolved = Object.values(annotation.fieldStates).some(value => ['conflict', 'review'].includes(value)) || Object.keys(annotation.suggestions || {}).length > 0;
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
        draft.dirty = false;
        draft.saveError = '';
        draft.stateTouched = [];
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
    if (annotation.status === 'needs-review') foot.append(button('确认当前控件', () => saveAnnotation(annotation.id, true)));
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

  function annotationFlags(annotation) {
    const draft = drafts.get(annotation.id);
    const states = Object.values(draft?.fieldStates || annotation.fieldStates || {});
    return {
      unknown: states.includes('unknown'),
      review: annotation.status === 'needs-review' || states.some(value => ['conflict', 'review'].includes(value)) || Object.keys(annotation.suggestions || {}).length > 0,
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
    const line = `当前呈现范围 ${q.total} 项 · 已开 ${openedCount} · 未保存 ${q.dirty}\n待确认 ${q.unknown} · 待复核 ${q.review} · 人工修改 ${q.manual}${q.hidden ? ' · 气泡暂藏 ' + q.hidden : ''}`;
    if (node.textContent !== line) node.textContent = line;
  }

  function renderCatalog() {
    const box = el('section', 'catalog-box');
    box.setAttribute('aria-label', '当前呈现范围标注目录');
    box.setAttribute('data-shh-catalog', '');
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
    filter.setAttribute('aria-label', '按标注状态筛选');
    for (const [value, title] of [['all', '全部状态'], ['unknown', '待确认'], ['review', '冲突 / 待复核'], ['manual', '人工修改']]) {
      const option = el('option', '', title); option.value = value; filter.append(option);
    }
    filter.value = catalogFilter;
    tools.append(search, filter);
    const list = el('div', 'catalog');
    const count = el('p', 'catalog-count');
    const update = () => {
      list.replaceChildren();
      const query = catalogQuery.trim().toLowerCase();
      const numeric = /^(?:a-?)?0*(\d+)$/i.exec(query);
      const requestedNumber = numeric ? Number(numeric[1]) : null;
      const current = currentPage.annotations.filter(annotation => targets.has(annotation.id));
      const matching = current.filter(annotation => {
        const flags = annotationFlags(annotation);
        const stateMatches = catalogFilter === 'all' || !!flags[catalogFilter];
        const label = (annotation.currentLabel || annotation.label).toLowerCase();
        const textMatches = !query || (requestedNumber > 0 ? annotation.number === requestedNumber : label.includes(query) || (annotation.displayId || '').toLowerCase().includes(query));
        return stateMatches && textMatches;
      });
      for (const annotation of matching) {
        const flags = annotationFlags(annotation);
        const item = button('', () => {
          targets.get(annotation.id)?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
          openCard(annotation.id);
        });
        item.setAttribute('data-shh-catalog-item', annotation.id);
        const content = el('span', 'catalog-text');
        content.append(el('span', 'label', annotation.currentLabel || annotation.label));
        const status = [flags.unknown && '待确认', flags.review && '待复核', flags.manual && '人工修改', flags.dirty && '未保存', placementHiddenIds.includes(annotation.id) && '气泡暂藏'].filter(Boolean).join(' · ');
        if (status) content.append(el('span', 'catalog-meta', status));
        item.append(el('span', 'num', annotation.displayId || annotation.number), content, el('span', 'muted', '定位'));
        list.append(item);
      }
      if (!matching.length) list.append(el('p', 'catalog-empty', '当前呈现范围没有匹配项。可清空名称或切换状态筛选。'));
      count.textContent = `显示 ${matching.length} / ${current.length} 项；未访问页面、未展开状态不计入。`;
    };
    search.addEventListener('input', () => { catalogQuery = search.value; update(); });
    filter.addEventListener('change', () => { catalogFilter = filter.value; update(); });
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
    const actions = el('div', 'row');
    actions.style.marginTop = '10px';
    actions.append(button('重新识别', () => { scan(); setNotice('已重新识别当前可见控件。'); }), button('导出', () => { transferMode = 'export'; transferValue = JSON.stringify(exportData(), null, 2); renderPanel(); }), button('导入', () => { transferMode = 'import'; transferValue = ''; renderPanel(); }));
    const catalogToggle = button(catalogOpen ? '收起目录' : '查找标注', () => {
      catalogOpen = !catalogOpen;
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
    if (storageWarning) body.append(el('p', 'notice', storageWarning));
    if (transferMode) body.append(renderTransfer());
    if (catalogOpen) body.append(renderCatalog());
    const openedAnnotations = [...opened].filter(id => targets.has(id)).map(id => currentPage.annotations.find(a => a.id === id)).filter(Boolean);
    for (const annotation of openedAnnotations) body.append(renderCard(annotation));
    if (!openedAnnotations.length) {
      const empty = el('div', 'empty');
      empty.append(el('b', '', '点击页面上的编号气泡'), el('p', '', '每个气泡对应一个可见控件。'), el('p', '', '可同时打开多条说明，在右侧逐项修改与保存。'));
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
    bubbles.forEach((badge, id) => badge.setAttribute('aria-expanded', String(opened.has(id))));
    schedulePosition();
  }

  function exportData() {
    savePage();
    return copy({ schemaVersion: VERSION, agent: 'Strike Her Heart', exportedAt: new Date().toISOString(), pages: [...pageCache.values()] });
  }

  function importData(data) {
    if (destroyed) throw new Error('标注已销毁，请重新运行。');
    if (typeof data === 'string') {
      if (data.length > 10 * 1024 * 1024) throw new Error('JSON 超过 10 MB，请分批导入。');
      data = JSON.parse(data);
    }
    if (!data || data.schemaVersion !== VERSION || !Array.isArray(data.pages)) throw new Error('需要 schemaVersion:1 和 pages 数组。');
    const dirty = [...drafts.values()].some(draft => draft.dirty);
    if (dirty) throw new Error('当前有未保存草稿，请先保存或撤销，避免导入覆盖草稿。');
    let updated = 0;
    let skipped = 0;
    for (const page of data.pages) {
      if (!page || !Array.isArray(page.annotations)) continue;
      if (!sameScope(page.scope, currentPage.scope)) { skipped += page.annotations.length; continue; }
      for (const incoming of page.annotations) {
        if (!incoming || typeof incoming !== 'object') { skipped++; continue; }
        const target = currentPage.annotations.find(a => a.id === incoming.id || incoming.anchor && a.anchor.kind === incoming.anchor.kind && a.anchor.key === incoming.anchor.key);
        if (!target) { skipped++; continue; }
        if (!incoming.fields || typeof incoming.fields !== 'object') { skipped++; continue; }
        if (Array.isArray(incoming.revisions)) {
          const existing = new Set(target.revisions.map(revision => JSON.stringify(revision)));
          for (const revision of incoming.revisions) {
            if (!revision || !revision.fields || typeof revision.fields !== 'object') continue;
            const restored = { at: text(revision.at, 40), action: text(revision.action, 100), fields: {}, evidence: {}, fieldStates: {}, status: text(revision.status, 40), anchor: copy(target.anchor) };
            for (const name of Object.keys(FIELD_NAMES)) {
              restored.fields[name] = typeof revision.fields[name] === 'string' ? revision.fields[name].slice(0, 12000) : '';
              restored.evidence[name] = revision.evidence && typeof revision.evidence[name] === 'string' ? revision.evidence[name].slice(0, 12000) : '';
              restored.fieldStates[name] = revision.fieldStates && hasOwn(STATE_NAMES, revision.fieldStates[name]) ? revision.fieldStates[name] : 'unknown';
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
          const state = incomingState && hasOwn(STATE_NAMES, incomingState) ? incomingState : incomingValue !== target.fields[name] ? 'review' : target.fieldStates[name];
          const manuallyOwned = target.fieldStates[name] === 'user' || (target.manualFields || []).includes(name);
          if (manuallyOwned && (incomingValue !== target.fields[name] || incomingEvidence !== target.evidence[name])) {
            target.suggestions = target.suggestions || {};
            target.suggestions[name] = { value: incomingValue, evidence: incomingEvidence, fieldState: state, receivedAt: new Date().toISOString() };
            protectedConflict = true;
            continue;
          }
          if (!manuallyOwned) {
            target.fields[name] = incomingValue;
            target.evidence[name] = incomingEvidence;
            target.fieldStates[name] = state;
          }
        }
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
    savePage();
    renderPanel();
    return { updated, skipped };
  }

  function getSnapshot() {
    if (!currentPage) return null;
    return copy({ ...currentPage, currentControlIds: [...targets.keys()], ui: { openedIds: [...opened].filter(id => targets.has(id)), visible, drawerOpen, narrow, placementHiddenIds: [...placementHiddenIds], dirtyIds: [...drafts].filter(([id, draft]) => draft.dirty && targets.has(id)).map(([id]) => id), quality: qualitySnapshot(), catalogOpen, storageAvailable: !storageWarning } });
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
  const api = { __runtime: true, version: VERSION, scan, exportData, importData, getSnapshot, toggle, toggleDrawer, destroy };
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
