#!/usr/bin/env python3
"""Record and resume a private Strike Her Heart task; this CLI performs no UI checks."""

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import urlsplit, urlunsplit
import uuid

SCHEMA = 1
CHECKS = ("coverage", "multi_open", "edit_save_refresh", "navigation", "manual_preserved")
STATUSES = ("discovered", "presented", "verified", "blocked", "failed", "cancelled")
PHASES = ("intake", "access", "discovery", "annotation", "presentation", "acceptance")
EXCEPTIONS = ("blocked", "failed", "cancelled")
TASK_STATES = PHASES + ("completed",) + EXCEPTIONS
CAPABILITIES = ("unknown", "supported", "unavailable")
URL_PATTERN = re.compile(r"https?://[^\s<>\"']+", re.I)
SCRIPT = Path(__file__).resolve()
_QUEUE_SPEC = importlib.util.spec_from_file_location("strike_task_queue", SCRIPT.with_name("task_queue.py"))
QUEUE = importlib.util.module_from_spec(_QUEUE_SPEC)
_QUEUE_SPEC.loader.exec_module(QUEUE)
_EVIDENCE_SPEC = importlib.util.spec_from_file_location("strike_evidence", SCRIPT.with_name("evidence_contract.py"))
EVIDENCE = importlib.util.module_from_spec(_EVIDENCE_SPEC)
_EVIDENCE_SPEC.loader.exec_module(EVIDENCE)
_VERIFY_SPEC = importlib.util.spec_from_file_location("strike_completion", SCRIPT.with_name("completion_verifier.py"))
VERIFIER = importlib.util.module_from_spec(_VERIFY_SPEC)
_VERIFY_SPEC.loader.exec_module(VERIFIER)


def contract(label, entry, success, failures, following):
    return {"label": label, "entryConditions": entry, "successConditions": success,
            "failureStates": failures, "allowedNext": following}


STATE_CONTRACTS = {"states": {
    "intake": contract("需求接收", ["任务已登记明确的目标地址和范围；旧记录在此重新核实"],
                       ["实际确认本次任务范围，并记录说明及有效证据"], list(EXCEPTIONS), ["access", *EXCEPTIONS]),
    "access": contract("访问系统", ["需求接收阶段已实际完成，且证据仍有效"],
                       ["页面读取能力受支持，有当前有效的访问证据"], list(EXCEPTIONS), ["discovery", *EXCEPTIONS]),
    "discovery": contract("发现页面", ["访问阶段已完成，读取能力和阶段证据仍有效"],
                          ["登记至少一个页面状态", "明确确认本次页面清单与范围，保存清单指纹和实际证据"],
                          list(EXCEPTIONS), ["annotation", *EXCEPTIONS]),
    "annotation": contract("生成标注", ["页面清单及范围已明确确认，指纹仍匹配"],
                           ["每页均有实际验证的控件绑定", "原页写入能力可用", "记录本轮实际标注产出证据"],
                           list(EXCEPTIONS), ["presentation", *EXCEPTIONS]),
    "presentation": contract("原页呈现", ["各页实际绑定、写入能力与标注产出证据有效"],
                             ["每页已在原页实际呈现或验收，且呈现证据仍有效"],
                             list(EXCEPTIONS), ["acceptance", *EXCEPTIONS]),
    "acceptance": contract("验收", ["本次范围所有页面均已实际呈现"],
                           ["每页通过全部五项实测验收", "无受阻、失败、取消页面和未解决缺口", "刷新前后快照通过独立完成验证", "范围清单与所有阶段证据仍有效"],
                           list(EXCEPTIONS), ["completed", *EXCEPTIONS]),
    "completed": contract("已完成", ["所有完成门槛通过，且最终实际验收证据已登记"],
                          ["仅表示本次明确范围完成；读取时持续重验证据，不推断整个系统完成"],
                          ["blocked"], ["intake", "discovery"]),
    "blocked": contract("受阻", ["明确受阻原因和可执行下一步；证据失效亦会派生受阻"],
                        ["解除受阻后以 --resume 和实际证据恢复原阶段"],
                        ["failed", "cancelled"], [*PHASES, "failed", "cancelled"]),
    "failed": contract("失败", ["实际执行失败，记录失败证据、原因和下一步"],
                       ["以 --retry 和实际证据重试原阶段"],
                       ["blocked", "cancelled"], [*PHASES, "blocked", "cancelled"]),
    "cancelled": contract("已取消", ["明确登记取消原因；调用 Agent 负责核实用户取消授权"],
                          ["普通修改冻结；明确 --reopen 后重新发现或从需求接收开始"],
                          [], ["intake", "discovery"]),
}, "pages": {
    "discovered": contract("已发现", ["登记稳定的页面地址和语义状态标识"],
                           ["写入能力有效、实际控件绑定有效、实际呈现证据已登记"],
                           list(EXCEPTIONS), ["presented", *EXCEPTIONS]),
    "presented": contract("已呈现", ["有效写入能力、实际绑定和原页呈现证据齐全"],
                          ["五项验收均有实测通过记录和有效证据"],
                          list(EXCEPTIONS), ["verified", "discovered", *EXCEPTIONS]),
    "verified": contract("已验收", ["呈现有效且全部五项实测验收通过"],
                         ["记录仍可复核；业务缺口单独保留，阻止任务整体完成"],
                         list(EXCEPTIONS), ["presented", "discovered", *EXCEPTIONS]),
    "blocked": contract("受阻", ["明确原因及非空下一步，或检查未测试、证据失效"],
                        ["以 --resume 显式恢复到 discovered 或 presented"],
                        ["failed", "cancelled"], ["discovered", "presented", "failed", "cancelled"]),
    "failed": contract("失败", ["实际检查失败，或明确登记带证据的执行失败"],
                       ["以 --retry 显式恢复到 discovered 或 presented，重新验收"],
                       ["blocked", "cancelled"], ["discovered", "presented", "blocked", "cancelled"]),
    "cancelled": contract("已取消", ["明确登记取消原因，保留页面身份与历史"],
                          ["以 --reopen 显式恢复到 discovered 或 presented"],
                          [], ["discovered", "presented"]),
}}
for _phase in (*PHASES, "blocked", "failed"):
    STATE_CONTRACTS["states"][_phase]["allowedNext"] = list(dict.fromkeys(
        STATE_CONTRACTS["states"][_phase]["allowedNext"] + ["intake", "discovery"]))
    STATE_CONTRACTS["states"][_phase]["successConditions"].append(
        "需重核时可用 --reopen 回 intake；已有有效访问证据时可回 discovery，保留历史并重置后续阶段")


class TaskError(ValueError):
    pass


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def within(path, parent):
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def safe_url(value):
    try:
        parts = urlsplit(value)
        if parts.scheme not in ("http", "https") or not parts.hostname:
            raise TaskError("Target URL must use http or https.")
        if parts.username is not None or parts.password is not None:
            raise TaskError("URL userinfo is refused; use the authorized login UI instead.")
        host = parts.hostname
        if ":" in host:
            host = "[" + host + "]"
        if parts.port:
            host += ":" + str(parts.port)
        return urlunsplit((parts.scheme.lower(), host, parts.path or "/", "", ""))
    except TaskError:
        raise
    except (ValueError, TypeError):
        raise TaskError("Invalid target URL; no URL input was saved.")


