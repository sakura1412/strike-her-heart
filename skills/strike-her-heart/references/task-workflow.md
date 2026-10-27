# 任务状态机与可恢复记录

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

## 状态契约

任务有独立的执行状态，页面另外记录呈现与检查状态。两者不能混用：页面 `verified`
不自动推进任务，页面数量也不推导当前阶段。状态契约的机器定义为 `task.py` 中的
`STATE_CONTRACTS`，随 `status` 输出为 `stateContracts`，工作流看板使用同一份定义。

| 任务状态 | 进入条件 | 成功条件 | 失败去向 | 允许的下一步 |
| --- | --- | --- | --- | --- |
| `intake` 接收任务 | 新任务完成建档，或显式从头重开 | 明确目标、范围与资料，记录实际核对证据 | 缺条件 `blocked`；实际执行失败 `failed`；明确终止 `cancelled` | `access` 或三个异常状态 |
| `access` 资料与接入 | 接收阶段有实际证据 | 读取能力 supported，方法与证据仍有效 | 同上；写入不足可先整理独立资料，但不能完成原页呈现 | `discovery` 或三个异常状态 |
| `discovery` 发现页面 | 读取条件成立，或有有效前序记录后重开 | 至少一页，明确确认本次清单，保存清单指纹与发现证据 | 同上；未访问状态保留在清单中 | `annotation` 或三个异常状态 |
| `annotation` 逐控件说明 | 发现阶段证据及范围清单有效 | 每页真实编号绑定、说明产出证据和受支持的原页写入能力有效 | 同上；资料未知保留缺口 | `presentation` 或三个异常状态 |
| `presentation` 原页标注 | 说明和绑定条件成立 | 每个登记页面当前为 presented 或 verified，证据有效 | 同上；失败不能冒充已呈现 | `acceptance` 或三个异常状态 |
| `acceptance` 验收与续接 | 当前范围全部实际呈现 | 每页五项检查通过、刷新前后独立验证通过、无未解决缺口、阶段及范围证据有效 | 同上；验收失败保留证据 | `completed` 或三个异常状态 |
| `blocked` 受阻 | 缺条件或证据失效；有原因与可执行下一步 | 补齐条件，提供实际恢复证据 | 恢复仍缺条件保持受阻；实际失败可转 failed；用户可取消 | 显式 `--resume` 回原阶段，或 failed／cancelled |
| `failed` 失败 | 实际执行未通过；有失败证据、原因与下一步 | 修复后提供实际重试证据 | 未解决保持失败；缺外部条件可 blocked；用户可取消 | 显式 `--retry` 回原阶段，或 blocked／cancelled |
| `cancelled` 取消 | 用户明确终止或撤回本次范围；登记原因 | 保留历史并冻结普通修改，不作为成功 | 不隐式恢复 | 显式 `--reopen` 到 intake，或前序证据有效时到 discovery |
| `completed` 范围内完成 | 全部完成门槛通过，并显式提交有证据的转移 | 本次明确范围内完成，证据持续有效 | 后续证据失效使当前有效状态 blocked，历史 completed 保留 | 显式 `--reopen` 到 intake 或 discovery |

“失败去向”按实际事实区分：还不能测试是 blocked，已经测试且失败是 failed。
cancelled 只能记录用户明确终止，不能用来移除困难页面以凑完成。CLI 校验状态、记录和
证据完整性；是否确有用户取消授权、观察是否真实，仍由执行 agent 核对。

