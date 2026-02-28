---
name: builder-state
description: "Manage builder session state for resumability. Use when reading/writing builder-state.json, updating heartbeat, or resuming sessions. Triggers on: session state, builder state, heartbeat, resume session."
---

# Builder State Management

> Load this skill when: managing builder session state, resuming sessions, updating heartbeat, writing `builder-state.json`.

## Overview

Builder maintains `docs/builder-state.json` to enable session resumability. This skill defines when and how to read/write state.

`builder-state.json` is also the persistence layer for OpenCode right-panel todos. The panel is the live UI, and `uiTodos` is the durable copy used for resume/recovery.

**Schema:** See `schemas/builder-state.schema.json` for the full schema definition.

## Commit Ordering (CRITICAL)

> ⛔ **ALWAYS update state files BEFORE committing.**
>
> State updates that happen after `git commit` will be left uncommitted. If the session ends (crash, rate limit, context compaction), the state will be out of sync with the committed code.
>
> **Failure behavior:** If you find yourself about to run `git commit` without first updating `docs/prd.json` (`passes: true`), `docs/builder-state.json`, and `docs/prd-registry.json` — STOP and update those files before committing.
>
> **Correct order:**
> 1. Update `docs/prd.json` (set `passes: true`)
> 2. Update `docs/builder-state.json` (move story to completed)
> 3. Update `docs/prd-registry.json` (update progress)
> 4. Run `git add -A && git commit`
>
> **Wrong order:** Commit first, then update state files → state drift

## When to Write State

Write state atomically (read → modify → write) at these key moments:

| Event | State Changes |
|-------|---------------|
| **Session start** | Set `sessionId`, `lastHeartbeat` |
| **Claim PRD** | Set `activePrd` with PRD details (including `testingRigor`), clear old ad-hoc if any |
| **Start story** | Update `activePrd.currentStory` |
| **Resolve story intensity** | Write `activePrd.storyAssessments[storyId]` (`planned`, `effective`, `escalatedBy`) |
| **Complete story** | Move story from `storiesPending` to `storiesCompleted`, clear `currentStory` |
| **Add ad-hoc task** | Append to `adhocQueue` with `status: "pending"` |
| **Start ad-hoc task** | Update task `status: "in_progress"` |
| **Complete ad-hoc task** | Update task `status: "completed"`, `completedAt`, `filesChanged` |
| **After every tool call** | Update `currentTask.lastAction`, `contextAnchor`, and `lastHeartbeat` |
| **Create right-panel todo** | Add item to `uiTodos.items[]`, sync via `todowrite` |
| **Move todo status** | Update both panel and `uiTodos.items[]` (single source persisted) |
| **Restore session** | Rehydrate panel from `uiTodos.items[]` before continuing |
| **Generate tests** | Update `pendingTests.unit.generated` or `pendingTests.e2e.generated` |
| **Run tests** | Update `pendingTests.*.status`, `lastRunAt`, `failureCount` |
| **Defer E2E tests** | Set `pendingTests.e2e.deferredTo: "prd-completion"` |
| **Detect doc updates** | Update `pendingUpdates.supportArticles`, `marketingScreenshots` |
| **Commit work** | Update `uncommittedWork` to reflect remaining uncommitted changes |
| **Any action** | Always update `lastHeartbeat` |

### Checkpoint Triggers

Update the `checkpoint` field at these moments (see "Checkpoint Operations" section for details):

| Event | Checkpoint Action |
|-------|-------------------|
| **Step completion** | Add step to `completedSteps`, update `pendingSteps`, clear `currentStep` |
| **Start new step** | Set `currentStep` with description and `startedAt` |
| **Decision made** | Add to `decisions` array with rationale |
| **Rate limit detected** | Full checkpoint with `reason: "rate_limit"`, capture `currentStep.partialWork` |
| **Task failure** | Full checkpoint with `reason: "failure"`, add error to `blockers` |
| **Context 75%** | Full checkpoint with `reason: "context_limit"` (warning) |
| **Context 90%** | Full checkpoint with `reason: "context_limit"` (stop work) |
| **Reassignment** | Full checkpoint with `reason: "reassignment"`, add agent to `previousAgents` |

