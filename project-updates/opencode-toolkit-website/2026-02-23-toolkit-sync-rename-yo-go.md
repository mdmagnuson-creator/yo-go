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
2. Update website branding from "AI Toolkit"/"ai-toolkit" to "Yo Go"/"yo-go".
3. Update repository links to the new GitHub slug (`mdmagnuson-creator/yo-go`).
4. Update docs snippets that referenced `~/code/ai-toolkit` paths.

## Files affected

- `README.md`
- `install.sh`
- `bootstrap.sh`
- `agents/builder.md`
- `agents/planner.md`
- `agents/session-status.md`
- `toolkit-structure.json`

## Why

Toolkit branding and repository slug were renamed to `yo-go`, and path guidance was normalized to canonical toolkit locations.

## Verification

Run these checks after website sync:

- Confirm published branding uses `Yo Go` / `yo-go` consistently.
- Confirm repository links resolve to `https://github.com/mdmagnuson-creator/yo-go`.
- Confirm docs no longer reference `~/code/ai-toolkit` paths.
- Confirm source manifest URL resolves:
  `https://raw.githubusercontent.com/mdmagnuson-creator/yo-go/main/toolkit-structure.json`
