---
name: prd-workflow
description: "PRD mode workflow for Builder. Use when building features from PRDs, implementing user stories, or managing PRD state transitions. Triggers on: PRD mode, build PRD, implement stories, ship PRD."
---

# PRD Workflow

> Load this skill when: building features from PRDs, implementing user stories, managing PRD state transitions.

## Overview

PRD mode implements features defined in `docs/prds/prd-[name].json`. It operates in four phases:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  CLAIM PHASE    │ ──► │  BUILD PHASE    │ ──► │   SHIP PHASE    │ ──► │ CLEANUP PHASE   │
│                 │     │                 │     │                 │     │                 │
│ Check conflicts │     │ Implement each  │     │ Run tests, PR,  │     │ Archive PRD,    │
│ setup branch    │     │ story in order  │     │ merge queue     │     │ generate script │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Todo Sync Rules (PRD)

Use OpenCode right-panel todos as the live checklist, mirrored to `docs/builder-state.json`.

1. Create one todo per story when PRD work starts (`US-001`, `US-002`, ...).
2. Set current story to `in_progress`; keep remaining stories `pending`.
3. When a story finishes and post-story checks pass, mark it `completed`.
4. Persist each transition under `uiTodos.items` with `flow: "prd"` and `refId: <storyId>`.
5. On session resume, rebuild right-panel todos from `uiTodos.items` before continuing.

## PRD Lifecycle States

PRDs go through 6 states:

```
┌───────┐     ┌───────┐     ┌─────────────┐     ┌─────────┐     ┌──────────────┐     ┌───────────┐
│ draft │ ──▶ │ ready │ ──▶ │ in_progress │ ──▶ │ pr_open │ ──▶ │ awaiting_e2e │ ──▶ │ completed │
└───────┘     └───────┘     └─────────────┘     └─────────┘     └──────────────┘     └───────────┘
    │                              │                                   │
    │         (skip for           │              (skip if no          │
    └─────────small PRDs)─────────┘              deferred E2E)────────┘
```

| State | Meaning |
|-------|---------|
| `draft` | PRD exists but not ready for implementation |
| `ready` | PRD approved, waiting to be picked up |
| `in_progress` | Implementation actively happening |
| `pr_open` | PR created, awaiting review/merge |
| `awaiting_e2e` | PR merged, but deferred E2E tests not yet run |
| `completed` | PR merged, E2E tests passed (or explicitly skipped), work done |

### State Migration

If you encounter PRDs with legacy states, migrate them automatically:
- `committed` → `in_progress` (work not yet pushed)
- `pushed` → `in_progress` (no PR yet)
- `merged` → `awaiting_e2e` (must verify E2E tests before completing)

## Git Execution Mode (PRD)

Resolve git behavior from `docs/project.json`:

1. `agents.gitWorkflow`
2. If `trunk`, resolve `agents.trunkMode` (default: `branchless`)
3. Resolve default branch from `git.defaultBranch` (fallback: `main`)

Rules:
- `trunk + branchless`:
  - Execute directly on default branch
  - Do not create/checkout feature branches
  - Treat PRD `branchName` as metadata only
  - Skip PR creation/merge-queue flow unless user explicitly overrides
- `trunk + pr-based` or non-trunk workflows:
  - Use existing branch + PR flow in this skill

---

## Phase 1: Claim PRD

When user selects a PRD to build:

### Step 1: Check for Conflicts

- Read `docs/prd-registry.json` for `conflictsWith` and `conflictRisk`
- If HIGH conflict risk with an active session, warn and get confirmation
- If MEDIUM conflict risk, note it but proceed if user confirms

### Step 2: Select Testing Rigor for This PRD

At PRD start, prompt for testing rigor profile (default from `docs/project.json` -> `testing.rigorProfile`, fallback `standard`):

- `rapid` - prioritize speed (`autoGenerate=false`, `criticMode=fast`, `qualityChecks=false`)
- `standard` - balanced default (`autoGenerate=true`, `criticMode=balanced`, `qualityChecks=false`)
- `strict` - higher confidence (`autoGenerate=true`, `criticMode=strict`, `qualityChecks=true`)
- `compliance` - strict plus hard gates (`autoGenerate=true`, `criticMode=strict`, `qualityChecks=true`, no "ship anyway" bypass)

Persist selection to `builder-state.json` under `activePrd.testingRigor` so resumed sessions keep the same behavior.

### Step 3: Credential Readiness Check

Before copying the PRD to the working location, inspect credential metadata in `docs/prds/prd-[name].json`:

- Read top-level `credentialRequirements[]` (if present).
- For each entry with `requestTiming: "upfront"`, ask for credential readiness before starting story execution.
- If user does not have a credential yet, mark it `deferred` and continue only with stories that do not depend on it.
- Persist statuses in `builder-state.json` under `activePrd.credentials` with `pending|provided|deferred`.
- Never ask users to paste actual secrets into chat; request secure local setup via environment variables/secrets manager.

If no credential requirements are listed, continue normally.

### Step 4: Copy PRD to Working Location

Copy `docs/prds/prd-[name].json` to `docs/prd.json`. This is where @developer reads the current work.

### Step 5: Update PRD Registry Status

Update `docs/prd-registry.json`:
- Set `status: "in_progress"`
- Set `startedAt: <now>`
- Store `currentStory` as work progresses

### Step 6: Create Session Lock

Create/update entry in `docs/session-locks.json`:

```json
{
  "sessions": [
    {
      "sessionId": "builder-abc123",
      "prdId": "prd-error-logging",
      "currentStory": "US-001",
      "status": "in_progress",
      "startedAt": "2026-02-19T16:30:00Z",
      "heartbeat": "2026-02-19T16:30:00Z"
    }
  ]
}
```

### Step 7: Set Execution Branch

If `trunk + branchless`:

```bash
git checkout <default-branch>
```

If not branchless trunk mode, create branch from PRD `branchName`:

```bash
git checkout -b <branchName> <default-branch>
```

### Step 8: Initialize Architecture Automation Baseline

Before story execution begins, ensure architecture automation assets exist and are current:

1. **Architecture guardrails** (generate when missing):
   - import boundary rules
   - layer constraints (UI/app/domain/data)
   - restricted direct access patterns
2. **Bounded-context docs** (generate when missing):
   - `docs/architecture/bounded-contexts.md`
   - optional `docs/architecture/contexts/*.md`
3. Persist initialization status in `builder-state.json` under `activePrd.architecture`.

Default policy:
- `guardrails.strictness`: `standard`
- `boundedContexts.policy`: `strict`

Only prompt users for policy overrides, not routine generation/refresh.

---

## Phase 2: Build Stories

For each story in priority order:

### Step 1: Implement the Story

0. **Credential gate before implementation:**
   - Check story `requiredCredentials[]` (if present).
   - If any required credential is still `pending`/`deferred`, prompt at the story boundary.
   - For `requestTiming: "after-initial-build"`, this is the first required prompt point.
   - If credential is still unavailable, skip to the next unblocked story and clearly report the block.

1. **Run the workflow steps** from `workflows.prd`:

   ```
   For each step in workflows.prd:
       Execute the step
       If step fails:
           Attempt to fix (run @developer with error context)
           If still fails after 2 attempts:
               Report and ask user
   ```

2. **Handle story-specific flags:**
   - `supportArticleRequired: true` → Run `support-article` step
   - `e2eRequired: true` → Run `e2e-write` step
   - `toolsRequired: true` → Run `tools` step (if `capabilities.ai`)
   - `marketingRequired: true` → Run `marketing` step (if `capabilities.marketing`)

3. **Resolve story test intensity (planner + runtime):**
   - Read planner baseline from story field: `testIntensity` (`low|medium|high|critical`)
   - Read project policy: `project.json` → `testing.storyAssessment.source` (`planner|builder|hybrid`, default `hybrid`)
   - Compute runtime risk signals (actual changed files, cross-cutting impact, auth/payment/security touches, repeated failures)
   - Determine effective intensity:
     - `planner`: use planner baseline
     - `builder`: use runtime assessment
     - `hybrid`: use max(planner baseline, runtime assessment)
   - Unless `testing.storyAssessment.allowDowngrade: true`, Builder must only escalate (never downgrade)
   - Persist to `builder-state.json` under `activePrd.storyAssessments[storyId]`

4. **Update heartbeat** periodically in session lock

5. **Update story todo state in both stores:**
   - Before implementation: mark current story `in_progress` via `todowrite` and `uiTodos.items`
   - After implementation + required checks: mark story `completed` in both places

6. **Handle developer failures:**
   - If developer fails more than once on a story, analyze the PRD
   - Update `docs/prd.json` with clarifications if needed
   - If developer struggles with cleanup, run @wall-e

### Step 2: Automatic Testing After Story (US-003)

Use `test-flow` as the canonical source for all test behavior.

1. Read effective story intensity from `builder-state.json` (`activePrd.storyAssessments[storyId].effective`).
2. Execute **PRD Mode Test Flow (US-003)** from `test-flow` after each story.
3. Do not duplicate test logic here. Follow `test-flow` for:
   - Per-story behavior based on effective intensity (`low|medium|high|critical`)
   - Rigor profile and policy resolution
   - Retry/fix loops and failure handling
   - `builder-state.json` updates for queued tests
