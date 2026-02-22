---
name: multi-session
description: "Multi-session coordination for parallel AI sessions. Provides session locks, heartbeat, and merge queue management. Only active when agents.multiSession: true in project.json."
---

# Multi-Session Coordination Skill

> ⚠️ **Solo Mode Check**
>
> Before using this skill, check `project.json` → `agents.multiSession`.
> - If `false` or missing: **Skip this skill entirely** — no coordination needed.
> - If `true`: Continue with multi-session coordination.

This skill provides helpers for coordinating multiple AI coding sessions working on the same codebase.

## Overview

The multi-session system allows multiple AI sessions to work on different PRDs (Product Requirements Documents) in parallel without conflicts. Each session:

1. Claims a PRD from the registry
2. Works on its own git branch
3. Updates heartbeat to show it's active
4. Merges to main when complete

## File Locations

| File | Purpose |
|------|---------|
| `docs/session-locks.json` | Tracks active sessions and their claimed PRDs |
| `docs/prd-registry.json` | Master registry of all PRDs with conflict analysis |
| `docs/prds/` | Active PRDs ready for implementation |
| `docs/drafts/` | Draft PRDs not yet ready |
| `docs/completed/` | Archived completed PRDs |
| `docs/abandoned/` | Archived abandoned PRDs |

## Session Lifecycle

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   STATUS     │────▶│    CLAIM     │────▶│    WORK      │────▶│   COMPLETE   │
│   CHECK      │     │    PRD       │     │   STORIES    │     │   & MERGE    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                                         │
       │                                         ▼
       │                                  ┌──────────────┐
       │                                  │  HEARTBEAT   │
       │                                  │  (per story) │
       │                                  └──────────────┘
       │
       ▼
┌──────────────┐
│ HANDLE STALE │
│  SESSIONS    │
└──────────────┘
```

## Operations

### Generate Session ID

```bash
# Generate a unique session ID
SESSION_ID="developer-$(openssl rand -hex 3)"
echo $SESSION_ID  # e.g., developer-a1b2c3
```

### Check for Stale Sessions

A session is stale if its heartbeat is older than 10 minutes:

```javascript
const isStale = (lock) => {
  const heartbeat = new Date(lock.heartbeat);
  const now = new Date();
  const minutesAgo = (now - heartbeat) / 1000 / 60;
  return minutesAgo > 10;
};
```

### Claim a PRD

1. Read `docs/session-locks.json`
2. Read `docs/prd-registry.json`
3. Find available PRD (not locked, dependencies met)
4. Add lock entry:
   ```json
   {
     "sessionId": "developer-abc123",
     "prdId": "print-templates",
     "prdFile": "docs/prds/prd-print-templates.json",
     "branch": "feature/print-templates",
     "claimedAt": "2026-02-19T15:00:00Z",
     "heartbeat": "2026-02-19T15:00:00Z",
     "currentStory": null,
     "status": "in_progress"
   }
   ```
5. Update registry: set PRD status to `"in_progress"`
6. Commit and push to main
7. Create/checkout feature branch

### Update Heartbeat

After completing each story:

1. Checkout main: `git checkout main && git pull origin main`
2. Update lock entry:
   ```json
   {
     "heartbeat": "<current ISO8601>",
     "currentStory": "US-XXX"
   }
   ```
3. Update registry: increment `stories.completed`
4. Commit: `chore: heartbeat [sessionId] - completed [storyId]`
5. Push to main
6. Return to feature branch

### Release Lock (PRD Complete)

1. Merge branch to main
2. Archive PRD to `docs/completed/YYYY-MM-DD/`
3. Move PRD from registry `prds` to `completed`
4. Remove lock from `session-locks.json`
5. Delete branch (local and remote)
6. Commit: `chore: archive [prdId], release [sessionId]`

### Abandon PRD

1. Create archive folder: `docs/abandoned/YYYY-MM-DD-[prdId]/`
2. Move PRD file to archive
3. Create `reason.md` with abandonment details
4. Update registry: move to abandoned with status
5. Delete branch (local and remote)
6. Remove lock
7. Commit: `chore: abandon [prdId]`

## Conflict Risk Levels

| Level | Meaning | Behavior |
|-------|---------|----------|
| `none` | No overlapping files | ✅ Safe to run in parallel |
| `low` | Minor overlap (shared types) | ⚠️ Warn, allow with caution |
| `medium` | Some shared components | ⚠️ Warn strongly, suggest waiting |
| `high` | Major overlap (same features) | 🛑 Block unless explicitly overridden |

## Branch Naming

PRD ID → Branch name:

```
prd-print-templates → feature/print-templates
prd-permissions → feature/permissions
```

The `branchName` field in each PRD specifies the exact branch name.

## Error Handling

### Merge Conflict During Rebase

1. Log conflicting files
2. Update lock: `status: "blocked"`, add `blockedReason`
3. Push lock update to main
4. Stop session

### Push Rejection (Race Condition)

1. `git fetch origin`
2. `git rebase origin/main`
3. Retry push (up to 3 times)
4. If still failing: mark blocked

### Quality Check Failure

1. Log failure details
2. Attempt auto-fix
3. If failing after 3 attempts: mark blocked

## Stale Session Resolution

When user encounters stale session:

| Action | Steps |
|--------|-------|
| **Resume** | Update lock with new sessionId → checkout branch → continue |
| **Abandon** | Delete branch → move to abandoned/ → remove lock |
| **Skip** | Leave stale alone → claim different PRD |

## Example: Full Claim Workflow

```bash
# 1. Generate session ID
SESSION_ID="developer-$(openssl rand -hex 3)"

# 2. Read registry and find available PRD
# (done in code by reading docs/prd-registry.json)

# 3. Add lock entry
# (edit docs/session-locks.json)

# 4. Commit claim
git add docs/session-locks.json docs/prd-registry.json
git commit -m "chore: claim print-templates for $SESSION_ID"
git push origin main

# 5. Create feature branch
git checkout -b feature/print-templates main

# 6. Rebase from main
git fetch origin main
git rebase origin/main

# 7. Start working on stories...
```

## Example: Heartbeat Update

```bash
# Save current work
git stash

# Switch to main
git checkout main
git pull origin main

# Update heartbeat (edit session-locks.json and prd-registry.json)
# ...

# Commit and push
git add docs/session-locks.json docs/prd-registry.json
git commit -m "chore: heartbeat developer-abc123 - completed US-003"
git push origin main

# Return to work
git checkout feature/print-templates
git stash pop
```

## Invoking Status Dashboard

To see current session status, invoke the session-status agent:

```
@session-status
```

This displays:
- Active sessions and their current work
- Stale sessions requiring attention
- Available PRDs with conflict analysis
- Completed PRDs
