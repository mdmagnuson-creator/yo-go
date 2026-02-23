---
createdBy: toolkit
date: 2026-02-23
priority: normal
type: sync
scope: implementation
---

# Sync Toolkit Documentation

## What to do

1. Fetch latest `toolkit-structure.json` from GitHub.
2. Update website docs that describe Builder/Planner temp-file behavior.
3. Update bootstrap/setup docs to state `.tmp/` and `.gitignore` expectations.

## Files affected

- `agents/builder.md`
- `agents/planner.md`
- `templates/coding-common.md`
- `bootstrap.sh`
- `toolkit-structure.json`

## Why

Toolkit now enforces project-local `.tmp/` usage and avoids system temp paths for both prompts and bootstrap internals.

## Verification

Run these checks after website sync:

- Confirm docs state `.tmp/` (project-local) and no `/tmp` guidance is present.
- Confirm bootstrap documentation mentions `.gitignore` should include `.tmp/`.
- Confirm source manifest URL resolves:
  `https://raw.githubusercontent.com/mdmagnuson-creator/yo-go/main/toolkit-structure.json`
