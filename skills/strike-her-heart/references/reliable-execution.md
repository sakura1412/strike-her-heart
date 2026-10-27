# 可恢复执行与确定性约束

本协议由 Strike Her Heart 在标注任务中使用。用户仍在 Codex 中发起或继续任务，
agent 维护记录并使用获支持的页面执行工具；队列工具不在后台自动调用模型或浏览器。
真实业务记录、快照与证据放在源码仓库之外的私有任务目录。

## 页面队列和检查点

每个工作项关联稳定页面 ID 与执行阶段，存入同一 `task.json` 的 `workQueue`。
当前队列执行 `annotation`、`presentation` 和 `acceptance` 三个阶段，面向已登记页面及真实
控件绑定；前序页面发现仍由任务状态机管理。快照控件集合必须与本页绑定一致，新发现的控件
先登记绑定，再核对队列基线。
队列与页面状态共用修订检查、进程锁、原子保存和历史，避免多个进度文件相互矛盾。
工作流看板显示本次快照中的队列状态、尝试次数、下一次可重试时间与完成控件数；
队列完成不自动代表页面已验收或任务已完成。

默认最多 3 次尝试、基础退避 2 秒、退避上限 60 秒、每次租约 120 秒。新配置仅适用于
之后入队的工作，重复入队不会重置原尝试次数。耗尽后保持 failed；只有人工明确允许追加，
agent 才能用 `reconcile --reviewed --additional-attempts N` 登记新的有限预算与实际依据，
原尝试次数和检查点仍保留。

agent 通过 `task.py queue --action ... --task-dir TASK_DIR --revision CURRENT` 操作：

| 动作 | 用途 |
| --- | --- |
| `configure` | 设置尝试次数上限、退避间隔上限和执行租约超时 |
| `enqueue` | 按页面和阶段登记工作；声明操作副作用和适用的幂等键 |
| `reconcile` | 实际重读目标页面与控件快照，核对上次检查点；变化必须复核 |
| `claim` | 领取已经到期且完成本次重核的工作，返回一次性执行租约 |
| `checkpoint` | 保存已完成的真实控件绑定与当前快照，供后续继续 |
| `report` | 上报本次实际结果或分类错误，验证当前租约及证据 |
| `reap` | 回收已过期的租约并按错误、副作用和重试预算决定去向 |

下面为命令形状；文件和编号必须替换为本次实际观察，不能把示例当证据：

```text
python3 TASK_SCRIPT queue --action enqueue --task-dir TASK_DIR --revision CURRENT \
  --page-id P-001 --phase annotation --side-effect read_only
python3 TASK_SCRIPT queue --action reconcile --task-dir TASK_DIR --revision CURRENT \
  --job-id JOB_ID --snapshot evidence/page-current.json \
  --actual --note "已实际核对本页与控件清单" --evidence evidence/observation.txt
python3 TASK_SCRIPT queue --action claim --task-dir TASK_DIR --revision CURRENT --job-id JOB_ID
python3 TASK_SCRIPT queue --action checkpoint --task-dir TASK_DIR --revision CURRENT \
  --job-id JOB_ID --lease-token LEASE_TOKEN --binding-id A-001 --checkpoint-result done \
  --actual --note "本控件说明已完成并核对" --evidence evidence/control-result.txt
python3 TASK_SCRIPT queue --action report --task-dir TASK_DIR --revision CURRENT \
  --job-id JOB_ID --lease-token LEASE_TOKEN --outcome succeeded \
  --actual --note "本工作项当前控件均已处理" --evidence evidence/page-result.txt
```

`claim` 未领取成功时读取返回原因，不执行对应工作；只有领取成功后返回的租约可以上报。
错误上报使用 `--outcome error --error-code model_timeout` 等枚举和实际证据。保存标注是可逆
写入，不能为了获得自动重试把它标为 read_only；幂等操作还需明确 `--idempotency-key`。

每次领取都需要新的实际页面核对；旧 reconcile 不能重复领取。页面或控件新增、缺失、
定位特征或内容变化时，旧检查点不再自动证明本次工作完成。人工完成核对后用显式复核记录
更新基线。检查点只能引用本页已有的控件绑定，不能用任意编号凑齐进度。

