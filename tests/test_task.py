"""Private task-record checks; these do not run a named agent or a real website."""

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
SPEC = importlib.util.spec_from_file_location("strike_task", SCRIPT)
task = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(task)


class TaskManifestTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="strike-task-test-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve()
        self.directory = self.base / "private-task"
        (self.directory / "evidence").mkdir(parents=True)
        for name in ("read", "write", "runtime", "presentation") + task.CHECKS:
            (self.directory / "evidence" / (name + ".txt")).write_text(
                "Isolated synthetic evidence fixture: " + name, encoding="utf-8")

    def manifest(self):
        return json.loads((self.directory / "task.json").read_text(encoding="utf-8"))

    def run_cli(self, command, *options, ok=True, revision=None):
        args = [sys.executable, str(SCRIPT), command, "--task-dir", str(self.directory)]
        if command not in ("init", "status"):
            version = self.manifest()["revision"] if revision is None else revision
            args += ["--revision", str(version)]
        process = subprocess.run(args + list(options), capture_output=True, text=True)
        self.assertEqual(process.returncode, 0 if ok else 2, process.stdout + process.stderr)
        return json.loads(process.stdout)

    def initialize(self, *extra):
        return self.run_cli("init", "--name", "Synthetic task", "--scope", "Only this fixture",
                            "--target", "https://example.invalid/app", *extra)

    def add_page(self, state="all"):
        return self.run_cli("page", "--url", "https://example.invalid/app",
                            "--state-key", state, "--label", state)["pageId"]

    def capability(self, method="fixture integration", write="supported"):
        return self.run_cli("capability", "--read", "supported", "--write", write,
                            "--method", method, "--evidence", "evidence/write.txt")

    def bind(self, page_id, runtime="shh-fixture", display="A-001", *extra):
        return self.run_cli("bind", "--page-id", page_id, "--display-id", display,
                            "--runtime-id", runtime, "--source-key", "name-input",
                            "--actual", "--note", "Synthetic unique target mapping",
                            "--evidence", "evidence/runtime.txt", *extra)

    def present(self, page_id, *extra, ok=True):
        return self.run_cli("page", "--page-id", page_id, "--status", "presented",
                            "--actual", "--note", "Synthetic original-page presentation record",
                            "--evidence", "evidence/presentation.txt", *extra, ok=ok)

    def check(self, page_id, name, result="pass"):
        extra = ["--actual", "--evidence", "evidence/" + name + ".txt"]
        if result == "untested":
            extra = []
        return self.run_cli("check", "--page-id", page_id, "--name", name,
                            "--result", result, "--note", "Synthetic " + result + " observation",
                            *extra)

    def verify(self, page_id, ok=True):
        return self.run_cli("page", "--page-id", page_id, "--status", "verified", ok=ok)

    def verified_page(self):
        self.initialize()
        self.capability()
        page_id = self.add_page()
        self.bind(page_id)
        self.present(page_id)
        for name in task.CHECKS:
            self.check(page_id, name)
        self.verify(page_id)
        return page_id

    def test_resume_keeps_stable_ids_and_stale_revision_cannot_overwrite(self):
        self.initialize()
        first = self.add_page("all")
        second = self.add_page("mine")
        repeated = self.add_page("all")
        self.assertEqual(first, repeated)
        self.assertNotEqual(first, second)
        before = self.manifest()
        self.run_cli("page", "--page-id", first, "--label", "stale change",
                     revision=1, ok=False)
        self.assertEqual(self.manifest(), before)
        resumed = self.run_cli("status")
        self.assertEqual(resumed["registeredPageStates"], 2)
        self.assertFalse(resumed["wholeSystemComplete"])
        self.assertIn("unknown", resumed["coverageBasis"])
        self.assertEqual(len(list((self.directory / ".history").glob("*.json"))), 3)

    def test_atomic_interruption_preserves_previous_record_and_recovers_dead_lock(self):
        self.initialize()
        path = self.directory / "task.json"
        before = path.read_bytes()
        with mock.patch.object(task.os, "replace", side_effect=OSError("simulated interruption")):
            with self.assertRaises(OSError):
                task.atomic_json(path, {"incomplete": True})
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(list(self.directory.glob(".task-*.tmp")), [])
        child = subprocess.Popen([sys.executable, "-c", "pass"])
        child.wait()
        (self.directory / ".task.lock").write_text(str(child.pid), encoding="ascii")
        self.add_page()
        self.assertFalse((self.directory / ".task.lock").exists())

    def test_privacy_rejects_credentials_and_route_states_do_not_silently_merge(self):
        self.run_cli("init", "--name", "x", "--scope", "x", "--target",
                     "https://private-user:private-password@example.invalid/app", ok=False)
        self.assertFalse((self.directory / "task.json").exists())
        self.run_cli("init", "--name", "x", "--scope", "Only supplied entry",
                     "--target", "https://example.invalid/app?token=SECRET_QUERY#/SECRET_HASH")
        self.run_cli("page", "--url", "https://example.invalid/app#/leads", ok=False)
        a = self.run_cli("page", "--url", "https://example.invalid/app#/leads",
                         "--state-key", "leads")["pageId"]
        b = self.run_cli("page", "--url", "https://example.invalid/app#/settings",
                         "--state-key", "settings")["pageId"]
        self.assertNotEqual(a, b)
        self.run_cli("page", "--page-id", a, "--next-action",
                     "Inspect https://example.invalid/app?token=NOTE_SECRET#HASH_SECRET")
        raw = (self.directory / "task.json").read_text(encoding="utf-8")
        for secret in ("private-user", "private-password", "SECRET_QUERY", "SECRET_HASH",
                       "NOTE_SECRET", "HASH_SECRET"):
            self.assertNotIn(secret, raw)

    def test_source_and_evidence_boundaries_and_readiness_do_not_imply_execution(self):
        self.initialize()
        self.add_page()
        outside = self.base / "outside.txt"
        outside.write_text("Outside fixture", encoding="utf-8")
        self.run_cli("capability", "--write", "supported", "--method", "fixture",
                     "--evidence", str(outside), ok=False)
        link = self.directory / "evidence" / "outside-link.txt"
        try:
            link.symlink_to(outside)
        except OSError:
            pass
        else:
            self.run_cli("capability", "--write", "supported", "--method", "fixture",
                         "--evidence", "evidence/outside-link.txt", ok=False)
        self.run_cli("capability", "--write", "supported", "--method", "fixture",
                     "--evidence", "task.json", ok=False)
        history = self.directory / ".history"
        saved_history = self.directory / ".saved-history"
        history.rename(saved_history)
        outside_history = self.base / "outside-history"
        outside_history.mkdir()
        try:
            history.symlink_to(outside_history, target_is_directory=True)
        except OSError:
            saved_history.rename(history)
        else:
            self.run_cli("page", "--url", "https://example.invalid/other", ok=False)
            self.assertEqual(list(outside_history.iterdir()), [])
            history.unlink()
            saved_history.rename(history)
        with self.assertRaises(task.TaskError):
            task.task_root(str(ROOT / "output" / "do-not-create"))
        home = self.base / "codex-home"
        (home / "agents").mkdir(parents=True)
        (home / "agents/strike-her-heart.toml").write_text(
            'name = "Strike Her Heart"\n', encoding="utf-8")
        args = task.parser_for_cli().parse_args(["doctor", "--codex-home", str(home)])
        result = task.doctor(args)
        self.assertTrue(result["agentNameIdentified"])
        self.assertEqual(result["namedAgentDispatch"], "not-tested")
        self.assertEqual(result["originalPageWrite"], "not-tested")

    def test_presentation_and_all_five_checks_have_real_record_gates(self):
        self.initialize()
        page_id = self.add_page()
        self.present(page_id, ok=False)
        self.run_cli("capability", "--write", "supported", "--method", "fixture", ok=False)
        self.capability()
        self.present(page_id, ok=False)
        self.bind(page_id)
        self.present(page_id)
        self.run_cli("page", "--page-id", page_id, "--gap", "Business permission remains unknown")
        self.run_cli("check", "--page-id", page_id, "--name", "coverage", "--result", "pass",
                     "--note", "Not actually observed", ok=False)
        for name in task.CHECKS[:-1]:
            self.check(page_id, name)
        self.verify(page_id, ok=False)
        self.check(page_id, task.CHECKS[-1])
        result = self.verify(page_id)
        self.assertEqual(result["pages"][0]["status"], "verified")
        self.assertEqual(len(result["pages"][0]["gaps"]), 1)
        self.assertTrue(result["recordingOnly"])
        self.assertIn("not business-rule truth", result["verificationMeaning"])
        self.check(page_id, "navigation", "untested")
        self.verify(page_id, ok=False)
        self.assertEqual(self.manifest()["pages"][0]["status"], "blocked")
        self.check(page_id, "navigation", "fail")
        self.verify(page_id, ok=False)
        self.check(page_id, "navigation")
        self.verify(page_id)

    def test_display_numbers_are_page_scoped_and_rebinding_invalidates_checks(self):
        first = self.verified_page()
        second = self.add_page("mine")
        self.bind(second, "shh-other")
        self.assertEqual([p["bindings"][0]["displayId"] for p in self.manifest()["pages"]],
                         ["A-001", "A-001"])
        # Identical registration is harmless; a different mapping is explicit and invalidating.
        self.bind(first)
        self.assertEqual(self.manifest()["pages"][0]["status"], "verified")
        self.bind(first, "shh-extra", "A-002")
        self.assertEqual(self.manifest()["pages"][0]["status"], "discovered")
        self.present(first)
        for name in task.CHECKS:
            self.check(first, name)
        self.verify(first)
        self.run_cli("bind", "--page-id", first, "--display-id", "A-001",
                     "--runtime-id", "shh-new", "--actual", "--note", "changed",
                     "--evidence", "evidence/runtime.txt", ok=False)
        self.bind(first, "shh-new", "A-001", "--replace")
        current = self.manifest()["pages"][0]
        self.assertEqual(current["status"], "discovered")
        self.assertTrue(all(c["result"] == "untested" for c in current["checks"].values()))
        self.verify(first, ok=False)
        self.assertTrue(any(json.loads(p.read_text())["pages"][0]["status"] == "verified"
                            for p in (self.directory / ".history").glob("*.json")
                            if json.loads(p.read_text())["pages"]))

    def test_presentation_version_and_write_capability_invalidate_previous_passes(self):
        page_id = self.verified_page()
        self.present(page_id, "--presentation-version", "v2")
        page = self.manifest()["pages"][0]
        self.assertEqual(page["status"], "presented")
        self.assertTrue(all(c["result"] == "untested" for c in page["checks"].values()))
        for name in task.CHECKS:
            self.check(page_id, name)
        self.verify(page_id)
        self.capability(write="unavailable")
        self.assertEqual(self.manifest()["pages"][0]["status"], "blocked")
        self.verify(page_id, ok=False)
        self.capability(method="new integration")
        self.assertEqual(self.manifest()["pages"][0]["status"], "discovered")
        self.verify(page_id, ok=False)

    def test_checks_cannot_pass_before_presentation_and_new_render_resets_old_failure(self):
        self.initialize()
        self.capability()
        page_id = self.add_page()
        self.bind(page_id)
        self.run_cli("check", "--page-id", page_id, "--name", "coverage", "--result", "pass",
                     "--actual", "--note", "Premature synthetic check",
                     "--evidence", "evidence/coverage.txt", ok=False)
        self.check(page_id, "coverage", "fail")
        self.present(page_id)
        self.assertEqual(self.manifest()["pages"][0]["checks"]["coverage"]["result"], "untested")
        for name in task.CHECKS:
            self.check(page_id, name)
        self.verify(page_id)

    def test_changed_evidence_blocks_current_status_and_cannot_certify_old_checks(self):
        page_id = self.verified_page()
        (self.directory / "evidence/edit_save_refresh.txt").write_text(
            "Changed observation version", encoding="utf-8")
        current = self.run_cli("status")
        self.assertEqual(current["pages"][0]["recordedStatus"], "verified")
        self.assertEqual(current["pages"][0]["status"], "blocked")
        self.assertTrue(current["pages"][0]["evidenceIssues"])
        self.verify(page_id, ok=False)
        self.check(page_id, "edit_save_refresh")
        self.verify(page_id)


if __name__ == "__main__":
    unittest.main()
