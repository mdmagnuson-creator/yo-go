---
name: test-flow
description: "Automatic test generation and execution flows for Builder. Use when generating unit/E2E tests, handling test failures, or managing E2E deferral. Triggers on: generate tests, run tests, test failures, E2E deferral, test flow."
---

# Test Flow

> Load this skill when: generating tests, running test suites, handling test failures, managing E2E deferral.

## Overview

Builder automatically generates and runs tests based on **signal-based activity resolution**. The system analyzes changed files, detects code patterns, and determines exactly which testing activities to run — no user prompts, no rigor selection, fully automatic.

---

## Automatic Activity Resolution (CORE)

> ⚠️ **Test activities are determined automatically. No prompts, no user selection.**
>
> The system analyzes what changed and runs the appropriate activities.
> Users see an informational display of what's running, but are never asked to confirm.

### How It Works

```
Task complete
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: Collect Changed Files                                       │
│                                                                     │
│ • git diff --name-only HEAD~1 (or vs base branch)                  │
│ • Include staged + unstaged changes                                 │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: Resolve Activities                                          │
│                                                                     │
│ Read: ~/.config/opencode/data/test-activity-rules.json             │
│ Read: <project>/docs/test-debt.json (hotspots)                     │
│                                                                     │
│ For each changed file:                                              │
│   • Match against filePatterns → collect activities                 │
│   • Check e2eScope for dependent testing                           │
│                                                                     │
│ For diff content:                                                   │
│   • Match against codePatterns → collect additional activities      │
│                                                                     │
│ Check cross-cutting rules:                                          │
│   • Multiple directories touched? → add oddball-critic              │
│   • Shared module touched? → add dx-critic                          │
│                                                                     │
│ Check hotspots:                                                     │
│   • File in test-debt.json? → add its critics, force E2E           │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3: Display Activities (Informational Only)                     │
│                                                                     │
│ Show what's running — NO confirmation prompt                        │
│ Execution proceeds immediately after display                        │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 4: Execute Activities                                          │
│                                                                     │
│ 1. Baseline: typecheck, lint (always)                               │
│ 2. Unit tests: resolved testers for file types                      │
│ 3. Critics: resolved critics in parallel                            │
│ 4. E2E: immediate or deferred based on resolution                   │
│ 5. Quality: aesthetic-critic, tailwind-critic if resolved           │
└─────────────────────────────────────────────────────────────────────┘
```

### Activity Resolution Algorithm

```
function resolveActivities(changedFiles, diffContent, project):
  # Check if project has UI
  hasUI = project.capabilities.ui !== false
  
  # Load rules
  rules = read("~/.config/opencode/data/test-activity-rules.json")
  hotspots = read("<project>/docs/test-debt.json") or { hotspots: {} }
  
  activities = {
    baseline: ["typecheck", "lint"],
    unit: Set(),
    critics: Set(),
    e2e: hasUI ? rules.defaults.e2e : "skip-no-ui",
    e2eAreas: [],
    dependentSmoke: [],
    quality: Set(),
    reasoning: []
  }
  
  for file in changedFiles:
    for pattern, rule in rules.filePatterns:
      if globMatch(file, pattern):
        # Collect critics
        activities.critics.addAll(rule.critics or [])
        activities.reasoning.push(file + " → " + (rule.reason or pattern))
        
        # Determine unit tester
        if rule.unit === true:
          activities.unit.add(inferUnitTester(file))
        else if rule.unit is string:
          activities.unit.add(rule.unit)
        
        # Handle E2E
        if rule.e2e === "skip":
          continue  # This file doesn't need E2E
        
        if rule.e2e === "immediate" and hasUI:
          activities.e2e = "immediate"
          activities.e2eAreas.add(file)
        
        if rule.e2e === "deferred" and hasUI:
          activities.e2eAreas.add(file)
        
        # Dependent smoke testing
        if rule.e2eScope === "dependents":
          activities.dependentSmoke.add(file)
        
        # Quality critics
        if rule.quality === true:
          activities.quality.addAll(["aesthetic-critic"])
        else if rule.quality is array:
          activities.quality.addAll(rule.quality)
  
  # Match code patterns in diff
  for pattern, rule in rules.codePatterns:
    if regexMatch(diffContent, pattern):
      activities.critics.addAll(rule.critics or [])
      if rule.e2e === "immediate" and hasUI:
        activities.e2e = "immediate"
      activities.reasoning.push("Code pattern: " + pattern)
  
  # Cross-cutting rules
  directories = countDistinctDirectories(changedFiles)
  if directories >= rules.crossCuttingRules.multipleDirectories.threshold:
    activities.critics.addAll(rules.crossCuttingRules.multipleDirectories.add.critics)
  
  sharedPaths = rules.crossCuttingRules.sharedModuleTouch.paths
  if anyMatch(changedFiles, sharedPaths):
    activities.critics.addAll(rules.crossCuttingRules.sharedModuleTouch.add.critics)
  
  # Hotspot escalation
  for file in changedFiles:
    if file in hotspots.hotspots:
      h = hotspots.hotspots[file]
      activities.critics.addAll(h.addedCritics or [])
      if h.forceE2E and hasUI:
        activities.e2e = "immediate"
      activities.reasoning.push(file + " → hotspot: " + h.reason)
  
  return activities

function inferUnitTester(file):
  if file.endsWith(".tsx") or file.endsWith(".jsx"):
    return "react-tester"
  if file.endsWith(".go"):
    return "go-tester"
  return "jest-tester"
```

