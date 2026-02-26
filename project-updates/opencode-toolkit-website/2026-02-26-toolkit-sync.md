---
createdBy: toolkit
date: 2026-02-26
priority: normal
type: sync
scope: implementation
---

# Sync Toolkit Documentation

## Changes

- Updated primary agents (builder, planner, toolkit) with rate-limit handling and resumability rules
- Added `currentTask.rateLimitDetectedAt` to builder-state schema
- Updated builder-state skill with per-tool-call persistence and rate-limit context

## Files to Update

- Fetch latest `toolkit-structure.json` from GitHub
- Update agent list page if agents changed
- Update skills page if skills changed
- Regenerate any auto-generated documentation

## Source

- Commit: 9cf499d
- toolkit-structure.json: https://raw.githubusercontent.com/mdmagnuson-creator/yo-go/main/toolkit-structure.json
