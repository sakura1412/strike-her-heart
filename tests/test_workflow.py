"""Private workflow snapshots: derived views, never new execution evidence."""

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills/strike-her-heart/scripts/task.py"
SPEC = importlib.util.spec_from_file_location("strike_workflow", SCRIPT.with_name("workflow_view.py"))
view = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(view)
CHECKS = ("coverage", "multi_open", "edit_save_refresh", "navigation", "manual_preserved")


class WorkflowSnapshotTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="shh-workflow-test-")
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name).resolve()
        self.directory = self.base / "private-task"
        (self.directory / "evidence").mkdir(parents=True)
        self.secret = "ARTIFICIAL_EVIDENCE_BODY_DO_NOT_COPY_92731"
        (self.directory / "evidence/observation.txt").write_text(self.secret, encoding="utf-8")
        self.run_cli("init", "--name", "Synthetic task", "--scope", "Fixture pages only",
                     "--target", "https://example.invalid/app", "--next-action", "Discover pages")

    def manifest(self):
        return json.loads((self.directory / "task.json").read_text(encoding="utf-8"))

    def run_cli(self, command, *options, ok=True):
        args = [sys.executable, str(SCRIPT), command, "--task-dir", str(self.directory)]
        if command not in ("init", "status", "workflow"):
            args += ["--revision", str(self.manifest()["revision"])]
        result = subprocess.run(args + list(options), capture_output=True, text=True)
        self.assertEqual(result.returncode, 0 if ok else 2, result.stdout + result.stderr)
        return json.loads(result.stdout)

    def payload(self):
        document = (self.directory / "workflow.html").read_text(encoding="utf-8")
        value = document.split("const supplied = ", 1)[1]
        return json.JSONDecoder().raw_decode(value)[0]

    def record_bytes(self):
        return {path.relative_to(self.directory).as_posix(): path.read_bytes()
                for path in self.directory.rglob("*") if path.is_file()
                and path.name != "workflow.html"}

    def add_page(self, label="All records"):
        return self.run_cli("page", "--url", "https://example.invalid/app",
                            "--state-key", "all", "--label", label)["pageId"]

    def verified_page(self):
        self.run_cli("capability", "--read", "supported", "--write", "supported",
                     "--method", "Synthetic fixture observation", "--evidence", "evidence/observation.txt")
        page = self.add_page()
        self.run_cli("bind", "--page-id", page, "--display-id", "A-001",
                     "--runtime-id", "shh-fixture", "--actual", "--note", "Synthetic mapping",
                     "--evidence", "evidence/observation.txt")
        self.run_cli("page", "--page-id", page, "--status", "presented", "--actual",
                     "--note", "Synthetic presentation", "--evidence", "evidence/observation.txt")
        for name in CHECKS:
            self.run_cli("check", "--page-id", page, "--name", name, "--result", "pass",
                         "--actual", "--note", "Synthetic interaction", "--evidence", "evidence/observation.txt")
        self.run_cli("page", "--page-id", page, "--status", "verified")
        return page

    def test_snapshot_preserves_record_and_does_not_copy_evidence_bodies(self):
        self.verified_page()
        before = self.record_bytes()
        status = self.run_cli("status")
        result = self.run_cli("workflow")
        self.assertEqual(self.record_bytes(), before)
        self.assertEqual(result["path"], str(self.directory / "workflow.html"))
        self.assertEqual(result["revision"], status["revision"])
        self.assertTrue(result["snapshot"])
        self.assertFalse(result["taskRecordChanged"])
        payload = self.payload()
        metadata = payload.pop("view")
        self.assertEqual(payload, status)
        self.assertEqual(metadata["mode"], "snapshot")
        self.assertEqual(metadata["generatedAt"], result["generatedAt"])
        self.assertEqual(metadata["name"], "Synthetic task")
        document = (self.directory / "workflow.html").read_text(encoding="utf-8")
        self.assertNotIn(self.secret, document)
        self.assertFalse(payload["wholeSystemComplete"])
        self.assertTrue(payload["recordingOnly"])
        self.assertFalse(payload["taskComplete"], "Verified page totals cannot finish an intake task")
        self.assertEqual(payload["execution"]["state"], "intake")
        self.assertTrue(payload["completion"]["missingConditions"])
        self.assertEqual(set(payload["stateContracts"]["states"]),
                         {"intake", "access", "discovery", "annotation", "presentation",
                          "acceptance", "completed", "blocked", "failed", "cancelled"})
        for kind in ("states", "pages"):
            for contract in payload["stateContracts"][kind].values():
                for field in ("entryConditions", "successConditions", "failureStates", "allowedNext"):
                    self.assertIsInstance(contract[field], list)

    def test_missing_or_changed_evidence_uses_effective_blocked_status(self):
        self.verified_page()
        evidence = self.directory / "evidence/observation.txt"
        original = evidence.read_bytes()
        record = (self.directory / "task.json").read_bytes()
        for kind in ("changed", "missing"):
            with self.subTest(kind=kind):
                if kind == "changed":
                    evidence.write_bytes(original + b" CHANGED")
                else:
                    evidence.unlink()
                self.run_cli("workflow")
                page = self.payload()["pages"][0]
                self.assertEqual(page["status"], "blocked")
                self.assertEqual(page["recordedStatus"], "verified")
                self.assertTrue(page["evidenceIssues"])
                self.assertEqual((self.directory / "task.json").read_bytes(), record)

    def test_html_data_cannot_close_script_or_inject_markup(self):
        label = '</script><img src=x onerror="alert(1)">&\u2028\u2029tail'
        self.add_page(label)
        self.run_cli("workflow")
        self.assertEqual(self.payload()["pages"][0]["label"], label)
        document = (self.directory / "workflow.html").read_text(encoding="utf-8")
        self.assertNotIn(label, document)
        self.assertNotIn('<img src=x onerror="alert(1)">', document)
        self.assertIn("\\u003c/script\\u003e", document)
        self.assertIn("\\u0026\\u2028\\u2029", document)

    def test_output_cannot_overwrite_links_directories_or_unrelated_files(self):
        target = self.directory / "workflow.html"
        outside = self.base / "outside.html"
        outside.write_text("Keep this file", encoding="utf-8")
        target.symlink_to(outside)
        self.run_cli("workflow", ok=False)
        self.assertEqual(outside.read_text(encoding="utf-8"), "Keep this file")
        self.assertTrue(target.is_symlink())
        target.unlink()
        target.mkdir()
        self.run_cli("workflow", ok=False)
        self.assertTrue(target.is_dir())
        target.rmdir()
        target.write_text("User-authored workflow", encoding="utf-8")
        self.run_cli("workflow", ok=False)
        self.assertEqual(target.read_text(encoding="utf-8"), "User-authored workflow")

    def test_regeneration_follows_new_revision_without_advancing_it(self):
        first = self.run_cli("workflow")
        self.assertEqual(self.payload()["pages"], [])
        self.add_page()
        record = (self.directory / "task.json").read_bytes()
        second = self.run_cli("workflow")
        self.assertEqual(second["taskId"], first["taskId"])
        self.assertEqual(second["revision"], first["revision"] + 1)
        self.assertEqual(self.payload()["pages"][0]["status"], "discovered")
        self.assertEqual((self.directory / "task.json").read_bytes(), record)

    def test_invalid_template_and_interrupted_write_preserve_previous_snapshot(self):
        self.run_cli("workflow")
        path = self.directory / "workflow.html"
        before = path.read_bytes()
        template = self.base / "invalid-template.html"
        for contents in ("No placeholder", view.PLACEHOLDER * 2):
            template.write_text(contents, encoding="utf-8")
            with mock.patch.object(view, "TEMPLATE", template):
                with self.assertRaises(ValueError):
                    view.render_workflow(self.directory, self.run_cli("status"))
            self.assertEqual(path.read_bytes(), before)
        with mock.patch.object(view.os, "replace", side_effect=OSError("Synthetic interruption")):
            with self.assertRaises(OSError):
                view.render_workflow(self.directory, self.run_cli("status"))
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(list(self.directory.glob(".workflow-*.tmp")), [])

    def test_generated_snapshot_is_not_accepted_as_interaction_evidence(self):
        self.run_cli("workflow")
        result = self.run_cli("capability", "--write", "supported", "--method", "Invalid evidence",
                              "--evidence", "workflow.html", ok=False)
        self.assertIn("not interaction evidence", result["error"])
        self.assertEqual(self.manifest()["revision"], 1)

    def test_exception_lifecycle_is_preserved_without_generating_new_execution_evidence(self):
        for state in ("blocked", "failed", "cancelled"):
            with self.subTest(state=state):
                if self.manifest()["execution"]["state"] != "intake":
                    self.run_cli("transition", "--to", "intake", "--reopen", "--actual",
                                 "--note", "Synthetic restart", "--reason", "Synthetic restart scope",
                                 "--evidence", "evidence/observation.txt", "--next-action", "Synthetic intake")
                self.run_cli("transition", "--to", state, "--reason", "Synthetic " + state,
                             "--next-action", "Synthetic explicit recovery", "--actual",
                             "--note", "Synthetic exception observation", "--evidence", "evidence/observation.txt")
                before = self.record_bytes()
                status = self.run_cli("status")
                self.run_cli("workflow")
                payload = self.payload()
                self.assertEqual(payload["execution"], status["execution"])
                self.assertEqual(payload["execution"]["state"], state)
                self.assertEqual(payload["execution"]["resumeState"], "intake")
                self.assertEqual(payload["execution"]["phaseStates"]["intake"], state)
                self.assertFalse(payload["taskComplete"])
                self.assertEqual(payload["completion"], status["completion"])
                self.assertEqual(payload["stateContracts"], status["stateContracts"])
                self.assertEqual(self.record_bytes(), before)

    def test_legacy_task_is_not_upgraded_or_completed_by_snapshot_generation(self):
        self.verified_page()
        path = self.directory / "task.json"
        manifest = self.manifest()
        del manifest["execution"]
        path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        before = self.record_bytes()
        self.run_cli("workflow")
        payload = self.payload()
        self.assertTrue(payload["execution"]["legacy"])
        self.assertFalse(payload["taskComplete"])
        self.assertFalse(payload["completion"]["eligible"])
        self.assertTrue(any("旧记录" in item for item in payload["completion"]["missingConditions"]))
        self.assertEqual(self.record_bytes(), before)
        self.assertNotIn("execution", self.manifest())

    def test_renderer_preserves_missing_lifecycle_fields_instead_of_fabricating_contracts(self):
        summary = self.run_cli("status")
        for key in ("execution", "completion", "stateContracts", "taskComplete", "workQueue"):
            summary.pop(key)
        original = json.loads(json.dumps(summary))
        before = self.record_bytes()
        view.render_workflow(self.directory, summary)
        payload = self.payload()
        payload.pop("view")
        self.assertEqual(payload, original)
        self.assertEqual(summary, original)
        self.assertEqual(self.record_bytes(), before)

    def test_queue_snapshot_preserves_progress_without_claiming_or_retrying(self):
        page = self.add_page()
        self.assertFalse(self.run_cli("status")["workQueue"]["enabled"])
        self.run_cli("queue", "--action", "enqueue", "--page-id", page,
                     "--phase", "annotation", "--side-effect", "read_only")
        before = self.record_bytes()
        status = self.run_cli("status")
        self.run_cli("workflow")
        payload = self.payload()
        self.assertEqual(payload["workQueue"], status["workQueue"])
        item = payload["workQueue"]["items"][0]
        self.assertEqual(item["status"], "queued")
        self.assertEqual(item["attempt"], 0)
        self.assertIsNone(item["lease"])
        self.assertEqual(item["checkpoints"]["done"], 0)
        self.assertTrue(item["reconciliation"]["required"])
        self.assertFalse(payload["taskComplete"])
        self.assertEqual(self.record_bytes(), before)

    def test_running_and_expired_lease_snapshots_hide_token_and_never_reap_records(self):
        page = self.verified_page()
        for target in ("access", "discovery", "annotation"):
            options = ["--to", target, "--actual", "--note", "Synthetic stage observation",
                       "--evidence", "evidence/observation.txt"]
            if target == "annotation":
                options.append("--scope-confirmed")
            self.run_cli("transition", *options)
        job = self.run_cli("queue", "--action", "enqueue", "--page-id", page,
                           "--phase", "annotation", "--side-effect", "read_only")["queueResult"]["jobId"]
        snapshot = {"pageId": page, "url": "https://example.invalid/app", "stateKey": "all",
                    "pageFingerprint": "a" * 64,
                    "controls": [{"id": "A-001", "fingerprint": "b" * 64, "contentHash": "c" * 64}]}
        (self.directory / "evidence/page-snapshot.json").write_text(json.dumps(snapshot), encoding="utf-8")
        self.run_cli("queue", "--action", "reconcile", "--job-id", job,
                     "--snapshot", "evidence/page-snapshot.json", "--actual", "--note", "Synthetic current controls",
                     "--evidence", "evidence/observation.txt")
        claim = self.run_cli("queue", "--action", "claim", "--job-id", job)["queueResult"]
        self.assertTrue(claim["claimed"])
        token = claim["leaseToken"]
        for expired in (False, True):
            with self.subTest(expired=expired):
                if expired:
                    manifest = self.manifest()
                    manifest["workQueue"]["items"][0]["lease"]["expiresAt"] = 1
                    (self.directory / "task.json").write_text(json.dumps(manifest), encoding="utf-8")
                before = self.record_bytes()
                self.run_cli("workflow")
                payload = self.payload()
                item = payload["workQueue"]["items"][0]
                self.assertEqual(item["recordedStatus"], "running")
                self.assertEqual(item["status"], "retry_wait" if expired else "running")
                self.assertEqual(item["lease"]["expired"], expired)
                self.assertEqual(item["attempt"], 1)
                self.assertEqual(self.manifest()["workQueue"]["items"][0]["status"], "running")
                self.assertNotIn(token, (self.directory / "workflow.html").read_text(encoding="utf-8"))
                self.assertNotIn("leaseToken", json.dumps(payload))
                self.assertNotIn("queueResult", payload)
                self.assertFalse(payload["taskComplete"])
                self.assertEqual(self.record_bytes(), before)


if __name__ == "__main__":
    unittest.main()
