"""Real CLI transactions with a controlled queue clock; no browser/model execution is claimed."""

from contextlib import redirect_stdout
import hashlib
import io
import json
import unittest
from unittest import mock

import test_task as fixture
import test_task_lifecycle as lifecycle


task = fixture.task


class TaskQueueTests(unittest.TestCase):
    manifest = fixture.TaskManifestTests.manifest
    initialize = fixture.TaskManifestTests.initialize
    add_page = fixture.TaskManifestTests.add_page
    capability = fixture.TaskManifestTests.capability
    bind = fixture.TaskManifestTests.bind
    present = fixture.TaskManifestTests.present
    check = fixture.TaskManifestTests.check
    verify = fixture.TaskManifestTests.verify
    independent_verify = fixture.TaskManifestTests.independent_verify
    transition = lifecycle.TaskLifecycleTests.transition
    discover = lifecycle.TaskLifecycleTests.discover

    def setUp(self):
        fixture.TaskManifestTests.setUp(self)
        self.timestamp = 1000.0
        patch = mock.patch.object(task.QUEUE, "clock", lambda: self.timestamp)
        patch.start()
        self.addCleanup(patch.stop)

    def run_cli(self, command, *options, ok=True, revision=None):
        path = self.directory / "task.json"
        before = path.read_bytes() if path.exists() else None
        old_history = {p.name: p.read_bytes() for p in (self.directory / ".history").glob("*.json")}
        args = [command, "--task-dir", str(self.directory)]
        if command not in ("init", "status", "workflow"):
            args += ["--revision", str(self.manifest()["revision"] if revision is None else revision)]
        output = io.StringIO()
        with redirect_stdout(output):
            code = task.main(args + list(options))
        self.assertEqual(code, 0 if ok else 2, output.getvalue())
        result = json.loads(output.getvalue())
        if not ok:
            self.assertEqual(path.read_bytes() if path.exists() else None, before)
            self.assertEqual({p.name: p.read_bytes() for p in (self.directory / ".history").glob("*.json")}, old_history)
        return result

    def queue(self, action, *options, ok=True):
        return self.run_cli("queue", "--action", action, *options, ok=ok)

    def proof(self, name="queue-observation"):
        path = self.directory / "evidence" / (name + ".txt")
        if not path.exists():
            path.write_text("Synthetic queue observation: " + name, encoding="utf-8")
        return ["--actual", "--note", "Synthetic actual observation " + name, "--evidence", "evidence/" + name + ".txt"]

    def snapshot(self, name="snapshot", changed=None):
        page = self.manifest()["pages"][0]
        sha = lambda text: hashlib.sha256(text.encode()).hexdigest()
        data = {"pageId": page["id"], "url": page["url"], "stateKey": page["stateKey"],
                "pageFingerprint": sha("page structure"),
                "controls": [{"id": binding["displayId"], "fingerprint": sha(binding["runtimeId"]),
                              "contentHash": sha((changed or {}).get(binding["displayId"], "unchanged"))}
                             for binding in page["bindings"]],
                "privateUnusedBody": "Must not be copied into manifest/workflow"}
        path = self.directory / "evidence" / (name + ".json")
        path.write_text(json.dumps(data), encoding="utf-8")
        return "evidence/" + name + ".json"

    def prepare(self, side_effect="read_only", max_attempts=3):
        self.discover()
        self.page_id = self.add_page()
        self.bind(self.page_id)
        self.bind(self.page_id, "shh-second", "A-002")
        self.transition("annotation", "--scope-confirmed")
        self.queue("configure", "--max-attempts", str(max_attempts), "--base-delay-seconds", "2",
                   "--max-delay-seconds", "3", "--timeout-seconds", "10")
        result = self.queue("enqueue", "--page-id", self.page_id, "--phase", "annotation", "--side-effect", side_effect)
        self.job_id = result["queueResult"]["jobId"]
        self.snapshot_path = self.snapshot()
        return self.job_id

    def reconcile(self, *options, ok=True, snapshot=None):
        return self.queue("reconcile", "--job-id", self.job_id, "--snapshot", snapshot or self.snapshot_path,
                          *self.proof("reconcile"), *options, ok=ok)

    def claim(self):
        return self.queue("claim", "--job-id", self.job_id)["queueResult"]

    def checkpoint(self, token, binding="A-001", result="done", ok=True):
        return self.queue("checkpoint", "--job-id", self.job_id, "--lease-token", token, "--binding-id", binding,
                          "--checkpoint-result", result, *self.proof("checkpoint-" + binding), ok=ok)

    def report(self, token, outcome="succeeded", code=None, ok=True):
        extra = ["--error-code", code] if code else []
        return self.queue("report", "--job-id", self.job_id, "--lease-token", token, "--outcome", outcome,
                          *self.proof("report"), *extra, ok=ok)

    def complete_job(self):
        self.reconcile()
        token = self.claim()["leaseToken"]
        self.checkpoint(token)
        self.checkpoint(token, "A-002")
        self.report(token)
        return token

    def test_queue_requires_fresh_observation_and_does_not_claim_task_completion(self):
        self.prepare()
        self.assertFalse(self.claim()["claimed"])
        self.transition("presentation", ok=False)
        self.reconcile()
        claim = self.claim()
        self.assertTrue(claim["claimed"])
        self.assertEqual(claim["attempt"], 1)
        self.assertFalse(self.claim()["claimed"])
        self.checkpoint(claim["leaseToken"], "A-999", ok=False)
        self.checkpoint(claim["leaseToken"])
        self.report(claim["leaseToken"], ok=False)
        self.checkpoint(claim["leaseToken"], "A-002", result="blocked")
        self.report(claim["leaseToken"], ok=False)
        self.checkpoint(claim["leaseToken"], "A-002")
        result = self.report(claim["leaseToken"])
        self.assertEqual(result["workQueue"]["progress"]["completed"], 1)
        self.assertFalse(result["taskComplete"])
        self.assertEqual(result["execution"]["recordedState"], "annotation")
        self.assertEqual(result["pages"][0]["status"], "discovered")
        self.transition("presentation")
        self.assertNotIn("privateUnusedBody", (self.directory / "task.json").read_text())
        self.assertNotIn(claim["leaseToken"], json.dumps(self.run_cli("status")["workQueue"]))

    def test_automatic_retries_have_backoff_budget_and_late_token_protection(self):
        self.prepare()
        self.reconcile()
        first = self.claim()["leaseToken"]
        self.report(first, "error", "network_timeout")
        self.assertEqual(self.run_cli("status")["workQueue"]["items"][0]["nextRetryAt"], 1002)
        self.timestamp = 1002
        self.assertFalse(self.claim()["claimed"], "Every attempt needs a new reconciliation")
        self.reconcile()
        second = self.claim()["leaseToken"]
        self.report(first, ok=False)
        self.report(second, "error", "model_timeout")
        self.reconcile()
        self.assertFalse(self.claim()["claimed"], "Backoff cannot be skipped")
        self.timestamp = 1005
        third = self.claim()["leaseToken"]
        self.report(third, "error", "browser_crash")
        state = self.run_cli("status")["workQueue"]["items"][0]
        self.assertEqual(state["status"], "failed")
        self.assertEqual(state["attempt"], 3)
        self.queue("configure", "--max-attempts", "10")
        again = self.queue("enqueue", "--page-id", self.page_id, "--phase", "annotation")
        self.assertTrue(again["queueResult"]["existing"])
        self.assertEqual(again["workQueue"]["items"][0]["maxAttempts"], 3)
        self.reconcile("--reviewed")
        self.assertFalse(self.claim()["claimed"])
        self.reconcile("--additional-attempts", "1", ok=False)
        extended = self.reconcile("--reviewed", "--additional-attempts", "1")
        self.assertEqual(extended["workQueue"]["items"][0]["maxAttempts"], 4)
        self.assertEqual(self.claim()["attempt"], 4)

    def test_unknown_side_effects_and_auth_errors_require_human_review(self):
        self.prepare(side_effect="unknown")
        self.reconcile()
        token = self.claim()["leaseToken"]
        self.report(token, "error", "network_timeout")
        item = self.run_cli("status")["workQueue"]["items"][0]
        self.assertEqual((item["status"], item["lastError"]["category"]), ("blocked", "manual"))
        self.reconcile()
        self.assertFalse(self.claim()["claimed"])
        self.reconcile("--reviewed")
        token = self.claim()["leaseToken"]
        self.report(token, "error", "auth_expired")
        self.assertEqual(self.run_cli("status")["workQueue"]["items"][0]["lastError"]["category"], "manual")

    def test_snapshot_changes_invalidate_only_affected_control_checkpoints(self):
        self.prepare()
        self.reconcile()
        token = self.claim()["leaseToken"]
        self.checkpoint(token)
        self.checkpoint(token, "A-002")
        self.report(token, "error", "network_timeout")
        changed = self.snapshot("changed", {"A-002": "new constraints"})
        review = self.reconcile(snapshot=changed)
        item = review["workQueue"]["items"][0]
        self.assertEqual(item["status"], "blocked")
        self.assertEqual(item["reconciliation"]["changedControls"], ["A-002"])
        self.assertEqual(item["checkpoints"]["done"], 1)
        self.assertEqual(item["checkpoints"]["invalidated"], 1)
        self.assertFalse(self.claim()["claimed"])
        self.reconcile("--reviewed", snapshot=changed)
        next_token = self.claim()["leaseToken"]
        self.report(next_token, ok=False)
        self.checkpoint(next_token, "A-002")
        self.assertEqual(self.report(next_token)["workQueue"]["items"][0]["status"], "succeeded")

    def test_snapshot_inventory_cannot_omit_add_or_duplicate_targets(self):
        self.prepare()
        path = self.directory / self.snapshot_path
        original = json.loads(path.read_text())
        for controls in ([], original["controls"][:1], original["controls"] + [original["controls"][0]],
                         [{**control, "id": "A-777"} for control in original["controls"]]):
            with self.subTest(controls=controls):
                path.write_text(json.dumps({**original, "controls": controls}))
                self.reconcile(ok=False)
        path.write_text(json.dumps(original))
        self.reconcile()
        self.assertEqual(task.QUEUE.PHASES, ("annotation", "presentation", "acceptance"))

    def test_timeout_is_read_only_until_reap_and_uses_expiry_for_backoff(self):
        self.prepare()
        self.reconcile()
        token = self.claim()["leaseToken"]
        before = (self.directory / "task.json").read_bytes()
        self.timestamp = 1011
        expired = self.run_cli("status")["workQueue"]["items"][0]
        self.assertEqual(expired["recordedStatus"], "running")
        self.assertEqual(expired["status"], "retry_wait")
        self.assertEqual(expired["nextRetryAt"], 1012)
        self.assertEqual(expired["allowedActions"], ["inspect", "reap"])
        self.timestamp = 1013
        self.assertTrue(self.run_cli("status")["workQueue"]["items"][0]["retryReady"])
        self.assertEqual((self.directory / "task.json").read_bytes(), before)
        self.report(token, ok=False)
        self.assertFalse(self.claim()["claimed"])
        self.assertEqual(self.manifest()["workQueue"]["items"][0]["status"], "retry_wait")
        self.reconcile()
        new_token = self.claim()["leaseToken"]
        self.checkpoint(token, ok=False)
        self.assertNotEqual(token, new_token)

    def test_task_cancel_reopen_invalidates_old_worker_generation(self):
        self.prepare()
        self.reconcile()
        token = self.claim()["leaseToken"]
        self.transition("cancelled", "--reason", "User explicitly stopped", proof=False)
        self.queue("claim", ok=False)
        self.transition("discovery", "--reopen")
        self.transition("annotation", "--scope-confirmed")
        self.report(token, ok=False)
        self.queue("reap")
        self.assertEqual(self.run_cli("status")["workQueue"]["items"][0]["status"], "blocked")
        self.reconcile("--reviewed")
        self.assertNotEqual(self.claim()["leaseToken"], token)

    def test_page_cancel_and_task_blocked_or_failed_prevent_claims(self):
        self.prepare()
        self.reconcile()
        self.transition("blocked", "--reason", "External input required", "--next-action", "Obtain input", proof=False)
        self.assertNotIn("claim", self.run_cli("status")["workQueue"]["items"][0]["allowedActions"])
        self.queue("claim", ok=False)
        self.transition("annotation", "--resume")
        self.transition("failed", "--reason", "Operation failed", "--next-action", "Repair")
        self.queue("claim", ok=False)
        self.transition("annotation", "--retry")
        self.run_cli("page", "--page-id", self.page_id, "--status", "cancelled", "--reason", "User withdrew page")
        self.assertFalse(self.claim()["claimed"])
        self.assertEqual(self.run_cli("status")["workQueue"]["items"][0]["status"], "cancelled")

    def test_successful_job_with_stale_evidence_can_be_reviewed_and_reexecuted(self):
        self.prepare()
        self.complete_job()
        (self.directory / "evidence/report.txt").unlink()
        self.assertEqual(self.run_cli("status")["workQueue"]["items"][0]["status"], "blocked")
        self.transition("presentation", ok=False)
        self.reconcile("--reviewed")
        token = self.claim()["leaseToken"]
        self.assertEqual(self.report(token)["workQueue"]["items"][0]["status"], "succeeded")
        self.transition("presentation")

    def test_queue_done_is_not_page_acceptance_and_all_required_jobs_gate_task_completion(self):
        self.prepare()
        self.complete_job()
        self.transition("presentation")
        self.present(self.page_id)
        self.transition("acceptance")
        new_job = self.queue("enqueue", "--page-id", self.page_id, "--phase", "acceptance", "--side-effect", "read_only")
        self.job_id = new_job["queueResult"]["jobId"]
        self.reconcile()
        token = self.claim()["leaseToken"]
        self.checkpoint(token)
        self.checkpoint(token, "A-002")
        self.report(token, ok=False)
        for name in task.CHECKS:
            self.check(self.page_id, name)
        self.verify(self.page_id)
        self.transition("completed", ok=False)
        self.report(token)
        self.independent_verify()
        completed = self.transition("completed")
        self.assertTrue(completed["taskComplete"])
        self.assertTrue(all(item["allowedActions"] == ["inspect"] for item in completed["workQueue"]["items"]))
        (self.directory / "evidence/checkpoint-A-001.txt").unlink()
        status = self.run_cli("status")
        self.assertFalse(status["taskComplete"])
        self.assertEqual(status["execution"]["state"], "blocked")

    def test_queue_disabled_is_read_only_and_bad_policy_cannot_write(self):
        self.initialize()
        original = (self.directory / "task.json").read_bytes()
        self.assertFalse(self.run_cli("status")["workQueue"]["enabled"])
        self.assertEqual((self.directory / "task.json").read_bytes(), original)
        self.queue("configure", "--max-attempts", "0", ok=False)
        self.queue("configure", "--base-delay-seconds", "10", "--max-delay-seconds", "2", ok=False)
        self.queue("configure", "--timeout-seconds", "nan", ok=False)

    def test_idempotency_requires_explicit_key_and_claim_has_no_execution_side_effect(self):
        self.discover()
        self.page_id = self.add_page()
        self.bind(self.page_id)
        self.transition("annotation", "--scope-confirmed")
        self.queue("enqueue", "--page-id", self.page_id, "--phase", "annotation", "--side-effect", "idempotent", ok=False)
        queued = self.queue("enqueue", "--page-id", self.page_id, "--phase", "annotation", "--side-effect", "idempotent",
                            "--idempotency-key", "caller-declared-stable-operation")
        self.job_id = queued["queueResult"]["jobId"]
        self.snapshot_path = self.snapshot()
        self.reconcile()
        token = self.claim()["leaseToken"]
        self.assertEqual(self.manifest()["pages"][0]["status"], "discovered")
        result = self.report(token, "error", "model_timeout")
        self.assertEqual(result["workQueue"]["items"][0]["status"], "retry_wait")


if __name__ == "__main__":
    unittest.main()