### Informational Activity Display

After resolution, display what's running — **no confirmation, execution proceeds immediately:**

```
═══════════════════════════════════════════════════════════════════════
                      TEST ACTIVITIES FOR THIS CHANGE
═══════════════════════════════════════════════════════════════════════

Changed files:
  • src/components/PaymentForm.tsx
  • src/api/payments/charge.ts

Running:
  ✓ Baseline: typecheck, lint
  ✓ Unit tests: @react-tester, @jest-tester
  ✓ Critics: @frontend-critic, @backend-critic-ts, @security-critic
  ✓ E2E: IMMEDIATE (payment code detected)
  ✓ Quality: @aesthetic-critic

═══════════════════════════════════════════════════════════════════════
```

**Note:** This display is informational. User is NOT asked to confirm or modify.

### E2E Timing Rules

| Timing | Meaning | When |
|--------|---------|------|
| `immediate` | Run E2E now, before task marked complete | Auth, payment, API, middleware, database |
| `deferred` | Queue for PRD/batch completion | Components, hooks, pages, styling |
| `skip` | No E2E for this file type | Type definitions, tests, docs, config |
| `skip-no-ui` | Project has no UI | CLI tools, libraries, backend-only |

### Skip Playwright Entirely

These file types never trigger Playwright (even in UI projects):

- `*.d.ts` — Type definitions
- `*.test.ts`, `*.spec.ts`, `__tests__/**` — Test files
- `*.md`, `README*`, `docs/**` — Documentation
- `.eslintrc*`, `.prettierrc*`, `tsconfig*.json` — Dev config
- `.gitignore`, `.github/**` — Git/CI config
- `*.lock`, `package-lock.json` — Lockfiles

### Project UI Detection

Before running Playwright, check if project has a UI:

```json
// project.json
{
  "capabilities": {
    "ui": true   // Has web UI → Playwright runs
    "ui": false  // No UI → Skip Playwright entirely
  }
}
```

If `capabilities.ui` is not declared, detect from:
- Has `apps/web/`, `src/app/`, `src/pages/` → UI project
- Has React/Vue/Svelte/Next.js in dependencies → UI project
- Has `playwright.config.*` → UI project
- Otherwise → assume no UI

---

## Verification Contract Integration

> 🎯 **Contract-first verification:** When a verification contract exists, map contract criteria to test activities.

### Using Contracts for Verification

When `builder-state.json` contains a `verificationContract`, use it to guide verification:

```
Verification Flow (with contract):

1. Read builder-state.json → verificationContract
2. For each criterion in contract.criteria:
   - Map criterion.activity to test activity
   - Execute the activity
   - Record result in verificationResults
3. All criteria must pass for task success
```

### Contract Criteria to Activity Mapping

| Contract Criterion | Test Activity | Execution |
|--------------------|---------------|-----------|
| `activity: "typecheck"` | Baseline typecheck | `npm run typecheck` |
| `activity: "lint"` | Baseline lint | `npm run lint` |
| `activity: "unit-test"` | Unit test generation + run | @tester → `npm test` |
| `activity: "e2e"` | E2E test generation + run | @e2e-playwright → `npx playwright test` |
| `activity: "critic"` | Code review | @critic or specific critic |