| 页面状态 | 进入与成功条件 | 失败状态 | 允许下一步 |
| --- | --- | --- | --- |
| `discovered` 已发现 | 已登记稳定身份；完成真实绑定与呈现后才能前进 | blocked／failed／cancelled | presented 或异常状态 |
| `presented` 已呈现 | 有当前写入、绑定、原页呈现证据；五项当前检查通过后才能验收 | blocked／failed／cancelled | verified、重新 discovered 或异常状态 |
| `verified` 交互已验收 | 五项当前检查实际通过；只证明该页交互验收 | 证据失效 blocked，检查失败 failed | 重新 discovered／presented 或异常状态 |
| `blocked` 受阻 | 有原因与下一步；解除条件后附实际恢复证据 | 未解除保持 blocked，实际失败 failed | `--resume` 到 discovered／presented，或 failed／cancelled |
| `failed` 失败 | 有实际失败记录；修复后显式重试 | 未修复保持 failed，缺条件 blocked | `--retry` 到 discovered／presented，或 blocked／cancelled |
| `cancelled` 取消 | 明确终止该页工作；保留原记录 | 不隐式恢复，不计入任务完成 | `--reopen` 到 discovered／presented |

所有正常任务转移逐阶段进行，不允许跳步；需要 `--actual --note --evidence`。
异常恢复还需要对应标记与当前证据。任务的 cancelled／completed 冻结普通修改；必须先
显式重开。重开到 discovery 只保留有效 intake／access 凭据，清除后续阶段凭据及范围确认；
早期取消、或前序证据失效时从 intake 重开。页面异常也不会因绑定或能力变更自动恢复。
活动阶段、blocked 和 failed 同样允许凭实际证据显式 `--reopen` 到 intake／discovery，
适用于新增页面、范围变化或前序证据需重做；这条修订路径无需先取消任务。上表的正常下一步
不表示可以省略重开标记，重开也不能绕过 discovery 所需的前序访问证据。

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

### 1. 记录接收结果，再登记能力

```text
python3 TASK_SCRIPT transition --task-dir TASK_DIR --revision CURRENT --to access \
  --actual --note "已核对本次目标、资料及授权范围" --evidence evidence/intake.txt
```

```text
python3 TASK_SCRIPT capability --task-dir TASK_DIR --revision CURRENT \
  --read supported --write unavailable --method "当前浏览器只读接口" \
  --evidence evidence/page-observation.txt --next-action "继续识别，原页写入保持未完成"
```

读取与写入各自为 `unknown`、`supported` 或 `unavailable`。`supported` 必须给实际方法
和已存在的证据文件。能力是调用者报告，CLI 不会因为文件存在就证明接口可写，
也不会自动安装扩展、扩权或调用 agent。写入状态、方法或其证据变更时，页面旧的呈现与
检查记录失效，旧结果仍保存在 `.history/`；能力不可用时正常页面进入 blocked，已有
blocked／failed／cancelled 保留。补齐能力后须显式恢复相应异常，再重新呈现、验收。

读取能力和证据有效后记录 `transition --to discovery --actual --note ... --evidence ...`。
若原页写入仍不具备，可继续发现与解释；推进到 presentation 时必须补齐写入条件。

### 2. 登记页面、状态与缺口

```text
python3 TASK_SCRIPT page --task-dir TASK_DIR --revision CURRENT \
  --url https://example.com/leads --state-key leads-all --label "线索列表·全部" \
  --status discovered --gap "权限规则未说明" --next-action "核对控件与资料对应关系"
```

相同净化 URL 与语义 state key 复用同一 `P-001` 页面状态 ID，新增状态追加编号。
后续使用 `--page-id P-001` 更新，不改写其 URL 身份。
`--gap` 追加业务说明、来源或覆盖缺口；`--next-action` 指明可执行的下一项工作。
业务说明未知与页面交互验收分开记录，不能为了把页面标为通过而删除业务缺口。

发现工作完成后，以 `transition --to annotation --scope-confirmed --actual --note ...
--evidence ...` 保存本次明确页面清单的指纹。新增页面会使原范围确认失效；必须重新核对
发现阶段，不能把新增或未访问页面漏出完成统计。

### 3. 绑定真实编号并记录呈现

