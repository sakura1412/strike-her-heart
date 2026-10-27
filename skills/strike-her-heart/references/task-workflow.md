# 可恢复任务记录

`scripts/task.py` 是供 Strike Her Heart agent 使用的本地记录工具。用户仍然在
Codex 中给目标、资料和修改要求；agent 负责调用工具、续接任务与操作获支持的执行器。
它不打开浏览器、不爬站、不生成正式气泡编号，也不执行或认证浏览器验收。

## 记录放在哪里

每次任务复用一个用户指定的私有目录，内含 `task.json`、证据文件与 `.history/`。
任务目录必须在本 agent 源码仓库及已安装支持技能目录之外。即使仓库中的
`output/` 已被 Git 忽略，也不把真实业务任务写入公开源码树。
只有元数据、相对证据路径、证据 SHA-256、实际控件映射和检查记录进入 manifest，
不复制证据正文。已引用的证据文件应保留不变，新观察使用新文件，不覆盖旧截图或报告。
不传入密码、账号凭证、令牌或不必要的个人信息；证据文件本身也应由 agent 核对隐私。

目标 URL 的 userinfo 会被拒绝，查询参数和 fragment 不保存。若页面依靠 query
或 `#/route` 区分，agent 必须提供不含令牌的语义 `--state-key`，例如
`leads-all`、`leads-mine`；CLI 会拒绝把带 query/fragment 的目标静默归为 `default`。
初始化中的 targets 是任务入口，不是自动发现的整站范围；用户范围仍由 agent 维护。

## 最小流程

下面的 `TASK_SCRIPT` 表示本 Skill 的 `scripts/task.py` 路径，`TASK_DIR` 表示已获授权的
私有任务目录。示例证据文件必须先由实际资料读取或原页观察产生；不能把此命令示例、
manifest 自身或脚本存在当作操作证据。以下命令由 agent 代用，不交给用户手动维护。

```text
python3 TASK_SCRIPT init --task-dir TASK_DIR --name "本次系统标注" \
  --scope "用户指定的业务页面及安全展开状态" --target https://example.com/leads \
  --next-action "核对当前读取与原页写入能力"
python3 TASK_SCRIPT status --task-dir TASK_DIR
```

`init` 不覆盖已有任务。新会话先运行 `status`，读取同一目录的 `task.json`，核对
来源、页面状态、缺口和下一步，再继续最早未完成项；不要重建任务或重新编号。
每个变更命令要求 `--revision` 等于刚读取的版本，变更后返回新版本。
版本过期时拒绝写入，重新读取后再决定是否重试。记录以同目录临时文件原子替换，
旧 manifest 保存在 `.history/r000001.json` 等文件；进程遗留且已不存在的锁可以恢复。
历史文件用于回查，不作为原页验收证据。

### 1. 登记能力

```text
python3 TASK_SCRIPT capability --task-dir TASK_DIR --revision 1 \
  --read supported --write unavailable --method "当前浏览器只读接口" \
  --evidence evidence/page-observation.txt --next-action "继续识别，原页写入保持未完成"
```

读取与写入各自为 `unknown`、`supported` 或 `unavailable`。`supported` 必须给实际方法
和已存在的证据文件。能力是调用者报告，CLI 不会因为文件存在就证明接口可写，
也不会自动安装扩展、扩权或调用 agent。写入状态、方法或其证据变更时，页面旧的呈现与
检查记录失效，旧结果仍保存在 `.history/`；能力不可用时标为 blocked，恢复后重新呈现、验收。

### 2. 登记页面、状态与缺口

```text
python3 TASK_SCRIPT page --task-dir TASK_DIR --revision 2 \
  --url https://example.com/leads --state-key leads-all --label "线索列表·全部" \
  --status discovered --gap "权限规则未说明" --next-action "核对控件与资料对应关系"
```

相同净化 URL 与语义 state key 复用同一 `P-001` 页面状态 ID，新增状态追加编号。
后续使用 `--page-id P-001` 更新，不改写其 URL 身份。
`--gap` 追加业务说明、来源或覆盖缺口；`--next-action` 指明可执行的下一项工作。
业务说明未知与页面交互验收分开记录，不能为了把页面标为通过而删除业务缺口。

### 3. 绑定真实编号并记录呈现

```text
python3 TASK_SCRIPT bind --task-dir TASK_DIR --revision 3 --page-id P-001 \
  --display-id A-001 --runtime-id shh-example --source-key name-filter \
  --actual --note "已用当前页面、控件属性和父级上下文核对唯一对应" \
  --evidence evidence/runtime-export.json
```

这里的编号必须来自实际运行时导出，示例值不能直接用于业务任务。未接入时只记录
资料键和下一步，不伪造正式绑定。相同 `A-001` 可以分别属于不同页面状态，
按 `pageId + displayId` 查找；同一页内不同目标不能共用运行时 ID。
改绑已有编号需要显式 `--replace` 及新的实际观察和证据，旧值仍在历史版本中。
新增、改绑或更新绑定证据会使该页旧呈现与检查失效；相同编号、来源键和同一证据的
重复登记不会清空已有验收。两个不同页面可以使用同号，不能以同号跨页覆盖。

```text
python3 TASK_SCRIPT page --task-dir TASK_DIR --revision 4 --page-id P-001 \
  --status presented --actual --note "原页气泡与右侧详情已可打开" \
  --presentation-version v1 --evidence evidence/original-page-overlay.png \
  --next-action "逐项验收原页交互"
```

