---
createdBy: toolkit
date: 2026-02-23
priority: normal
type: sync
scope: implementation
---

# Sync Toolkit Documentation

## What to do

1. Fetch latest `toolkit-structure.json` from GitHub
2. Update skills list page to add the new skill:
   - Category: utilities
   - Skill name: start-dev-server
   - Description: Starts dev server using project.json config and waits for readiness
3. Regenerate any auto-generated documentation

## Files affected

- `toolkit-structure.json` (source of truth)
- Skills index page (website)
- Auto-generated skill documentation

## Why

Added a new toolkit skill `start-dev-server` that automatically starts development servers for projects. This saves Builder tokens by handling server startup without requiring Builder to figure out the process each time.

## Changes

- Added skill: `start-dev-server` — Automatically starts development server using project.json config (commands.dev, devServer.healthCheck, devServer.env) and projects.json (devPort). Saves Builder tokens by handling server startup process.

## Source

- Commit: (pending)
- toolkit-structure.json: https://raw.githubusercontent.com/mdmagnuson-creator/yo-go/main/toolkit-structure.json

## Verification

Run: `jq '.skills.categories.utilities.skills[] | select(.name == "start-dev-server")' toolkit-structure.json` — should return the skill entry