4. After test-flow completes for the story, update `activePrd.storiesCompleted` and continue.

### Step 3: Repeat for All Stories

Continue Steps 1-2 for each story until all are complete.

### Step 4: Boundary Drift Detection During Build

After each story, detect boundary-impacting changes and refresh docs/guardrails as needed:

1. Detect drift signals:
   - new/renamed domain modules
   - cross-layer imports violating policy
   - context ownership changes
2. If drift detected:
   - refresh guardrail artifacts
   - refresh bounded-context docs
3. Record a short change summary in `builder-state.json` (`activePrd.architecture.boundaryChanges[]`).

### Critic Batching

When to run @critic depends on the configured `criticMode`:

| Mode | When Critic Runs |
|------|------------------|
| `strict` | After every story |
| `balanced` | After story 2, then every 3 stories (5, 8, 11...) |
| `fast` | Only at PRD completion |

**Configuration cascade** (highest priority first):
1. CLI flag: `--critic-mode=strict`
2. Active PRD rigor profile (`builder-state.json` -> `activePrd.testingRigor`)
3. Project: `project.json` → `agents.criticMode`
4. Fallback: `balanced`

Rigor-derived critic overrides:
- `rapid` -> `fast`
- `standard` -> `balanced`
- `strict` and `compliance` -> `strict`

**Balanced mode details:**
- If PRD has ≤2 stories, behave like `fast` (one critic run at end)
- Always run critic at PRD completion regardless of mode

---

## Phase 3: Ship

After all stories are complete, ship the work:

### Step 1: Run Quality Gates

Use commands from `docs/project.json`:

```bash
# Example - actual commands come from project.json
npm run typecheck && npm run test && npm run build
```

### Step 1.5: Run Architecture Guardrail Checks

Run guardrail validation in the same pre-ship gate path:

```bash
# Example commands; use project-defined equivalents when available
npm run lint:architecture || npm run guardrails:check
```

If violations exist:
- attempt auto-fix/update where safe
- re-run checks
- if still failing, stop and report explicit remediation guidance

### Step 1.75: Refresh Bounded-Context Docs if Needed

If boundary-impacting changes were detected during the PRD:

1. Regenerate `docs/architecture/bounded-contexts.md`
2. Regenerate/refresh `docs/architecture/contexts/*.md` if used
3. Include a concise boundary delta summary in ship output

### Step 2: Run ALL Queued E2E Tests

First, gather all queued E2E tests from `builder-state.json`:
- All tests in `pendingTests.e2e.generated[]`
- This includes story E2E tests AND any ad-hoc E2E tests deferred to PRD completion

If no E2E tests are queued (for example, `testing.autoGenerate: false` and no manually added tests), skip this step and continue to Step 2.5.

Start dev server if needed (see Dev Server Management).

Run queued E2E execution and failure handling using `test-flow` retry semantics (max attempts, @developer fix loop, and stop conditions).

### Step 2.5: Run Quality Checks (if enabled) (US-008)

Check `project.json → testing.qualityChecks`:

```json
{
  "testing": {
    "qualityChecks": true  // default: false
  }
}
```

**If `qualityChecks: true`:**

Run @quality-critic with context:
```
Run @quality-critic with:
  devServerUrl: http://localhost:{devPort}  # Get devPort from ~/.config/opencode/projects.json
  changedFiles: [files changed in this PRD/session]
  mode: comprehensive  // for PRD completion
```

@quality-critic will check:
- Accessibility (axe-core) — WCAG 2.1 AA compliance
- Layout Shift (CLS) — cumulative layout shift detection
- Visual Regression — screenshot comparison with baselines
- Performance — FCP, LCP, TTI metrics

**Handle quality check results:**

- If no critical issues → Continue to step 3
- If critical issues → Show prompt with [F]ix / [S]kip options

### Step 3: Commit Final Changes

Commit all remaining changes:

```bash
git add -A
git commit -m "feat: [summary from PRD]"
```

### Step 3.5: Generate PRD Completion Report Artifact

Before final completion/archival, generate:

- `docs/completed/[prd-id]/completion-report.md`

Support report modes:
- `detailed` (default)
- `compact` (if configured in project config)

Required report sections:

1. PRD metadata (id, name, completion timestamp)
2. Story-to-acceptance mapping (what shipped)
3. Files and system areas changed
4. Data/migration impact
5. API changes and auth/permission notes
6. UI/UX changes
7. Verification evidence (commands + pass/fail)
8. Deferred items / known issues / follow-ups

