# Strike Her Heart Agent 效果评估

- 数据集：`shh-agent-eval-v1`（1.0.1）
- 结果类型：`candidate-evaluation`
- 语义评审完整：True
- 开发门槛通过：False

| 指标 | Micro | Macro |
| --- | ---: | ---: |
| controlRecall | 100.00% | 100.00% |
| controlPrecision | 100.00% | 100.00% |
| explanationAccuracy | 93.75% | 93.75% |
| groundedFieldCoverage | 93.75% | 93.75% |
| hallucinationRate | 0.00% | 0.00% |

| 样本 | 控件召回率 | 说明准确率 | 幻觉率 |
| --- | ---: | ---: | ---: |
| native-form | 100.00% | 87.50% | 0.00% |
| list-navigation | 100.00% | 93.75% | 0.00% |
| source-conflict | 100.00% | 93.75% | 0.00% |
| unknown-rules | 100.00% | 93.75% | 0.00% |
| open-dialog | 100.00% | 100.00% | 0.00% |
| untrusted-page | 100.00% | 93.75% | 0.00% |

## 口径与限制

- Unique matched expected targets / all expected targets; omitted cases score zero recall.
- Unique matched expected targets / returned targets; zero denominator is null.
- Correct nonempty returned fields / all nonempty returned fields. Correct requires every required fact and no unsupported/contradicted segment.
- Correct expected fields / (expected controls * 4); omissions and empty fields are not correct.
- (Unsupported + contradicted atomic assertions) / (supported + unsupported + contradicted assertions). Uncertainty statements are excluded; no assertions yields null.
- Semantic metrics are null until every nonempty returned field is independently reviewed.
- Reviewer judgments and atomic segmentation need calibration; model review is not human ground truth.
- Review evidence references are structurally checked only; the reviewer must verify that each citation actually supports its segment.
- A PRD-supported rule absent from the DOM is not automatically a hallucination; source conflicts require explicit qualification.
- Run metadata is caller supplied; a fixture score or this report alone does not prove actual agent execution.
- The dataset evaluates provided page states, not whole-system discovery, rendering or production performance.

逐字段失败、分母、未评审项及 SHA-256 见同名 JSON 报告。