`presented` 的最小门槛是有证据的受支持写入能力、实际运行时绑定和实际原页呈现记录。
CLI 不会检查截图像素或执行页面操作；agent 仍需亲自核对记录对应的是目标原页。
重新呈现不同版本、引用不同证据文件或内容变化时，旧通过检查失效为 untested，
必须针对新版本复验；不能沿用旧截图的通过状态。相同版本与相同证据重复登记可保留检查。

### 4. 登记实际检查，再标记交互验收

每页至少包含以下固定检查，初始全部为 `untested`：

| 检查 | 需要实际核对 |
| --- | --- |
| `coverage` | 本次明确页面／状态内的控件覆盖、定位和未摆放项；不是全站覆盖率 |
| `multi_open` | 多条气泡可同时打开，详情与控件对应 |
| `edit_save_refresh` | 修改、保存、刷新后仍能读取原编号与内容 |
| `navigation` | 适用的页签、路由、弹窗、滚动与关闭后原交互；无对应交互时说明实际核查范围 |
| `manual_preserved` | 重扫／导入后人工内容、证据与修订保留 |

```text
python3 TASK_SCRIPT check --task-dir TASK_DIR --revision 5 --page-id P-001 \
  --name edit_save_refresh --result pass --actual \
  --note "原页修改并保存后刷新，原编号及修改内容保持" \
  --evidence evidence/save-refresh-observation.txt
```

`pass` 和 `fail` 均要求 `--actual`、具体结果及既有证据；没有实际测试时用
`--result untested` 并解释原因。失败或未测试记录会把页面标为 `blocked`，
不能用修改状态覆盖。重新实际测试通过后再推进；旧结果在历史版本中保留。
任何一项缺少实际通过记录，都不能标为 `verified`。
通过记录只能在当前实际呈现之后登记；尚未呈现时可以记录失败或未测原因，
但不能预先通过。实际重新呈现新版本会把此前检查重置为未测，必须针对新呈现复验。

```text
python3 TASK_SCRIPT page --task-dir TASK_DIR --revision CURRENT --page-id P-001 \
  --status verified --next-action "保留权限规则缺口，继续下一已登记页面"
```

`verified` 仅表示**该登记页面的呈现与交互检查记录已验收**，不表示所有业务说明已证实，
也不表示整个系统已完成。保存目录中的证据必须仍然存在且 SHA-256 未变。
`status` 会区分历史 `recordedStatus` 与证据核对后的当前有效 `status`；证据缺失或变化时，
当前输出降为 blocked 并列出 evidenceIssues，不改写旧历史。CLI 无法独立认证调用者
提供的观察是否真实，所以所有输出明确标识 `recordingOnly`。
业务冲突、缺失和来源待确认继续保留在 `gaps` 及标注字段中。

## 状态与恢复

### 展示工作流

任务建档后，以及阶段切换、阻塞变化、验收与交付时，由 agent 运行：

```text
python3 TASK_SCRIPT workflow --task-dir TASK_DIR
```

命令先按 `status` 的规则核对现有记录与证据，再在同一私有任务目录生成
`workflow.html`。它不修改任务修订、页面状态或历史，不登记新验收结果。
agent 打开或给出此文件的本地入口，并以简短文字说明当前阶段、未完成项和下一步。
用户只需说“展示当前工作流”或“继续上次”，无需维护 JSON 或运行脚本。

看板包含六阶段的输入／动作／产出、页面状态统计、编号查找、状态筛选、五项交互检查、
业务缺口及下一步。当前没有业务说明完成率字段，所以编号绑定数量不能标为“理解完成”。
证据失效时显示受阻／待复验，历史通过保留历史含义。

HTML 是带生成时间和修订号的自包含只读快照，没有外部请求；浏览器刷新不会重新读取
`task.json`，agent 必须在进度变化后重新生成。它包含任务范围、页面名称、编号及缺口，
按任务私有资料保存，不复制证据正文，不上传到公开仓库。
`assets/workflow.html` 未填任务数据时仅显示明确标识的虚构流程样例，不是实际 agent 执行记录。

- `discovered`：只登记了页面状态，没有宣称原页已有气泡。
- `presented`：记录了实际原页呈现；默认检查仍可未测，不等于交互验收。
- `verified`：五项规定的呈现／交互检查有实际通过及证据；不是业务规则全部确认。
- `blocked`：有失败、明确未测的检查，或 agent 主动登记具体阻塞原因。

```text
python3 TASK_SCRIPT page --task-dir TASK_DIR --revision CURRENT --page-id P-001 \
  --status blocked --reason "只有只读浏览器接口" --next-action "继续资料映射并报告写入缺口"
```

`status` 只统计已登记页面状态数量、各状态、缺口和下一步。不会自动爬站，
不会生成精确覆盖率，也不会提供“整站完成”结论。失去当前写入能力时应更新能力记录；
历史呈现记录不等于当前环境仍可写。实际来源或界面换版时，由 agent 重核受影响检查。

## 本机就绪检查

```text
python3 TASK_SCRIPT doctor
python3 TASK_SCRIPT doctor --codex-home PATH_TO_CODEX_HOME
```

`doctor` 仅检查本机配置名称与支持资源是否存在。它始终将 named agent 调度、
模型请求、原页写入和交互验收列为 `not-tested`。配置文件存在、doctor 通过、
独立 agent 已被真正调度、目标原页已完成标注，是不同层级的事实。
