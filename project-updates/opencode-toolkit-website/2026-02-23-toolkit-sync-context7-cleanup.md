---
createdBy: toolkit
date: 2026-02-23
priority: normal
type: sync
scope: implementation
---

# Sync Toolkit Documentation

## Changes

Repository-wide cleanup removed Context7-specific wording from agent prompts, templates, and bootstrap guidance.

- Updated agents and agent templates to reference generic documentation lookup tools instead of Context7
- Updated `AGENTS.md`, `templates/coding-common.md`, and `bootstrap.sh` to remove Context7 naming
- Updated `README.md` `opencode.json` description to match current defaults

## Files to Update

- Fetch latest `toolkit-structure.json` from GitHub
- Refresh docs pages that describe agent prompt conventions and documentation lookup behavior
- Remove any website references that still name Context7 as the default docs integration

## Source

- Commit: pending local commit
- toolkit-structure.json: https://raw.githubusercontent.com/mdmagnuson-creator/ai-toolkit/main/toolkit-structure.json
