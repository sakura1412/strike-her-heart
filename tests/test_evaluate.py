"""Scorer contract tests use synthetic candidates, never actual agent results."""

import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/evaluate.py"
SPEC = importlib.util.spec_from_file_location("strike_evaluate", SCRIPT)
evaluate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evaluate)


class EvaluationScorerTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="shh-eval-test-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.dataset_path = self.root / "dataset.json"
        self.prediction_path = self.root / "predictions.json"
        self.review_path = self.root / "review.json"
        self.dataset = {"schemaVersion": 1, "id": "synthetic-scorer-unit-tests", "version": "1.0.0", "cases": []}
        self.prediction = {"schemaVersion": 1, "datasetId": self.dataset["id"],
                           "run": {"kind": "fixture", "agentName": "Synthetic unit-test fixture"}, "cases": []}
        self.gold = {}
        for case_id in ("c1", "c2"):
            directory = self.root / "cases" / case_id
            directory.mkdir(parents=True)
            (directory / "page.html").write_text('<button id="a">Save</button><input id="b" required>', encoding="utf-8")
            (directory / "prd.md").write_text("# Requirement\nSynthetic source fact.\n", encoding="utf-8")
            case = {"id": case_id, "title": case_id, "tags": ["synthetic"],
                    "page": "cases/%s/page.html" % case_id, "prd": "cases/%s/prd.md" % case_id,
                    "gold": "cases/%s/expected.json" % case_id}
            gold = {"caseId": case_id, "scope": "Two synthetic controls", "controls": [], "forbiddenClaims": []}
            predicted_case = {"caseId": case_id, "annotations": []}
            for target in ("#a", "#b"):
                fields, output = {}, {}
                for field in evaluate.FIELDS:
                    answer = "%s %s %s supported." % (case_id, target, field)
                    fields[field] = {"answer": answer, "requiredFacts": [{
                        "id": "%s-%s" % (target[1:], field), "text": answer,
                        "evidence": [{"source": "prd", "locator": "Requirement", "quote": "Synthetic source fact."}]}]}
                    output[field] = answer
                gold["controls"].append({"target": target, "label": target, "fields": fields})
                predicted_case["annotations"].append({"target": target, "fields": output})
            self.gold[case_id] = gold
            self.dataset["cases"].append(case)
            self.prediction["cases"].append(predicted_case)
            self.write(directory / "expected.json", gold)
        self.write(self.dataset_path, self.dataset)
        self.write(self.prediction_path, self.prediction)

    @staticmethod
    def write(path, value):
        Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")

    def make_review(self, prediction=None):
        prediction = prediction or self.prediction
        self.write(self.prediction_path, prediction)
        review = {"schemaVersion": 1, "predictionSha256": hashlib.sha256(self.prediction_path.read_bytes()).hexdigest(),
                  "datasetSha256": evaluate.dataset_digest(self.dataset_path),
                  "reviewer": {"kind": "model", "name": "Synthetic review fixture, not a model call"}, "fields": []}
        for case in prediction["cases"]:
            for annotation in case["annotations"]:
                for field, value in annotation["fields"].items():
                    if not value.strip():
                        continue
                    matching = next((control for control in self.gold[case["caseId"]]["controls"]
                                     if control["target"] == annotation["target"]), None)
                    facts = [fact["id"] for fact in matching["fields"][field]["requiredFacts"]] if matching else []
                    review["fields"].append({"caseId": case["caseId"], "target": annotation["target"], "field": field,
                                             "matchedFactIds": facts, "segments": [{"text": value,
                                             "verdict": "supported", "reason": "Synthetic source supports this fixture.",
                                             "evidence": ["prd:Requirement"]}]})
        self.write(self.review_path, review)
        return review

    def score(self, review=True):
        return evaluate.evaluate(self.dataset_path, self.prediction_path, self.review_path if review else None)

    def test_perfect_fixture_has_explicit_denominators_and_is_not_actual_agent_execution(self):
        self.make_review()
        report = self.score()
        self.assertEqual(report["counts"]["expectedControls"], 4)
        self.assertEqual(report["counts"]["expectedFields"], 16)
        self.assertEqual(report["counts"]["supportedClaims"], 16)
        for metric in ("controlRecall", "controlPrecision", "explanationAccuracy", "groundedFieldCoverage"):
            self.assertEqual(report["micro"][metric], 1)
        self.assertEqual(report["micro"]["hallucinationRate"], 0)
        self.assertTrue(report["gate"]["passed"])
        self.assertEqual(report["resultKind"], "scorer-self-test")
        self.assertFalse(report["agentExecutionCertifiedByScorer"])
        self.assertEqual(report["semanticReview"]["reviewer"]["kind"], "model")

    def test_omitted_case_scores_zero_recall_and_field_coverage(self):
        self.prediction["cases"].pop()
        self.make_review()
        report = self.score()
        self.assertEqual(report["micro"]["controlRecall"], 0.5)
        self.assertEqual(report["macro"]["controlRecall"], 0.5)
        self.assertEqual(report["micro"]["groundedFieldCoverage"], 0.5)
        self.assertEqual(report["cases"][1]["metrics"]["controlRecall"], 0)
        self.assertEqual(report["cases"][1]["missingControls"], ["#a", "#b"])
        self.assertFalse(report["gate"]["passed"])

    def test_missing_field_is_not_correct_and_empty_text_does_not_inflate_accuracy(self):
        self.prediction["cases"][0]["annotations"][0]["fields"]["limits"] = "   "
        self.make_review()
        report = self.score()
        self.assertEqual(report["counts"]["correctFields"], 15)
        self.assertEqual(report["micro"]["explanationAccuracy"], 1)
        self.assertEqual(report["micro"]["groundedFieldCoverage"], 15 / 16)
        self.assertFalse(report["gate"]["passed"])

    def test_unexpected_control_reduces_precision_and_returned_field_accuracy(self):
        ghost = copy.deepcopy(self.prediction["cases"][0]["annotations"][0])
        ghost["target"] = "#ghost"
        self.prediction["cases"][0]["annotations"].append(ghost)
        self.make_review()
        report = self.score()
        self.assertEqual(report["micro"]["controlRecall"], 1)
        self.assertEqual(report["micro"]["controlPrecision"], 4 / 5)
        self.assertEqual(report["micro"]["explanationAccuracy"], 16 / 20)
        self.assertIn("#ghost", report["cases"][0]["unexpectedControls"])

    def test_extra_empty_control_cannot_evade_precision_gate(self):
        self.prediction["cases"][0]["annotations"].append({"target": "#empty-ghost", "fields": {}})
        self.make_review()
        report = self.score()
        self.assertEqual(report["micro"]["explanationAccuracy"], 1)
        self.assertEqual(report["micro"]["groundedFieldCoverage"], 1)
        self.assertEqual(report["micro"]["controlPrecision"], 4 / 5)
        self.assertFalse(report["gate"]["checks"]["controlPrecision"])
        self.assertFalse(report["gate"]["passed"])

    def test_unsupported_and_contradicted_segments_count_as_hallucinations(self):
        review = self.make_review()
        for record, verdict in zip(review["fields"][:2], ("unsupported", "contradicted")):
            record["segments"][0]["verdict"] = verdict
            record["segments"][0]["evidence"] = []
        self.write(self.review_path, review)
        report = self.score()
        self.assertEqual(report["micro"]["hallucinationRate"], 2 / 16)
        self.assertEqual(report["micro"]["explanationAccuracy"], 14 / 16)
        self.assertEqual(report["counts"]["unsupportedClaims"], 1)
        self.assertEqual(report["counts"]["contradictedClaims"], 1)
        self.assertFalse(report["gate"]["passed"])

    def test_no_review_never_becomes_zero_hallucination(self):
        report = self.score(review=False)
        self.assertEqual(report["micro"]["controlRecall"], 1)
        for metric in ("explanationAccuracy", "groundedFieldCoverage", "hallucinationRate"):
            self.assertIsNone(report["micro"][metric])
            self.assertIsNone(report["macro"][metric])
        self.assertFalse(report["semanticReview"]["complete"])
        self.assertEqual(report["semanticReview"]["coverage"], 0)

    def test_partial_review_does_not_hide_missing_semantic_labels_in_macro(self):
        review = self.make_review()
        review["fields"].pop()
        self.write(self.review_path, review)
        report = self.score()
        self.assertIsNone(report["micro"]["hallucinationRate"])
        self.assertIsNone(report["macro"]["explanationAccuracy"])
        self.assertEqual(report["semanticReview"]["coverage"], 15 / 16)
        self.assertEqual(len(report["cases"][1]["unreviewedFields"]), 1)

    def test_empty_predictions_keep_null_denominators_and_fail_gate(self):
        self.prediction["cases"] = []
        self.make_review()
        report = self.score()
        self.assertEqual(report["micro"]["controlRecall"], 0)
        self.assertIsNone(report["micro"]["controlPrecision"])
        self.assertIsNone(report["micro"]["explanationAccuracy"])
        self.assertIsNone(report["micro"]["hallucinationRate"])
        self.assertEqual(report["micro"]["groundedFieldCoverage"], 0)
        self.assertFalse(report["gate"]["passed"])

    def test_uncertainty_only_has_no_assertion_denominator(self):
        review = self.make_review()
        for record in review["fields"]:
            record["matchedFactIds"] = []
            record["segments"][0]["verdict"] = "uncertainty"
        self.write(self.review_path, review)
        report = self.score()
        self.assertIsNone(report["micro"]["hallucinationRate"])
        self.assertEqual(report["micro"]["explanationAccuracy"], 0)
        self.assertEqual(report["counts"]["uncertaintyStatements"], 16)
        self.assertFalse(report["gate"]["passed"])

    def test_duplicate_cases_targets_and_unknown_cases_are_rejected(self):
        base = copy.deepcopy(self.prediction)
        for kind in ("case", "target", "unknown"):
            with self.subTest(kind=kind):
                value = copy.deepcopy(base)
                if kind == "case":
                    value["cases"].append(copy.deepcopy(value["cases"][0]))
                elif kind == "target":
                    value["cases"][0]["annotations"].append(copy.deepcopy(value["cases"][0]["annotations"][0]))
                else:
                    value["cases"][0]["caseId"] = "unknown"
                self.write(self.prediction_path, value)
                with self.assertRaises(evaluate.EvaluationError):
                    self.score(review=False)

    def test_review_hashes_bind_both_predictions_and_all_dataset_resources(self):
        self.make_review()
        original = self.prediction_path.read_bytes()
        self.prediction_path.write_bytes(original + b"\n")
        with self.assertRaisesRegex(evaluate.EvaluationError, "prediction hash"):
            self.score()
        self.prediction_path.write_bytes(original)
        prd = self.root / "cases/c1/prd.md"
        prd.write_text(prd.read_text() + "New rule.\n", encoding="utf-8")
        with self.assertRaisesRegex(evaluate.EvaluationError, "dataset hash"):
            self.score()

    def test_full_field_segment_accounting_catches_appended_unreviewed_hallucination(self):
        review = self.make_review()
        self.prediction["cases"][0]["annotations"][0]["fields"]["content"] += " Fabricated admin-only rule."
        self.write(self.prediction_path, self.prediction)
        review["predictionSha256"] = hashlib.sha256(self.prediction_path.read_bytes()).hexdigest()
        self.write(self.review_path, review)
        with self.assertRaisesRegex(evaluate.EvaluationError, "exact full field text"):
            self.score()

    def test_cross_field_fact_credit_duplicate_review_and_missing_evidence_rejected(self):
        base = self.make_review()
        for kind in ("cross-field", "duplicate", "evidence"):
            with self.subTest(kind=kind):
                review = copy.deepcopy(base)
                if kind == "cross-field":
                    review["fields"][0]["matchedFactIds"] = ["a-navigation"]
                elif kind == "duplicate":
                    review["fields"].append(copy.deepcopy(review["fields"][0]))
                else:
                    review["fields"][0]["segments"][0]["evidence"] = []
                self.write(self.review_path, review)
                with self.assertRaises(evaluate.EvaluationError):
                    self.score()

    def test_missing_required_fact_reduces_accuracy_despite_supported_statements(self):
        review = self.make_review()
        review["fields"][0]["matchedFactIds"] = []
        self.write(self.review_path, review)
        report = self.score()
        self.assertEqual(report["micro"]["explanationAccuracy"], 15 / 16)
        self.assertEqual(report["micro"]["hallucinationRate"], 0)
        self.assertTrue(any(item["kind"] == "missing-required-facts" for item in report["failures"]))

    def test_dataset_digest_is_location_independent_and_checks_source_bytes(self):
        before = evaluate.dataset_digest(self.dataset_path)
        alternative = self.root / "renamed-manifest.json"
        alternative.write_bytes(self.dataset_path.read_bytes())
        self.assertEqual(before, evaluate.dataset_digest(alternative))
        page = self.root / "cases/c1/page.html"
        page.write_text(page.read_text() + "<!-- changed -->", encoding="utf-8")
        self.assertNotEqual(before, evaluate.dataset_digest(self.dataset_path))

    def test_gold_citations_must_exist_in_stated_source(self):
        self.gold["c1"]["controls"][0]["fields"]["content"]["requiredFacts"][0]["evidence"][0]["quote"] = "Not in either source"
        self.write(self.root / "cases/c1/expected.json", self.gold["c1"])
        with self.assertRaisesRegex(evaluate.EvaluationError, "quote is absent"):
            self.score(review=False)

    def test_cli_writes_json_markdown_and_strict_failure_has_nonzero_exit(self):
        self.make_review()
        report = self.root / "report.json"
        command = [sys.executable, str(SCRIPT), "--dataset", str(self.dataset_path),
                   "--predictions", str(self.prediction_path), "--review", str(self.review_path),
                   "--output", str(report), "--strict"]
        completed = subprocess.run(command, text=True, capture_output=True)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertTrue(report.exists())
        self.assertIn("scorer-self-test", report.with_suffix(".md").read_text())
        command[command.index("--review"):command.index("--review") + 2] = []
        completed = subprocess.run(command, text=True, capture_output=True)
        self.assertEqual(completed.returncode, 1, completed.stderr)
        result = json.loads(report.read_text())
        self.assertIsNone(result["micro"]["hallucinationRate"])

    def test_cli_cannot_overwrite_gold_or_follow_output_symlinks(self):
        self.make_review()
        gold = self.root / "cases/c1/expected.json"
        before = gold.read_bytes()
        link = self.root / "report-link.json"
        link.symlink_to(gold)
        for destination in (gold, link):
            with self.subTest(destination=destination.name):
                command = [sys.executable, str(SCRIPT), "--dataset", str(self.dataset_path),
                           "--predictions", str(self.prediction_path), "--review", str(self.review_path),
                           "--output", str(destination)]
                result = subprocess.run(command, text=True, capture_output=True)
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.assertEqual(gold.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