def safe_text(value, maximum=1200):
    value = str(value or "").strip()
    # Do not retain query/fragment tokens or URL credentials embedded in notes.
    def replace(match):
        try:
            return safe_url(match.group(0))
        except TaskError:
            return "[URL omitted]"
    return URL_PATTERN.sub(replace, value)[:maximum]


def task_root(value):
    root = Path(value).expanduser().resolve()
    protected = [SCRIPT.parents[1]]
    for candidate in SCRIPT.parents:
        if (candidate / "scripts/install.py").is_file() and (
                candidate / "agents/strike-her-heart.toml").is_file():
            protected.append(candidate)
            break
    if any(within(root, directory) for directory in protected):
        raise TaskError("Task data must be outside the agent source/support directory.")
    if any((root / name).is_symlink() for name in ("task.json", ".history", ".task.lock")):
        raise TaskError("Task record, history and lock paths must not be symlinks.")
    return root


def read_manifest(root):
    try:
        data = json.loads((root / "task.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise TaskError("Cannot read task.json; supply the existing private task directory.")
    if not isinstance(data, dict) or data.get("schemaVersion") != SCHEMA:
        raise TaskError("Unsupported task manifest schema.")
    if not isinstance(data.get("revision"), int) or not isinstance(data.get("pages"), list):
        raise TaskError("Invalid task manifest; restore a known revision before changing it.")
    return data


@contextmanager
def locked(root):
    root.mkdir(parents=True, exist_ok=True)
    lock = root / ".task.lock"
    for attempt in range(2):
        try:
            fd = os.open(str(lock), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            break
        except FileExistsError:
            try:
                pid = int(lock.read_text(encoding="ascii"))
                os.kill(pid, 0)
            except ProcessLookupError:
                lock.unlink()
                continue
            except (OSError, ValueError):
                pass
            raise TaskError("Task is locked by another process; do not overwrite its revision.")
    else:
        raise TaskError("Cannot acquire task lock.")
    try:
        with os.fdopen(fd, "w", encoding="ascii") as handle:
            handle.write(str(os.getpid()))
        yield
    finally:
        lock.unlink(missing_ok=True)


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", dir=path.parent,
                prefix=".task-", suffix=".tmp", delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(str(temporary), str(path))
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def evidence_paths(root, values, required=False):
    values = values or []
    if required and not values:
        raise TaskError("An actual observation needs at least one existing evidence file.")
    result = []
    for value in values:
        path = Path(value).expanduser()
        path = (path if path.is_absolute() else root / path).resolve()
        if not within(path, root) or not path.is_file():
            raise TaskError("Evidence must be an existing file inside the private task directory.")
        relative = path.relative_to(root)
        if relative.name in ("task.json", ".task.lock", "workflow.html") or ".history" in relative.parts:
            raise TaskError("Manifest/history/workflow files are records, not interaction evidence.")
        if "?" in str(relative) or "#" in str(relative):
            raise TaskError("Use a neutral evidence filename without URL query/fragment material.")
        name = relative.as_posix()
        if name not in result:
            result.append(name)
    return result


def evidence_stamp(root, paths):
    hashes = {}
    for name in paths:
        digest = hashlib.sha256()
        with (root / name).open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        hashes[name] = digest.hexdigest()
    return hashes


def verify_evidence(root, record):
    if not isinstance(record, dict):
        raise TaskError("Missing or invalid evidence record.")
    paths = evidence_paths(root, record.get("evidence"), required=True)
    if evidence_stamp(root, paths) != record.get("evidenceSha256"):
        raise TaskError("Evidence content changed; preserve a new file and repeat affected observations.")


def invalidate_page(page, reason, blocked=False):
    prior = page.get("status")
    page["presentation"] = None
    page["checks"] = {
        name: {"result": "untested", "actual": False, "evidence": [],
               "note": reason, "invalidatedAt": now()} for name in CHECKS
    }
    if prior not in EXCEPTIONS:
        page["status"] = "blocked" if blocked else "discovered"
        page["blockedReason"] = reason
        page["nextAction"] = "Recheck bindings and record current presentation before rerunning required checks."
    page["invalidatedReason"] = reason


def page_by_id(data, page_id):
    page = next((page for page in data["pages"] if page["id"] == page_id), None)
    if page is None:
        raise TaskError("Unknown page ID; use status to inspect registered page states.")
    return page


def save_change(root, old, data, action):
    # Full old revisions preserve previous mappings, checks and manual-revision references.
    history = root / ".history" / ("r%06d.json" % old["revision"])
    if history.is_symlink():
        raise TaskError("Historical records must not be symlinks.")
    if history.exists():
        try:
            if json.loads(history.read_text(encoding="utf-8")) != old:
                raise TaskError("History revision differs; refusing to overwrite it.")
        except (OSError, ValueError):
            raise TaskError("Invalid historical revision; refusing to overwrite it.")
    else:
        atomic_json(history, old)
    data["revision"] = old["revision"] + 1
    data["updatedAt"] = now()
    data["lastAction"] = action
    atomic_json(root / "task.json", data)


def initial_execution():
    return {"state": "intake", "resumeState": None, "reason": "", "nextAction": "确认本次任务范围并登记实际证据。",
            "attempt": 1, "proofs": {}, "scopeReview": None, "transitions": []}


def valid_execution_shape(execution):
    return (isinstance(execution, dict) and execution.get("state") in TASK_STATES
            and type(execution.get("attempt")) is int and execution["attempt"] >= 1
            and isinstance(execution.get("proofs"), dict)
            and isinstance(execution.get("transitions"), list)
            and (execution["state"] not in EXCEPTIONS or execution.get("resumeState") in PHASES))


def scope_fingerprint(data):
    inventory = {"scope": data["scope"], "pages": sorted(
        [{key: page[key] for key in ("id", "url", "stateKey")} for page in data["pages"]],
        key=lambda page: page["id"])}
    return hashlib.sha256(json.dumps(inventory, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def actual_observation(root, args):
    if not args.actual or not safe_text(args.note):
        raise TaskError("An actual transition needs --actual, --note and existing --evidence.")
    refs = evidence_paths(root, args.evidence, required=True)
    return {"actual": True, "note": safe_text(args.note), "evidence": refs,
            "evidenceSha256": evidence_stamp(root, refs), "recordedAt": now(),
            "basis": "caller-reported actual observation; CLI checks records, not their semantic truth"}


def require_observation(root, record):
    if not isinstance(record, dict) or record.get("actual") is not True or not safe_text(record.get("note")):
        raise TaskError("Missing actual observation or its explanatory note.")
    if root is None:
        raise TaskError("Evidence cannot be validated without the private task directory.")
    verify_evidence(root, record)


def capability_valid(root, data, kind):
    capability = data.get("capabilities", {}).get(kind, {})
    if capability.get("status") != "supported" or not safe_text(capability.get("method")):
        raise TaskError("Supported %s capability and an actual method are required." % kind)
    if root is None:
        raise TaskError("Capability evidence cannot be validated without the task directory.")
    verify_evidence(root, capability)


def page_issues(root, data, page):
    issues = []
    status = page.get("status")
    if status not in STATUSES:
        return ["Invalid recorded page state; restore a valid record."]
    if status not in ("presented", "verified"):
        return issues
    try:
        capability_valid(root, data, "write")
        if not page.get("bindings"):
            raise TaskError("Missing actual runtime bindings.")
        for binding in page["bindings"]:
            require_observation(root, binding)
        require_observation(root, page.get("presentation"))
        if status == "verified":
            for name in CHECKS:
                check = page.get("checks", {}).get(name, {})
                if check.get("result") != "pass":
                    raise TaskError("Required check %s is not pass." % name)
                require_observation(root, check)
    except (TaskError, OSError) as error:
        issues.append(safe_text(str(error)))
    return issues


def scope_issues(root, data, execution):
    review = execution.get("scopeReview")
    try:
        require_observation(root, review)
        if review.get("fingerprint") != scope_fingerprint(data):
            raise TaskError("Confirmed scope/page inventory changed; reopen discovery and confirm the current list.")
    except (TaskError, OSError) as error:
        return ["范围确认: " + safe_text(str(error))]
    return []


def proof_issues(root, execution, phase):
    proofs = execution.get("proofs")
    proof = proofs.get(phase) if isinstance(proofs, dict) else None
    try:
        require_observation(root, proof)
        expected = (PHASES + ("completed",))[PHASES.index(phase) + 1]
        if proof.get("from") != phase or proof.get("to") != expected:
            raise TaskError("Missing or invalid stage transition record.")
    except (TaskError, OSError) as error:
        return ["阶段 %s: %s" % (phase, safe_text(str(error)))]
    return []


def recovery_issues(root, execution):
    """Only the current attempt's resume/retry/reopen observations remain live gates."""
    transitions = execution.get("transitions", [])
    if not isinstance(transitions, list) or any(not isinstance(item, dict) for item in transitions):
        return ["任务恢复历史无效，无法核实当前尝试。"]
    boundary = max([index for index, item in enumerate(transitions)
                    if item.get("mode") in ("retry", "reopen")] or [0])
    issues = []
    for transition in transitions[boundary:]:
        if transition.get("mode") not in ("resume", "retry", "reopen"):
            continue
        try:
            require_observation(root, transition)
        except (TaskError, OSError) as error:
            issues.append("当前尝试 %s 恢复证据: %s" %
                          (transition.get("mode"), safe_text(str(error))))
    return issues


def phase_requirements(root, data, execution, phase, pages):
    """Success gates of a phase; proof files never establish business-rule truth."""
    missing = []
    try:
        missing += QUEUE.phase_issues({**data, "pages": pages}, phase, lambda record: require_observation(root, record))
    except (ValueError, OSError) as error:
        missing.append("页面队列: " + safe_text(str(error)))
    if phase == "intake":
        if not safe_text(data.get("scope", {}).get("description")) or not data.get("scope", {}).get("targets"):
            missing.append("任务需要明确的非空范围和目标地址。")
    if phase == "access":
        try:
            capability_valid(root, data, "read")
        except (TaskError, OSError) as error:
            missing.append("访问能力: " + safe_text(str(error)))
    if phase == "discovery":
        if not pages:
            missing.append("本次范围尚未登记任何页面状态。")
        missing += scope_issues(root, data, execution)
    if phase == "annotation":
        try:
            capability_valid(root, data, "write")
        except (TaskError, OSError) as error:
            missing.append("原页写入能力: " + safe_text(str(error)))
        for page in pages:
            if not page.get("bindings"):
                missing.append(page["id"] + " 缺少实际控件绑定。")
            for binding in page.get("bindings", []):
                try:
                    require_observation(root, binding)
                except (TaskError, OSError) as error:
                    missing.append(page["id"] + " 绑定: " + safe_text(str(error)))
    if phase == "presentation":
        for page in pages:
            if page.get("status") not in ("presented", "verified"):
                missing.append(page["id"] + " 尚未有效呈现。")
    if phase == "acceptance":
        try:
            record = data.get("independentVerification")
            require_observation(root, record)
            bundle = VERIFIER.read_private(root, record["bundle"])
            missing += VERIFIER.verify(root, {**data, "pages": pages}, bundle, EVIDENCE)
        except (TaskError, ValueError, KeyError, OSError) as error:
            missing.append("独立完成验证: " + safe_text(str(error)))
        for page in pages:
            for retired in page.get("retiredBindings", []):
                try:
                    require_observation(root, retired)
                except (TaskError, OSError) as error:
                    missing.append(page["id"] + " 退役绑定证据: " + safe_text(str(error)))
            if page.get("status") != "verified":
                missing.append(page["id"] + " 尚未有效验收（当前 " + str(page.get("status")) + "）。")
            if page.get("gaps"):
                missing.append(page["id"] + " 仍有未解决缺口。")
            for resolution in page.get("gapResolutions", []):
                try:
                    require_observation(root, resolution)
                except (TaskError, OSError) as error:
                    missing.append(page["id"] + " 缺口解决证据: " + safe_text(str(error)))
    return missing


def execution_view(root, data, pages):
    legacy = "execution" not in data
    recorded = data.get("execution", initial_execution())
    malformed = not valid_execution_shape(recorded)
    execution = recorded if isinstance(recorded, dict) else initial_execution()
    state = recorded.get("state") if isinstance(recorded, dict) else None
    resume = execution.get("resumeState")
    if state in EXCEPTIONS and resume not in PHASES:
        malformed = True
    active = resume if state in EXCEPTIONS else state
    position = len(PHASES) if state == "completed" else PHASES.index(active) if active in PHASES else 0
    issues = ["任务状态记录无效；恢复有效历史版本后再继续。"] if malformed else []
    issues += recovery_issues(root, execution)
    stages = {phase: "pending" for phase in PHASES}
    for index, phase in enumerate(PHASES):
        if index < position:
            bad = proof_issues(root, execution, phase) + phase_requirements(root, data, execution, phase, pages)
            stages[phase] = "stale" if bad else "succeeded"
            issues += bad
        elif index == position:
            stages[phase] = state if state in EXCEPTIONS else "active"
    if state == "failed":
        try:
            require_observation(root, execution.get("lastTransition"))
        except (TaskError, OSError) as error:
            issues.append("失败记录证据: " + safe_text(str(error)))
    if state in EXCEPTIONS and not safe_text(execution.get("reason")):
        issues.append("异常状态缺少明确原因。")
    if state in ("blocked", "failed") and not safe_text(execution.get("nextAction")):
        issues.append("异常状态缺少可执行下一步。")
    missing = []
    for phase in PHASES:
        # The acceptance proof is produced by the final transition itself.
        if phase != "acceptance" or state == "completed":
            missing += proof_issues(root, execution, phase)
        missing += phase_requirements(root, data, execution, phase, pages)
    if legacy:
        missing.insert(0, "旧记录尚无任务状态机记录，需从 intake 重新核实。")
    if state not in ("acceptance", "completed"):
        missing.insert(0, "任务尚未进入最终验收阶段。")
    missing = list(dict.fromkeys(issues + missing))
    effective = "blocked" if issues and state not in ("failed", "cancelled") else state
    if malformed:
        effective = "blocked"
    if effective == "blocked" and state == "completed":
        resume = "acceptance"
    elif effective == "blocked" and state not in EXCEPTIONS:
        resume = active if active in PHASES else "intake"
    if malformed:
        allowed = []
    elif state in ("completed", "cancelled"):
        allowed = ["intake", "discovery"]
    elif issues and state in PHASES:
        allowed = [*EXCEPTIONS, "intake", "discovery"]
    elif effective in EXCEPTIONS:
        allowed = [resume] if resume in PHASES else []
        allowed += [x for x in EXCEPTIONS if x != effective]
        allowed += ["intake", "discovery"]
    elif state in PHASES:
        allowed = [(PHASES + ("completed",))[PHASES.index(state) + 1], *EXCEPTIONS, "intake", "discovery"]
    else:
        allowed = []
    return {
        "state": effective, "recordedState": state, "resumeState": resume,
        "reason": "证据或阶段记录失效，当前状态不能视为完成。" if issues else execution.get("reason", ""),
        "nextAction": "恢复有效证据，或以 --reopen 显式重核范围与后续阶段。" if issues else execution.get("nextAction", ""),
        "attempt": execution.get("attempt", 1), "allowedNext": list(dict.fromkeys(allowed)),
        "evidenceIssues": list(dict.fromkeys(issues)), "legacy": legacy, "phaseStates": stages,
    }, {"eligible": not missing, "missingConditions": missing}


def summary(data, root=None):
    # Read-only derivation: stale evidence never rewrites historical state.
    pages = json.loads(json.dumps(data["pages"]))
    for page in pages:
        page["recordedStatus"] = page.get("status")
        page["evidenceIssues"] = page_issues(root, data, page)
        if page["evidenceIssues"]:
            page["status"] = "blocked"
            page["blockedReason"] = "Evidence missing/changed; historical verification is not current."
            page["nextAction"] = "Restore current evidence and explicitly record the affected observations."
    counts = {status: 0 for status in STATUSES}
    for page in pages:
        counts[page["status"]] += 1
    execution, completion = execution_view(root, data, pages)
    complete = execution["recordedState"] == "completed" and execution["state"] == "completed" and completion["eligible"]
    return {
        "taskId": data["taskId"], "revision": data["revision"],
        "scope": data["scope"], "capabilities": data["capabilities"],
        "registeredPageStates": len(data["pages"]), "statusCounts": counts,
        "coverageBasis": "registered page states only; undiscovered/unvisited scope is unknown",
        "wholeSystemComplete": False, "taskComplete": complete,
        "stateContracts": STATE_CONTRACTS, "execution": execution, "completion": completion,
        "workQueue": queue_summary(root, {**data, "pages": pages}, execution["state"]),
        "verificationMeaning": "registered presentation/interaction checks only; not business-rule truth",
        "recordingOnly": True,
        "nextAction": data.get("nextAction", ""),
        "pages": [{
            "id": page["id"], "url": page["url"], "stateKey": page["stateKey"],
            "label": page["label"], "status": page["status"],
            "recordedStatus": page["recordedStatus"], "evidenceIssues": page["evidenceIssues"],
            "bindings": page["bindings"], "gaps": page["gaps"],
            "retiredBindings": page.get("retiredBindings", []),
            "gapResolutions": page.get("gapResolutions", []),
            "checks": {name: check["result"] for name, check in page["checks"].items()},
            "blockedReason": page.get("blockedReason", ""),
            "nextAction": page.get("nextAction", "")
        } for page in pages]
    }


def queue_summary(root, data, active_state=None):
    try:
        return QUEUE.view(data, lambda record: require_observation(root, record), active_state=active_state)
    except (ValueError, OSError) as error:
        return {"enabled": "workQueue" in data, "policy": {}, "counts": {}, "items": [],
                "progress": {"total": 0, "completed": 0, "required": 0, "incompleteRequired": 0},
                "evidenceIssues": [safe_text(str(error))]}


def queue_snapshot(root, data, args):
    paths = evidence_paths(root, [args.snapshot] if args.snapshot else [], required=True)
    path = root / paths[0]
    if path.stat().st_size > 1024 * 1024:
        raise TaskError("Queue snapshots must be bounded private JSON observations (at most 1 MiB).")
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise TaskError("Cannot read the observed page/control snapshot JSON.")
    queue = QUEUE.queue_record(data)
    item = QUEUE.item_for(queue, args.job_id) if queue else None
    if not item or not isinstance(raw, dict):
        raise TaskError("Reconciliation needs an existing work item and an object snapshot.")
    page = page_by_id(data, item["pageId"])
    if (raw.get("pageId"), safe_url(raw.get("url")), raw.get("stateKey")) != (page["id"], page["url"], page["stateKey"]):
        raise TaskError("Snapshot page identity must match the registered page and semantic state.")
    def fingerprint(value):
        if not isinstance(value, str) or not re.fullmatch(r"[a-fA-F0-9]{64}", value):
            raise TaskError("Snapshot fingerprints/content hashes must be SHA-256 hex digests of actual observations.")
        return value.lower()
    controls = raw.get("controls")
    if not isinstance(controls, list) or not controls:
        raise TaskError("Queue snapshots need the complete nonempty registered control inventory.")
    ids = [control.get("id") if isinstance(control, dict) else None for control in controls]
    bindings = QUEUE.binding_map(page)
    if any(not isinstance(value, str) for value in ids) or len(set(ids)) != len(ids) or set(ids) != set(bindings):
        raise TaskError("Snapshot IDs must exactly match existing page bindings; register new targets before reconciling.")
    snapshot = {"pageId": page["id"], "url": page["url"], "stateKey": page["stateKey"],
                "pageFingerprint": fingerprint(raw.get("pageFingerprint")),
                "controls": sorted([{"id": control["id"], "fingerprint": fingerprint(control.get("fingerprint")),
                                     "contentHash": fingerprint(control.get("contentHash"))}
                                    for control in controls], key=lambda control: control["id"])}
    return snapshot, paths


def update_queue(root, data, args):
    options = {"jobId": args.job_id, "pageId": args.page_id, "phase": args.phase,
               "sideEffect": args.side_effect, "idempotencyKey": safe_text(args.idempotency_key, 160),
               "leaseToken": args.lease_token, "bindingId": args.binding_id,
               "checkpointResult": args.checkpoint_result, "outcome": args.outcome,
               "errorCode": args.error_code, "reviewed": args.reviewed, "additionalAttempts": args.additional_attempts}
    if args.action == "configure":
        options["policy"] = {name: value for name, value in (
            ("maxAttempts", args.max_attempts), ("baseDelaySeconds", args.base_delay_seconds),
            ("maxDelaySeconds", args.max_delay_seconds), ("timeoutSeconds", args.timeout_seconds)) if value is not None}
    if args.action == "enqueue" and (not args.page_id or not args.phase):
        raise TaskError("Enqueue needs --page-id and --phase annotation|presentation|acceptance.")
    if args.action in ("checkpoint", "reconcile", "report") and not args.job_id:
        raise TaskError("This queue operation needs --job-id.")
    if args.action == "checkpoint" and (not args.binding_id or not args.checkpoint_result):
        raise TaskError("Checkpoint needs --binding-id and --checkpoint-result done|blocked.")
    if args.action == "report" and not args.outcome:
        raise TaskError("Report needs --outcome succeeded|error.")
    if args.action != "reconcile" and (args.reviewed or args.additional_attempts is not None or args.snapshot):
        raise TaskError("Snapshot/review/additional-attempt options are only for reconciliation.")
    proof, snapshot = None, None
    if args.action in ("checkpoint", "reconcile", "report"):
        proof = actual_observation(root, args)
    if args.action == "reconcile":
        snapshot, paths = queue_snapshot(root, data, args)
        proof["evidence"] = list(dict.fromkeys(proof["evidence"] + paths))
        proof["evidenceSha256"] = evidence_stamp(root, proof["evidence"])
    if args.action == "claim":
        execution = summary(data, root)["execution"]
        if execution["state"] not in QUEUE.PHASES:
            raise TaskError("Claim requires a currently valid active phase; restore evidence or explicitly resume/retry first.")
    if args.action in ("checkpoint", "report") and not (args.action == "report" and args.outcome == "error"):
        item = QUEUE.item_for(QUEUE.queue_record(data), args.job_id)
        issues = page_issues(root, data, page_by_id(data, item["pageId"]))
        if issues:
            raise TaskError("Current page evidence is invalid: " + "; ".join(issues))
    return QUEUE.mutate(data, args.action, options, lambda record: require_observation(root, record),
                        proof=proof, snapshot=snapshot)


def transition_task(root, data, args):
    execution = data.setdefault("execution", initial_execution())
    if not valid_execution_shape(execution):
        raise TaskError("Invalid execution state; restore a valid historical record.")
    state, target = execution["state"], args.to
    flag = "resume" if args.resume else "retry" if args.retry else "reopen" if args.reopen else None
    if args.scope_confirmed and not (state == "discovery" and target == "annotation" and flag is None):
        raise TaskError("--scope-confirmed is only valid for discovery -> annotation.")
    if flag == "reopen":
        data.pop("independentVerification", None)
        if target not in ("intake", "discovery"):
            raise TaskError("Reopening needs --to intake|discovery.")
        proof = actual_observation(root, args)
        retained = {}
        if target == "discovery":
            problems = []
            for phase in ("intake", "access"):
                problems += proof_issues(root, execution, phase)
                problems += phase_requirements(root, data, execution, phase, data["pages"])
            if problems:
                raise TaskError("Cannot reopen discovery without valid prior access: " + "; ".join(problems))
            retained = {phase: execution["proofs"][phase] for phase in ("intake", "access")}
        execution["proofs"] = retained
        execution["scopeReview"] = None
        execution["attempt"] += 1
    elif state in ("completed", "cancelled"):
        raise TaskError("Terminal tasks need explicit --reopen --to intake|discovery.")
    elif target in EXCEPTIONS:
        if flag:
            raise TaskError("Recovery flags cannot enter an exception state.")
        if target not in STATE_CONTRACTS["states"][state]["allowedNext"]:
            raise TaskError("Illegal task exception transition.")
        if not safe_text(args.reason) or (target in ("blocked", "failed") and not safe_text(args.next_action)):
            raise TaskError("Exception transitions need --reason; blocked/failed also need --next-action.")
        proof = actual_observation(root, args) if target == "failed" else {
            "note": safe_text(args.note), "actual": bool(args.actual),
            "evidence": evidence_paths(root, args.evidence), "recordedAt": now()}
        if target != "failed":
            proof["evidenceSha256"] = evidence_stamp(root, proof["evidence"])
        execution["resumeState"] = execution.get("resumeState") if state in EXCEPTIONS else state
    elif state in ("blocked", "failed"):
        required = "resume" if state == "blocked" else "retry"
        if flag != required or target != execution.get("resumeState"):
            raise TaskError("Recovery needs --%s --to the recorded resumeState." % required)
        proof = actual_observation(root, args)
        if state == "failed":
            execution["attempt"] += 1
    else:
        if flag:
            raise TaskError("Recovery flags are only valid for their matching exception/terminal state.")
        expected = (PHASES + ("completed",))[PHASES.index(state) + 1]
        if target != expected:
            raise TaskError("Illegal stage transition; advance one phase at a time to " + expected + ".")
        proof = actual_observation(root, args)
        if state == "discovery":
            if not args.scope_confirmed:
                raise TaskError("Discovery needs --scope-confirmed for the explicit current scope/page inventory.")
            execution["scopeReview"] = {**proof, "fingerprint": scope_fingerprint(data)}
        current = summary(data, root)
        problems = current["execution"]["evidenceIssues"]
        problems += phase_requirements(root, data, execution, state, current["pages"])
        if target == "completed":
            problems += current["completion"]["missingConditions"]
        if problems:
            raise TaskError("Stage success conditions are incomplete: " + "; ".join(dict.fromkeys(problems)))
        execution.setdefault("proofs", {})[state] = {**proof, "from": state, "to": target}
    transition = {**proof, "from": state, "to": target, "mode": flag or "advance",
                  "reason": safe_text(args.reason), "nextAction": safe_text(args.next_action)}
    execution.setdefault("transitions", []).append(transition)
    execution["lastTransition"] = transition
    execution["state"] = target
    execution["reason"] = safe_text(args.reason) if target in EXCEPTIONS else ""
    execution["nextAction"] = safe_text(args.next_action)
    if target not in EXCEPTIONS:
        execution["resumeState"] = None
    data["nextAction"] = safe_text(args.next_action)


def init_task(root, args):
    if (root / "task.json").exists():
        raise TaskError("Task already exists; use status and continue its revision.")
    targets = list(dict.fromkeys(safe_url(value) for value in args.target))
    data = {
        "schemaVersion": SCHEMA, "taskId": "T-" + uuid.uuid4().hex[:12],
        "revision": 1, "name": safe_text(args.name, 160),
        "scope": {"description": safe_text(args.scope), "targets": targets},
        "capabilities": {name: {"status": "unknown", "method": "", "evidence": []}
                         for name in ("read", "write")},
        "pages": [], "nextAction": safe_text(args.next_action),
        "execution": initial_execution(),
        "createdAt": now(), "updatedAt": now(), "lastAction": "init",
        "recordingOnly": True,
        "privacy": "URL userinfo refused; URL query/fragment omitted; evidence bodies not copied"
    }
    atomic_json(root / "task.json", data)
    return summary(data, root)


def update_capability(root, data, args):
    if args.read is None and args.write is None:
        raise TaskError("Specify --read or --write.")
    refs = evidence_paths(root, args.evidence,
                          required="supported" in (args.read, args.write))
    if "supported" in (args.read, args.write) and not safe_text(args.method):
        raise TaskError("A supported capability needs its actual method.")
    for name in ("read", "write"):
        status = getattr(args, name)
        if status is not None:
            prior = data["capabilities"][name]
            method = safe_text(args.method, 240)
            stamps = evidence_stamp(root, refs)
            changed = (prior["status"], prior["method"], prior["evidence"],
                       prior.get("evidenceSha256")) != (status, method, refs, stamps)
            data["capabilities"][name] = {
                "status": status, "method": method, "evidenceSha256": stamps,
                "evidence": refs, "recordedAt": now(),
                "basis": "caller-supplied capability observation; not tested by CLI"
            }
            if name == "write" and changed:
                for page in data["pages"]:
                    invalidate_page(page, "Write capability or its evidence changed.",
                                    blocked=status != "supported")


def update_page(root, data, args):
    page = page_by_id(data, args.page_id) if args.page_id else None
    if not page:
        if not args.url:
            raise TaskError("A new page needs --url and a semantic --state-key.")
        parts = urlsplit(args.url)
        if (parts.query or parts.fragment) and args.state_key == "default":
            raise TaskError("Query/fragment is omitted; supply a semantic --state-key to avoid merging routes.")
        url = safe_url(args.url)
        if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,80}", args.state_key):
            raise TaskError("Use a short semantic state key; never paste query/hash tokens.")
        page = next((item for item in data["pages"]
                     if item["url"] == url and item["stateKey"] == args.state_key), None)
        if not page:
            number = max([int(item["id"][2:]) for item in data["pages"]] or [0]) + 1
            page = {
                "id": "P-%03d" % number, "url": url, "stateKey": args.state_key,
                "label": safe_text(args.label or args.state_key, 180),
                "status": "discovered", "bindings": [], "gaps": [],
                "checks": {name: {"result": "untested", "actual": False,
                                  "evidence": [], "note": ""} for name in CHECKS},
                "presentation": None, "nextAction": "", "createdAt": now()
            }
            data["pages"].append(page)
    elif args.url and safe_url(args.url) != page["url"]:
        raise TaskError("Do not change a registered page identity; register its new state instead.")
    refs = evidence_paths(root, args.evidence)
    requested = args.status
    prior_status = page.get("status")
    if prior_status not in STATUSES:
        raise TaskError("Invalid page state; restore a valid historical record.")
    flag = "resume" if args.resume else "retry" if args.retry else "reopen" if args.reopen else None
    recovering = prior_status in EXCEPTIONS and requested in ("discovered", "presented")
    if recovering:
        required = {"blocked": "resume", "failed": "retry", "cancelled": "reopen"}[prior_status]
        if flag != required:
            raise TaskError("Page recovery requires explicit --%s and a discovered/presented target." % required)
        recovery_proof = actual_observation(root, args)
        invalidate_page(page, "Explicit page recovery requires fresh interaction checks.")
        page["status"] = "discovered"
        page.setdefault("recoveries", []).append({**recovery_proof, "from": prior_status, "to": requested, "mode": flag})
    elif flag:
        raise TaskError("Page recovery flags require their matching exception and discovered/presented target.")
    elif prior_status == "cancelled":
        raise TaskError("Cancelled pages are frozen until explicit --reopen.")
    if requested and requested != prior_status and not recovering:
        if requested not in STATE_CONTRACTS["pages"][prior_status]["allowedNext"]:
            raise TaskError("Illegal page transition from %s to %s." % (prior_status, requested))
    observation = None
    previous = page.get("presentation")
    changed_presentation = False
    if requested == "presented":
        observation = {
            "actual": True, "note": safe_text(args.note), "evidence": refs,
            "evidenceSha256": evidence_stamp(root, refs),
            "version": safe_text(args.presentation_version or "unspecified", 80),
            "recordedAt": now(), "basis": "caller-reported actual original-page observation"
        }
        changed_presentation = bool(previous) and any(
            previous.get(key) != observation.get(key)
            for key in ("evidence", "evidenceSha256", "version"))
        if not previous and any(check.get("recordedAt") for check in page["checks"].values()):
            changed_presentation = True
    unresolved = [name for name, check in page["checks"].items()
                  if check.get("recordedAt") and check["result"] != "pass"]
    if requested and requested not in EXCEPTIONS and unresolved and not (
            requested == "presented" and changed_presentation):
        raise TaskError("Recorded failed/untested checks must be rerun with actual passing evidence first.")
    if requested in ("presented", "verified"):
        write = data["capabilities"]["write"]
        if write["status"] != "supported" or not write["evidence"]:
            raise TaskError("Supported write capability evidence is required before presentation.")
        if not page["bindings"]:
            raise TaskError("Presentation needs a verified real runtime binding, not invented IDs.")
        verify_evidence(root, write)
        for binding in page["bindings"]:
            verify_evidence(root, binding)
    if requested == "presented":
        if not args.actual or not safe_text(args.note) or not refs:
            raise TaskError("Presentation needs --actual, --note and existing --evidence.")
        if changed_presentation:
            invalidate_page(page, "Presentation version or evidence changed.")
        page["presentation"] = observation
    if requested == "verified":
        if not page.get("presentation"):
            raise TaskError("Record actual presentation before interaction verification.")
        incomplete = [name for name in CHECKS if (
            page["checks"][name]["result"] != "pass" or
            not page["checks"][name].get("actual") or
            not page["checks"][name].get("evidence"))]
        if incomplete:
            raise TaskError("Required actual checks are incomplete: " + ", ".join(incomplete))
        verify_evidence(root, page["presentation"])
        for name in CHECKS:
            verify_evidence(root, page["checks"][name])
    if requested in EXCEPTIONS:
        if not safe_text(args.reason) or (requested in ("blocked", "failed") and not safe_text(args.next_action)):
            raise TaskError("A blocked/failed page needs --reason and a nonempty --next-action; cancelled needs --reason.")
        failure_proof = actual_observation(root, args) if requested == "failed" else {
            "note": safe_text(args.note), "actual": bool(args.actual), "evidence": refs,
            "evidenceSha256": evidence_stamp(root, refs), "recordedAt": now()}
        page["exception"] = {**failure_proof, "from": prior_status, "to": requested,
                             "reason": safe_text(args.reason), "nextAction": safe_text(args.next_action)}
    if requested == "discovered" and not recovering:
        invalidate_page(page, "Explicitly returned to discovery; prior acceptance is no longer current.")
    if requested:
        page["status"] = requested
        page["blockedReason"] = safe_text(args.reason) if requested in EXCEPTIONS else ""
    if args.label:
        page["label"] = safe_text(args.label, 180)
    if args.gap:
        page["gaps"] = list(dict.fromkeys(page["gaps"] + [safe_text(gap) for gap in args.gap]))
    if args.resolve_gap:
        proof = actual_observation(root, args)
        for gap in args.resolve_gap:
            if gap not in page["gaps"]:
                raise TaskError("--resolve-gap must exactly match an existing unresolved gap.")
            page["gaps"].remove(gap)
            page.setdefault("gapResolutions", []).append({**proof, "gap": gap})
    if args.next_action is not None:
        page["nextAction"] = safe_text(args.next_action)
    page["updatedAt"] = now()
    return page["id"]


def bind_control(root, data, args):
    page = page_by_id(data, args.page_id)
    if page.get("status") == "cancelled":
        raise TaskError("Cancelled pages are frozen until explicit --reopen.")
    if not re.fullmatch(r"A-\d{3,}", args.display_id):
        raise TaskError("Use the actual runtime display ID, such as A-001.")
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,160}", args.runtime_id):
        raise TaskError("Runtime ID has unsupported characters.")
    if not args.actual or not safe_text(args.note):
        raise TaskError("Binding needs --actual and a note describing unique target verification.")
    refs = evidence_paths(root, args.evidence, required=True)
    existing = next((item for item in page["bindings"]
                     if item["displayId"] == args.display_id), None)
    if not existing and any(item.get("binding", {}).get("displayId") == args.display_id for item in page.get("retiredBindings", [])) and not args.replace:
        raise TaskError("A retired display ID requires explicit --replace and current evidence.")
    if any(item["runtimeId"] == args.runtime_id and item["displayId"] != args.display_id
           for item in page["bindings"]):
        raise TaskError("One runtime target cannot silently receive two display IDs in the same page.")
    if existing and existing["runtimeId"] != args.runtime_id and not args.replace:
        raise TaskError("Stable binding differs; explicit --replace and evidence are required.")
    binding = {
        "displayId": args.display_id, "runtimeId": args.runtime_id,
        "sourceKey": safe_text(args.source_key, 160), "actual": True,
        "evidence": refs, "evidenceSha256": evidence_stamp(root, refs),
        "note": safe_text(args.note), "recordedAt": now()
    }
    changed = not existing or any(existing.get(key) != binding.get(key)
                                  for key in ("runtimeId", "sourceKey", "evidence", "evidenceSha256"))
    if changed:
        invalidate_page(page, "Runtime binding or target evidence changed.")
    if existing:
        page["bindings"].remove(existing)
    page["bindings"].append(binding)


def unbind_control(root, data, args):
    page = page_by_id(data, args.page_id)
    if page.get("status") == "cancelled":
        raise TaskError("Cancelled pages are frozen until explicit --reopen.")
    binding = next((item for item in page["bindings"] if item["displayId"] == args.display_id), None)
    if not binding or not safe_text(args.reason):
        raise TaskError("An existing binding and a reason for retirement are required.")
    proof = actual_observation(root, args)
    page.setdefault("retiredBindings", []).append({**proof, "binding": binding, "reason": safe_text(args.reason)})
    page["bindings"].remove(binding)
    invalidate_page(page, "Binding retired; recheck current page inventory and presentation.")


def record_independent_verification(root, data, args):
    if data.get("execution", {}).get("state") != "acceptance":
        raise TaskError("Independent verification requires the acceptance phase.")
    proof = actual_observation(root, args)
    bundle_ref = evidence_paths(root, [args.bundle], required=True)[0]
    bundle = VERIFIER.read_private(root, bundle_ref)
    if not isinstance(bundle, dict) or not isinstance(bundle.get("pages"), list) or any(not isinstance(entry, dict) or not isinstance(entry.get("before"), str) or not isinstance(entry.get("after"), str) for entry in bundle["pages"]):
        raise TaskError("Invalid verification bundle or snapshot paths.")
    refs = [bundle_ref]
    for entry in bundle.get("pages", []):
        refs.extend(evidence_paths(root, [entry.get("before"), entry.get("after")], required=True))
    problems = VERIFIER.verify(root, data, bundle, EVIDENCE)
    if problems:
        raise TaskError("Independent verification failed: " + "; ".join(problems))
    refs = list(dict.fromkeys(proof["evidence"] + refs))
    data["independentVerification"] = {**proof, "bundle": bundle_ref, "evidence": refs, "evidenceSha256": evidence_stamp(root, refs)}


def record_check(root, data, args):
    page = page_by_id(data, args.page_id)
    if page.get("status") == "cancelled":
        raise TaskError("Cancelled pages are frozen until explicit --reopen.")
    if page.get("status") in ("blocked", "failed") and args.result == "pass":
        raise TaskError("Recover the page explicitly with --resume/--retry before recording passing checks.")
    if page.get("status") == "failed" and args.result == "untested":
        raise TaskError("A failed page requires explicit --retry; untested cannot erase its failure.")
    if not safe_text(args.note):
        raise TaskError("Describe the actual result or why this check remains untested.")
    if args.result in ("pass", "fail") and not args.actual:
        raise TaskError("Pass/fail needs --actual; registration does not execute a UI check.")
    if args.result == "pass":
        if not page.get("presentation") or data["capabilities"]["write"]["status"] != "supported":
            raise TaskError("Passing interaction checks need a current actual presentation first.")
        verify_evidence(root, data["capabilities"]["write"])
        verify_evidence(root, page["presentation"])
        for binding in page["bindings"]:
            verify_evidence(root, binding)
    refs = evidence_paths(root, args.evidence, required=args.result in ("pass", "fail"))
    page["checks"][args.name] = {
        "result": args.result, "actual": args.result != "untested" and args.actual,
        "evidence": refs, "evidenceSha256": evidence_stamp(root, refs),
        "note": safe_text(args.note), "recordedAt": now(),
        "basis": "caller-reported observation; not executed or authenticated by CLI"
    }
    if args.result != "pass":
        page["status"] = "failed" if args.result == "fail" else "blocked"
        page["blockedReason"] = "Required check %s is %s." % (args.name, args.result)
        page["nextAction"] = safe_text(args.next_action) or (
            "Resolve check %s, explicitly %s the page, then rerun all five actual checks." %
            (args.name, "retry" if args.result == "fail" else "resume"))
        page["exception"] = {**page["checks"][args.name], "to": page["status"],
                             "reason": page["blockedReason"], "nextAction": page["nextAction"]}
    if args.next_action is not None:
        if args.result != "pass" and not safe_text(args.next_action):
            raise TaskError("A failed/untested check needs a nonempty next action.")
        page["nextAction"] = safe_text(args.next_action)


def doctor(args):
    home = Path(args.codex_home or os.environ.get(
        "CODEX_HOME", str(Path.home() / ".codex"))).expanduser().resolve()
    agent = home / "agents/strike-her-heart.toml"
    support = home / "skills/strike-her-heart"
    identified = False
    if agent.is_file():
        setting = next((line.strip() for line in agent.read_text(encoding="utf-8").splitlines()
                        if line.strip() and not line.lstrip().startswith("#")), "")
        identified = bool(re.fullmatch(r"name\s*=\s*(['\"])Strike Her Heart\1\s*(?:#.*)?", setting))
    return {
        "configurationFilePresent": agent.is_file(), "agentNameIdentified": identified,
        "supportResourcesPresent": all((support / name).is_file() for name in (
            "SKILL.md", "assets/overlay.js", "assets/workflow.html",
            "references/task-workflow.md", "scripts/task.py", "scripts/task_queue.py", "scripts/evidence_contract.py", "scripts/completion_verifier.py", "scripts/workflow_view.py")),
        "namedAgentDispatch": "not-tested", "modelRequest": "not-tested",
        "originalPageWrite": "not-tested", "interactionVerification": "not-tested",
        "meaning": "Local file readiness only; not proof of named agent execution or website access."
    }


def parser_for_cli():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("init", "status", "workflow", "capability", "page", "bind", "unbind", "check", "transition", "queue", "verify"):
        command = commands.add_parser(name)
        command.add_argument("--task-dir", required=True)
        if name not in ("init", "status", "workflow"):
            command.add_argument("--revision", type=int, required=True)
        if name in ("capability", "page", "bind", "unbind", "check", "transition", "queue", "verify"):
            command.add_argument("--evidence", action="append", default=[])
            command.add_argument("--note", default="")
        if name in ("page", "bind", "unbind", "check", "queue"):
            command.add_argument("--page-id", required=name in ("bind", "unbind", "check"))
        if name in ("page", "bind", "unbind", "check", "transition", "queue", "verify"):
            command.add_argument("--actual", action="store_true")
        if name in ("init", "capability", "page", "check", "transition"):
            command.add_argument("--next-action", default="" if name == "init" else None)
        if name in ("page", "transition"):
            command.add_argument("--reason", default="")
            recovery = command.add_mutually_exclusive_group()
            for flag in ("resume", "retry", "reopen"):
                recovery.add_argument("--" + flag, action="store_true")
        if name == "init":
            command.add_argument("--name", required=True)
            command.add_argument("--scope", required=True)
            command.add_argument("--target", action="append", required=True)
        elif name == "capability":
            command.add_argument("--read", choices=CAPABILITIES)
            command.add_argument("--write", choices=CAPABILITIES)
            command.add_argument("--method", default="")
        elif name == "page":
            command.add_argument("--url")
            command.add_argument("--state-key", default="default")
            command.add_argument("--label")
            command.add_argument("--status", choices=STATUSES)
            command.add_argument("--gap", action="append", default=[])
            command.add_argument("--resolve-gap", action="append", default=[])
            command.add_argument("--presentation-version")
        elif name == "transition":
            command.add_argument("--to", choices=TASK_STATES, required=True)
            command.add_argument("--scope-confirmed", action="store_true")
        elif name == "queue":
            command.add_argument("--action", choices=("configure", "enqueue", "claim", "checkpoint", "reconcile", "report", "reap"), required=True)
            command.add_argument("--job-id")
            command.add_argument("--phase", choices=QUEUE.PHASES)
            command.add_argument("--side-effect", choices=("read_only", "idempotent", "unknown"), default="unknown")
            command.add_argument("--idempotency-key", default="")
            command.add_argument("--lease-token")
            command.add_argument("--binding-id")
            command.add_argument("--checkpoint-result", choices=("done", "blocked"))
            command.add_argument("--snapshot")
            command.add_argument("--reviewed", action="store_true")
            command.add_argument("--additional-attempts", type=int)
            command.add_argument("--outcome", choices=("succeeded", "error"))
            command.add_argument("--error-code", choices=QUEUE.ERROR_CODES)
            command.add_argument("--max-attempts", type=int)
            command.add_argument("--base-delay-seconds", type=float)
            command.add_argument("--max-delay-seconds", type=float)
            command.add_argument("--timeout-seconds", type=float)
        elif name == "bind":
            command.add_argument("--display-id", required=True)
            command.add_argument("--runtime-id", required=True)
            command.add_argument("--source-key", default="")
            command.add_argument("--replace", action="store_true")
        elif name == "unbind":
            command.add_argument("--display-id", required=True)
            command.add_argument("--reason", required=True)
        elif name == "verify":
            command.add_argument("--bundle", required=True)
        elif name == "check":
            command.add_argument("--name", choices=CHECKS, required=True)
            command.add_argument("--result", choices=("pass", "fail", "untested"), required=True)
    readiness = commands.add_parser("doctor")
    readiness.add_argument("--codex-home")
    return parser


def main(argv=None):
    parser = parser_for_cli()
    args = parser.parse_args(argv)
    try:
        if args.command == "doctor":
            result = doctor(args)
        else:
            root = task_root(args.task_dir)
            if args.command in ("status", "workflow"):
                data = read_manifest(root)
                result = summary(data, root)
                if args.command == "workflow":
                    from workflow_view import render_workflow
                    try:
                        result = render_workflow(root, result, name=data.get("name", ""),
                                                 updated_at=data.get("updatedAt", ""))
                    except ValueError as error:
                        raise TaskError(str(error))
            else:
                with locked(root):
                    if args.command == "init":
                        result = init_task(root, args)
                    else:
                        old = read_manifest(root)
                        if args.revision != old["revision"]:
                            raise TaskError("Revision changed; read status before retrying the change.")
                        data = json.loads(json.dumps(old))
                        execution = data.get("execution")
                        if "execution" in data and not valid_execution_shape(execution):
                            raise TaskError("Invalid execution state; restore a valid historical record.")
                        if execution and execution["state"] in ("cancelled", "completed") and args.command != "transition":
                            raise TaskError("Terminal tasks are frozen; use transition --reopen first.")
                        page_id = None
                        queue_result = None
                        if args.command == "capability":
                            update_capability(root, data, args)
                        elif args.command == "page":
                            page_id = update_page(root, data, args)
                        elif args.command == "bind":
                            bind_control(root, data, args)
                        elif args.command == "unbind":
                            unbind_control(root, data, args)
                        elif args.command == "verify":
                            record_independent_verification(root, data, args)
                        elif args.command == "check":
                            record_check(root, data, args)
                        elif args.command == "transition":
                            transition_task(root, data, args)
                        elif args.command == "queue":
                            queue_result = update_queue(root, data, args)
                        if args.command in ("capability", "page", "bind", "unbind", "check"):
                            data.pop("independentVerification", None)
                        if args.command == "capability" and args.next_action is not None:
                            data["nextAction"] = safe_text(args.next_action)
                        save_change(root, old, data, args.command)
                        result = summary(data, root)
                        if page_id:
                            result["pageId"] = page_id
                        if queue_result is not None:
                            result["queueResult"] = queue_result
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (TaskError, QUEUE.QueueError, OSError) as error:
        print(json.dumps({"error": safe_text(str(error)), "changed": False}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
