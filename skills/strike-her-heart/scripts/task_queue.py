"""Bounded page-work leases and checkpoints. No browser/model calls or background loop."""

import copy
import hashlib
import json
import math
import time
import uuid

VERSION = 1
PHASES = ("annotation", "presentation", "acceptance")
STATUSES = ("queued", "running", "retry_wait", "blocked", "failed", "succeeded", "cancelled")
DEFAULT_POLICY = {"maxAttempts": 3, "baseDelaySeconds": 2, "maxDelaySeconds": 60, "timeoutSeconds": 120}
AUTO_ERRORS = {"network_timeout", "model_timeout", "browser_crash", "lease_timeout", "connection_reset",
               "service_unavailable", "rate_limited", "transport_timeout"}
REVIEW_ERRORS = {"mapping_changed", "content_changed", "execution_changed", "evidence_invalid"}
MANUAL_ERRORS = {"auth_expired", "permission_denied", "captcha", "user_input", "unknown", "side_effect_unknown"}
ERROR_CODES = tuple(sorted(AUTO_ERRORS | REVIEW_ERRORS | MANUAL_ERRORS))


class QueueError(ValueError):
    pass


def clock():
    return time.time()


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def generation(data):
    return len(data.get("execution", {}).get("transitions", []))


def page_for(data, page_id):
    page = next((page for page in data["pages"] if page["id"] == page_id), None)
    if page is None:
        raise QueueError("Unknown queued page; register its stable page identity first.")
    return page


def binding_map(page):
    return {binding["displayId"]: binding["runtimeId"] for binding in page.get("bindings", [])}


def record_event(item, action, timestamp, **details):
    item.setdefault("events", []).append({"action": action, "at": timestamp, "attempt": item["attempt"], **details})


def queue_record(data, create=False):
    queue = data.get("workQueue")
    if queue is None and create:
        queue = {"version": VERSION, "policy": dict(DEFAULT_POLICY), "items": []}
        data["workQueue"] = queue
    if queue is not None and (not isinstance(queue, dict) or queue.get("version") != VERSION
                              or not isinstance(queue.get("items"), list)):
        raise QueueError("Unsupported or invalid work queue; restore a valid task revision.")
    if queue is not None:
        try:
            validated_policy(queue["policy"])
            identities = set()
            for item in queue["items"]:
                if (not isinstance(item, dict) or item.get("status") not in STATUSES
                        or item.get("phase") not in PHASES or type(item.get("attempt")) is not int
                        or item["attempt"] < 0 or not isinstance(item.get("checkpoints"), dict)
                        or not isinstance(item.get("events"), list)
                        or item.get("sideEffect") not in ("read_only", "idempotent", "unknown")):
                    raise QueueError("Invalid work item state or checkpoint record.")
                identity = (item["id"], item["pageId"], item["phase"])
                if identity in identities:
                    raise QueueError("Duplicate work item identity.")
                identities.add(identity)
                validated_policy(item["policy"])
                if item.get("lease"):
                    lease = item["lease"]
                    if (not isinstance(lease, dict) or not isinstance(lease["token"], str)
                            or type(lease["generation"]) is not int or type(lease["attempt"]) is not int
                            or not math.isfinite(lease["expiresAt"])):
                        raise QueueError("Invalid work lease.")
        except (KeyError, TypeError, AttributeError):
            raise QueueError("Invalid work queue record; restore a valid task revision.")
    return queue


def item_for(queue, job_id):
    item = next((item for item in queue["items"] if item["id"] == job_id), None)
    if item is None:
        raise QueueError("Unknown work item; inspect status before continuing.")
    return item


def validated_policy(values):
    policy = dict(DEFAULT_POLICY)
    policy.update(values)
    limits = {"maxAttempts": (1, 20), "baseDelaySeconds": (0, 3600),
              "maxDelaySeconds": (0, 86400), "timeoutSeconds": (1, 86400)}
    for key, (minimum, maximum) in limits.items():
        value = policy.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not minimum <= value <= maximum:
            raise QueueError("Invalid bounded queue policy: " + key)
    if type(policy["maxAttempts"]) is not int or policy["baseDelaySeconds"] > policy["maxDelaySeconds"]:
        raise QueueError("maxAttempts must be an integer; base delay cannot exceed maximum delay.")
    return policy


