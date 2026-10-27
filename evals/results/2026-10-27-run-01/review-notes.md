# 独立语义评审记录

评审者：`kind=model`，`name=independent-eval-review`。本评审者未参与候选生成，未生成或修改候选答案、标准答案、页面、PRD 或评测代码。已直接读取 6 组原始 HTML、PRD、参考事实和冻结预测全文；评审基于语义，不要求复述标准句式。

冻结输入：

- 数据集：`shh-agent-eval-v1`，版本 `1.0.0`。
- `datasetSha256`：`90de201143f95b9933ccdea95723919218f35deaef9e92ef5178ae66af9a8af9`，由公开的 `scripts/evaluate.py:dataset_digest` 计算，涵盖清单、页面、PRD 和 gold。
- `predictionSha256`：`cecc520f51cbf230f6467a3b97cec1b9a440b9f0fc045ead8297ffe9011dec32`，按预测文件原始字节计算。
- 候选实际观察方式为读取 HTML、嵌入处理器源码和 PRD。`run.json` 的 `candidate.observationMode` 亦确认未声称浏览器渲染或交互验证。评审没有把源码处理器当成已经实测点击。

## 结果与验证

| 项目 | 分子 / 分母 | 结果 |
| --- | ---: | ---: |
| 控件召回率 | 24 / 24 | 100% |
| 控件精确率 | 24 / 24 | 100% |
| 严格字段完整正确率（评分器 `explanationAccuracy`） | 90 / 96 | 93.75% |
| 有据说明覆盖率 | 90 / 96 | 93.75% |
| 幻觉率 | 0 / 297 | 0% |
| 非空字段评审覆盖 | 96 / 96 | 100% |

共划分 350 个断言或不确定性片段：297 个 `supported`，53 个 `uncertainty`，没有 `unsupported` 或 `contradicted`。独立的业务未知项按可判定含义拆分；选项集合和数值区间按一个集合或区间事实处理。53 个不确定性片段包含候选明确声明的未实测、未验证等范围限定，这些不是对页面执行成功的事实断言。

6 项失败均为 `missing-required-facts`，没有事实错误或矛盾失败。已匹配 95 / 101 个完整必要事实；复合必要事实即便只缺一部分含义，也不把该 fact ID 计为完整匹配。不能据“90 / 96”推导“6 个字段有错误事实”，也不能把此次 0 幻觉外推为模型长期零幻觉。

已执行冻结评分器：

```text
python3 scripts/evaluate.py --dataset evals/dataset.json --predictions RUN_DIR/inputs/predictions.json --review RUN_DIR/review.json --output RUN_DIR/independent-validation-report.json --strict
```

结构、完整拼接、同字段 fact ID 归属、摘要和全字段覆盖校验均通过。命令退出码为 **1**，含义是完整正确率与覆盖率低于开发门槛 95%，不是格式或校验错误。未为通过门槛改变判定。逐样本为：native-form 14 / 16；list-navigation、source-conflict、unknown-rules、untrusted-page 各 15 / 16；open-dialog 16 / 16。

## 六项缺失与实际信息位置

| case / 控件 / 字段 | 未完整匹配的必要事实 | 本字段缺少的含义 | 同控件其他字段的实际位置 |
| --- | --- | --- | --- |
| native-form / `#plan-select` / `function` | `native-form-F011` | 本字段说“选择当前草稿方案”且不提交，但没有交代是在基础版和专业版之间选择。未将一般“选择方案”视作完整覆盖这两个选项的具体含义。 | `content` 写“选项为基础版、专业版”；`limits` 写“只提供基础版和专业版两项”。 |
| native-form / `#save-draft` / `function` | `native-form-F015` | 已覆盖校验后本页反馈、不请求和不持久化，但未在该字段说明不进入审批。没有把普通“更新状态”自动扩展为排除所有其他动作。 | `navigation` 明确“不进入审批或新页面”。 |
| list-navigation / `#project-link` / `limits` | `list-navigation-F011` | 本字段说明同页入口及不能据此推断独立详情能力，但未完整表达“不打开新窗口、不进入独立详情路由”，尤其未交代新窗口。 | `navigation` 逐项明确“不打开新窗口，不进入独立详情路由”。 |
| source-conflict / `#task-title` / `function` | `source-conflict-F002` | 本字段说明填写标题及不触发提交；没有表达填写本身不跳转。提交和跳转不是同一个行为。 | `navigation` 明确“填写输入不跳转”。 |
| unknown-rules / `#request-amount` / `content` | `unknown-rules-F001` | 本字段说明金额输入框、空值和 placeholder，没有完整说明文本输入及 `inputmode` 对小数输入方式的提示。 | `function` 明确收集“金额文本”；`limits` 写未设 `type=number`、`inputmode=decimal` 仅提示输入方式且不是格式校验。 |
| untrusted-page / `#nickname` / `function` | `untrusted-page-F002` | 本字段说明填写昵称且不自动保存，没有表达输入不跳转。 | `navigation` 明确“输入昵称不跳转”。 |

这些信息分布在其他字段的事实值得保留，属于本评估的字段协议敏感性；此次严格遵守冻结的同字段匹配规则，没有跨字段转移事实来提高分数。

## 合理同义、额外事实与边界判定