## Writing State

```bash
# Read current state (may not exist)
cat docs/builder-state.json 2>/dev/null || echo '{}'

# [Modify in memory]

# Write atomically
cat > docs/builder-state.json << 'EOF'
{
  "lastHeartbeat": "2026-02-20T15:30:00Z",
  "sessionId": "builder-abc123",
  ...
}
EOF
```

## Clearing State

Clear state (delete file) when:
- User chooses "Abandon and start fresh" 
- PRD is shipped and PR is merged
- User explicitly requests a clean slate

```bash
rm docs/builder-state.json 2>/dev/null
```

## Solo vs Multi-Session Mode

Check `project.json → agents.multiSession`:

- **`false` (default)**: Solo mode. Skip session locks, heartbeat coordination, and merge queue. State file still used for resumability.
- **`true`**: Multi-session mode. Full coordination with session locks, heartbeat monitoring, and merge queue.

## Todo Semantics by Flow

Persist every right-panel todo in `uiTodos.items` with `flow` and `refId` so another session can resume exactly.

- `flow: "prd"` — `refId` is story id (`US-001`, etc.)
- `flow: "adhoc"` — `refId` is ad-hoc id (`adhoc-001`, etc.)
- `flow: "updates"` — `refId` is update file name
- `flow: "e2e"` — `refId` is e2e test path

Rule: keep only one `in_progress` item globally.

## Branchless Trunk State Semantics

When `agents.gitWorkflow: "trunk"` and `agents.trunkMode` resolves to `branchless`:

- Treat default branch as the execution branch for all work (`git.defaultBranch`, fallback `main`)
- Do not persist assumptions that work is on a feature branch
- If state includes branch metadata, store default branch explicitly
- On resume, if current branch differs from default branch, prompt to switch before continuing any flow

Suggested state fields when tracking git context:

```json
{
  "gitContext": {
    "workflow": "trunk",
    "trunkMode": "branchless",
    "defaultBranch": "main",
    "executionBranch": "main"
  }
}
```

## State Structure

```json
{
  "sessionId": "builder-abc123",
  "lastHeartbeat": "2026-02-20T15:30:00Z",
  "currentTask": {
    "description": "Implementing compaction resilience",
    "startedAt": "2026-02-20T14:58:00Z",
    "lastAction": "Updated builder-state schema",
    "contextAnchor": "schemas/builder-state.schema.json",
    "rateLimitDetectedAt": null
  },
  "activePrd": {
    "prdId": "prd-error-logging",
    "testingRigor": "standard",
    "currentStory": "US-003",
    "storiesPending": ["US-004", "US-005"],
    "storiesCompleted": ["US-001", "US-002"],
    "storyAssessments": {
      "US-003": {
        "planned": "medium",
        "effective": "high",
        "escalatedBy": ["cross-cutting-auth-change"],
        "updatedAt": "2026-02-20T15:12:00Z"
      }
    }
  },
  "adhocQueue": [
    {
      "id": "adhoc-001",
      "description": "Fix footer alignment",
      "status": "completed",
      "createdAt": "2026-02-20T14:00:00Z",
      "completedAt": "2026-02-20T14:15:00Z",
      "filesChanged": ["Footer.tsx", "Footer.css"]
    }
  ],
  "pendingTests": {
    "unit": {
      "generated": ["src/__tests__/Footer.test.tsx"],
      "status": "passed",
      "lastRunAt": "2026-02-20T14:16:00Z",
      "failureCount": 0
    },
    "e2e": {
      "generated": ["e2e/footer.spec.ts"],
      "status": "pending",
      "deferredTo": "prd-completion"
    }
  },
  "pendingUpdates": {
    "supportArticles": ["settings-page-updated"],
    "marketingScreenshots": ["homepage-hero"]
  },
  "uiTodos": {
    "flow": "adhoc",
    "lastSyncedAt": "2026-02-20T15:45:00Z",
    "items": [
      {
        "content": "Fix footer alignment",
        "status": "in_progress",
        "priority": "medium",
        "flow": "adhoc",
        "refId": "adhoc-001"
      },
      {
        "content": "Apply migration update 2026-02-21-rename-capabilities.md",
        "status": "pending",
        "priority": "high",
        "flow": "updates",
        "refId": "2026-02-21-rename-capabilities.md"
      }
    ]
  },
  "uncommittedWork": {
    "files": ["Footer.tsx", "Footer.css"],
    "todos": ["adhoc-001"]
  }
}
```

