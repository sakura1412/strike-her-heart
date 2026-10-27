#!/usr/bin/env python3
"""Install the Strike Her Heart Codex agent and its separate support skill."""

import argparse
import os
from pathlib import Path
import re
import shutil
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    codex_home = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))
    parser.add_argument("--destination", type=Path,
                        default=codex_home / "skills" / "strike-her-heart")
    parser.add_argument("--agent-destination", type=Path,
                        default=codex_home / "agents" / "strike-her-heart.toml")
    parser.add_argument("--backup-directory", type=Path, default=codex_home / "backups")
    parser.add_argument("--update", action="store_true",
                        help="Back up existing Strike Her Heart files before updating")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    source = root / "skills" / "strike-her-heart"
    agent_source = root / "agents" / "strike-her-heart.toml"
    destination = args.destination.expanduser().absolute()
    agent_destination = args.agent_destination.expanduser().absolute()
    backup_directory = args.backup_directory.expanduser().absolute()
    for target in (destination, agent_destination, backup_directory):
        if target.is_symlink() or any(parent.is_symlink() for parent in target.parents):
            parser.error(f"Refusing a symlink destination or parent: {target}")
        resolved = target.resolve()
        if resolved == root or root in resolved.parents or resolved in root.parents:
            parser.error("Installation and backups must be outside the source repository")
    if destination in agent_destination.parents or agent_destination in destination.parents or destination == agent_destination:
        parser.error("Agent and support skill destinations must be separate")
    if any(target == backup_directory or target in backup_directory.parents or backup_directory in target.parents
           for target in (destination, agent_destination)):
        parser.error("Backups must be separate from installation destinations")
    for target in (destination, agent_destination):
        if target.exists() and not args.update:
            parser.error(f"Destination already exists; use --update to preserve a backup first: {target}")
    if destination.exists() and not destination.is_dir():
        parser.error("Support skill destination must be a directory")
    if agent_destination.exists() and not agent_destination.is_file():
        parser.error("Agent destination must be a file")
    if destination.exists():
        existing_skill = destination / "SKILL.md"
        text = existing_skill.read_text() if existing_skill.is_file() else ""
        frontmatter = re.match(r"\A---\s*\n(.*?)\n---(?:\s*\n|$)", text, re.S)
        if not frontmatter or not re.search(r"(?m)^name:\s*['\"]?strike-her-heart['\"]?\s*$", frontmatter.group(1)):
            parser.error("Existing support directory is not identified as strike-her-heart; refusing to replace it")
    if agent_destination.exists():
        first_setting = next((line.strip() for line in agent_destination.read_text().splitlines()
                              if line.strip() and not line.lstrip().startswith("#")), "")
        if not re.fullmatch(r"name\s*=\s*(['\"])Strike Her Heart\1\s*(?:#.*)?", first_setting):
            parser.error("Existing agent must begin with name = 'Strike Her Heart'; refusing to replace an unidentified agent")
    required = ("SKILL.md", "agents/openai.yaml", "assets/overlay.js", "assets/demo.html",
                "assets/demo-annotations.js", "references/runtime.md", "references/annotation-evidence.md",
                "references/task-workflow.md", "scripts/task.py")
    if not agent_source.is_file():
        parser.error(f"Missing agent definition: {agent_source}")
    for relative in required:
        if not (source / relative).is_file():
            parser.error(f"Missing support resource: {relative}")
    if any(path.is_symlink() for path in source.rglob("*")):
        parser.error("Support resources must not contain symlinks")
    ignore = shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store")
    if args.update and (destination.exists() or agent_destination.exists()):
        backup = backup_directory / ("strike-her-heart-" + uuid.uuid4().hex[:12])
        backup.mkdir(parents=True, exist_ok=False)
        if destination.exists():
            shutil.copytree(destination, backup / "support-skill", ignore=ignore, symlinks=True)
        if agent_destination.exists():
            shutil.copy2(agent_destination, backup / "strike-her-heart.toml")
        print(f"Preserved backup: {backup}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        # The identified old directory has already been backed up. Replace it so
        # obsolete agent copies or scripts from earlier releases cannot linger.
        shutil.rmtree(destination)
    shutil.copytree(source, destination, ignore=ignore)
    agent_destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(agent_source, agent_destination)
    print(f"Installed Codex custom agent: {agent_destination}")
    print(f"Installed separate implementation support skill: {destination}")
    print('Ask Codex: 请调用名为 Strike Her Heart 的自定义 agent，完成本次页面标注。')
    print("$strike-her-heart selects the support skill, not the standalone agent.")
    print("Start a new Codex session to load the agent definition.")


if __name__ == "__main__":
    main()
