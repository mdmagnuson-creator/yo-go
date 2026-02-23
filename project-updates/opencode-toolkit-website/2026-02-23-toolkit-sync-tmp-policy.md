---
createdBy: toolkit
date: 2026-02-23
priority: normal
type: sync
scope: implementation
---

# Sync Toolkit Documentation

## Changes

Updated temp-file policy and bootstrap behavior to use project-local `.tmp/` consistently.

- Updated `agents/builder.md` and `agents/planner.md` with explicit temp-file rules (`.tmp/` only, never `/tmp/`)
- Expanded planner write allowlist to include project `.tmp/` and `.gitignore` for temp hygiene
- Updated generated conventions in `templates/coding-common.md` and mirrored bootstrap template content
- Updated `bootstrap.sh` internals to use project-local temp scratch space instead of system `mktemp` directories

## Files to Update

- Fetch latest `toolkit-structure.json` from GitHub
- Update website docs that describe Builder/Planner temp-file behavior
- Update bootstrap/setup docs to state `.tmp/` and `.gitignore` expectations

## Source

- Commit: pending local commit
- toolkit-structure.json: https://raw.githubusercontent.com/mdmagnuson-creator/ai-toolkit/main/toolkit-structure.json