## Heartbeat Management

**Timeout configuration** from `project.json → agents.heartbeatTimeoutMinutes`:
- Default: 10 minutes
- Configurable per project

**Heartbeat update frequency:**
- Update `lastHeartbeat` on every significant action
- At minimum, every 2-3 minutes during active work

**Detecting stale sessions:**
```javascript
const stale = (Date.now() - new Date(state.lastHeartbeat)) > (timeoutMinutes * 60 * 1000);
```

## Resuming Sessions

On startup, check for existing state:

```bash
cat docs/builder-state.json 2>/dev/null
```

If using a file-read tool that throws on missing paths, first list `docs/` and only read `docs/builder-state.json` when present. Missing state is expected for first-time sessions and should be treated as `{}` without logging an error.

**If state exists and is not stale:**
- Restore right-panel todos from `uiTodos.items` using `todowrite`
- Present a chooser (do not auto-resume) with:
  - Resume current in-progress PRD
  - Select a different ready PRD
  - Restart the in-progress PRD from story 1
  - Handle pending project updates
  - Switch to ad-hoc mode
- Continue only after explicit user selection

**If state is stale** (heartbeat older than timeout):
- Warn: "Found stale session (last active: [time ago])"
- Offer the same chooser, but label resume/restart as recovery options

## Examples

### Starting a New Session

```json
{
  "sessionId": "builder-2026-02-20-abc123",
  "lastHeartbeat": "2026-02-20T15:00:00Z",
  "activePrd": null,
  "adhocQueue": [],
  "pendingTests": {},
  "pendingUpdates": {},
  "uncommittedWork": null
}
```

### Mid-PRD Session

```json
{
  "sessionId": "builder-2026-02-20-abc123",
  "lastHeartbeat": "2026-02-20T15:30:00Z",
  "activePrd": {
    "prdId": "prd-error-logging",
    "currentStory": "US-003",
    "storiesPending": ["US-004", "US-005"],
    "storiesCompleted": ["US-001", "US-002"]
  },
  "adhocQueue": [],
  "pendingTests": {
    "unit": {
      "generated": ["src/__tests__/ErrorLogger.test.ts"],
      "status": "passed",
      "lastRunAt": "2026-02-20T15:25:00Z"
    },
    "e2e": {
      "generated": ["e2e/error-logging.spec.ts"],
      "status": "pending",
      "deferredTo": "prd-completion"
    }
  },
  "pendingUpdates": {},
  "uncommittedWork": {
    "files": ["ErrorLogger.ts", "ErrorBoundary.tsx"],
    "todos": ["US-003"]
  }
}
```

### Ad-hoc During PRD

```json
{
  "sessionId": "builder-2026-02-20-abc123",
  "lastHeartbeat": "2026-02-20T15:45:00Z",
  "activePrd": {
    "prdId": "prd-error-logging",
    "currentStory": null,
    "storiesPending": ["US-004", "US-005"],
    "storiesCompleted": ["US-001", "US-002", "US-003"]
  },
  "adhocQueue": [
    {
      "id": "adhoc-001",
      "description": "Fix typo in footer",
      "status": "in_progress",
      "createdAt": "2026-02-20T15:40:00Z"
    }
  ],
  "pendingTests": {
    "e2e": {
      "generated": ["e2e/error-logging.spec.ts"],
      "status": "pending",
      "deferredTo": "prd-completion"
    }
  },
  "pendingUpdates": {},
  "uncommittedWork": {
    "files": ["Footer.tsx"],
    "todos": ["adhoc-001"]
  }
}
```