```text
python3 TASK_SCRIPT bind --task-dir TASK_DIR --revision CURRENT --page-id P-001 \
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

每页完成实际绑定与说明，并核对写入能力后，记录
`transition --to presentation --actual --note ... --evidence ...`；证据须包含实际说明产出。

```text
python3 TASK_SCRIPT page --task-dir TASK_DIR --revision CURRENT --page-id P-001 \
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
python3 TASK_SCRIPT check --task-dir TASK_DIR --revision CURRENT --page-id P-001 \
  --name edit_save_refresh --result pass --actual \
  --note "原页修改并保存后刷新，原编号及修改内容保持" \
  --evidence evidence/save-refresh-observation.txt
```

`pass` 和 `fail` 均要求 `--actual`、具体结果及既有证据；没有实际测试时用
`--result untested` 并解释原因。失败记录使页面进入 `failed`，明确未测试使页面进入
`blocked`。使用对应 `--retry`／`--resume` 显式恢复后再测试，不能用 pass 静默清除异常；
旧结果在历史版本中保留。
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

所有页面实际呈现后，记录 `transition --to acceptance --actual --note ... --evidence ...`。
业务缺口用 `page --resolve-gap "原缺口完整文字" --actual --note ... --evidence ...` 解决；
工具保留原缺口、解决依据与历史，不能直接清空数组来获得完成。

保存、真实刷新并采集各页运行时快照后，按 [可恢复执行协议](reliable-execution.md) 运行
`task.py verify`。它确定性核对页面、绑定、保存前后内容、人工修改、来源和报告数量；
失败或未经验证不能转入 completed。

只有 `completion.eligible` 为真，才可登记
`transition --to completed --actual --note ... --evidence ...`。此前即使所有页 verified，
`taskComplete` 也仍为 false。完成要求范围清单未变、每页当前 verified、五项检查及前序
阶段证据有效、无取消页及未解决缺口；`wholeSystemComplete` 始终为 false。

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

看板包含当前有效执行状态、原因、允许下一步、完成条件缺口、尝试次数，以及全部状态的
进入／成功／失败／转移契约。六阶段徽标读取 `execution.phaseStates`，不从绑定数或页面
统计推测成功；页面支持 discovered／presented／verified／blocked／failed／cancelled
筛选。证据失效时显示当前受阻与历史状态，历史通过保留历史含义。

HTML 是带生成时间和修订号的自包含只读快照，没有外部请求；浏览器刷新不会重新读取
`task.json`，agent 必须在进度变化后重新生成。它包含任务范围、页面名称、编号及缺口，
按任务私有资料保存，不复制证据正文，不上传到公开仓库。
`assets/workflow.html` 未填任务数据时仅显示明确标识的虚构流程样例，不是实际 agent 执行记录。

任务受阻示例（页面受阻使用 `page --page-id P-001 --status blocked`）：

```text
python3 TASK_SCRIPT transition --task-dir TASK_DIR --revision CURRENT --to blocked \
  --reason "只有只读浏览器接口" --next-action "补齐已获授权的原页写入接入"
```

解除后使用 `transition --to 原阶段 --resume --actual --note ... --evidence ...`。
失败时登记 `--to failed --reason ... --next-action ... --actual --note ... --evidence ...`，
修复后用 `--retry` 返回原阶段。重试不自动通过此前失败的检查。
用户明确取消时登记 `--to cancelled --reason ...`；明确继续时再 `--reopen --to intake`
或 `--reopen --to discovery`，提供实际说明及证据。每次恢复／重试／重开保留操作历史。

`status` 每次重新核对证据。记录中 completed 而证据现已失效时，输出
`execution.recordedState=completed`、当前 `execution.state=blocked`、`taskComplete=false`
和具体缺口；读取不篡改原 manifest。旧 schemaVersion 1 仍可读取，缺执行记录时标记
legacy，保守地等待阶段补核，即使旧页面均已验收也不补造任务完成记录。

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