def safe_replay(item):
    return item["sideEffect"] == "read_only" or (item["sideEffect"] == "idempotent" and bool(item.get("idempotencyKey")))


def classify(item, code):
    if code in REVIEW_ERRORS:
        return "review"
    return "automatic" if code in AUTO_ERRORS and safe_replay(item) else "manual"


def finish_error(item, code, message, timestamp, proof=None):
    category = classify(item, code)
    exhausted = item["attempt"] >= item["policy"]["maxAttempts"]
    item["status"] = "failed" if exhausted else "retry_wait" if category == "automatic" else "blocked"
    item["retryAt"] = (timestamp + min(item["policy"]["maxDelaySeconds"],
                                       item["policy"]["baseDelaySeconds"] * 2 ** (item["attempt"] - 1))
                       if item["status"] == "retry_wait" else None)
    action = ("Retry budget exhausted; obtain an explicit decision before reconciling with --reviewed --additional-attempts N." if exhausted else
              "Observe the current page and reconcile a fresh snapshot before the next bounded attempt."
              if category == "automatic" else
              "Resolve the cause, observe the page, then reconcile with --reviewed before any new claim.")
    item["lastError"] = {"code": code, "category": category, "message": message, "nextAction": action}
    item["lease"] = None
    item["closedAt"] = timestamp
    record_event(item, "error", timestamp, error=copy.deepcopy(item["lastError"]), proof=proof)


def expired_reason(data, item, timestamp):
    lease = item.get("lease")
    if not lease:
        return "unknown", "Running work has no valid lease."
    if lease["generation"] != generation(data):
        return "execution_changed", "Task execution changed after the lease was issued."
    if timestamp >= lease["expiresAt"]:
        return "lease_timeout", "Worker did not report within its lease; remote side effects are not assumed absent."
    return None


def reap(data, queue, timestamp):
    count = 0
    for item in queue["items"]:
        if item["status"] == "running":
            expired = expired_reason(data, item, timestamp)
            if expired:
                closed_at = item["lease"]["expiresAt"] if expired[0] == "lease_timeout" else timestamp
                finish_error(item, *expired, closed_at)
                count += 1
    return count


def verify_reconciliation(data, item, verify):
    reconciliation = item.get("reconciliation")
    if not reconciliation:
        raise QueueError("A fresh actual page/control reconciliation is required before every claim.")
    verify(reconciliation["proof"])
    snapshot = reconciliation["snapshot"]
    page = page_for(data, item["pageId"])
    if (snapshot["pageId"], snapshot["url"], snapshot["stateKey"]) != (page["id"], page["url"], page["stateKey"]):
        raise QueueError("Page identity changed; reconcile its current actual snapshot.")
    if reconciliation["bindings"] != binding_map(page):
        raise QueueError("Registered runtime bindings changed; reconcile and review the current mapping.")
    if reconciliation["generation"] != generation(data) and item["status"] != "succeeded":
        raise QueueError("Task execution changed; a fresh reconciliation is required.")
    return reconciliation


def checkpoint_issues(item, verify):
    issues = []
    reconciliation = item.get("reconciliation")
    if not reconciliation:
        return ["Missing page/control reconciliation."]
    for control in reconciliation["snapshot"]["controls"]:
        checkpoint = item.get("checkpoints", {}).get(control["id"])
        if not checkpoint or checkpoint.get("result") != "done" or checkpoint.get("invalidated"):
            issues.append(control["id"] + " has no current completed checkpoint.")
            continue
        if checkpoint.get("controlDigest") != digest(control):
            issues.append(control["id"] + " checkpoint does not match the current control snapshot.")
            continue
        try:
            verify(checkpoint["proof"])
        except (ValueError, OSError) as error:
            issues.append(control["id"] + ": " + str(error))
    return issues