### Recording Verification Results

After running each criterion, update `builder-state.json` → `verificationResults`:

```json
{
  "verificationResults": {
    "overall": "pass",
    "criteria": [
      { "activity": "typecheck", "status": "pass" },
      { "activity": "lint", "status": "pass" },
      { "activity": "unit-test", "status": "pass", "attempts": 1 },
      { "activity": "e2e", "status": "pass", "attempts": 1 }
    ],
    "completedAt": "2026-02-28T10:15:00Z"
  }
}
```

### Contract Types and Verification Behavior

| Contract Type | Verification Behavior |
|---------------|----------------------|
| `verifiable` | Run all criteria in contract, all must pass |
| `advisory` | Skip automated verification, log output for user review |
| `skip` | Run only typecheck + lint (minimal verification) |

### Failure Handling with Contracts

When a criterion fails:

1. **Record failure in verificationResults:**
   ```json
   {
     "activity": "unit-test",
     "status": "fail",
     "error": "Expected component to render, but got null",
     "attempts": 2
   }
   ```

2. **Run fix loop** (existing behavior, max 3 attempts)

3. **If still failing after max attempts:**
   - Update `verificationResults.overall: "fail"`
   - Record `completedAt` timestamp
   - Report to user with detailed failure info
   - This data enables Dynamic Reassignment (future) to decide retry vs escalate

### Backward Compatibility

If no `verificationContract` exists in `builder-state.json`:
- Fall back to automatic activity resolution (existing behavior)
- Use file patterns and code patterns to determine activities
- No contract means no `verificationResults` to record

---

## Per-Task Quality Checks (MANDATORY)

> ⛔ **After EVERY task/story completes, run resolved activities automatically. No prompts, no skipping.**
>
> This applies to BOTH ad-hoc mode AND PRD mode.

### Activity Execution Order

After @developer completes a task, run resolved activities in this order:

| Step | Activity | Source | Fix Loop |
|------|----------|--------|----------|
| 1 | **Typecheck** | Always (baseline) | Yes, max 3 attempts |
| 2 | **Lint** | Always (baseline) | Yes, max 3 attempts |
| 3 | **Unit Tests** | Resolved testers (`react-tester`, `jest-tester`, `go-tester`) | Yes, max 3 attempts |
| 4 | **Critics** | Resolved from file/code patterns | Report findings, @developer fixes |
| 5 | **E2E Tests** | If `immediate` (or at PRD completion if `deferred`) | Yes, max 3 attempts |
| 6 | **Quality** | Resolved quality critics (`aesthetic-critic`, etc.) | Report findings |

### Flow Diagram

```
Task/Story complete
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ RESOLVE ACTIVITIES (automatic, no prompt)                           │
│ Read test-activity-rules.json, match patterns, check hotspots       │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ DISPLAY ACTIVITIES (informational only, no confirmation)            │
│ Show what's running and why                                         │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────┐
│ 1. Typecheck        │
└─────────────────────┘
    │
    ├─── PASS ──► Continue
    │
    └─── FAIL ──► Fix loop (max 3) ──► Still failing? STOP
    │
    ▼
┌─────────────────────┐
│ 2. Lint             │
└─────────────────────┘
    │
    ├─── PASS ──► Continue
    │
    └─── FAIL ──► Fix loop (max 3) ──► Still failing? STOP
    │
    ▼
┌─────────────────────┐
│ 3. Unit tests       │
│ (resolved testers)  │
└─────────────────────┘
    │
    ├─── PASS ──► Continue
    │
    └─── FAIL ──► Fix loop (max 3) ──► Still failing? STOP
    │
    ▼
┌─────────────────────┐
│ 4. Critics          │
│ (resolved critics)  │
└─────────────────────┘
    │
    ├─── No issues ──► Continue
    │
    └─── Issues found ──► @developer fixes ──► Re-run critic
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. E2E Tests (if immediate)                                         │
│    - @e2e-reviewer identifies areas + finds dependents              │
│    - @e2e-playwright writes and runs tests                          │
└─────────────────────────────────────────────────────────────────────┘
    │
    ├─── PASS (or deferred/skip) ──► Continue
    │
    └─── FAIL ──► Fix loop (max 3) ──► Still failing? STOP
    │
    ▼
┌─────────────────────┐
│ 6. Quality critics  │
│ (if resolved)       │
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│ ✅ TASK VERIFIED    │
│                     │
│ Show completion     │
│ prompt to user      │
└─────────────────────┘
```

