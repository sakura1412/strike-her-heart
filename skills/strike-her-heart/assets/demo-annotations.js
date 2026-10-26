/* Demo-only enrichment. This source describes the accompanying fictitious app.
 * Never inject this file into a real system. Existing edits are never replaced.
 */
(() => {
  'use strict';
  const noRoute = '停留在当前页面，不产生页面跳转。';
  const specs = {
    'nav-leads': ['客户线索导航入口。', '打开客户线索列表，展示统计卡、筛选器、线索表格与新增入口。', '无需登录的虚构演示；不验证真实权限。', '当前演示的 #/leads 页面。'],
    'nav-projects': ['协作项目导航入口。', '切换到虚构项目卡片列表。', '仅展示两个固定样例；无真实项目数据。', '当前演示的 #/projects 页面。'],
    'nav-settings': ['工作空间设置导航入口。', '打开基本信息与通知偏好表单。', '保存只显示反馈，不持久化演示设置。', '当前演示的 #/settings 页面。'],
    'return-leads': ['返回客户线索的链接。', '点击后切换回客户线索演示列表。', '使用当前页面内存中的演示数据；不请求服务器业务数据。', '当前演示的 #/leads 页面。'],
    'export-leads': ['导出演示数据按钮。', '点击后显示“已模拟导出操作”提示。', '这是演示反馈，不会生成或下载业务文件。', noRoute],
    'new-lead': ['新增客户线索按钮。', '点击后调用 #lead-dialog.showModal()，打开新增线索弹窗。', '本示例只在本次页面内存中保存线索；刷新后恢复初始数据。', '当前页面的“新增客户线索”弹窗。'],
    'tab-all': ['“全部线索”页签。', '将 selectedTab 设为 all，重新显示符合查询条件的全部负责人线索。', '仍受客户名称与跟进状态条件约束；不改变 URL。', noRoute],
    'tab-mine': ['“我负责的”页签。', '将 selectedTab 设为 mine，仅显示负责人为演示用户“林澈”的线索。', '仍受客户名称与跟进状态条件约束；不改变 URL。', noRoute],
    'search-name': ['客户名称搜索输入框。', '点击“查询”后去除前后空格，以名称包含输入文本的方式筛选当前线索列表。', '选填；maxlength=40；空值表示不限制名称。输入本身不触发查询。', '查询结果在当前页面表格中更新，不跳转。'],
    'filter-stage': ['跟进状态单选下拉框。', '点击“查询”后按精确状态筛选：待跟进、沟通中、已转化；全部状态表示不限。', '只能选择下拉中的一个选项；状态可与名称条件组合。', '查询结果在当前页面表格中更新，不跳转。'],
    'created-after': ['创建日期起始输入框。', '展示浏览器原生日期输入交互。', '日期上限 2026-10-23；本演示未将日期接入筛选逻辑，不能声称按日期过滤。', noRoute],
    'query-leads': ['查询按钮。', '提交 #filter-form，读取名称与状态条件，更新 #lead-rows。', '查询仅作用于当前内存中的演示列表；无网络请求。日期不参与筛选。', noRoute],
    'reset-filter': ['重置筛选按钮。', '清空名称与状态，重绘列表并将日期恢复为空。', '保留当前“全部 / 我负责的”页签；不删除客户数据。', noRoute],
    'select-all': ['当前列表的全选复选框。', '将当前 tbody 内全部客户复选框设为同一勾选状态。', '只影响当前渲染列表；本演示未实现批量业务操作。', noRoute],
    'previous-page': ['上一页按钮。', '本演示显示分页外观。', 'disabled，演示只有一页，无法触发翻页。', noRoute],
    'next-page': ['下一页按钮。', '本演示显示分页外观。', 'disabled，演示只有一页，无法触发翻页。', noRoute],
    'lead-name': ['新增线索的客户名称输入框。', '提交时将该名称加入当前演示线索列表。', 'required；最多 40 字符；浏览器原生必填校验。刷新后新增数据消失。', noRoute],
    'lead-contact': ['联系人邮箱输入框。', '用于展示邮箱输入与浏览器格式校验；演示新增列表使用固定的“演示联系人”。', '选填；type=email；填写时必须通过浏览器邮箱格式校验。邮箱不会被发送。', noRoute],
    'lead-source': ['线索来源下拉框。', '展示官网咨询、活动报名、客户推荐三个单选项。', '演示提交未保存此字段，仅展示选择交互。', noRoute],
    'lead-note': ['线索备注多行输入框。', '展示补充跟进背景的输入方式。', '选填；最多 200 字符；演示提交未保存备注。', noRoute],
    'close-dialog': ['弹窗右上角的关闭按钮。', '调用 #lead-dialog.close() 关闭弹窗。', '关闭动作不提交；当前草稿仍留在表单中，再次打开可继续输入。', '返回当前客户线索页面。'],
    'cancel-dialog': ['新增线索弹窗的取消按钮。', '关闭弹窗，不提交表单。', '关闭动作不清空表单草稿。', '返回当前客户线索页面。'],
    'save-lead': ['新增线索弹窗的保存按钮。', '通过原生表单校验后，向内存列表插入一条待跟进线索，关闭并重置表单。', '客户名必填、最多 40 字符；邮箱填写时须合法；数据仅在本次演示会话的页面内存中有效。', '关闭弹窗并更新当前客户线索列表。'],
    'project-owner': ['项目负责人下拉框。', '切换后显示“演示选择已变更”提示。', '列表保持两个固定样例；本演示没有按负责人过滤。', noRoute],
    'refresh-projects': ['项目列表刷新按钮。', '显示“项目演示列表已刷新”的本地反馈。', '不发出网络请求；项目内容为固定样例。', noRoute],
    'view-project': ['品牌焕新计划的详情按钮。', '展开或收起项目卡片内的静态演示详情文字。', '只有本卡片的说明文字；真实详情页与权限须单独验证。', '当前卡片中的 #project-detail 区域，不改变 URL。'],
    'start-project': ['等待项目启动按钮。', '仅用于显示待启动状态。', 'disabled，无法触发项目启动。', noRoute],
    'workspace-name': ['工作空间名称输入框。', '编辑待确认的演示空间名称；保存时仅显示反馈。', 'required；最多 30 字符；演示不将修改持久化到服务器或本地业务存储。', noRoute],
    'workspace-zone': ['工作空间时区下拉框。', '演示北京时间 UTC+8 和协调世界时 UTC 两个选择。', '只能单选；本演示不据此换算其他日期或时间。', noRoute],
    'notification-email': ['通知邮箱输入框。', '展示通知邮箱配置入口，表单提交时执行原生格式校验。', '选填；type=email。演示不会发送邮件或持久化邮箱。', noRoute],
    'daily-time': ['每日摘要发送时间输入框。', '展示浏览器原生时间选择控件。', 'type=time；演示不会建立定时任务。', noRoute],
    'workspace-desc': ['工作空间说明多行输入框。', '编辑演示空间介绍内容。', '选填，最多 200 字符；保存不持久化业务数据。', noRoute],
    'enable-digest': ['是否接收每日摘要的复选框。', '勾选与取消只改变当前演示表单状态。', '本演示不会发送邮件或创建订阅。', noRoute],
    'view-list': ['默认列表视图单选项。', '与看板视图属于同一 default-view 组，选中列表时取消看板选中。', '两项只能单选一个；不改变当前页面视图。', noRoute],
    'view-board': ['默认看板视图单选项。', '与列表视图属于同一 default-view 组，选中看板时取消列表选中。', '两项只能单选一个；不改变当前页面视图。', noRoute],
    'reset-settings': ['恢复表单初始值按钮。', '触发原生 form reset，将字段还原为页面生成时的默认值。', '只还原演示业务表单；标注内容由标注工具单独保存。', noRoute],
    'save-settings': ['保存演示设置按钮。', '表单通过原生校验后显示“演示设置已确认”的反馈。', '不调用真实系统、不写入服务器，也不持久化业务数据。', noRoute]
  };
  const titles = { '#/leads': '客户线索', '#/projects': '协作项目', '#/settings': '工作空间设置' };
  function seed() {
    const runtime = window.StrikeHerHeart;
    if (!runtime) return;
    const state = runtime.scan();
    if (!state || state.ui?.dirtyIds.length) return;
    const annotations = [];
    for (const annotation of state.annotations) {
      if (annotation.status !== 'observed' || annotation.revisions?.length) continue;
      let spec = annotation.anchor.kind === 'id' ? specs[annotation.anchor.key] : null;
      let ref = `demo.html #${annotation.anchor.key}：HTML 约束与对应事件处理；仅适用于本虚构演示。`;
      if (annotation.anchor.kind === 'page') {
        spec = annotation.anchor.key.includes('|modal:')
          ? ['虚构客户管理系统的“新增客户线索”弹窗。', '收集客户名称、邮箱、来源和备注；通过校验后将名称加入本次页面内存中的演示线索列表。', '名称必填，最多 40 字符；邮箱选填且须格式有效。演示不保存邮箱、来源或备注；刷新会恢复初始列表。', '保存后关闭弹窗并更新线索列表；取消或关闭仅返回原列表。']
          : [`虚构协作管理系统的“${titles[state.scope.route] || '演示'}”页面。`, '展示原页面控件、编号气泡、右侧多条详情，以及可编辑的功能、限制和跳转说明。', '全部客户和项目均为虚构数据；不连接真实系统。此页面的演示业务操作与标注保存相互独立。', '左侧导航可切换 #/leads、#/projects、#/settings 三个演示页面。'];
        ref = `demo.html render() 与对应页面渲染函数；demo-annotations.js 的演示说明。`;
      } else if (!spec && annotation.controlType === 'checkbox' && annotation.label.startsWith('选择客户 ')) {
        spec = [`客户行复选框：${annotation.label.slice(5)}。`, '独立选择当前客户行；可由表头全选框统一设定勾选状态。', '只改变勾选状态；本演示没有批量业务操作。', noRoute];
        ref = 'demo.html rows() 中的客户行 checkbox；未绑定业务提交。';
      } else if (!spec && annotation.anchor.kind === 'row' && annotation.label.startsWith('查看 ')) {
        spec = ['客户行的查看项目链接。', '切换到固定的协作项目演示页；未按客户 ID 过滤项目。', '所有客户链接打开相同的项目演示页；真实系统关系需要来源验证。', '当前演示的 #/projects 页面。'];
        ref = 'demo.html rows() 中 href="#/projects"；renderProjects() 固定样例。';
      } else if (!spec && annotation.anchor.kind === 'path') {
        let node;
        try { node=document.querySelector(annotation.anchor.key); } catch (_) { continue; }
        if (node?.tagName === 'A' && node.getAttribute('href') === '#/projects') {
          spec = ['客户行的查看项目链接。', '切换到固定的协作项目演示页；未按客户 ID 过滤项目。', '所有客户链接打开相同的项目演示页；真实系统关系需要来源验证。', '当前演示的 #/projects 页面。'];
          ref = 'demo.html rows() 中 href="#/projects"；renderProjects() 固定样例。';
        } else if (node?.tagName === 'A' && node.getAttribute('href') === '#/leads') {
          spec = ['返回客户线索的链接。', '切换到客户线索演示列表。', '使用当前演示内存中的数据；无服务器请求。', '当前演示的 #/leads 页面。'];
          ref = 'demo.html renderProjects() 中 href="#/leads"。';
        }
      }
      if (!spec) continue;
      const fields = Object.fromEntries(['content','function','limits','navigation'].map((name,index)=>[name,spec[index]]));
      annotations.push({ id:annotation.id, anchor:annotation.anchor, fields, evidence:Object.fromEntries(Object.keys(fields).map(name=>[name,ref])), fieldStates:Object.fromEntries(Object.keys(fields).map(name=>[name,'supported'])) });
    }
    if (annotations.length) runtime.importData({schemaVersion:1, pages:[{scope:state.scope,annotations}]});
  }
  let timer;
  function schedule() { clearTimeout(timer); timer=setTimeout(seed,250); }
  window.addEventListener('hashchange',schedule);
  document.addEventListener('click',schedule);
  document.addEventListener('submit',schedule);
  schedule();
})();