租约 token 防止崩溃前的迟到结果覆盖新尝试，也绑定任务执行轮次。任务取消、重开或恢复后，
旧 worker 不能继续提交结果。普通页面记录更新会增加修订，调用者应重读修订后上报；
修订相同不等于租约仍有效。

自动重试使用有上限的指数退避，尝试上限包含首次执行。超时只说明调用未在租约内返回，
不证明业务操作没有发生。网络、模型超时或浏览器崩溃仅在只读、无副作用或明确幂等的操作中
可自动安排重试；副作用未知、登录过期、权限不足、验证码、定位变化和未知错误需要人工处理
或复核。不能通过自动重复登录、真实提交或无限重试消除阻塞。

执行者应为浏览器和模型调用设置不超过剩余租约的实际超时。工具不会中止外部浏览器进程，
也不会自动唤醒已结束的 Codex 会话；用户继续任务时，agent 读取同一队列、处理过期租约、
重新检查目标，再执行下一项。

## 控件身份与重新匹配

定位器用于找到候选节点，不能单独证明它就是之前的业务对象。每条标注额外保存
`identity`，保留原 `anchor` 供定位与兼容使用：

| 字段 | 含义 |
| --- | --- |
| `page_id` | 运行时页面范围身份，与任务清单的 P 编号通过绑定对应 |
| `state_id` | 页签、弹窗及业务实体上下文身份 |
| `element_id` | 上述范围内稳定的控件身份 |
| `selector_fingerprint` | 当前定位特征摘要 |
| `content_hash` | 当前可观察内容与声明的摘要，不读取密码或用户输入值 |
| `mapping_confidence` | 本次匹配的确定程度，不是模型说明正确率 |

稳定行键与行内唯一控件语义共同识别列表操作；行内新增按钮不能把后续序号当作原身份。
复用弹窗的客户／实体上下文参与状态身份，标注、打开详情及草稿一同隔离。
缺少可靠实体键、存在重复候选或旧数据不足时，旧记录保留为待复核或暂未关联，新对象不得
继承原人工说明。保守创建新编号优于静默错配，后续复核应明确原对象与目标对象的对应。

导入先校验页面、状态与控件身份的唯一匹配，再执行现有人工字段保护和合并。旧数据只有在
简单稳定 ID、无实体上下文歧义时才兼容恢复；存在歧义的导入会跳过并说明原因，不先改写
目标再添加警告。文本、属性或目标内容改变时重新核对说明，身份稳定不代表内容仍正确。

支持的原页运行时可调用只读 `getQueueSnapshot({pageId, stateKey})`，以任务页面 ID 和语义
状态键导出当前可见控件的队列快照。输出只包含当前目标与身份摘要，不以历史缓存中的
所有标注冒充当前页面控件清单。agent 保存为新的私有证据文件后交给队列 reconcile。

控件经实际核对确认已经移除时，可使用 `task.py unbind --page-id P-001 --display-id A-001
--reason ... --actual --note ... --evidence ... --revision CURRENT` 显式退役旧绑定。原绑定、
原因和证据保留，旧呈现和验收失效；复用退役编号需要显式 `bind --replace` 和新证据。不得
以退役方式隐藏仍存在或难处理的控件。

## 结论与来源的关联

在原有说明及 `evidenceMeta` 之外，`claimRecords` 按字段保存结论片段，`claimSources`
以来源 ID 索引证据。片段按顺序拼接必须等于字段完整文字；每片包含 `text`、该文字的
UTF-8 `textSha256`、`type`、`kind`、`scope`、`controlFingerprint` 和 `sourceRefs`。
来源记录包含相同 `type`、私有任务目录相对 `path`、文件 `sha256` 与 `locator`；
实测来源还需要 `action`、`result`、`observedAt`，文档来源需要 `version`、`quote`。
具体文件哈希由工具计算，不能凭空编造。字段文字、控件身份或文件变化会使关联失效。