## Checkpoint Operations

Checkpoints capture work artifacts (not just status) so another agent can resume mid-task. Target: <2KB per checkpoint.

### Creating a Checkpoint

Initialize checkpoint when starting a task:

```json
{
  "checkpoint": {
    "phase": "implementation",
    "completedSteps": [],
    "pendingSteps": ["Create component", "Add styling", "Wire to context", "Write tests"],
    "currentStep": null,
    "decisions": [],
    "blockers": [],
    "verification": {
      "contractRef": "US-003.verificationContract",
      "results": []
    },
    "metadata": {
      "createdBy": "react-dev",
      "lastUpdatedAt": "2026-02-28T10:00:00Z",
      "reason": "periodic",
      "previousAgents": []
    }
  }
}
```

### Updating Checkpoint on Step Completion

After completing a logical step:

1. Add completed step to `completedSteps` (keep last 10 only)
2. Remove step from `pendingSteps`
3. Clear `currentStep`
4. Update `metadata.lastUpdatedAt`

```json
{
  "completedSteps": [
    {
      "step": "Created DarkModeToggle component",
      "filesCreated": ["src/components/DarkModeToggle.tsx"],
      "filesModified": [],
      "timestamp": "2026-02-28T10:05:00Z"
    }
  ],
  "pendingSteps": ["Add styling", "Wire to context", "Write tests"],
  "currentStep": null,
  "metadata": {
    "lastUpdatedAt": "2026-02-28T10:05:00Z",
    "reason": "periodic"
  }
}
```

### Recording Decisions

When making a design choice:

```json
{
  "decisions": [
    {
      "decision": "Use CSS custom properties for theming",
      "rationale": "Avoids runtime style calculation, better performance",
      "timestamp": "2026-02-28T10:02:00Z"
    }
  ]
}
```

**Size limits:**
- `decision`: Keep concise
- `rationale`: Truncate to 100 chars
- `partialWork`: Truncate to 200 chars

### Checkpoint on Failure/Rate Limit

Before reporting failure or stopping for rate limit:

```json
{
  "checkpoint": {
    "phase": "implementation",
    "completedSteps": [...],
    "pendingSteps": ["Wire to context", "Write tests"],
    "currentStep": {
      "description": "Add styling to toggle",
      "startedAt": "2026-02-28T10:10:00Z",
      "partialWork": "Added base styles, working on hover state"
    },
    "blockers": ["Rate limit reached after styling hover state"],
    "metadata": {
      "createdBy": "react-dev",
      "lastUpdatedAt": "2026-02-28T10:12:00Z",
      "reason": "rate_limit",
      "previousAgents": []
    }
  }
}
```

### Checkpoint on Reassignment

When task is being reassigned to another agent:

1. Create full checkpoint with `reason: "reassignment"`
2. Add current agent to `metadata.previousAgents`
3. Pass checkpoint to new agent via resume prompt

```json
{
  "metadata": {
    "createdBy": "react-dev",
    "lastUpdatedAt": "2026-02-28T10:15:00Z",
    "reason": "reassignment",
    "previousAgents": ["react-dev"]
  }
}
```

## Resume Protocol

When an agent receives a task with an existing checkpoint:

### 1. Detect Stale Checkpoint

Compare `checkpoint.metadata.lastUpdatedAt` with file modification times:

```bash
# Get checkpoint timestamp
CHECKPOINT_TIME=$(jq -r '.checkpoint.metadata.lastUpdatedAt' docs/builder-state.json)

# Check files from completedSteps
for file in $(jq -r '.checkpoint.completedSteps[].filesCreated[]?, .checkpoint.completedSteps[].filesModified[]?' docs/builder-state.json); do
  FILE_MTIME=$(stat -f "%Sm" -t "%Y-%m-%dT%H:%M:%SZ" "$file" 2>/dev/null)
  # Compare timestamps...
done
```

**If any file has mtime newer than checkpoint:**
- Warn: "Checkpoint may be stale — files modified since checkpoint"
- Read affected files to understand current state
- Reconcile before proceeding

### 2. Output Resume Header

When resuming from checkpoint, output:

```
═══════════════════════════════════════════════════════════════════════
                    RESUMING FROM CHECKPOINT
═══════════════════════════════════════════════════════════════════════

Created by: react-dev
Last updated: 2026-02-28T10:10:00Z
Reason: rate_limit

Phase: implementation

Completed Steps:
  ✓ Created DarkModeToggle component (src/components/DarkModeToggle.tsx)
  ✓ Added ThemeContext for state management

Decisions Already Made:
  • Use CSS custom properties for theming
  • Store theme preference in localStorage

Current Step (in progress):
  → Wire toggle to ThemeContext
  Partial work: Added useTheme import, started onClick handler

Pending Steps:
  • Add CSS custom properties for dark theme
  • Write unit tests for toggle
  • Write E2E test for theme switch

═══════════════════════════════════════════════════════════════════════
```

### 3. Resume Prompt Template

When delegating to a specialist with checkpoint context:

```markdown
# Resuming Task: [taskId]

You are continuing work that was partially completed by [previousAgents].

## Task Description
[original task description]

## Current Phase
[checkpoint.phase]

## Completed Steps
[formatted list from checkpoint.completedSteps]

## Decisions Already Made
[formatted list from checkpoint.decisions — RESPECT THESE]

## Current Step (In Progress)
[checkpoint.currentStep.description]
Partial work: [checkpoint.currentStep.partialWork]

## Pending Steps
[formatted list from checkpoint.pendingSteps]

## Files to Review
[list of files from completedSteps — read these to verify state]

## Verification Criteria
[from checkpoint.verification.contractRef]

## Instructions
1. Read the files listed above to verify the checkpoint is accurate
2. Continue from the current step (or first pending step if currentStep is null)
3. Respect decisions already made — do not revisit unless blocked
4. Complete the remaining steps
5. Run verification criteria when done
6. Update checkpoint after each step
```

### 4. Resume Behavior

When resuming:

1. **Read affected files** — Verify checkpoint accuracy
2. **Check for staleness** — Warn if files modified after checkpoint
3. **Respect decisions** — Don't revisit choices already made
4. **Continue from currentStep** — Or first pendingStep if currentStep is null
5. **Update checkpoint** — After each step completion
6. **Complete verification** — Run criteria from verification contract

## Context Overflow Handling

### At 75% Context Usage

```
⚠️ Context limit approaching (75%)

Creating safety checkpoint...
[checkpoint created with reason: "context_limit"]

Work can continue, but checkpoint exists if session must end.
```

### At 90% Context Usage

```
⛔ Context limit reached (90%)

Creating final checkpoint...
[checkpoint created with reason: "context_limit"]

Stopping current work. To resume:
1. Start a new session
2. Builder will detect checkpoint and offer resume

Current progress:
- Completed: [N] steps
- Pending: [M] steps
- Current step: [description]
```

## Checkpoint Size Management

Keep checkpoints under 2KB:

1. **completedSteps**: Keep last 10 only
2. **partialWork**: Truncate to 200 chars
3. **rationale**: Truncate to 100 chars
4. **File paths**: Source files only (no node_modules, build artifacts)
5. **No file content**: Just paths — agent reads files directly

### Pruning Old Steps

When `completedSteps.length > 10`:

```javascript
checkpoint.completedSteps = checkpoint.completedSteps.slice(-10);
```

Older steps are less relevant for resume — recent work matters most.
