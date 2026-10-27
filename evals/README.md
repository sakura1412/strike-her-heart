# Strike Her Heart · Agent 效果评估

这里评估 agent 能否识别应标控件、正确解释页面与 PRD，并克制无依据的业务规则推断。
原有 Playwright 测试继续验证气泡、侧栏和保存交互；本评估不将渲染器通过率算成 agent 效果。

已完成 [首轮实际 agent 基线](results/2026-10-27-run-01/README.md)：6 个样本、24 个控件，
控件召回率 100%，严格字段完整正确率 93.75%，独立模型评审幻觉率 0/297；开发门槛未通过。
原始候选、评审、失败明细和可重算报告全部保留。数据集修订见 [版本记录](CHANGELOG.md)。

## 样本与标准答案

`dataset.json` 是固定版本的合成开发评估集。每个样本包含：

- `page.html`：可独立打开的本地页面，定义当前待标注状态。
- `prd.md`：该页面的产品需求；可能包含 DOM 不直接显示的规则或与页面不一致的旧要求。
- `expected.json`：应标控件、四项参考说明、必须覆盖的事实、来源原文及禁止推断的示例。

标准答案由本项目作者建立，尚待外部产品专家校准。公开样本属于开发集，不能作为未见过的
隐藏测试集。首次真实运行不根据结果反改答案；修改标准后升级数据集版本并重新记录摘要。
后续应加入真实脱敏样本、独立留出集与重复运行，才能评估稳定性和对实际业务的适用性。

## 指标口径

| 指标 | 分子 / 分母 | 用途 |
| --- | --- | --- |
| 控件召回率 | 命中的标准控件 / 所有标准控件 | 漏页、漏控件会降低分数，缺失 case 计作零召回 |
| 控件精确率 | 命中的标准控件 / 输出的控件 | 暴露隐藏控件、范围外或不存在的控件 |
| 说明准确率 | 完整正确的非空说明字段 / 所有输出的非空说明字段 | 四字段分别判定，必须覆盖本字段必要事实且无错误断言 |
| 有据说明覆盖率 | 完整正确的标准字段 / 所有标准控件的四字段 | 补充召回，防止少写或空写换取高准确率 |
| 幻觉率 | 无依据或与证据相矛盾的断言 / 所有事实断言 | 正确的“未知／待确认”不算事实断言 |

**事实依据是实际页面与所给 PRD 的并集。** PRD 已写明但界面未直接展示的规则不算幻觉，
说明应注明其来源。二者冲突时正确答案须保留两方并指出待复核；未经证实的权限、自动动作、
收费、成功结果或跳转，若被肯定陈述则判为无依据或矛盾。明确表示未知并非幻觉，但不能用
“全部未知”代替已经提供的事实。

分数附带每个样本的分子、分母及错误明细。空分母用 `null`，语义评审未完成时不显示完整
说明准确率或幻觉率；“没有评分”不能显示为“零幻觉”。默认开发门槛为召回、精确率、说明准确率与
有据说明覆盖率各不低于 95%，幻觉率不高于 2%，且评审完整。它们是本项目的初始回归门槛，
不是行业基准；小样本的一个错误也会显著改变结果。

## 运行流程

1. 准备只含输入的独立目录：

   ```bash
   python3 scripts/prepare_eval.py --output /tmp/shh-eval-inputs
   ```

2. 在新上下文中实际调用 **Strike Her Heart**，只提供该目录的 `PROMPT.md`、`inputs.json`、
   页面与 PRD。输出 `predictions.json`。候选 agent 不得读取 `expected.json` 或评审记录。
   本地输入包隔离的是提供内容，不是操作系统权限沙箱；强隔离需由调用环境另行限制可读目录。
3. 冻结预测文件，保存实际调度记录、agent 配置与输入文件摘要。由未参与本次候选生成的
   人工或模型评审，对照标准与原始输入逐字段审查。模型评审是可复核的辅助判断，不伪称人工金标。
   可复用 [独立评审提示](REVIEW_PROMPT.md)，让生成者与评审者保持分离。
4. 生成指标报告：

   ```bash
   python3 scripts/evaluate.py --dataset evals/dataset.json \
     --predictions /tmp/shh-eval-inputs/predictions.json \
     --review /tmp/shh-eval-review.json \
     --output /tmp/shh-eval-report.json --strict
   ```

不提供 `--review` 仍能计算控件指标，但语义评分保留未完成。运行产物默认放在私有工作目录
或被忽略的 `test-results/`；不要把实际客户页面、PRD、凭据或评审原文上传到公开仓库。
此工作流使用当前 Codex 环境的 agent 调度，不要求额外 API Key，也不创建付费 API 调用。

## 输出与评审协议

候选输出采用 `schemaVersion: 1`、`datasetId`、`run` 与 `cases`。每个 case 下的
`annotations` 使用实际 `target: "#id"`，`fields` 的 `content`、`function`、`limits`、
`navigation` 均为中文字符串。重复 case、重复目标及未知 case 拒绝评分；范围外的目标保留为
误报。`run.kind` 应明确是实际 `agent` 还是测试 `fixture`，该自报字段本身不证明真实调度。

评审文件示意：

```json
{
  "schemaVersion": 1,
  "predictionSha256": "预测文件原始字节的 SHA-256",
  "datasetSha256": "evaluate.dataset_digest(dataset_path) 的结果",
  "reviewer": {"kind": "model", "name": "独立评审标识"},
  "fields": [{
    "caseId": "case-id",
    "target": "#control-id",
    "field": "limits",
    "matchedFactIds": ["该字段中真正覆盖的标准事实 ID"],
    "segments": [{
      "text": "候选字段中的精确原文",
      "verdict": "supported",
      "reason": "对照原文的简短判定依据",
      "evidence": ["page:#control-id", "prd:约束"]
    }]
  }]
}
```

评审者必须阅读整段说明并按最小可判定断言分段。同字段的 `segments[].text` 顺序拼接必须
与候选字段完全一致；这防止追加的幻觉句被漏审。每段必须有理由；`supported` 与
`uncertainty` 需列来源。可用结论为 `supported`、`unsupported`、`contradicted`、
`uncertainty`。冲突被准确归因并保留时可以是 supported；“不清楚”只有在资料确实未定义时
才判 uncertainty。引用存在不自动意味着它支持该断言，评审者必须核对相关性。

`matchedFactIds` 只能来自对应 case、目标及字段。评分器据此检查必要事实覆盖，并对
缺字段、错误断言、漏审、过期摘要和分母为空作保守处理。评分器验证格式、引用归属和计数，
不能独立认证语义判断；应定期由产品专家复核模型评审并保存分歧。

本版“说明准确率”采用严格的**字段完整正确率**，它同时要求事实正确与本字段必要内容齐全。
信息出现在其他字段时可能被记为必要事实遗漏，但不因此记作幻觉。报告应区分这类字段协议问题
与实际错误断言；标准有争议时保存评审备注，不能在看到本轮输出后偷偷修改标准来提高得分。

评分器的完美答案、遗漏、错误规则和空输出测试是**评估器自测**。它们不代表实际 agent
达到同样分数。真实运行报告应同时标明样本版本、候选来源、评审来源、输入隔离方式、运行次数
和未验证范围。

设计参考：[OpenAI 官方评估实践](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
建议使用贴近任务的数据、明确标准与可复核评审；[评分器指南](https://developers.openai.com/api/docs/guides/graders)
强调防止评分漏洞并用标准答案校准开放式判断。本项目采用本地文件协议，不依赖其托管评估服务。