| 证据类型 | 可用于的结论 |
| --- | --- |
| `DOM_OBSERVED` | `visible_content`、`dom_constraint`、`declared_destination`：只描述页面可见内容、属性或链接声明 |
| `INTERACTION_VERIFIED` | `observed_behavior`、`permission_outcome`、`observed_effect`：仅限 `observed_session` 这一实际会话 |
| `DOCUMENT_SUPPORTED` | `specification`：仅说明文档规定，`scope` 必须为 `specification`，`derivation` 为 `explicit` |
| `INFERRED`、`UNKNOWN` | 继续待确认，不能作为已证实的权限、限制或操作后果 |

例如按钮文字只能支持按钮存在；不能据此确认提交后创建记录或某角色拥有权限。
原文字和人工修订继续保留，缺少合格关联的旧数据不能自动升级为已确认。运行时显示关联
状态；来源文件及哈希由独立验证器检查。哈希不能证明模型解释与引用在语义上确实一致，
需要 agent 或评审人核对。

## 独立完成判定

在真实页面保存后，由 agent 调用 `getVerificationSnapshot({pageId,stateKey})` 保存当前
快照；实际刷新页面后再保存第二份快照。每份包含当前扫描的控件、实际从当前站点本地
存储读回的记录、未保存草稿和本次运行实例 ID。两次实例必须不同。

在私有目录创建 bundle：`{"pages":[{"pageId":"P-001","before":"evidence/before.json",
"after":"evidence/after.json"}],"report":{"pages":1,"verifiedPages":1,"controls":3}}`。
其中页面和数量必须按实际任务构造。然后执行 `task.py verify --task-dir TASK_DIR --revision
CURRENT --bundle evidence/bundle.json --actual --note ... --evidence evidence/observation.txt`。
验证器核对任务页面清单、绑定与当前扫描、刷新后保存内容、人工修改、未解决冲突、结论
来源和报告数量；失败则拒绝登记验证结果。`completed` 还要求该验证结果及相关文件在读取时
仍有效。后续页面、绑定、能力或检查修改会使原验证失效。

快照覆盖的是运行时可识别的当前 DOM 范围；跨域 iframe、封闭 Shadow DOM、Canvas 和尚未
发现的页面仍需另行核查。此验证检查记录和文件一致性，不认证执行者的观察是否真实，也不
独立控制浏览器刷新。agent 必须亲自执行刷新和核验，不能伪造快照。

## 执行权限

原页运行时提供 `performAction` 固定动作入口，默认许可 `read_snapshot`、`scan_controls`
及 `write_annotations`（仅当前页、唯一匹配的标注数据）；扫描会保存识别结果，因此按标注
写入处理。标注写入会检查保存结果。
业务提交、删除、审批、对外发送和任意点击均拒绝，泛化的详情展开也因无法证明只读而不执行。
读取和标注写入是本任务默认权限；超出当前执行器范围的动作需要用户明确授权并通过具备
相应权限与确认机制的独立执行方式，且执行后验证结果。

| 类别 | 权限与确认 | 执行后验证 |
| --- | --- | --- |
| 只读 | 用户给出的目标与资料范围内可读取；不需要额外确认 | 检查目标和状态，记录读取范围与遗漏 |
| 低风险页面操作 | 当前网关无法保证页面事件无副作用，因此不自动执行；其他具备可靠只读能力的执行方式须保持用户授权范围 | 核对实际展示与页面状态，并记录结果 |
| 可逆标注写入 | 默认只允许当前页面、身份唯一匹配的标注内容 | 网关读回本地存储；任务完成另需实际刷新后验证 |
| 高风险业务操作 | 提交、删除、审批、发送与任意点击在此网关内一律拒绝；其他执行方式须有该动作的明确授权及适用的确认 | 只在获授权的执行方式中核对真实结果；未知结果不得自动重放 |

此网关只约束经它调用的运行时动作。Codex 会话中其他继承的浏览器或系统工具不经过此网关，
网关无法拦截这些工具；agent 必须遵守同样的操作边界，不能把网关拒绝当成全局沙箱保证。