def valid_lease(data, item, token, timestamp, verify, require_current=True):
    if item["status"] != "running" or not item.get("lease"):
        raise QueueError("Only currently leased running work can report or checkpoint.")
    lease = item["lease"]
    if not token or token != lease["token"] or lease["attempt"] != item["attempt"]:
        raise QueueError("Lease token/attempt mismatch; late workers must not overwrite a new attempt.")
    expired = expired_reason(data, item, timestamp)
    if expired:
        raise QueueError(expired[1])
    state = data.get("execution", {}).get("state")
    page_status = page_for(data, item["pageId"])["status"]
    if state != item["phase"] or page_status == "cancelled" or (require_current and page_status in ("blocked", "failed")):
        raise QueueError("Task/page execution is not active for this lease; recover explicitly before new work.")
    if require_current:
        verify_reconciliation(data, item, verify)
    return lease


def mutate(data, action, options, verify, proof=None, snapshot=None, timestamp=None):
    timestamp = clock() if timestamp is None else timestamp
    queue = queue_record(data, create=action in ("configure", "enqueue"))
    if queue is None:
        raise QueueError("Configure or enqueue work before using the queue.")
    if action == "configure":
        queue["policy"] = validated_policy({**queue["policy"], **options.get("policy", {})})
        return {"policy": queue["policy"], "meaning": "Applies to newly enqueued work; existing attempt budgets are unchanged."}
    if action == "enqueue":
        page = page_for(data, options["pageId"])
        phase = options["phase"]
        if phase not in PHASES or page["status"] == "cancelled":
            raise QueueError("Use a supported page phase and an active registered page.")
        existing = next((item for item in queue["items"] if (item["pageId"], item["phase"]) == (page["id"], phase)), None)
        if existing:
            return {"jobId": existing["id"], "existing": True}
        side_effect = options.get("sideEffect", "unknown")
        key = options.get("idempotencyKey", "")
        if side_effect not in ("read_only", "idempotent", "unknown") or (side_effect == "idempotent" and not key):
            raise QueueError("Idempotent work needs an explicit idempotency key; unknown effects require human recovery.")
        item = {"id": "Q-%03d" % (len(queue["items"]) + 1), "pageId": page["id"], "phase": phase,
                "required": True, "status": "queued", "attempt": 0, "policy": dict(queue["policy"]),
                "sideEffect": side_effect, "idempotencyKey": key, "lease": None, "retryAt": None,
                "lastError": None, "reconciliation": None, "checkpoints": {}, "events": [], "createdAt": timestamp}
        queue["items"].append(item)
        record_event(item, "enqueue", timestamp)
        return {"jobId": item["id"], "existing": False}
    if action == "reap":
        return {"reaped": reap(data, queue, timestamp)}
    if action == "claim":
        state = data.get("execution", {}).get("state")
        if state not in PHASES:
            raise QueueError("Only an active task phase can claim work; explicitly resume/retry first.")
        count = reap(data, queue, timestamp)
        candidates = [item_for(queue, options["jobId"])] if options.get("jobId") else queue["items"]
        reasons = []
        for item in candidates:
            if item["phase"] != state or item["status"] not in ("queued", "retry_wait"):
                reasons.append(item["id"] + ": phase/state is not claimable")
                continue
            if page_for(data, item["pageId"])["status"] in ("blocked", "failed", "cancelled"):
                reasons.append(item["id"] + ": page requires explicit recovery")
                continue
            if item["attempt"] >= item["policy"]["maxAttempts"] or (item.get("retryAt") or 0) > timestamp:
                reasons.append(item["id"] + ": retry budget or backoff prevents claim")
                continue
            try:
                reconciliation = verify_reconciliation(data, item, verify)
                if reconciliation["forAttempt"] != item["attempt"] + 1 or reconciliation["reviewRequired"]:
                    raise QueueError("A fresh reconciled and reviewed snapshot is required for this attempt.")
            except (ValueError, OSError) as error:
                reasons.append(item["id"] + ": " + str(error))
                continue
            item["attempt"] += 1
            item["status"] = "running"
            item["retryAt"] = None
            item["lease"] = {"token": uuid.uuid4().hex, "attempt": item["attempt"], "generation": generation(data),
                             "claimedAt": timestamp, "expiresAt": timestamp + item["policy"]["timeoutSeconds"]}
            record_event(item, "claim", timestamp, snapshotDigest=reconciliation["snapshotDigest"])
            return {"claimed": True, "jobId": item["id"], "pageId": item["pageId"], "phase": item["phase"],
                    "leaseToken": item["lease"]["token"], "attempt": item["attempt"], "expiresAt": item["lease"]["expiresAt"],
                    "snapshotDigest": reconciliation["snapshotDigest"], "reaped": count}
        return {"claimed": False, "reaped": count, "reasons": reasons}
    item = item_for(queue, options.get("jobId"))
    if action == "reconcile":
        if item["status"] == "running":
            raise QueueError("Reconcile only after the lease closes or is explicitly reaped.")
        verify(proof)
        page = page_for(data, item["pageId"])
        if page["status"] == "cancelled":
            raise QueueError("Cancelled pages must be explicitly reopened before reconciliation.")
        previous = item.get("reconciliation")
        evidence_stale = False
        if item["status"] == "succeeded":
            try:
                verify_reconciliation(data, item, verify)
                verify(item.get("completionProof"))
                evidence_stale = bool(checkpoint_issues(item, verify))
            except (ValueError, OSError):
                evidence_stale = True
        previous_controls = {c["id"]: c for c in previous["snapshot"]["controls"]} if previous else {}
        current_controls = {c["id"]: c for c in snapshot["controls"]}
        bindings = binding_map(page)
        changed = sorted(key for key in set(previous_controls) | set(current_controls)
                         if previous_controls.get(key) != current_controls.get(key)
                         or (previous and previous["bindings"].get(key) != bindings.get(key))) if previous else []
        page_changed = bool(previous and previous["snapshot"]["pageFingerprint"] != snapshot["pageFingerprint"])
        if page_changed:
            changed = sorted(set(changed) | set(current_controls) | set(previous_controls))
        for binding_id, checkpoint in item["checkpoints"].items():
            if binding_id in changed:
                checkpoint["invalidated"] = True
        needs_review = bool(changed or page_changed or evidence_stale or (previous and previous.get("reviewRequired"))
                            or item["status"] in ("blocked", "failed"))
        reviewed = bool(options.get("reviewed"))
        if (changed or evidence_stale) and item["status"] == "succeeded" and item["attempt"] >= item["policy"]["maxAttempts"]:
            item["status"] = "failed"
        additional = options.get("additionalAttempts")
        if additional is not None:
            if item["status"] != "failed" or not reviewed or type(additional) is not int or not 1 <= additional <= 20:
                raise QueueError("Additional attempts require a failed item, explicit --reviewed and a positive bounded allowance.")
            item["policy"] = validated_policy({**item["policy"], "maxAttempts": item["policy"]["maxAttempts"] + additional})
            record_event(item, "additional-attempts", timestamp, allowance=additional, proof=proof)
            item["status"] = "blocked"
        item["reconciliation"] = {"snapshot": snapshot, "snapshotDigest": digest(snapshot), "bindings": bindings,
                                  "proof": proof, "at": timestamp, "forAttempt": item["attempt"] + 1,
                                  "generation": generation(data), "changedControls": changed,
                                  "reviewRequired": needs_review and not reviewed}
        record_event(item, "reconcile", timestamp, proof=proof, snapshotDigest=digest(snapshot),
                     changedControls=changed, reviewed=reviewed)
        if needs_review and not reviewed and item["status"] != "failed":
            item["status"] = "blocked"
            if changed or page_changed or evidence_stale or not item.get("lastError"):
                item["lastError"] = {"code": "evidence_invalid" if evidence_stale else "content_changed" if page_changed else "mapping_changed",
                                     "category": "review", "message": "Current page/control observations require review.",
                                     "nextAction": "Inspect the change and reconcile with --reviewed using actual evidence."}
        elif reviewed and item["status"] == "blocked":
            item["status"] = "queued"
            item["retryAt"] = None
            item["lastError"] = None
        elif (changed or evidence_stale) and item["status"] == "succeeded":
            item["status"] = "queued"
        return {"jobId": item["id"], "changedControls": changed, "reviewRequired": needs_review and not reviewed}
    if action in ("checkpoint", "report"):
        lease = valid_lease(data, item, options.get("leaseToken"), timestamp, verify,
                            require_current=action != "report" or options.get("outcome") == "succeeded")
        verify(proof)
        if action == "checkpoint":
            binding_id = options.get("bindingId")
            controls = {control["id"]: control for control in item["reconciliation"]["snapshot"]["controls"]}
            if binding_id not in controls or binding_id not in binding_map(page_for(data, item["pageId"])):
                raise QueueError("Checkpoint IDs must be observed controls with registered runtime bindings.")
            item["checkpoints"][binding_id] = {"result": options["checkpointResult"], "proof": proof,
                                              "controlDigest": digest(controls[binding_id]), "invalidated": False,
                                              "snapshotDigest": item["reconciliation"]["snapshotDigest"],
                                              "attempt": item["attempt"], "at": timestamp}
            record_event(item, "checkpoint", timestamp, bindingId=binding_id, result=options["checkpointResult"])
        elif options.get("outcome") == "succeeded":
            expected = ("presented", "verified") if item["phase"] == "presentation" else ("verified",) if item["phase"] == "acceptance" else ()
            if expected and page_for(data, item["pageId"])["status"] not in expected:
                raise QueueError("This phase needs the page's actual presentation/acceptance record before the job can succeed.")
            issues = checkpoint_issues(item, verify)
            if issues:
                raise QueueError("Cannot complete work with missing/stale checkpoints: " + "; ".join(issues))
            item["status"] = "succeeded"
            item["completionProof"] = proof
            item["lease"] = None
            item["closedAt"] = timestamp
            item["lastError"] = None
            record_event(item, "succeeded", timestamp, proof=proof, attempt=lease["attempt"])
        else:
            code = options.get("errorCode") or "unknown"
            finish_error(item, code if code in ERROR_CODES else "unknown", proof["note"], timestamp, proof)
        return {"jobId": item["id"], "status": item["status"]}
    raise QueueError("Unsupported queue action.")


