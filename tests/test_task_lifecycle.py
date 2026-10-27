"""State-machine gates use synthetic local records, not claimed live website runs."""

import json
import unittest

import test_task as fixture


task = fixture.task


class TaskLifecycleTests(unittest.TestCase):
    setUp = fixture.TaskManifestTests.setUp
    manifest = fixture.TaskManifestTests.manifest
    initialize = fixture.TaskManifestTests.initialize
    add_page = fixture.TaskManifestTests.add_page
    capability = fixture.TaskManifestTests.capability
    bind = fixture.TaskManifestTests.bind
    present = fixture.TaskManifestTests.present
    check = fixture.TaskManifestTests.check
    verify = fixture.TaskManifestTests.verify
    verified_page = fixture.TaskManifestTests.verified_page
    independent_verify = fixture.TaskManifestTests.independent_verify

    def run_cli(self, command, *options, ok=True, revision=None):
        record = self.directory / "task.json"
        before = record.read_bytes() if record.exists() else None
        history = {p.name: p.read_bytes() for p in (self.directory / ".history").glob("*.json")}
        result = fixture.TaskManifestTests.run_cli(self, command, *options, ok=ok, revision=revision)
        if not ok:
            self.assertFalse(result["changed"])
            self.assertEqual(record.read_bytes() if record.exists() else None, before)
            self.assertEqual({p.name: p.read_bytes() for p in (self.directory / ".history").glob("*.json")}, history)
        return result

    def transition(self, target, *extra, ok=True, proof=True):
        args = ["--to", target]
        if proof:
            name = "stage-" + target
            evidence = self.directory / "evidence" / (name + ".txt")
            if not evidence.exists():
                evidence.write_text("Synthetic lifecycle observation: " + target, encoding="utf-8")
            args += ["--actual", "--note", "Synthetic stage observation for " + target,
                     "--evidence", "evidence/" + name + ".txt"]
        return self.run_cli("transition", *args, *extra, ok=ok)

    def discover(self):
        self.initialize()
        self.transition("access")
        self.capability()
        self.transition("discovery")

    def ready_for_acceptance(self):
        self.discover()
        page_id = self.add_page()
        self.transition("annotation", "--scope-confirmed")
        self.bind(page_id)
        self.transition("presentation")
        self.present(page_id)
        self.transition("acceptance")
        for name in task.CHECKS:
            self.check(page_id, name)
        self.verify(page_id)
        self.independent_verify()
        return page_id

    def test_contracts_cover_every_state_with_explicit_boundaries(self):
        self.assertEqual(set(task.STATE_CONTRACTS["states"]), set(task.TASK_STATES))
        self.assertEqual(set(task.STATE_CONTRACTS["pages"]), set(task.STATUSES))
        for group in task.STATE_CONTRACTS.values():
            for definition in group.values():
                self.assertTrue(definition["label"])
                for name in ("entryConditions", "successConditions", "failureStates", "allowedNext"):
                    self.assertIsInstance(definition[name], list)
                self.assertTrue(definition["entryConditions"])
                self.assertTrue(definition["successConditions"])

    def test_skipping_or_unproven_advancement_is_rejected_without_any_write(self):
        initial = self.initialize()
        self.assertEqual(initial["execution"]["state"], "intake")
        self.transition("discovery", ok=False)
        self.transition("access", proof=False, ok=False)
        self.run_cli("transition", "--to", "access", "--actual", "--note", "Missing evidence", ok=False)
        self.transition("access")
        self.transition("discovery", ok=False)
        self.capability()
        self.transition("discovery")
        self.transition("annotation", "--scope-confirmed", ok=False)
        self.add_page()
        self.transition("annotation", ok=False)
        self.transition("annotation", "--scope-confirmed")
        self.transition("presentation", ok=False)

    def test_task_exception_recovery_requires_matching_explicit_action(self):
        self.initialize()
        self.transition("blocked", "--reason", "No usable login", proof=False, ok=False)
        blocked = self.transition("blocked", "--reason", "No usable login", "--next-action", "Restore login", proof=False)
        self.assertEqual(blocked["execution"]["resumeState"], "intake")
        self.assertEqual(blocked["execution"]["phaseStates"]["intake"], "blocked")
        self.transition("intake", ok=False)
        self.transition("intake", "--retry", ok=False)
        self.transition("access", "--resume", ok=False)
        self.transition("intake", "--resume", proof=False, ok=False)
        self.transition("intake", "--resume")
        self.transition("failed", "--reason", "Login interaction failed", "--next-action", "Fix login", proof=False, ok=False)
        failed = self.transition("failed", "--reason", "Login interaction failed", "--next-action", "Fix login")
        self.assertEqual(failed["execution"]["phaseStates"]["intake"], "failed")
        self.transition("intake", "--resume", ok=False)
        retried = self.transition("intake", "--retry")
        self.assertEqual(retried["execution"]["attempt"], 2)

    def test_cancelled_task_freezes_mutations_until_explicit_reopen(self):
        page_id = self.verified_page()
        self.transition("cancelled", proof=False, ok=False)
        cancelled = self.transition("cancelled", "--reason", "User requested cancellation", proof=False)
        self.assertEqual(cancelled["execution"]["state"], "cancelled")
        self.assertFalse(cancelled["taskComplete"])
        self.run_cli("page", "--page-id", page_id, "--label", "Cannot edit", ok=False)
        self.run_cli("capability", "--write", "unavailable", ok=False)
        self.run_cli("bind", "--page-id", page_id, "--display-id", "A-001", "--runtime-id", "same", ok=False)
        self.run_cli("check", "--page-id", page_id, "--name", "coverage", "--result", "untested", ok=False)
        self.transition("access", ok=False)
        self.transition("discovery", "--reopen", ok=False)
        reopened = self.transition("intake", "--reopen")
        self.assertEqual(reopened["execution"]["attempt"], 2)
        self.assertEqual(reopened["execution"]["state"], "intake")

    def test_closed_scope_full_pipeline_completes_only_after_final_transition(self):
        page_id = self.ready_for_acceptance()
        current = self.run_cli("status")
        self.assertTrue(current["completion"]["eligible"])
        self.assertFalse(current["taskComplete"])
        completed = self.transition("completed")
        self.assertTrue(completed["taskComplete"])
        self.assertFalse(completed["wholeSystemComplete"])
        self.assertEqual(set(completed["execution"]["phaseStates"].values()), {"succeeded"})
        self.run_cli("page", "--page-id", page_id, "--gap", "Late issue", ok=False)
        self.transition("cancelled", "--reason", "Cannot silently rewrite terminal state", ok=False)
        reopened = self.transition("discovery", "--reopen")
        self.assertEqual(reopened["execution"]["state"], "discovery")
        self.assertFalse(reopened["taskComplete"])
        self.assertEqual(set(self.manifest()["execution"]["proofs"]), {"intake", "access"})
        self.assertIsNone(self.manifest()["execution"]["scopeReview"])
        self.assertEqual(self.manifest()["pages"][0]["id"], page_id)

    def test_new_page_invalidates_scope_and_reopen_does_not_need_cancellation(self):
        self.ready_for_acceptance()
        self.add_page("unvisited-modal")
        state = self.run_cli("status")
        self.assertFalse(state["completion"]["eligible"])
        self.assertEqual(state["execution"]["state"], "blocked")
        self.assertEqual(state["execution"]["phaseStates"]["discovery"], "stale")
        self.transition("completed", ok=False)
        self.transition("discovery", "--reopen")
        confirmed = self.transition("annotation", "--scope-confirmed")
        self.assertEqual(confirmed["execution"]["state"], "annotation")
        self.transition("presentation", ok=False)
        self.assertFalse(any(t["to"] == "cancelled" for t in self.manifest()["execution"]["transitions"]))

    def test_gap_requires_exact_evidenced_resolution_and_preserves_history(self):
        page_id = self.ready_for_acceptance()
        self.run_cli("page", "--page-id", page_id, "--gap", "Permission limit unknown")
        self.transition("completed", ok=False)
        self.run_cli("page", "--page-id", page_id, "--resolve-gap", "Permission limit unknown", ok=False)
        self.run_cli("page", "--page-id", page_id, "--resolve-gap", "Wrong gap", "--actual", "--note", "Checked",
                     "--evidence", "evidence/read.txt", ok=False)
        self.run_cli("page", "--page-id", page_id, "--resolve-gap", "Permission limit unknown", "--actual",
                     "--note", "Observed the requested permission limit", "--evidence", "evidence/read.txt")
        self.assertEqual(self.manifest()["pages"][0]["gapResolutions"][0]["gap"], "Permission limit unknown")
        self.independent_verify()
        completed = self.transition("completed")
        self.assertTrue(completed["taskComplete"])
        self.assertTrue(any(json.loads(p.read_text())["pages"][0]["gaps"] for p in
                            (self.directory / ".history").glob("*.json") if json.loads(p.read_text())["pages"]))
        (self.directory / "evidence/read.txt").write_text("Changed gap resolution", encoding="utf-8")
        self.assertFalse(self.run_cli("status")["taskComplete"])

    def test_failed_and_cancelled_pages_cannot_be_revived_by_rescan_or_pass(self):
        page_id = self.verified_page()
        self.check(page_id, "coverage", "fail")
        self.bind(page_id, "shh-new", "A-001", "--replace")
        self.capability(method="new actual capability")
        self.assertEqual(self.manifest()["pages"][0]["status"], "failed")
        self.run_cli("check", "--page-id", page_id, "--name", "coverage", "--result", "pass",
                     "--actual", "--note", "Cannot revive", "--evidence", "evidence/coverage.txt", ok=False)
        self.present(page_id, ok=False)
        self.present(page_id, "--retry")
        self.run_cli("page", "--page-id", page_id, "--status", "cancelled", "--reason", "User cancelled this page")
        self.capability(method="third actual capability")
        self.assertEqual(self.manifest()["pages"][0]["status"], "cancelled")
        self.present(page_id, ok=False)
        self.run_cli("bind", "--page-id", page_id, "--display-id", "A-001", "--runtime-id", "shh-again",
                     "--actual", "--note", "Cannot revive", "--evidence", "evidence/runtime.txt", ok=False)
        self.present(page_id, "--reopen")
        self.assertEqual(self.manifest()["pages"][0]["status"], "presented")

    def test_page_failure_can_become_blocked_without_losing_failure_check(self):
        page_id = self.ready_for_acceptance()
        self.check(page_id, "navigation", "fail")
        self.run_cli("page", "--page-id", page_id, "--status", "blocked", "--reason", "External server offline", ok=False)
        self.run_cli("page", "--page-id", page_id, "--status", "blocked", "--reason", "External server offline",
                     "--next-action", "Restore server and retry")
        self.assertEqual(self.manifest()["pages"][0]["checks"]["navigation"]["result"], "fail")
        self.transition("completed", ok=False)
        self.present(page_id, "--retry", ok=False)
        self.present(page_id, "--resume")

    def test_cancelled_page_and_unvisited_page_prevent_task_completion(self):
        page_id = self.ready_for_acceptance()
        self.run_cli("page", "--page-id", page_id, "--status", "cancelled", "--reason", "User cancelled page verification")
        current = self.run_cli("status")
        self.assertEqual(current["statusCounts"]["cancelled"], 1)
        self.assertFalse(current["completion"]["eligible"])
        self.transition("completed", ok=False)
        self.assertEqual(self.manifest()["execution"]["state"], "acceptance")

    def test_stale_completed_evidence_degrades_read_only_and_keeps_recorded_state(self):
        self.ready_for_acceptance()
        self.transition("completed")
        before = (self.directory / "task.json").read_bytes()
        (self.directory / "evidence/stage-presentation.txt").unlink()
        status = self.run_cli("status")
        self.assertEqual(status["execution"]["recordedState"], "completed")
        self.assertEqual(status["execution"]["state"], "blocked")
        self.assertEqual(status["execution"]["phaseStates"]["annotation"], "stale")
        self.assertFalse(status["taskComplete"])
        self.assertEqual((self.directory / "task.json").read_bytes(), before)
        self.transition("discovery", "--reopen")

    def test_legacy_verified_pages_never_infer_task_completion_or_modify_on_read(self):
        self.verified_page()
        data = self.manifest()
        del data["execution"]
        (self.directory / "task.json").write_text(json.dumps(data), encoding="utf-8")
        before = (self.directory / "task.json").read_bytes()
        current = self.run_cli("status")
        self.assertTrue(current["execution"]["legacy"])
        self.assertEqual(current["execution"]["state"], "intake")
        self.assertFalse(current["taskComplete"])
        self.assertEqual(current["pages"][0]["status"], "verified")
        self.assertEqual((self.directory / "task.json").read_bytes(), before)
        self.transition("completed", ok=False)
        self.transition("access")
        self.assertFalse(self.run_cli("status")["execution"]["legacy"])

    def test_missing_stage_record_and_invalid_state_fail_closed(self):
        self.ready_for_acceptance()
        data = self.manifest()
        del data["execution"]["proofs"]["intake"]
        (self.directory / "task.json").write_text(json.dumps(data), encoding="utf-8")
        self.assertEqual(self.run_cli("status")["execution"]["state"], "blocked")
        self.transition("completed", ok=False)
        self.transition("discovery", "--reopen", ok=False)
        self.transition("intake", "--reopen")
        data = self.manifest()
        data["execution"]["state"] = "looks-done"
        (self.directory / "task.json").write_text(json.dumps(data), encoding="utf-8")
        status = self.run_cli("status")
        self.assertFalse(status["taskComplete"])
        self.assertEqual(status["execution"]["state"], "blocked")
        self.transition("access", ok=False)

    def test_failed_task_can_block_or_reopen_without_fabricated_cancel(self):
        self.discover()
        self.transition("failed", "--reason", "Interaction failed", "--next-action", "Investigate outage")
        self.transition("blocked", "--reason", "Server unavailable", "--next-action", "Restore service", proof=False)
        self.assertEqual(self.manifest()["execution"]["resumeState"], "discovery")
        self.transition("discovery", "--reopen")
        self.assertEqual(self.manifest()["execution"]["attempt"], 2)
        self.assertEqual([t["to"] for t in self.manifest()["execution"]["transitions"]],
                         ["access", "discovery", "failed", "blocked", "discovery"])

    def test_explicit_page_failure_requires_actual_evidence_and_retry(self):
        self.initialize()
        page_id = self.add_page()
        self.run_cli("page", "--page-id", page_id, "--status", "failed", "--reason", "Render failed",
                     "--next-action", "Repair renderer", ok=False)
        failed = self.run_cli("page", "--page-id", page_id, "--status", "failed", "--reason", "Render failed",
                              "--next-action", "Repair renderer", "--actual", "--note", "Synthetic render failure",
                              "--evidence", "evidence/presentation.txt")
        self.assertEqual(failed["pages"][0]["status"], "failed")
        self.run_cli("page", "--page-id", page_id, "--status", "discovered", "--retry", "--actual",
                     "--note", "Renderer repaired", "--evidence", "evidence/presentation.txt")
        self.assertEqual(self.manifest()["pages"][0]["status"], "discovered")

    def test_malformed_execution_shapes_never_crash_or_allow_mutation(self):
        self.initialize()
        original = self.manifest()
        for execution in (None, [], {**original["execution"], "attempt": "1"},
                          {**original["execution"], "proofs": None},
                          {**original["execution"], "transitions": None}):
            with self.subTest(execution=execution):
                record = {**original, "execution": execution}
                (self.directory / "task.json").write_text(json.dumps(record), encoding="utf-8")
                result = self.run_cli("status")
                self.assertEqual(result["execution"]["state"], "blocked")
                self.assertFalse(result["taskComplete"])
                self.assertEqual(result["execution"]["allowedNext"], [])
                self.transition("intake", "--reopen", ok=False)
                self.run_cli("page", "--url", "https://example.invalid/new", ok=False)

    def test_current_resume_evidence_remains_a_completion_gate(self):
        self.ready_for_acceptance()
        recovery = self.directory / "evidence/recovery.txt"
        recovery.write_text("Synthetic observed acceptance recovery", encoding="utf-8")
        self.transition("blocked", "--reason", "Review interface unavailable", "--next-action", "Restore review", proof=False)
        self.transition("acceptance", "--resume", "--evidence", "evidence/recovery.txt")
        self.assertTrue(self.run_cli("status")["completion"]["eligible"])
        recovery.unlink()
        before = (self.directory / "task.json").read_bytes()
        status = self.run_cli("status")
        self.assertEqual(status["execution"]["recordedState"], "acceptance")
        self.assertEqual(status["execution"]["state"], "blocked")
        self.assertTrue(any("resume" in issue for issue in status["execution"]["evidenceIssues"]))
        self.assertFalse(status["completion"]["eligible"])
        self.assertEqual((self.directory / "task.json").read_bytes(), before)
        self.transition("completed", ok=False)

    def test_new_attempt_replaces_old_recovery_proofs_but_keeps_its_own(self):
        self.ready_for_acceptance()
        old_recovery = self.directory / "evidence/old-recovery.txt"
        old_recovery.write_text("Superseded synthetic recovery", encoding="utf-8")
        self.transition("blocked", "--reason", "Temporary outage", "--next-action", "Restore access", proof=False)
        self.transition("acceptance", "--resume", "--evidence", "evidence/old-recovery.txt")
        self.transition("failed", "--reason", "Acceptance operation failed", "--next-action", "Repair acceptance")
        retry = self.directory / "evidence/retry.txt"
        retry.write_text("Current attempt synthetic retry", encoding="utf-8")
        self.transition("acceptance", "--retry", "--evidence", "evidence/retry.txt")
        old_recovery.unlink()
        self.assertTrue(self.run_cli("status")["completion"]["eligible"])
        self.assertTrue(self.transition("completed")["taskComplete"])
        retry.unlink()
        status = self.run_cli("status")
        self.assertFalse(status["taskComplete"])
        self.assertTrue(any("retry" in issue for issue in status["execution"]["evidenceIssues"]))
        reopening = self.directory / "evidence/reopen.txt"
        reopening.write_text("Current attempt synthetic scope recheck", encoding="utf-8")
        self.transition("discovery", "--reopen", "--evidence", "evidence/reopen.txt")
        self.transition("annotation", "--scope-confirmed")
        self.transition("presentation")
        self.transition("acceptance")
        self.independent_verify()
        self.assertTrue(self.run_cli("status")["completion"]["eligible"])
        reopening.unlink()
        self.transition("completed", ok=False)
        self.assertTrue(any("reopen" in issue for issue in self.run_cli("status")["execution"]["evidenceIssues"]))


if __name__ == "__main__":
    unittest.main()