### Completion Prompt (After All Checks Pass)

After the four checks pass, show this prompt:

```
═══════════════════════════════════════════════════════════════════════
                          TASK COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ [Task description]

Quality checks:
  ✅ Typecheck: passed
  ✅ Lint: passed
  ✅ Unit tests: [N] generated, all passing
  ✅ Critic: no issues

Changed files: [count] ([file list])

Options:
  [E] Write E2E tests (Playwright automated UI testing)
  [C] Commit this change
  [N] Next task (add more work)

> _
═══════════════════════════════════════════════════════════════════════
```

### Handle Response

| Choice | Action |
|--------|--------|
| **E** | Run @playwright-dev to generate E2E tests, then prompt to run them |
| **C** | Commit the changes (respecting `git.autoCommit` setting) |
| **N** | Return to task prompt for more work |

### E2E Sub-flow (When User Chooses "E")

1. Run @playwright-dev to generate E2E tests for changed files
2. Show prompt:
   ```
   📝 E2E tests generated:
      • e2e/[test-name].spec.ts
   
   [R] Run E2E tests now
   [S] Save for later (queue tests, return to task prompt)
   ```
3. If "R": Start dev server if needed, run tests, handle failures
4. If "S": Queue tests in `builder-state.json`, return to completion prompt

---

## Escape Hatches (Optional — Power Users Only)

These overrides exist but are **never required**. The system works fully automatically without them.

### Per-Task Force

If user explicitly requests more coverage:
```
User: "force full"
Builder: "Adding all critics + unit tests..."
```

### Per-Task Skip

If user explicitly requests less coverage:
```
User: "skip security-critic"
Builder: "Removing @security-critic from this run..."
```

### Project-Level Configuration

Set once in `project.json`, never prompted:

```json
{
  "testing": {
    "alwaysInclude": ["security-critic"],  // Always run these
    "neverSkip": ["exploit-critic"]         // Cannot be skipped
  }
}
```

### Legacy Rigor Profiles (DEPRECATED)

> ⚠️ **`rigorProfile` is deprecated and ignored.**
>
> If you have `testing.rigorProfile` in `project.json`, it will be ignored.
> Test activities are now determined automatically based on what changed.
> Remove this field from your `project.json` when convenient.

---

## Test Execution Mode (CRITICAL)

> ⚠️ **ALWAYS run tests in CI/non-watch mode to prevent orphaned processes.**
>
> Before executing any test command, verify CI=true or runner-specific flags.
> If CI mode is missing, stop and correct the command before execution.
> When the terminal session ends, watch-mode processes become orphaned and consume CPU.

### Required Flags by Runner

| Runner | Watch Mode (DO NOT USE) | CI Mode (USE THIS) |
|--------|------------------------|-------------------|
| **Vitest** | `vitest` (default) | `vitest run` |
| **Jest** | `jest --watch` | `jest` (default) |
| **Playwright** | N/A | Default is single-run |
| **Go test** | N/A | Default is single-run |

### Enforcement

When executing test commands:

1. **Check if project uses Vitest** — look for `vitest` in `package.json` dependencies
2. **If Vitest detected**, verify the test script includes `run`:
   - ✅ `"test": "vitest run"`
   - ❌ `"test": "vitest"` (will watch)
3. **If the script is wrong or uncertain**, run with explicit flags:
   ```bash
   CI=true npx vitest run
   ```
4. **CI environment variable** — set `CI=true` as a safety net:
   ```bash
   CI=true npm test
   ```
   Most test runners detect `CI=true` and automatically disable watch mode.

### Symptoms of Watch Mode

If tests "hang" without returning to the prompt:
1. The runner is likely in watch mode
2. Kill the process (Ctrl+C or kill PID)
3. Re-run with proper CI mode flags

---

## PRD Mode Test Flow (US-003)

**After each story completion, run the mandatory per-task quality checks** (see "Per-Task Quality Checks" above).