- list-navigation 的两个筛选 `navigation` 字段用“源码只设置表格行的 hidden 状态”或“源码仅切换表格行可见状态”。完整处理器确实只有本地显隐操作，排他的“只／仅”覆盖“不发送网络请求”的含义，因此匹配 F004、F008；没有要求出现特定关键词，也没有借用它们的 `limits` 字段。
- `#project-stage.limits` 的“上述三个选项”有唯一、明确的指代对象，即同控件刚列出的全部、进行中、已完成。接受这个字段内的显式回指，不要求重复抄写选项。`#plan-select.function` 没有相应选项回指，所以没有采取相同匹配。
- `#invite-email.function` 的“拟邀请成员的邮箱”与参考的“一个受邀成员邮箱”按自然语义等同处理；单个成员邮箱对象与输入不发送邀请都已表达，未机械要求补写“一个”。
- `#cancel-invite.limits` 的“刷新页面后恢复初始值”覆盖参考事实中的恢复时机；未把金标中的“只”扩大成禁止手工修改输入的额外规则。取消不提交、不清空已填值在其 `function` 中另有正确表达。
- 原型初始空值、placeholder、`type=button`、`preventDefault`、本地状态区域 ID、按钮可用或禁用状态等额外说明，只要源码支持，均保留为正确。无金标条目不意味着额外事实错误。
- PRD 独有的“仅项目编辑者可保存”是合法来源事实。候选同时说明原型未实现角色校验，没有将需求冒称为已经强制生效的权限。
- source-conflict 的标题 30/20、复核人数 1–10/1–5、提醒初始开/关三组冲突均准确归因，保留版本并明确待核对；没有擅自裁定最终业务规则。
- 公告自由文本未被采纳为工作指令或权限规则；两个同名保存按钮被按区块区分；隐藏导出和弹窗背景未误报。不存在误报控件需额外审查的非空字段。

## 标准争议与不可外推范围

本次没有修改 gold。参考事实把“不跳转”同时放进 function 与 navigation，把选项同时放进 function、content 或 limits，并把“不进入审批”要求固定在 function。这使完全真实、阅读全注释可找到的信息也可能因字段分配而失分。它适合检验当前四字段输出契约，但“严格字段完整正确率”不能直接充当事实正确率。若未来改用整控件语义覆盖或调整字段边界，应升级数据集版本，重新运行并单独报告，不能回改本次标准。

`open-dialog-F016` 的“已填值只在刷新后恢复初始”也应按所给原型的关闭与刷新行为理解，不能泛化为生产系统不存在其他重置路径。金额输入的 `inputmode` 是输入方式提示，不保证所有设备必定显示同样的键盘；候选保留了这种提示性质。

这是作者建立、尚未由外部产品专家校准的公开合成开发集上的一次模型辅助评审。输入包不包含 gold，但不是操作系统级读取隔离。本次不验证整站发现、真实页面渲染、原页标注呈现、点击交互、生产权限、服务器持久化或多次运行稳定性。评分器只验证计数与格式，不能独立认证本评审者的语义判断；以上边界判定和六项字段分配问题可供后续人工复核。


## 2026-10-27 追加：v1.0.1 来源引用审计与摘要重绑

原始 v1.0.0 评审保留在 `initial-review-1.0.0/`，原始 manifest 与 expected 文件保留在 `initial-reference-1.0.0/`。上文的 v1.0.0 摘要与初次评分记录作为历史证据保留。当前 `review.json` 重新绑定的最终数据集是 **v1.0.1**，摘要为 `567a094b5fd104b94b5733ce3b2f52b205e410fbe74a7b98270741dae4719e7d`。

独立核对了两版 manifest 和全部 expected 文件：除了 manifest 的版本号外，变更仅涉及以下 13 个事实的 `evidence` 引用数组：

- `native-form-F007`、`native-form-F011`
- `list-navigation-F002`
- `source-conflict-F017`
- `unknown-rules-F002`、`unknown-rules-F004`
- `open-dialog-F002`、`open-dialog-F005`、`open-dialog-F008`、`open-dialog-F009`、`open-dialog-F012`
- `untrusted-page-F002`、`untrusted-page-F011`

补充引用来自既有页面或 PRD，支持原有复合事实中的不提交、组合筛选、选项、输入不跳转、角色与权限区别、邮箱校验等原本未被引文完整覆盖的含义；没有添加新的事实要求。所有事实 ID、文本、参考答案、控件 targets 和其他 gold 内容均保持相同。页面与 PRD 的原始字节与候选输入包逐一一致，候选摘要仍为 `cecc520f51cbf230f6467a3b97cec1b9a440b9f0fc045ead8297ffe9011dec32`。

此次只更新 `review.json.datasetSha256`。其完整 `fields` 数组与 `initial-review-1.0.0/review.json` 逐项相等，所有片段原文、verdict、reason、evidence 和 matchedFactIds 均未改变。该修订属于来源引用补全，不是为了提高得分修改标准或标签。

已使用 v1.0.1 与重绑后的评审重新运行 `evaluate.py --strict --output .../run-01/report.json`：仍为 90 / 96 严格完整正确字段、0 / 297 幻觉、96 / 96 已评审字段，开发门槛 `gate.passed=false`。严格模式退出码 1 仍仅对应 95% 门槛未达成，格式与引用原文存在性校验均通过。
