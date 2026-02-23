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
2. Refresh website docs that describe agent prompt conventions and documentation lookup behavior.
3. Remove any website references that still name Context7 as a default docs integration.

## Files affected

- `AGENTS.md`
- `templates/coding-common.md`
- `bootstrap.sh`
- `README.md`
- `toolkit-structure.json`

## Why

Toolkit prompts and templates were generalized to docs-tool language and no longer refer to Context7 directly.

## Verification

Run these checks after website sync:

- Search published site content for `Context7` and confirm no default-integration claims remain.
- Confirm docs pages describe generic documentation lookup behavior.
- Confirm source manifest URL resolves:
  `https://raw.githubusercontent.com/mdmagnuson-creator/yo-go/main/toolkit-structure.json`