This is the same flow used in ad-hoc mode:
1. Typecheck
2. Lint
3. Auto-generate and run unit tests (resolved testers)
4. Critic review (resolved critics)
5. E2E tests (if immediate)
6. Quality checks (if resolved)

### Additional PRD-Specific Behavior

After the mandatory checks pass, PRD mode handles E2E based on **automatic activity resolution**:

| E2E Resolution | Behavior |
|----------------|----------|
| `immediate` | Run E2E tests now, before marking story complete |
| `deferred` | Queue E2E tests for PRD completion |
| `skip` | No E2E (docs, config, type definitions) |

**Note:** E2E timing is determined automatically by the activity rules based on what files changed. No user selection required.

### PRD Story Completion Flow

```
Story complete
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ RESOLVE ACTIVITIES (automatic)                                      │
│ Based on files changed in this story                                │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│ MANDATORY: Run resolved         │
│ activities (baseline, unit,     │
│ critics, E2E if immediate)      │
└─────────────────────────────────┘
    │
    ├─── Any check fails ──► Fix loop ──► Still failing? STOP
    │
    ▼
┌─────────────────────────────────┐
│ If E2E = deferred:              │
│ Queue for PRD completion        │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│ Show completion prompt          │
│ [E] Write E2E  [C] Commit       │
│ [N] Next story                  │
└─────────────────────────────────┘
    │
    ▼
Next story (or PRD completion)
```

**After ALL stories complete:**

1. **Run all deferred E2E tests** — Everything queued during story execution
2. **If E2E tests fail:**
   - Run @developer to fix
   - Re-run (up to 3 attempts)
   - If still failing → STOP, report to user
3. **Clear E2E queue** — Remove `deferredTo` flag, mark as passed

---

## Ad-hoc Mode Test Flow — Standalone (US-004)

**After each ad-hoc task completes, run the mandatory per-task quality checks** (see "Per-Task Quality Checks" above).

This is the same flow used in PRD mode:
1. Typecheck
2. Lint
3. Auto-generate and run unit tests
4. Critic review

Then show the completion prompt with E2E/Commit/Next options.

### Ad-hoc Task Completion Flow

```
Task complete
    │
    ▼
┌─────────────────────────────────┐
│ MANDATORY: Per-Task Quality     │
│ Checks (typecheck, lint, unit   │
│ tests, critic)                  │
└─────────────────────────────────┘
    │
    ├─── Any check fails ──► Fix loop ──► Still failing? STOP
    │
    ▼
┌─────────────────────────────────┐
│ Show completion prompt          │
│ [E] Write E2E  [C] Commit       │
│ [N] Next task                   │
└─────────────────────────────────┘
```

### Context Block for @tester

When running @tester for unit test generation, pass context:

```yaml
<context>
version: 1
project:
  path: {project path}
  stack: {stack}
  commands:
    test: {test command}
conventions:
  summary: |
    {conventions summary}
  fullPath: {path}/docs/CONVENTIONS.md
</context>

Generate unit tests for these changed files: [file list]
Mode: adhoc
```

---

## Ad-hoc Mode Test Flow — During PRD (US-005)

**Same per-task checks apply.** The only difference is the E2E prompt offers a deferral option.

After mandatory checks pass, show:

```
═══════════════════════════════════════════════════════════════════════
                          TASK COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ [Task description]

Quality checks:
  ✅ Typecheck: passed
  ✅ Lint: passed
  ✅ Unit tests: [N] generated, all passing
  ✅ Critic: no issues

⚠️  Active PRD: [prd-name] ([current-story])

Options:
  [E] Write E2E tests (can defer to PRD completion)
  [C] Commit this change
  [N] Next task (add more work)
  [R] Return to PRD work

> _
═══════════════════════════════════════════════════════════════════════
```

### E2E Deferral (When User Chooses "E" During PRD)

After generating E2E tests, show:

```
📝 E2E tests generated:
   • e2e/[test-name].spec.ts

Options:
   [R] Run E2E tests now (then return to PRD)
   [D] Defer to PRD completion (run with PRD's E2E tests)
   [S] Save for later (queue without deferring)
```

| Choice | Action |
|--------|--------|
| **R** | Start dev server, run tests, commit ad-hoc work, return to PRD |
| **D** | Add to PRD's deferred queue (`deferredTo: "prd-completion"`), return to PRD |
| **S** | Queue tests, return to task prompt |

