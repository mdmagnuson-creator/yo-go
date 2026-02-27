---
createdBy: toolkit
date: 2026-02-26
priority: normal
type: sync
scope: implementation
---

# Sync Toolkit Documentation

## What to do

1. Fetch latest `toolkit-structure.json` from GitHub
2. Update agent list page if agents changed
3. Update skills page if skills changed
4. Regenerate any auto-generated documentation

## Files affected

- Toolkit website docs pages (agent list, skills list)
- Any generated docs that mirror `toolkit-structure.json`

## Why

Toolkit behavior updates:

- Updated primary agents (builder, planner, toolkit) with rate-limit handling and resumability rules
- Added `currentTask.rateLimitDetectedAt` to builder-state schema
- Updated builder-state skill with per-tool-call persistence and rate-limit context
- Allowed primary agents to update `projects.json` for user-requested devPort changes

## Verification

- Confirm website renders updated agent count and descriptions
- Confirm skills page reflects updated builder-state guidance

## Source

- Commit: 8eab08d
- toolkit-structure.json: https://raw.githubusercontent.com/mdmagnuson-creator/yo-go/main/toolkit-structure.json
