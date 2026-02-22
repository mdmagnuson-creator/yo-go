#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"

python3 - "$ROOT" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1]).resolve()
builder = (root / "agents" / "builder.md").read_text(encoding="utf-8")
planner = (root / "agents" / "planner.md").read_text(encoding="utf-8")
toolkit = (root / "agents" / "toolkit.md").read_text(encoding="utf-8")

issues = []

# Builder checks
if "\"pending updates\", \"project updates\", \"apply updates\"" not in builder:
    issues.append("agents/builder.md: missing pending/project updates intent row")
if "Handle in Builder" not in builder:
    issues.append("agents/builder.md: pending updates intent is not explicitly handled by Builder")
if "scope: implementation" not in builder or "scope: planning" not in builder or "scope: mixed" not in builder:
    issues.append("agents/builder.md: missing scope routing table for planning/implementation/mixed")
if "Process pending project updates from `project-updates/`" in builder:
    issues.append("agents/builder.md: contains legacy prohibition against project-updates processing")

# Planner checks
if "Process pending updates in Planner scope" not in planner:
    issues.append("agents/planner.md: missing Planner-scoped U-flow guidance")
if "scope: planning" not in planner or "scope: implementation" not in planner or "scope: mixed" not in planner:
    issues.append("agents/planner.md: missing scope routing table for planning/implementation/mixed")

# Toolkit checks
if "Updates for @builder or @planner to apply based on update scope" not in toolkit:
    issues.append("agents/toolkit.md: project-updates ownership line is inconsistent")
if "scope: implementation" not in toolkit:
    issues.append("agents/toolkit.md: project-updates template missing required scope field")
if "`scope` values:" not in toolkit:
    issues.append("agents/toolkit.md: project-updates template missing scope value guidance")

if issues:
    print("FAIL: handoff contract inconsistencies found")
    for issue in issues:
        print(f" - {issue}")
    sys.exit(1)

print("OK: handoff contracts are consistent across builder/planner/toolkit")
PY
