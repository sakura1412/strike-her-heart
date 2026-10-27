#!/usr/bin/env python3
"""Score annotation outputs against a versioned dataset and an independent review.

Control identity is scored deterministically. Semantic truth is supplied by a
human/model reviewer, never inferred by string similarity or trusted from the
candidate. A complete review must account for every character of every returned
nonempty field. This program validates that accounting, not the reviewer's truth.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys


FIELDS = ("content", "function", "limits", "navigation")
VERDICTS = ("supported", "unsupported", "contradicted", "uncertainty")
DEFAULT_THRESHOLDS = {
    "controlRecall": 0.95, "controlPrecision": 0.95, "explanationAccuracy": 0.95,
    "groundedFieldCoverage": 0.95, "hallucinationRate": 0.02,
}
METRICS = ("controlRecall", "controlPrecision", "explanationAccuracy",
           "groundedFieldCoverage", "hallucinationRate")


class EvaluationError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise EvaluationError(message)


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise EvaluationError("Cannot read JSON %s: %s" % (path, error))


def schema(data, label):
    require(isinstance(data, dict) and data.get("schemaVersion") == 1,
            label + " must be a schemaVersion 1 object.")


def array(value, label):
    require(isinstance(value, list), label + " must be an array.")
    return value


def text(value, label):
    require(isinstance(value, str) and bool(value.strip()), label + " must be nonempty text.")
    return value


def target_name(value):
    text(value, "target")
    require(value.startswith("#") and value == value.strip() and
            not any(character.isspace() for character in value),
            "target must be a canonical exact #id selector without whitespace.")
    return value


def dataset_file(root, relative):
    text(relative, "dataset relative path")
    path = Path(relative)
    require(not path.is_absolute() and ".." not in path.parts and path.as_posix() == relative,
            "Dataset paths must be canonical relative paths.")
    resolved = (root / path).resolve()
    require(root in resolved.parents and resolved.is_file(),
            "Dataset resource must be an existing file inside its dataset directory.")
    return resolved


def dataset_digest(dataset_path):
    """SHA256 of sorted (canonical path + NUL + file SHA256 bytes) entries.

    The manifest is always named dataset.json in the hash, even if the caller
    stores it under a different basename. Referenced page, PRD and gold bytes are
    included, so review labels cannot be silently reused after source changes.
    """
    dataset_path = Path(dataset_path).resolve()
    manifest = read_json(dataset_path)
    schema(manifest, "Dataset")
    resources = {"dataset.json": dataset_path}
    for case in array(manifest.get("cases"), "Dataset cases"):
        require(isinstance(case, dict), "Each dataset case must be an object.")
        for key in ("page", "prd", "gold"):
            name = case.get(key)
            resource = dataset_file(dataset_path.parent, name)
            require(name != "dataset.json", "Dataset resources cannot alias the manifest.")
            resources[name] = resource
    digest = hashlib.sha256()
    for name, resource in sorted(resources.items()):
        digest.update(name.encode("utf-8") + b"\0" + hashlib.sha256(resource.read_bytes()).digest())
    return digest.hexdigest()


def load_dataset(dataset_path):
    dataset_path = Path(dataset_path).resolve()
    manifest = read_json(dataset_path)
    schema(manifest, "Dataset")
    text(manifest.get("id"), "Dataset id")
    cases = {}
    for case in array(manifest.get("cases"), "Dataset cases"):
        require(isinstance(case, dict), "Dataset case must be an object.")
        case_id = text(case.get("id"), "Case id")
        require(case_id not in cases, "Duplicate dataset case: " + case_id)
        for key in ("page", "prd", "gold"):
            dataset_file(dataset_path.parent, case.get(key))
        gold = read_json(dataset_file(dataset_path.parent, case["gold"]))
        require(isinstance(gold, dict) and gold.get("caseId") == case_id,
                "Gold caseId must match its manifest entry.")
        controls, fact_ids = {}, set()
        for control in array(gold.get("controls"), "Gold controls"):
            require(isinstance(control, dict), "Gold control must be an object.")
            target = target_name(control.get("target"))
            require(target not in controls, "Duplicate gold target: " + target)
            fields = control.get("fields")
            require(isinstance(fields, dict) and set(fields) == set(FIELDS),
                    "Every gold control needs exactly four annotation fields.")
            for field in FIELDS:
                spec = fields[field]
                require(isinstance(spec, dict), "Gold field must be an object.")
                text(spec.get("answer"), "Gold answer")
                facts = array(spec.get("requiredFacts"), "requiredFacts")
                require(bool(facts), "Every gold field requires at least one required fact.")
                for fact in facts:
                    require(isinstance(fact, dict), "Gold fact must be an object.")
                    fact_id = text(fact.get("id"), "Fact id")
                    require(fact_id not in fact_ids, "Fact IDs must be unique within a case.")
                    fact_ids.add(fact_id)
                    text(fact.get("text"), "Fact text")
                    require(bool(array(fact.get("evidence"), "Gold evidence")),
                            "Every gold fact needs source evidence.")
                    for evidence in fact["evidence"]:
                        require(isinstance(evidence, dict) and evidence.get("source") in ("page", "prd"),
                                "Gold evidence must identify page or prd.")
                        text(evidence.get("locator"), "Evidence locator")
                        quote = text(evidence.get("quote"), "Evidence quote")
                        original = dataset_file(dataset_path.parent, case[evidence["source"]]).read_text(encoding="utf-8")
                        require(quote in original, "Gold evidence quote is absent from its stated source: " + fact_id)
            controls[target] = control
        require(bool(controls), "A case must include at least one expected control.")
        cases[case_id] = {"definition": case, "gold": gold, "controls": controls}
    require(bool(cases), "Dataset cannot be empty.")
    return manifest, cases


def load_predictions(path, dataset_id, cases):
    prediction = read_json(path)
    schema(prediction, "Predictions")
    require(prediction.get("datasetId") == dataset_id, "Predictions datasetId does not match.")
    run = prediction.get("run")
    require(isinstance(run, dict) and run.get("kind") in ("agent", "fixture"),
            "run.kind must distinguish agent outputs from scorer fixtures.")
    text(run.get("agentName"), "run.agentName")
    result = {}
    for case in array(prediction.get("cases"), "Prediction cases"):
        require(isinstance(case, dict), "Prediction case must be an object.")
        case_id = text(case.get("caseId"), "Prediction caseId")
        require(case_id in cases, "Unknown prediction case: " + str(case_id))
        require(case_id not in result, "Duplicate prediction case: " + case_id)
        annotations = {}
        for annotation in array(case.get("annotations"), "Annotations"):
            require(isinstance(annotation, dict), "Annotation must be an object.")
            target = target_name(annotation.get("target"))
            require(target not in annotations, "Duplicate predicted target: " + target)
            fields = annotation.get("fields")
            require(isinstance(fields, dict) and set(fields).issubset(FIELDS),
                    "Prediction fields must use content/function/limits/navigation.")
            require(all(isinstance(value, str) for value in fields.values()),
                    "Predicted field values must be strings.")
            annotations[target] = fields
        result[case_id] = annotations
    return prediction, result


def load_review(path, predictions_path, dataset_hash, cases, predictions):
    if path is None:
        return None, {}
    review = read_json(path)
    schema(review, "Review")
    require(review.get("predictionSha256") == hashlib.sha256(Path(predictions_path).read_bytes()).hexdigest(),
            "Review prediction hash is stale or mismatched.")
    require(review.get("datasetSha256") == dataset_hash, "Review dataset hash is stale or mismatched.")
    reviewer = review.get("reviewer")
    require(isinstance(reviewer, dict) and reviewer.get("kind") in ("human", "model"),
            "Independent review must identify a human or model reviewer.")
    text(reviewer.get("name"), "Reviewer name")
    records = {}
    for record in array(review.get("fields"), "Review fields"):
        require(isinstance(record, dict), "Reviewed field must be an object.")
        case_id = text(record.get("caseId"), "Review caseId")
        target = target_name(record.get("target"))
        field = text(record.get("field"), "Review field")
        require(case_id in predictions and target in predictions[case_id] and field in FIELDS,
                "Review references an unknown predicted case, target or field.")
        value = predictions[case_id][target].get(field, "")
        require(bool(value.strip()), "Review cannot give credit to missing/empty fields.")
        key = (case_id, target, field)
        require(key not in records, "Duplicate field review: " + repr(key))
        expected = cases[case_id]["controls"].get(target)
        allowed = {fact["id"] for fact in expected["fields"][field]["requiredFacts"]} if expected else set()
        matched = array(record.get("matchedFactIds"), "Matched fact IDs")
        require(all(isinstance(item, str) for item in matched) and len(set(matched)) == len(matched),
                "Matched fact IDs must be unique strings.")
        require(set(matched).issubset(allowed), "Review matches facts from a different case, target or field.")
        segments = array(record.get("segments"), "Review segments")
        require(bool(segments), "A nonempty field needs reviewed text segments.")
        for segment in segments:
            require(isinstance(segment, dict), "Review segment must be an object.")
            text(segment.get("text"), "Segment text")
            require(segment.get("verdict") in VERDICTS, "Unsupported segment verdict.")
            text(segment.get("reason"), "Segment reason")
            evidence = array(segment.get("evidence"), "Segment evidence")
            require(all(isinstance(item, str) and item.strip() for item in evidence),
                    "Segment evidence must contain nonempty source references.")
            if segment["verdict"] in ("supported", "uncertainty"):
                require(bool(evidence), "Supported/uncertainty segments need source references.")
        require("".join(segment["text"] for segment in segments) == value,
                "Review segments must cover the exact full field text in order.")
        records[key] = record
    return review, records


def ratio(numerator, denominator):
    return numerator / denominator if denominator else None


def metrics(counts, complete):
    claims = counts["supportedClaims"] + counts["unsupportedClaims"] + counts["contradictedClaims"]
    return {
        "controlRecall": ratio(counts["matchedControls"], counts["expectedControls"]),
        "controlPrecision": ratio(counts["matchedControls"], counts["predictedControls"]),
        "explanationAccuracy": ratio(counts["correctFields"], counts["nonemptyPredictedFields"]) if complete else None,
        "groundedFieldCoverage": ratio(counts["correctFields"], counts["expectedFields"]) if complete else None,
        "hallucinationRate": ratio(counts["unsupportedClaims"] + counts["contradictedClaims"], claims) if complete else None,
    }


def evaluate(dataset_path, predictions_path, review_path=None):
    manifest, cases = load_dataset(dataset_path)
    dataset_hash = dataset_digest(dataset_path)
    prediction, predictions = load_predictions(predictions_path, manifest["id"], cases)
    review, reviews = load_review(review_path, predictions_path, dataset_hash, cases, predictions)
    reports, failures = [], []
    for case_id, case in cases.items():
        expected, returned = case["controls"], predictions.get(case_id, {})
        missing, extra = sorted(set(expected) - set(returned)), sorted(set(returned) - set(expected))
        counts = {"expectedControls": len(expected), "predictedControls": len(returned),
                  "matchedControls": len(set(expected) & set(returned)), "expectedFields": len(expected) * 4,
                  "nonemptyPredictedFields": 0, "reviewedFields": 0, "correctFields": 0,
                  "supportedClaims": 0, "unsupportedClaims": 0, "contradictedClaims": 0,
                  "uncertaintyStatements": 0, "missingOrEmptyExpectedFields": 0}
        missing_review = []
        for target in missing:
            failures.append({"caseId": case_id, "target": target, "kind": "missing-control"})
        for target in extra:
            failures.append({"caseId": case_id, "target": target, "kind": "unexpected-control"})
        for target in expected:
            for field in FIELDS:
                if not returned.get(target, {}).get(field, "").strip():
                    counts["missingOrEmptyExpectedFields"] += 1
                    failures.append({"caseId": case_id, "target": target, "field": field,
                                     "kind": "missing-or-empty-field"})
        for target, fields in returned.items():
            for field in FIELDS:
                value = fields.get(field, "")
                if not value.strip():
                    continue
                counts["nonemptyPredictedFields"] += 1
                record = reviews.get((case_id, target, field))
                if record is None:
                    missing_review.append({"target": target, "field": field})
                    continue
                counts["reviewedFields"] += 1
                bad = False
                for segment in record["segments"]:
                    verdict = segment["verdict"]
                    counts[{"supported": "supportedClaims", "unsupported": "unsupportedClaims",
                            "contradicted": "contradictedClaims", "uncertainty": "uncertaintyStatements"}[verdict]] += 1
                    if verdict in ("unsupported", "contradicted"):
                        bad = True
                        failures.append({"caseId": case_id, "target": target, "field": field,
                                         "kind": verdict, "text": segment["text"],
                                         "reason": segment["reason"], "evidence": segment["evidence"]})
                required = {fact["id"] for fact in expected[target]["fields"][field]["requiredFacts"]} if target in expected else set()
                missing_facts = sorted(required - set(record["matchedFactIds"]))
                if missing_facts:
                    failures.append({"caseId": case_id, "target": target, "field": field,
                                     "kind": "missing-required-facts", "factIds": missing_facts})
                if target in expected and not bad and not missing_facts:
                    counts["correctFields"] += 1
        complete = review is not None and not missing_review
        reports.append({"caseId": case_id, "title": case["definition"].get("title", case_id),
                        "counts": counts, "metrics": metrics(counts, complete),
                        "reviewComplete": complete, "unreviewedFields": missing_review,
                        "missingControls": missing, "unexpectedControls": extra})
    total = {key: sum(report["counts"][key] for report in reports) for key in reports[0]["counts"]}
    complete = review is not None and all(report["reviewComplete"] for report in reports)
    micro = metrics(total, complete)
    macro, macro_counts = {}, {}
    for key in METRICS:
        values = [report["metrics"][key] for report in reports if report["metrics"][key] is not None]
        macro_counts[key] = len(values)
        # Do not hide an unreviewed case behind an average of reviewed cases.
        macro[key] = sum(values) / len(values) if values and (key in ("controlRecall", "controlPrecision") or complete) else None
    gates = {key: (micro[key] is not None and
                  (micro[key] <= threshold if key == "hallucinationRate" else micro[key] >= threshold))
             for key, threshold in DEFAULT_THRESHOLDS.items()}
    gates["completeSemanticReview"] = complete
    return {
        "schemaVersion": 1, "datasetId": manifest["id"], "datasetVersion": manifest.get("version"),
        "datasetSha256": dataset_hash,
        "predictionSha256": hashlib.sha256(Path(predictions_path).read_bytes()).hexdigest(),
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "run": prediction["run"],
        "resultKind": "scorer-self-test" if prediction["run"]["kind"] == "fixture" else "candidate-evaluation",
        "agentExecutionCertifiedByScorer": False,
        "semanticReview": {"provided": review is not None, "complete": complete,
                           "reviewer": review["reviewer"] if review else None,
                           "coverage": ratio(total["reviewedFields"], total["nonemptyPredictedFields"]),
                           "meaning": "Independent reviewer labels; program validates accounting, not semantic truth."},
        "counts": total, "micro": micro, "macro": macro, "macroDefinedCases": macro_counts,
        "cases": reports, "failures": failures,
        "gate": {"passed": all(gates.values()), "checks": gates, "thresholds": DEFAULT_THRESHOLDS,
                 "meaning": "Development thresholds for this synthetic set, not a universal quality benchmark."},
        "metricDefinitions": {
            "controlRecall": "Unique matched expected targets / all expected targets; omitted cases score zero recall.",
            "controlPrecision": "Unique matched expected targets / returned targets; zero denominator is null.",
            "explanationAccuracy": "Correct nonempty returned fields / all nonempty returned fields. Correct requires every required fact and no unsupported/contradicted segment.",
            "groundedFieldCoverage": "Correct expected fields / (expected controls * 4); omissions and empty fields are not correct.",
            "hallucinationRate": "(Unsupported + contradicted atomic assertions) / (supported + unsupported + contradicted assertions). Uncertainty statements are excluded; no assertions yields null.",
        },
        "limitations": [
            "Semantic metrics are null until every nonempty returned field is independently reviewed.",
            "Reviewer judgments and atomic segmentation need calibration; model review is not human ground truth.",
            "Review evidence references are structurally checked only; the reviewer must verify that each citation actually supports its segment.",
            "A PRD-supported rule absent from the DOM is not automatically a hallucination; source conflicts require explicit qualification.",
            "Run metadata is caller supplied; a fixture score or this report alone does not prove actual agent execution.",
            "The dataset evaluates provided page states, not whole-system discovery, rendering or production performance.",
        ],
    }


def markdown(report):
    def score(value):
        return "未定义／未完整评审" if value is None else "%.2f%%" % (value * 100)
    lines = ["# Strike Her Heart Agent 效果评估", "",
             "- 数据集：`%s`（%s）" % (report["datasetId"], report["datasetVersion"]),
             "- 结果类型：`%s`" % report["resultKind"],
             "- 语义评审完整：%s" % report["semanticReview"]["complete"],
             "- 开发门槛通过：%s" % report["gate"]["passed"], "",
             "| 指标 | Micro | Macro |", "| --- | ---: | ---: |"]
    for key in METRICS:
        lines.append("| %s | %s | %s |" % (key, score(report["micro"][key]), score(report["macro"][key])))
    lines += ["", "| 样本 | 控件召回率 | 说明准确率 | 幻觉率 |", "| --- | ---: | ---: | ---: |"]
    for case in report["cases"]:
        lines.append("| %s | %s | %s | %s |" % (case["caseId"], score(case["metrics"]["controlRecall"]),
                     score(case["metrics"]["explanationAccuracy"]), score(case["metrics"]["hallucinationRate"])))
    lines += ["", "## 口径与限制", ""]
    lines += ["- " + value for value in report["metricDefinitions"].values()]
    lines += ["- " + item for item in report["limitations"]]
    lines += ["", "逐字段失败、分母、未评审项及 SHA-256 见同名 JSON 报告。", ""]
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=Path("evals/dataset.json"))
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--review", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--strict", action="store_true", help="Exit 1 if development gates fail")
    args = parser.parse_args(argv)
    try:
        requested_output = args.output.expanduser().absolute()
        require(not requested_output.is_symlink() and not requested_output.with_suffix(".md").is_symlink(),
                "Report outputs must not be symlinks.")
        output = requested_output.resolve()
        require(output.suffix == ".json", "Output must use a .json extension; a sibling .md is also written.")
        protected = {args.dataset.resolve(), args.predictions.resolve()}
        if args.review:
            protected.add(args.review.resolve())
        manifest = read_json(args.dataset)
        schema(manifest, "Dataset")
        for case in array(manifest.get("cases"), "Dataset cases"):
            require(isinstance(case, dict), "Dataset case must be an object.")
            for key in ("page", "prd", "gold"):
                protected.add(dataset_file(args.dataset.resolve().parent, case.get(key)))
        require(output not in protected and output.with_suffix(".md") not in protected,
                "Report must not overwrite dataset, predictions or review inputs.")
        report = evaluate(args.dataset, args.predictions, args.review)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        output.with_suffix(".md").write_text(markdown(report), encoding="utf-8")
        print(json.dumps({"report": str(output), "markdown": str(output.with_suffix(".md")),
                          "micro": report["micro"], "gatePassed": report["gate"]["passed"],
                          "resultKind": report["resultKind"]}, ensure_ascii=False))
        return 1 if args.strict and not report["gate"]["passed"] else 0
    except (EvaluationError, OSError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