Always reference this report path in final Builder completion output.

### Step 4: Push/PR Behavior by Git Mode

If `trunk + branchless`:

```bash
git push origin <default-branch>
```

- Skip PR creation and merge queue by default.
- Update PRD status directly toward completion flow (`awaiting_e2e` or `completed` based on deferred tests).

If not branchless trunk mode:

```bash
git push -u origin <branch-name>
```

### Step 5: Create PR (non-branchless mode)

Create PR with `gh pr create` (not draft — E2E already passed):
- Title: `feat: [description from prd.json]`
- Body: List of user stories with status

**Update registry status to `pr_open`:**
- Set `status: "pr_open"`
- Store `prNumber` and `prUrl` from `gh pr create` output
- Report: "✅ PR created: [URL]. Status: `pr_open`"

### Step 6: Add to Merge Queue (if enabled, non-branchless mode)

Check `docs/project.json` → `agents.mergeQueue.enabled` (default: true).

**If merge queue is enabled:**

1. Read `~/.config/opencode/merge-queue.json`

2. Get list of files changed in this branch:
   ```bash
   git diff --name-only origin/<defaultBranch>...HEAD
   ```

3. Check for conflict risk with existing queue entries

4. Create queue entry:
   ```json
   {
     "id": "entry-<random>",
     "projectId": "<current-project-id>",
     "prdId": "<prd-id or null>",
     "branch": "<branch-name>",
     "prNumber": <pr-number>,
     "prUrl": "<pr-url>",
     "status": "queued",
     "priority": "<from prd priority or 'normal'>",
     "queuedAt": "<now>",
     "sessionId": "<session-id>",
     "filesChanged": ["<list of changed files>"],
     "conflictRisk": ["<conflicting entry IDs>"]
   }
   ```

5. Add to `queue` array and save `merge-queue.json`

6. Report queue status

**If merge queue is disabled:**
- Skip queue integration
- Fall back to legacy behavior (step 7)

### Step 7: Handle Immediate Merge (legacy, non-branchless mode)

Read `autoMerge` from `docs/project.json` → `agents.autoMerge`:

| Setting | Behavior |
|---------|----------|
| `"off"` (default) | Report PR URL, done. Human merges later. |
| `"on-e2e-pass"` | E2E passed, so merge immediately |
| `"on-ci-pass"` | Run @felix to wait for GitHub CI, then merge |

### Step 8: Update Session Lock

Update to status "completed" (or "awaiting-merge" if autoMerge is off)

---

## Phase 4: Cleanup (runs on next Builder startup)

When Builder starts, check for PRs that need cleanup:

### Step 1: Check PR Status

Read `docs/prd-registry.json` for PRDs with status `pr_open`.

For each:
- Check if PR was merged: `gh pr view <PR-NUMBER> --json state`

### Step 2: Handle Merged PRs

If `state: "MERGED"`:

1. **Check for pending E2E tests:**
   
   Read `builder-state.json` → `pendingTests.e2e`:
   - If `status: "pending"` with `deferredTo: "prd-completion"` → E2E tests still needed
   - If `status: "passed"` → E2E tests complete, proceed to step 3
   - If no `pendingTests.e2e` exists → **Check PRD for E2E requirements** (see below)

   **If no E2E tracking exists:**
   
   Read the PRD JSON and check if any story has `e2eRequired: true`:
   - If YES → E2E tests were expected but not tracked. Treat as `awaiting_e2e` and prompt user.
   - If NO stories required E2E → E2E tests not needed, proceed to step 3

2. **If E2E tests are still pending (or expected but untracked):**
   
   **Update registry to `awaiting_e2e`** (do NOT archive yet):
   - Set `status: "awaiting_e2e"`
   - Set `mergedAt: <now>`
   - Store `pendingE2eTests: [list of test files]`
   
   **Report and show E2E prompt:**
   ```
   ═══════════════════════════════════════════════════════════════════════
                        PR MERGED — E2E TESTS PENDING
   ═══════════════════════════════════════════════════════════════════════
   
   ✅ PR merged: [prd-name]
   
   ⚠️  Deferred E2E tests have not been run yet:
      • e2e/feature-name.spec.ts
   
   [If E2E tests were expected but untracked:]
   ⚠️  This PRD has stories with e2eRequired: true, but no E2E tests
      were tracked. E2E tests may need to be generated first.
   
   The PRD will remain in `awaiting_e2e` status until E2E tests pass.
   
   Options:
      [E] Run E2E tests now
      [G] Generate E2E tests first, then run (if untracked)
      [S] Skip E2E tests (mark completed anyway)
      [L] Leave as awaiting_e2e (run later)
   
   > _
   ═══════════════════════════════════════════════════════════════════════
   ```
   
   **Handle response:**
   - "E" → Run E2E tests (see Deferred E2E Test Flow in builder.md)
   - "G" → Run @playwright-dev to generate E2E tests for the PRD's stories, then run them
   - "S" → Log skip reason, proceed to step 3 (archive and complete)
   - "L" → Stop here, user will run `[E]` from dashboard later
   
   **Do NOT proceed to step 3 unless user chooses "E" (and tests pass), "G" (and tests pass), or "S".**