---

## Fix Loop Algorithm

The retry loop for fixing test failures:

> ⚠️ **Always pass context block to @developer in fix loops.**
> Without context, @developer makes bad assumptions and the fix loop fails.

```
MAX_ATTEMPTS = 3
attempt = 1
lastFailure = null

while attempt <= MAX_ATTEMPTS:
    Run all verification steps
    
    if ALL pass:
        Continue to next phase
    
    if any step fails:
        currentFailure = identify what failed
        
        if currentFailure == lastFailure:
            # Same failure twice in a row — not making progress
            STOP and report to user (see Failure Reporting below)
        
        lastFailure = currentFailure
        
        Report: "Attempt {attempt}/{MAX_ATTEMPTS}: {failure description}"
        Report: "Running @developer to fix..."
        
        Run @developer with context block:
            <context>
            version: 1
            project:
              path: {project path}
              stack: {stack}
              commands:
                test: {test command}
            conventions:
              summary: |
                {conventions summary}
              fullPath: {path}/docs/CONVENTIONS.md
            currentWork:
              mode: fix-loop
              attempt: {attempt}
              failure: {what failed}
            </context>
            
            Fix these failures:
            - What failed: {test names, lint errors, type errors}
            - Error messages: {stack traces}
            - Files involved: {file list}
        
        attempt += 1

# If loop exhausts without success:
STOP and report to user
```

---

## Failure Reporting

After 3 failed attempts (or same failure twice), show failure details and options:

```
═══════════════════════════════════════════════════════════════════════
                      ❌ VERIFICATION FAILED
═══════════════════════════════════════════════════════════════════════

Checks failed after 3 fix attempts:

  ❌ Typecheck: 2 errors in SubmitButton.tsx
     - Property 'loading' does not exist on type 'Props'
     - Cannot find module './spinner.css'

Options:
  1. Review and fix manually, then type "verify" again
  2. Type "skip [activity]" to bypass this check (if allowed)
  3. Type "abort" to discard all changes

> _
═══════════════════════════════════════════════════════════════════════
```

### Bypass Restrictions

Some activities cannot be bypassed — they always block until fixed:

| Activity | Can Skip? | Rationale |
|----------|-----------|-----------|
| `typecheck` | ❌ Never | Broken types = broken code |
| `lint` | ✅ Yes | Style issues don't break runtime |
| `unit-test` | ✅ Yes | User accepts risk |
| `critic` | ✅ Yes | Suggestions, not blockers |
| `e2e-playwright` | ⚠️ Depends | See below |

**E2E bypass rules:**
- Activities triggered by `immediate` signals (auth, payment, API, middleware) → Cannot skip
- Activities triggered by `deferred` signals (component styling, hooks) → Can skip with warning
- Activities in `project.json` → `testing.neverSkip[]` → Cannot skip

**For story blocking (PRD mode):**

```
❌ STORY BLOCKED: Unit tests failing after 3 fix attempts

Story: US-003 - Add print preview modal

Failing tests:
  • PrintPreview.test.tsx: Expected modal to be visible
  • usePreview.test.ts: Hook returned undefined

Options:
  1. Review and fix manually, then type "retry"
  2. Type "skip unit-test" to bypass (adds to test-debt.json)
  3. Abort PRD

> _
```

When a user skips a test, record it in `test-debt.json` so future changes to that file get escalated testing (hotspot behavior).

---

## State Updates During Test Flow

After each test operation, update `builder-state.json`:

**When generating tests:**
```json
{
  "pendingTests": {
    "unit": {
      "generated": ["src/__tests__/Component.test.tsx"],
      "status": "pending"
    },
    "e2e": {
      "generated": ["e2e/feature.spec.ts"],
      "status": "pending",
      "deferredTo": "prd-completion"  // only if deferred
    }
  }
}
```

**When running tests:**
```json
{
  "pendingTests": {
    "unit": {
      "generated": ["src/__tests__/Component.test.tsx"],
      "status": "passed",        // or "failed"
      "lastRunAt": "ISO8601",
      "failureCount": 0          // increments on each failure
    }
  }
}
```

**When E2E tests are deferred:**
```json
{
  "pendingTests": {
    "e2e": {
      "generated": ["e2e/feature.spec.ts", "e2e/adhoc.spec.ts"],
      "status": "pending",
      "deferredTo": "prd-completion"
    }
  }
}
```

