---
name: test-flow
description: "Automatic test generation and execution flows for Builder. Use when generating unit/E2E tests, handling test failures, or managing E2E deferral. Triggers on: generate tests, run tests, test failures, E2E deferral, test flow."
---

# Test Flow

> Load this skill when: generating tests, running test suites, handling test failures, managing E2E deferral.

## Overview

Builder automatically generates and runs tests based on the mode and context. This skill defines the exact behavior for all test flows.

---

## Per-Task Quality Checks (MANDATORY)

> ⛔ **After EVERY task/story completes, run these four checks automatically. No prompts, no skipping.**
>
> This applies to BOTH ad-hoc mode AND PRD mode. Quality checks are not optional.

### The Four Checks

After @developer completes a task, run these in order:

| Step | Check | Command | Fix Loop |
|------|-------|---------|----------|
| 1 | **Typecheck** | `npm run typecheck` (or project equivalent) | Yes, max 3 attempts |
| 2 | **Lint** | `npm run lint` (or project equivalent) | Yes, max 3 attempts |
| 3 | **Unit Tests** | Auto-generate with @tester, then run | Yes, max 3 attempts |
| 4 | **Critic** | Run @critic for code review | Report findings, @developer fixes |

### Flow Diagram

```
Task/Story complete
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
│ 3. Generate & run   │
│    unit tests       │
└─────────────────────┘
    │
    ├─── PASS ──► Continue
    │
    └─── FAIL ──► Fix loop (max 3) ──► Still failing? STOP
    │
    ▼
┌─────────────────────┐
│ 4. Critic review    │
└─────────────────────┘
    │
    ├─── No issues ──► Continue
    │
    └─── Issues found ──► @developer fixes ──► Re-run critic
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

## Test Flow Configuration

Rigor profiles control **additional** behavior beyond the mandatory per-task checks. The four checks above always run; rigor profiles add E2E generation, quality checks, etc.

> ⚠️ **Rigor profiles do NOT disable the mandatory per-task checks.**
> Even `rapid` profile runs typecheck, lint, unit tests, and critic after each task.
> Rigor profiles control: auto E2E generation, quality checks, and failure bypass options.

### PRD Mode Rigor Configuration

Resolve testing rigor in this order (highest priority first):

1. `builder-state.json` -> `activePrd.testingRigor` (selected at PRD start)
2. `docs/project.json` -> `testing.rigorProfile`
3. Fallback: `standard`

Rigor profile controls baseline behavior for the active PRD:

| Profile | baselineAutoGenerate | criticMode | qualityChecks | Policy |
|---|---|---|---|---|
| `rapid` | `false` | `fast` | `false` | Speed-first |
| `standard` | `true` | `balanced` | `false` | Balanced default |
| `strict` | `true` | `strict` | `true` | High confidence |
| `compliance` | `true` | `strict` | `true` | No bypass on failing checks |

Project-level defaults still live in `docs/project.json`:

```json
{
  "testing": {
    "rigorProfile": "standard",
    "autoGenerate": true,    // default: true - auto-generate tests for changed files
    "qualityChecks": false   // default: false - run visual/a11y/performance checks
  }
}
```

Per-story assessment policy comes from `project.json` -> `testing.storyAssessment`:

```json
{
  "testing": {
    "storyAssessment": {
      "source": "hybrid",
      "allowDowngrade": false
    }
  }
}
```

Story intensity levels:

| Intensity | Per-story behavior |
|---|---|
| `low` | Skip auto-generation unless rigor is `strict` or `compliance` |
| `medium` | Generate and run unit tests per story; defer E2E generation |
| `high` | Generate and run unit tests per story; generate and queue E2E |
| `critical` | Same as high plus force quality checks and strict failure handling |

In `hybrid` mode, Builder uses planner-assigned `testIntensity` as baseline and may escalate from runtime signals.

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
3. Auto-generate and run unit tests
4. Critic review

### Additional PRD-Specific Behavior

After the mandatory checks pass, PRD mode adds E2E handling based on story intensity:

| Story Intensity | E2E Behavior |
|-----------------|--------------|
| `low` | No automatic E2E generation |
| `medium` | No automatic E2E generation (user can request) |
| `high` | Auto-generate E2E tests, queue for PRD completion |
| `critical` | Auto-generate E2E tests, queue for PRD completion |

### PRD Story Completion Flow

```
Story complete
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
│ If high/critical intensity:     │
│ Auto-generate E2E tests         │
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

### Story Intensity Resolution

Resolve effective per-story behavior from:
1. Active story intensity (`builder-state.json` -> `activePrd.storyAssessments[storyId].effective`)
2. Active PRD rigor profile

Per-story assessment policy comes from `project.json` -> `testing.storyAssessment`:
- `source`: `planner` | `builder` | `hybrid` (default: `hybrid`)
- `allowDowngrade`: whether Builder can downgrade planner's intensity (default: `false`)

**After ALL stories complete:**

1. **Run queued E2E tests** — All tests in `pendingTests.e2e.generated[]` (if any)
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

After 3 failed attempts (or same failure twice):

If effective rigor profile is `compliance`, remove any bypass option (`ship anyway`, `skip tests`) and require fix-or-abort.

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
  2. Type "ship anyway" to force ship without passing checks
  3. Type "abort" to discard all changes

> _
═══════════════════════════════════════════════════════════════════════
```

**For story blocking (PRD mode):**

In `compliance` mode, replace option 2 with "Continue fixing" and do not allow skipping story tests.

```
❌ STORY BLOCKED: Unit tests failing after 3 fix attempts

Story: US-003 - Add print preview modal

Failing tests:
  • PrintPreview.test.tsx: Expected modal to be visible
  • usePreview.test.ts: Hook returned undefined

Options:
  1. Review and fix manually, then type "retry"
  2. Skip tests and continue (not recommended)
  3. Abort PRD

> _
```

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
