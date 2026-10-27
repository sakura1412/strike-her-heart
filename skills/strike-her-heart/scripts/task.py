#!/usr/bin/env python3
"""Record and resume a private Strike Her Heart task; this CLI performs no UI checks."""

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import urlsplit, urlunsplit
import uuid

SCHEMA = 1
CHECKS = ("coverage", "multi_open", "edit_save_refresh", "navigation", "manual_preserved")
STATUSES = ("discovered", "presented", "verified", "blocked")
CAPABILITIES = ("unknown", "supported", "unavailable")
URL_PATTERN = re.compile(r"https?://[^\s<>\"']+", re.I)
SCRIPT = Path(__file__).resolve()


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
        if relative.name in ("task.json", ".task.lock") or ".history" in relative.parts:
            raise TaskError("Manifest/history files are records, not interaction evidence.")
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
    paths = evidence_paths(root, record.get("evidence"), required=True)
    if evidence_stamp(root, paths) != record.get("evidenceSha256"):
        raise TaskError("Evidence content changed; preserve a new file and repeat affected observations.")


def invalidate_page(page, reason, blocked=False):
    page["presentation"] = None
    page["checks"] = {
        name: {"result": "untested", "actual": False, "evidence": [],
               "note": reason, "invalidatedAt": now()} for name in CHECKS
    }
    page["status"] = "blocked" if blocked else "discovered"
    page["blockedReason"] = reason
    page["nextAction"] = "Recheck bindings and record current presentation before rerunning required checks."


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


def summary(data, root=None):
    # Derived validity never hides the historical status stored in task.json.
    pages = json.loads(json.dumps(data["pages"]))
    for page in pages:
        page["recordedStatus"] = page["status"]
        issues = []
        records = []
        if page["status"] in ("presented", "verified"):
            records += [data["capabilities"]["write"], page.get("presentation")]
            records += page["bindings"]
        if page["status"] == "verified":
            records += list(page["checks"].values())
        if root:
            for record in records:
                if not record:
                    issues.append("Missing presentation evidence.")
                    continue
                try:
                    verify_evidence(root, record)
                except (TaskError, OSError) as error:
                    issues.append(safe_text(str(error)))
        page["evidenceIssues"] = list(dict.fromkeys(issues))
        if issues:
            page["status"] = "blocked"
            page["blockedReason"] = "Evidence missing/changed; historical verification is not current."
    counts = {status: 0 for status in STATUSES}
    for page in pages:
        counts[page["status"]] += 1
    return {
        "taskId": data["taskId"], "revision": data["revision"],
        "scope": data["scope"], "capabilities": data["capabilities"],
        "registeredPageStates": len(data["pages"]), "statusCounts": counts,
        "coverageBasis": "registered page states only; undiscovered/unvisited scope is unknown",
        "wholeSystemComplete": False,
        "verificationMeaning": "registered presentation/interaction checks only; not business-rule truth",
        "recordingOnly": True,
        "nextAction": data.get("nextAction", ""),
        "pages": [{
            "id": page["id"], "url": page["url"], "stateKey": page["stateKey"],
            "label": page["label"], "status": page["status"],
            "recordedStatus": page["recordedStatus"], "evidenceIssues": page["evidenceIssues"],
            "bindings": page["bindings"], "gaps": page["gaps"],
            "checks": {name: check["result"] for name, check in page["checks"].items()},
            "blockedReason": page.get("blockedReason", ""),
            "nextAction": page.get("nextAction", "")
        } for page in pages]
    }


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
    if "supported" in (args.read, args.write) and not args.method:
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
    if requested and requested != "blocked" and unresolved and not (
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
        if not args.actual or not args.note or not refs:
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
    if requested == "blocked" and not args.reason:
        raise TaskError("A blocked page needs --reason and a useful next action.")
    if requested:
        page["status"] = requested
        page["blockedReason"] = safe_text(args.reason) if requested == "blocked" else ""
    if args.label:
        page["label"] = safe_text(args.label, 180)
    if args.gap:
        page["gaps"] = list(dict.fromkeys(page["gaps"] + [safe_text(gap) for gap in args.gap]))
    if args.next_action is not None:
        page["nextAction"] = safe_text(args.next_action)
    page["updatedAt"] = now()
    return page["id"]


def bind_control(root, data, args):
    page = page_by_id(data, args.page_id)
    if not re.fullmatch(r"A-\d{3,}", args.display_id):
        raise TaskError("Use the actual runtime display ID, such as A-001.")
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,160}", args.runtime_id):
        raise TaskError("Runtime ID has unsupported characters.")
    if not args.actual or not args.note:
        raise TaskError("Binding needs --actual and a note describing unique target verification.")
    refs = evidence_paths(root, args.evidence, required=True)
    existing = next((item for item in page["bindings"]
                     if item["displayId"] == args.display_id), None)
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


def record_check(root, data, args):
    page = page_by_id(data, args.page_id)
    if not args.note:
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
        page["status"] = "blocked"
        page["blockedReason"] = "Required check %s is %s." % (args.name, args.result)
    if args.next_action is not None:
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
            "SKILL.md", "assets/overlay.js", "references/task-workflow.md", "scripts/task.py")),
        "namedAgentDispatch": "not-tested", "modelRequest": "not-tested",
        "originalPageWrite": "not-tested", "interactionVerification": "not-tested",
        "meaning": "Local file readiness only; not proof of named agent execution or website access."
    }


def parser_for_cli():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("init", "status", "capability", "page", "bind", "check"):
        command = commands.add_parser(name)
        command.add_argument("--task-dir", required=True)
        if name not in ("init", "status"):
            command.add_argument("--revision", type=int, required=True)
        if name in ("capability", "page", "bind", "check"):
            command.add_argument("--evidence", action="append", default=[])
            command.add_argument("--note", default="")
        if name in ("page", "bind", "check"):
            command.add_argument("--page-id", required=name != "page")
            command.add_argument("--actual", action="store_true")
        if name in ("init", "capability", "page", "check"):
            command.add_argument("--next-action", default="" if name == "init" else None)
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
            command.add_argument("--reason", default="")
            command.add_argument("--gap", action="append", default=[])
            command.add_argument("--presentation-version")
        elif name == "bind":
            command.add_argument("--display-id", required=True)
            command.add_argument("--runtime-id", required=True)
            command.add_argument("--source-key", default="")
            command.add_argument("--replace", action="store_true")
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
            if args.command == "status":
                result = summary(read_manifest(root), root)
            else:
                with locked(root):
                    if args.command == "init":
                        result = init_task(root, args)
                    else:
                        old = read_manifest(root)
                        if args.revision != old["revision"]:
                            raise TaskError("Revision changed; read status before retrying the change.")
                        data = json.loads(json.dumps(old))
                        page_id = None
                        if args.command == "capability":
                            update_capability(root, data, args)
                        elif args.command == "page":
                            page_id = update_page(root, data, args)
                        elif args.command == "bind":
                            bind_control(root, data, args)
                        elif args.command == "check":
                            record_check(root, data, args)
                        if args.command == "capability" and args.next_action is not None:
                            data["nextAction"] = safe_text(args.next_action)
                        save_change(root, old, data, args.command)
                        result = summary(data, root)
                        if page_id:
                            result["pageId"] = page_id
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (TaskError, OSError) as error:
        print(json.dumps({"error": safe_text(str(error)), "changed": False}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