---

## Running E2E Tests

When running E2E tests (either immediately or at PRD completion):

### Runtime Preference Prompt (Required)

Before executing E2E, ask for runtime breadth:

1. Browser scope:
   - `chromium-only` (default)
   - `all-major` (`chromium+firefox+webkit`)
2. Device scope:
   - `desktop-only` (default)
   - `desktop+mobile`

If user selects non-default breadth, include a brief runtime impact warning.

Record selected values in `builder-state.json` under `pendingTests.e2e.preferences`.

### Auth Mode Policy (Required for Auth-Enabled Projects)

If authentication is enabled in project capabilities:

1. Default to real-user auth E2E flows (seeded accounts + real sign-in path).
2. Do not silently fall back to demo/adaptive assertions.
3. If required credentials/secrets are missing:
   - output a setup checklist
   - mark the run as blocked by test setup debt
   - persist debt under `builder-state.json` (`pendingTests.e2e.authSetupDebt[]`)

Setup checklist should include at minimum:
- required env vars/secrets
- seeded account identifiers/roles
- command to seed/reset test auth fixtures

1. **Verify dev server is running** — Builder starts it at session startup. If somehow stopped, restart it (see Dev Server Management in builder.md)
2. **Run all queued E2E tests:**
   ```bash
   npx playwright test [list of test files]
   ```
3. **Handle failures** with the fix loop above
4. **Update state** — Mark as passed or track failure count

### Playwright Matrix Guidance

Generated/maintained `playwright.config.*` should support:

- Chromium, Firefox, WebKit projects
- At least one mobile project (for example iPhone)

Keep defaults fast (`chromium-only`, desktop), while making policy-driven expansion straightforward.

---

## Full-Site Visual Audit Flow

Run this flow after substantial UI/content changes, before final sign-off, or when requested by user/project policy.

### Trigger Conditions

- Multiple user-facing pages changed in one batch/PRD
- Changes to navigation, docs/help pages, diagrams, or marketing/support content
- Explicit request to run a visual or UX coherence sweep

### Required Checks

For each audited route/state, test both desktop and mobile (include at least one narrow mobile width).

1. Diagram/flow coherence
   - Arrow direction and sequencing are unambiguous
   - Actor/system labels are correct and readable

2. Navigation behavior
   - Mobile hamburger opens/closes correctly
   - Overlay/backdrop layering does not block intended interactions
   - Links/buttons remain usable across breakpoints

3. Code-block usability
   - Copy button is visible and tappable on mobile
   - Long lines do not clip or overflow without horizontal access

4. Short-page spacing quality
   - Sparse pages avoid oversized empty gaps
   - Vertical rhythm remains intentional on desktop and mobile

### Findings Output Contract

Return a structured report grouped by severity (`critical`, `high`, `medium`, `low`).
Each finding must include page URL/path, user impact, and a concrete fix recommendation.

### Temporary Artifact Guidance

When scripts/screenshots are needed for visual audit capture:
- Keep temporary assets under project-local `.tmp/` (for example `.tmp/visual-audit/`)
- Do not create ad-hoc JS files in tracked source/test directories
- Clean up non-required temporary files after capture

### Post-Fix Re-Verification

After fixes are implemented, run a targeted re-check pass on affected pages/screenshots only:
- Re-test each prior finding at the same viewport(s)
- Mark each as resolved or still failing
- Block sign-off if unresolved `critical` issues remain

---

## Quality Checks (Optional, US-008)

If `project.json → testing.qualityChecks: true`:

After E2E tests pass, run @quality-critic:

```
Run @quality-critic with:
  devServerUrl: http://localhost:{devPort}  # Get devPort from ~/.config/opencode/projects.json
  changedFiles: [files changed in this PRD/session]
  mode: comprehensive  // for PRD completion
        // or "quick" for ad-hoc
```

**Quality checks include:**
- Accessibility (axe-core) — WCAG 2.1 AA compliance
- Layout Shift (CLS) — cumulative layout shift detection
- Visual Regression — screenshot comparison with baselines
- Performance — FCP, LCP, TTI metrics

**Handle results:**
- No critical issues → Continue
- Critical issues → Show prompt with [F]ix / [S]kip options