3. **Generate human testing script** (see template below)

4. **Archive the PRD:**
   - Create folder: `docs/completed/[prd-id]/`
   - Move PRD JSON and MD files to archive folder
   - Move the generated `human-testing-script.md` to archive folder
   - **Update registry status to `completed`:**
     - Set `status: "completed"`, `completedAt: <now>`
     - If E2E was skipped, add `e2eSkipped: true` and `e2eSkipReason: "user-requested"`
     - Move entry to `completed` array

5. **Clear E2E queue:**
   - Remove `pendingTests.e2e` from `builder-state.json`
   - Clear `deferredTo` flag

6. **Run @prd-impact-analyzer:**
   - Check if completed work unblocks other PRDs
   - Check if conflict risks have changed
   - Update registry accordingly

7. **Remove session lock** from `docs/session-locks.json`

8. **Report and offer to open:**
   ```
   ✅ Cleaned up merged PRD: [prd-name]
   
   📋 Human testing script ready:
      docs/completed/[prd-id]/human-testing-script.md
   
   Would you like me to open it? (y/n)
   ```

### Step 3: Handle Other States

- **If `state: "OPEN"`:** Keep current state, report: "⏳ PR still open"
- **If `state: "CLOSED"` (not merged):** Warn and ask user what to do

### Step 4: Check for Stale Sessions

- `in_progress` with no heartbeat for > 1 hour → warn: "PRD [name] may be abandoned (no heartbeat)"
- `pr_open` for > 24 hours → suggest checking PR status

### Step 5: Check Merge Queue Status

If queued entries exist for this project, show queue status and offer to process.

---

## Handling Ad-hoc Requests During PRD Mode

If user makes an ad-hoc request while a PRD is checked out:

1. **Determine if it's PRD-related:**
   - If the request relates to the current PRD's scope → treat as part of PRD work
   - If it's unrelated → run as ad-hoc (separate from PRD)

2. **For unrelated ad-hoc requests:**
   - Run the `workflows.adhoc` steps
   - **⚠️ PRD PROTECTION: Do NOT modify `docs/prd.json` during ad-hoc work**
   - Commit separately from PRD work
   - Generate an ad-hoc report
   - Return to PRD work when done

3. **Example:**
   ```
   [Working on prd-error-logging]
   
   User: "Oh also, can you fix the typo in the footer?"
   
   Builder: "That's outside the current PRD scope. I'll handle it as ad-hoc.
          Running ad-hoc workflow..."
   
   [Runs adhoc workflow, generates adhoc-2026-02-20-fix-footer-typo.md]
   
   Builder: "✅ Fixed footer typo.
          
          📋 Ad-hoc report: docs/completed/adhoc/adhoc-2026-02-20-fix-footer-typo.md
          
          Continuing with prd-error-logging..."
   ```

---

## Human Testing Script Template

When archiving a completed PRD, generate `human-testing-script.md`:

**Audience:** Non-technical PMs and QA testers.

```markdown
# Testing Script: [Feature Name]

**Feature:** [Human-readable feature name]  
**Completed:** [Date]  
**Tested by:** _________________  
**Test date:** _________________

---

## What Was Built

[2-3 sentences describing what the user can now do]

---

## Before You Start

- [ ] Make sure you're logged into the application
- [ ] [Any setup needed]

---

## Test Scenarios

### Scenario 1: [User goal]

**Starting point:** [Where the user begins]

**Steps:**
1. [Action in plain language]
2. [Next action]
3. [Next action]

**What should happen:**
- [Expected outcome]

**Result:** ☐ Pass  ☐ Fail

---

## Edge Cases to Try

| Try this | Expected behavior |
|----------|-------------------|
| [Edge case] | [What should happen] |

---

## Things That Should Still Work

- [ ] [Related feature 1]
- [ ] [Related feature 2]

---

## Final Check

- [ ] All scenarios passed
- [ ] Edge cases behave correctly  
- [ ] Existing features still work

**Overall result:** ☐ Ready to ship  ☐ Needs fixes
```