def view(data, verify, timestamp=None, active_state=None):
    timestamp = clock() if timestamp is None else timestamp
    queue = queue_record(data)
    if queue is None:
        return {"enabled": False, "policy": dict(DEFAULT_POLICY), "counts": {status: 0 for status in STATUSES},
                "progress": {"total": 0, "completed": 0, "required": 0, "incompleteRequired": 0}, "items": []}
    items = []
    recorded_task_state = data.get("execution", {}).get("state")
    active_state = active_state or recorded_task_state
    for original in queue["items"]:
        item = copy.deepcopy(original)
        issues = []
        if item["status"] == "running":
            expired = expired_reason(data, item, timestamp)
            if expired:
                closed_at = item["lease"]["expiresAt"] if expired[0] == "lease_timeout" else timestamp
                finish_error(item, *expired, closed_at)
        page = page_for(data, item["pageId"])
        if data.get("execution", {}).get("state") == "cancelled" or page["status"] == "cancelled":
            item["status"] = "cancelled"
        reconciliation = item.get("reconciliation")
        reconcile_reason = "Observe the current page/control snapshot before claiming work."
        reconcile_status = "missing"
        if reconciliation:
            try:
                verify_reconciliation(data, item, verify)
                reconcile_status = "review_required" if reconciliation["reviewRequired"] else "current"
                reconcile_reason = "Inspect and explicitly review the observed changes." if reconciliation["reviewRequired"] else "Current observed snapshot recorded."
            except (ValueError, OSError) as error:
                reconcile_status = "stale"
                reconcile_reason = str(error)
                issues.append(str(error))
        if item["status"] == "succeeded":
            expected = ("presented", "verified") if item["phase"] == "presentation" else ("verified",) if item["phase"] == "acceptance" else ()
            if expected and page["status"] not in expected:
                issues.append("Page presentation/acceptance is no longer current for this work phase.")
            issues += checkpoint_issues(item, verify)
            try:
                verify(item.get("completionProof"))
            except (ValueError, OSError) as error:
                issues.append(str(error))
        if issues and item["status"] not in ("cancelled", "failed"):
            item["status"] = "blocked"
        checkpoints = item.get("checkpoints", {})
        controls = reconciliation["snapshot"]["controls"] if reconciliation else []
        done, stale_ids = 0, set()
        for control in controls:
            checkpoint = checkpoints.get(control["id"], {})
            if checkpoint.get("result") != "done":
                continue
            try:
                verify(checkpoint.get("proof"))
                if checkpoint.get("invalidated") or checkpoint.get("controlDigest") != digest(control):
                    raise QueueError("Control checkpoint no longer matches the observed target.")
                done += 1
            except (ValueError, OSError):
                stale_ids.add(control["id"])
        lease = original.get("lease")
        fresh = bool(reconciliation and reconciliation["forAttempt"] == item["attempt"] + 1
                     and not reconciliation["reviewRequired"] and reconcile_status == "current")
        allowed = ["inspect"]
        if recorded_task_state not in ("completed", "cancelled") and page["status"] != "cancelled":
            if original["status"] == "running" and item["status"] != "running":
                allowed.append("reap")
            elif item["status"] != "running":
                allowed.append("reconcile")
            can_execute = active_state == item["phase"] and page["status"] not in ("blocked", "failed", "cancelled")
            if (can_execute and item["status"] in ("queued", "retry_wait") and fresh
                    and item["attempt"] < item["policy"]["maxAttempts"] and (item.get("retryAt") or 0) <= timestamp):
                allowed.append("claim")
            if can_execute and item["status"] == "running":
                allowed += ["checkpoint", "report"]
        items.append({"id": item["id"], "pageId": item["pageId"], "pageLabel": page["label"], "phase": item["phase"],
                      "status": item["status"], "recordedStatus": original["status"], "attempt": item["attempt"],
                      "maxAttempts": item["policy"]["maxAttempts"], "nextRetryAt": item.get("retryAt"),
                      "retryReady": item["status"] == "retry_wait" and (item.get("retryAt") or 0) <= timestamp,
                      "lease": {"expiresAt": lease["expiresAt"], "remainingSeconds": max(0, lease["expiresAt"] - timestamp),
                                "expired": timestamp >= lease["expiresAt"] or lease["generation"] != generation(data)} if lease else None,
                      "checkpoints": {"total": len(controls), "done": done,
                                      "blocked": sum(c.get("result") == "blocked" for c in checkpoints.values()),
                                      "invalidated": len(stale_ids | {key for key, value in checkpoints.items() if value.get("invalidated")}),
                                      "ids": sorted(checkpoints)},
                      "reconciliation": {"required": not fresh and item["status"] not in ("running", "succeeded"),
                                         "status": reconcile_status, "reason": reconcile_reason,
                                         "changedControls": reconciliation.get("changedControls", []) if reconciliation else []},
                      "lastError": item.get("lastError"), "evidenceIssues": list(dict.fromkeys(issues)), "allowedActions": allowed})
    counts = {status: sum(item["status"] == status for item in items) for status in STATUSES}
    return {"enabled": True, "policy": queue["policy"], "counts": counts, "items": items,
            "progress": {"total": len(items), "completed": counts["succeeded"], "required": len(items),
                         "incompleteRequired": len(items) - counts["succeeded"]}}


def phase_issues(data, phase, verify):
    if "workQueue" not in data:
        return []
    current = view(data, verify)
    return [item["id"] + " 页面队列尚未有效完成（" + item["status"] + "）。" for item in current["items"]
            if (phase == "acceptance" or item["phase"] == phase) and item["status"] != "succeeded"]
