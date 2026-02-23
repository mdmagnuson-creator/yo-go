---
createdBy: toolkit
date: 2026-02-23
priority: normal
type: sync
scope: implementation
---

# Sync Toolkit Documentation

## Changes

Removed MCP and Context7 configuration from toolkit defaults.

- Updated config: `opencode.json` no longer includes `mcp.playwright` or `mcp.context7`
- Updated docs: `README.md` no longer includes the Optional MCP Integrations section

## Files to Update

- Fetch latest `toolkit-structure.json` from GitHub
- Refresh configuration/docs pages that reference `opencode.json` defaults
- Remove website references that imply Context7 MCP is configured by default

## Source

- Commit: pending local commit
- toolkit-structure.json: https://raw.githubusercontent.com/mdmagnuson-creator/ai-toolkit/main/toolkit-structure.json
