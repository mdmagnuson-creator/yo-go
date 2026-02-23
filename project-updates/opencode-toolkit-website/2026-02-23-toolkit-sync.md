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
2. Refresh website configuration/docs pages that reference `opencode.json` defaults.
3. Remove website references that imply Context7 MCP is configured by default.

## Files affected

- `opencode.json`
- `README.md`
- `toolkit-structure.json`

## Why

Toolkit defaults removed MCP and Context7 configuration and docs examples, so website content must match current behavior.

## Verification

Run these checks after website sync:

- Confirm rendered docs do not mention default `mcp.context7` configuration.
- Confirm config snippets match current `opencode.json`.
- Confirm source manifest URL resolves:
  `https://raw.githubusercontent.com/mdmagnuson-creator/yo-go/main/toolkit-structure.json`
