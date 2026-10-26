/* Trusted, local DOM adapter. It annotates the original page; no requests/clicks. */
(() => {
  'use strict';
  const matches = () => location.hostname === 'quote.fx678.com' && location.pathname === '/exchange/SGE';
  if (!matches()) return;
  const ID = 'fx678-sge-v1';
  const MAIN = ['名称', '最新价', '涨跌', '涨跌幅', '最高', '最低', '昨收', '更新时间'];
  const HEAT = ['品种/周期', '现价', '1分钟', '5分钟', '15分钟', '30分钟', '1小时', '4小时', '天', '周', '月'];
  const plain = value => String(value || '').replace(/\s+/g, ' ').trim();
  const compact = value => plain(value).replace(/\s/g, '');
  const ownText = node => plain(Array.from(node.childNodes).filter(child => child.nodeType === 3).map(child => child.nodeValue).join(' '));
  let current = null;

  function description(content, action, limits, navigation, evidence, states = {}) {
    return {
      fields: { content, function: action, limits, navigation },
      evidence: { content: evidence, function: evidence, limits: evidence, navigation: evidence },
      fieldStates: { content: 'observed', function: 'observed', limits: 'unknown', navigation: 'unknown', ...states }
    };
  }

  function leafMatches(document, test, visible) {
    return Array.from(document.querySelectorAll('h1,h2,h3,h4,[role="heading"],strong,b,p,span,div,button,a,th,td')).filter(node => {
      if (!visible(node)) return false;
      const direct = ownText(node);
      return direct && test(direct) && !Array.from(node.children).some(child => test(ownText(child)));
    });
  }

  function discover({ document, isVisible }) {
    const issues = [];
    const extras = [];
    const unique = (nodes, name) => {
      const candidates = [...new Set(nodes)];
      if (candidates.length !== 1) issues.push(`${name}：${candidates.length ? '存在多个候选，已跳过' : '未找到唯一可见目标，已跳过'}。`);
      return candidates.length === 1 ? candidates[0] : null;
    };
    function tableFor(headers, name) {
      const matches = [];
      for (const table of document.querySelectorAll('table,[role="table"],[role="grid"]')) {
        if (!isVisible(table)) continue;
        const rows = Array.from(table.querySelectorAll('tr,[role="row"]')).filter(row => row.closest('table,[role="table"],[role="grid"]') === table);
        for (const row of rows) {
          const cells = Array.from(row.cells || row.querySelectorAll(':scope > [role="columnheader"],:scope > [role="cell"],:scope > th,:scope > td'));
          // Only inspect structural header rows; never aggregate a quote-data row.
          if (cells.length !== headers.length || !cells.every(cell => cell.tagName === 'TH' || cell.getAttribute('role') === 'columnheader' || row.parentElement?.tagName === 'THEAD')) continue;
          if (cells.every((cell, i) => compact(cell.textContent) === compact(headers[i]))) matches.push({ table, cells, row, rows });
        }
      }
      const found = unique(matches.map(item => item.row), name);
      return found ? matches.find(item => item.row === found) : null;
    }
    const main = tableFor(MAIN, '8 列行情表');
    const heat = tableFor(HEAT, '11 列品种热力图');
    const isBreadcrumbTitle = node => {
      if (node.closest('a[href],nav,[role="navigation"],.breadcrumb,.breadcrumbs,.crumb,.crumbs,[aria-label*="面包屑"],[aria-label*="breadcrumb" i]')) return true;
      // Some legacy breadcrumb wrappers have no semantic role or useful class.
      // Identify their short navigation context, never aggregate a quote table.
      for (let parent = node.parentElement, depth = 0; parent && parent !== document.body && depth < 3; parent = parent.parentElement, depth++) {
        if (parent.querySelector('table,[role="table"],[role="grid"],h1,h2,h3,h4,[role="heading"]')) break;
        const links = Array.from(parent.querySelectorAll('a[href]'));
        if (links.length > 0 && links.length <= 4 && links.some(link => compact(link.textContent) === '行情中心') && compact(parent.textContent).length < 100) return true;
      }
      return false;
    };
    const titleCandidates = leafMatches(document, text => compact(text) === '上海金', isVisible).filter(node => !isBreadcrumbTitle(node));
    const heading = node => !!node.closest('h1,h2,h3,h4,[role="heading"]');
    function titleForMain() {
      if (!main) return unique(titleCandidates, '上海金标题');
      const preceding = titleCandidates.filter(node => !node.contains(main.table) && !!(node.compareDocumentPosition(main.table) & 4));
      for (let parent = main.table.parentElement, depth = 0; parent && depth < 7; parent = parent.parentElement, depth++) {
        const nearby = preceding.filter(node => parent.contains(node));
        if (!nearby.length) continue;
        const semantic = nearby.filter(heading);
        return unique(semantic.length ? semantic : nearby, '主表上下文上海金标题');
      }
      return unique([], '主表上下文上海金标题');
    }
    const title = titleForMain();
    let pageRegion = null;
    if (!title && main && heat) {
      for (let parent = main.table.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
        if (parent.contains(heat.table) && isVisible(parent)) { pageRegion = parent; break; }
      }
    }
    if (!title) issues.push(pageRegion
      ? '具体上海金标题未唯一识别，标题目标已跳过；页面级说明已锚定唯一行情表与热力图的最近共同主内容区。'
      : '具体上海金标题未唯一识别，且未核实包含两张唯一表格的非 body/html 共同主内容区；页面级说明目标继续跳过。');
    const headerLimits = '表头只说明显示字段；未验证排序、筛选或可点击行为。价格单位、统计窗口、时间口径及刷新频率均需来源确认。';
    const noNavigation = '这是内容说明目标；未声明点击跳转，不将表头或表格区域视为导航按钮。';
    const mainNotes = {
      名称: '标识这一行的品种；实际带 href 的品种名称另有链接标注。',
      最新价: '页面标记为最新价的显示字段；不据列名保证实时性或可成交性。',
      涨跌: '页面标记为涨跌的显示字段；比较基准和计算方法待确认。',
      涨跌幅: '页面标记为涨跌幅的显示字段；基准、单位和计算方法待确认。',
      最高: '页面标记为最高的显示字段；统计时间范围待确认。',
      最低: '页面标记为最低的显示字段；统计时间范围待确认。',
      昨收: '页面标记为昨收的显示字段；交易日历及收盘口径待确认。',
      更新时间: '页面标记为更新时间的显示字段；时区、采样时点及刷新频率待确认。'
    };
    const rowCount = info => info ? info.rows.filter(row => row !== info.row && Array.from(row.cells || row.children).length === info.cells.length).length : 0;
    if (main) {
      extras.push({ element: main.table, key: 'main-table', label: '行情表', kind: 'content', description: description(`上海金行情表；识别到 ${MAIN.length} 个列标题及 ${rowCount(main)} 个已加载数据行。标注不记录报价数值。`, '以表格区域组织品种与对应显示字段；各品种名称链接单独说明。', headerLimits, noNavigation, '当前原页 DOM：同一行情表中按顺序匹配 8 个完整列标题；数据行仅计数，不读取其报价内容。') });
      main.cells.forEach((cell, index) => extras.push({ element: cell, key: 'main-column-' + index, label: `行情表 · ${MAIN[index]}`, kind: 'content', description: description(`行情表第 ${index + 1} 列的可见表头为「${MAIN[index]}」。`, mainNotes[MAIN[index]], headerLimits, noNavigation, `当前原页 DOM：唯一 8 列行情表，第 ${index + 1} 个表头「${MAIN[index]}」。`) }));
    }
    if (heat) {
      extras.push({ element: heat.table, key: 'heat-table', label: '品种热力图区域', kind: 'content', description: description(`品种热力图；识别到 ${HEAT.length} 个列标题及 ${rowCount(heat)} 个已加载数据行。标注不记录价格、色块点值或报价数值。`, '按品种与列出的周期组织显示内容。', '当前可见色块不等于已证实其颜色含义；数值单位、计算方式、颜色阈值、时区及刷新频率待确认。', noNavigation, '当前原页 DOM：同一热力图表中顺序匹配完整 11 列；数据行只计数，不读取单元格报价。') });
      heat.cells.forEach((cell, index) => extras.push({ element: cell, key: 'heat-column-' + index, label: `品种热力图 · ${HEAT[index]}`, kind: 'content', description: description(`品种热力图第 ${index + 1} 列的可见表头为「${HEAT[index]}」。`, index === 0 ? '标识品种与周期的交叉显示区域。' : index === 1 ? '页面标记为现价的显示字段；不据列名保证实时性或可成交性。' : `对应页面标出的「${HEAT[index]}」周期显示列。`, '列名只作为显示说明。该列数值含义、单位、计算基准、颜色含义和刷新频率均待确认；不推定支持排序。', noNavigation, `当前原页 DOM：唯一 11 列热力图，第 ${index + 1} 个表头「${HEAT[index]}」。`) }));
    }
    const heatTitle = unique(leafMatches(document, text => /^品种热力图\s*[(（]/.test(text) || text === '品种热力图', isVisible), '品种热力图标题');
    if (heatTitle) extras.push({ element: heatTitle, key: 'heat-title', label: '品种热力图标题', kind: 'content', description: description('原页标题显示「品种热力图」，并可能随当前数据展示日期与时间。标注不固化这一动态时间戳。', '为下方品种与周期显示区域提供标题及页面声明的数据时间信息。', '时间字段的时区、统计含义和刷新频率未由标题说明，不根据日期推定数据新鲜度。', noNavigation, '当前可见标题节点；只核对标题前缀，不把动态时间戳作为锚点或保存内容。') });
    const expansionCandidates = main && heat ? leafMatches(document, text => text === '展开全部' || text === '收起', isVisible).filter(node => (main.table.contains(node) || !!(main.table.compareDocumentPosition(node) & 4)) && !!(node.compareDocumentPosition(heat.table) & 4)) : [];
    const expansionLeaf = unique(expansionCandidates, '行情表展开 / 收起入口');
    if (expansionLeaf) {
      const element = expansionLeaf.closest('button,a[href],[role="button"]') || expansionLeaf;
      const state = ownText(expansionLeaf);
      extras.push({ element, key: 'expand-toggle', label: '行情表展开 / 收起', kind: 'control', description: description(`当前页面入口文案为「${state}」。`, '展开或收起行情表区域；经 2026-10-26 原页点击核读，点击「展开全部」后入口变为「收起」，再次点击恢复收折显示。', '展开 / 收折表示区域呈现变化；不据此推断新增数据、只加载某个固定数量或任何报价刷新机制。', '已观察到页面内展开 / 收折效果；没有据此声明跨页导航。', '2026-10-26 原页实际交互核读及当前入口 DOM 文案。未由适配脚本执行点击。', { function: 'supported', navigation: 'supported' }) });
    }
    const risk = unique(leafMatches(document, text => /^风险提示[:：]?/.test(text), isVisible), '风险提示');
    if (risk) extras.push({ element: risk, key: 'risk', label: '风险提示', kind: 'content', description: description('原页风险文字说明：数据未必实时准确，价格属于指示性信息，不宜用于交易目的，使用者需自主决策。', '说明页面行情信息的使用边界及使用者自主判断的要求。', '该概述对应 2026-10-26 原页风险提示核读；后续以当前原文版本复核。不将页面价格视为可交易报价，不据此认证数据准确性或服务资质。', noNavigation, '2026-10-26 原页风险提示实际核读及当前唯一「风险提示」文本节点；此处只作简洁转述。', { limits: 'observed' }) });
    const pageDescription = description(title
      ? '当前原页为上海金行情页面，包含行情表、品种链接、品种热力图以及站点导航。'
      : '上海金行情页面：页面级说明锚定已核实的行情表与热力图主内容区，未唯一识别具体标题。不读取或保存这一聚合区域内的报价文本。',
    '组织上海金相关品种的显示字段与页面已有链接入口；此说明不解释未证实的交易、排序或报价计算规则。', '报价单位、时间口径、刷新频率、颜色含义、登录限制及目标链接实际到达情况均需进一步核实。', '当前地址为 https://quote.fx678.com/exchange/SGE；各链接仅按其实际 href 声明去向，不视为已验证到达。', title
      ? '当前原页 URL、可见上海金标题及已唯一识别的行情 / 热力图表头结构。'
      : '当前原页 URL，以及分别唯一匹配完整 8 列与 11 列表头的两张表格。页面级说明锚定两表最近共同的非 body/html 主内容容器，未唯一识别具体标题；仅核对包含关系，不读取聚合报价文本。');
    return { main, heat, extras, issues, page: title || pageRegion ? { element: title || pageRegion, key: 'page', label: '上海金行情页面', kind: 'content', description: pageDescription } : null };
  }

  function declaredURL(node) {
    try {
      const url = new URL(node.getAttribute('href'), location.href);
      if (!['https:', 'http:'].includes(url.protocol)) return { text: `${url.protocol} 地址（脚本或应用处理未验证）`, url };
      let address = url.origin + url.pathname;
      if (url.hostname === 'member.fx678.com' && url.pathname === '/Login/login' && url.searchParams.get('login_type') === 'register') address += '?login_type=register';
      else if (url.search || url.hash) address += '（查询参数 / 片段已省略）';
      return { text: address, url };
    } catch (_) { return { text: '无法解析的声明地址', url: null }; }
  }

  const adapter = {
    id: ID, matches,
    getPageTarget(context) { current = discover(context); return current.page; },
    getAdditionalTargets(context) { if (!current) current = discover(context); return current.extras; },
    describeTarget(node, context) {
      if (!node.matches('a[href]')) return null;
      const destination = declaredURL(node);
      const labelClone = node.cloneNode(true);
      for (const field of labelClone.querySelectorAll('input,textarea,select,[contenteditable],script,style')) field.remove();
      let label = plain(node.getAttribute('aria-label') || node.getAttribute('title') || labelClone.textContent).slice(0, 180);
      if (!label) {
        const url = destination.url;
        if (url?.hostname === 'www.fx678.com' && url.pathname === '/' || url?.hostname === 'fx678.com' && url.pathname === '/') label = '汇通首页';
        else if (url?.hostname === 'quote.fx678.com' && url.pathname === '/') label = '行情中心';
        else if (url?.hostname === 'vip.fx678.com' && url.pathname === '/') label = 'VIP 入口';
        else if (['www.fx678.com', 'fx678.com'].includes(url?.hostname) && url.pathname === '/3g/index.shtml') label = '移动端 / APP 相关入口';
        else if (['www.fx678.com', 'fx678.com'].includes(url?.hostname) && url.pathname === '/product/index.html') label = '易汇通软件相关入口';
        else label = '无文字链接（名称待确认）';
      }
      const isSymbol = current?.main?.table.contains(node) && destination.url?.hostname === 'quote.fx678.com' && destination.url.pathname.startsWith('/symbol/');
      const result = description(`${isSymbol ? '行情表品种名称链接' : '原页链接入口'}「${label}」。`, `页面提供「${label}」链接入口；浏览器按实际 href 处理声明目标${node.target === '_blank' ? '，DOM 声明在新标签页或窗口打开' : ''}。实际目标内容与到达结果未验证。`, '登录条件、权限、目标服务当前可用性和实际到达结果未验证；不根据名称推断交易、付费或软件安装行为。', `当前 DOM 声明的 href 去向：${destination.text}。该声明不等于已点击验证到达。`, '当前原页链接的可见 / 可访问名称、href 与 target 属性；未保存输入值、凭据或无关查询参数。', { navigation: 'observed' });
      result.label = label;
      return result;
    },
    getCoverage() {
      return [
        'SGE 专属适配仅作用于 quote.fx678.com/exchange/SGE；其他页面使用基础扫描。',
        '内容目标来自唯一可见标题、完整表头上下文、表格区域及风险段落；标题未唯一识别时，页级说明仅可锚定两张唯一表格的非 body/html 最近共同主内容区。不把报价单元格当作按钮，不采集报价数值。',
        ...(current?.issues || []),
        '列标题不表示支持排序；报价单位、时间口径、刷新频率及热力图颜色含义未验证。'
      ];
    }
  };
  const config = window.StrikeHerHeartConfig || {};
  config.siteAdapter = adapter;
  window.StrikeHerHeartConfig = config;
})();
