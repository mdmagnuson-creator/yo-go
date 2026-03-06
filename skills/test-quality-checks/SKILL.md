---
name: test-quality-checks
description: "Per-task quality checks and completion prompts. Use when running mandatory quality checks after task completion or handling the completion prompt flow. Triggers on: quality checks, task complete, completion prompt, typecheck, lint, unit tests."
---

# Test Quality Checks

> Load this skill when: running per-task quality checks, handling task completion prompts, or managing quality critic integration.

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
| 3 | **Unit Tests** | Resolved testers | Yes, max 3 attempts |
| 3.5 | **Rebuild/Relaunch** | `postChangeWorkflow` steps (or auto-inferred from `apps[]`) | Yes, max 3 attempts |
| 4 | **Critics** | Resolved from patterns | Report findings, @developer fixes |
| 5 | **E2E / Playwright** | `postChangeWorkflow` Playwright step, or `immediate` from activity resolution | Yes, max 5 attempts (see retry strategy) |
| 6 | **Quality** | Resolved quality critics | Report findings |

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
    └─── FAIL ──► Fix loop (max 3) ──► Still failing? STOP
    │
    ▼
┌─────────────────────┐
│ 2. Lint             │
└─────────────────────┘
    │
    ├─── PASS ──► Continue
    └─── FAIL ──► Fix loop (max 3) ──► Still failing? STOP
    │
    ▼
┌─────────────────────┐
│ 3. Unit tests       │
│ (resolved testers)  │
└─────────────────────┘
    │
    ├─── PASS ──► Continue
    └─── FAIL ──► Fix loop (max 3) ──► Still failing? STOP
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3.5. Rebuild/Relaunch (postChangeWorkflow or architecture-aware)     │
│                                                                     │
│ If postChangeWorkflow exists → execute non-Playwright steps          │
│   (typecheck, lint, test, build, relaunch — per step order)          │
│                                                                     │
│ If no postChangeWorkflow, check apps[] in project.json:              │
│   • No apps[] or web-only → Skip (HMR handles it)                  │
│   • Desktop + bundled/hybrid → Build + relaunch Electron            │
│   • Desktop + remote → Ensure Electron running (no rebuild)         │
│                                                                     │
│ CRITICAL: Desktop → always Playwright-Electron, never browser       │
└─────────────────────────────────────────────────────────────────────┘
    │
    ├─── PASS (or skipped) ──► Continue
    └─── FAIL ──► Fix loop (max 3) ──► Still failing? STOP
    │
    ▼
┌─────────────────────┐
│ 4. Critics          │
│ (resolved critics)  │
└─────────────────────┘
    │
    ├─── No issues ──► Continue
    └─── Issues found ──► @developer fixes ──► Re-run critic
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. E2E / Playwright                                                  │
│                                                                     │
│ For UI projects (postChangeWorkflow has Playwright, or               │
│ apps.*.testing.framework has Playwright, or apps.*.type is           │
│ frontend/desktop):                                                   │
│   - Run scoped Playwright tests (changed files + 1-hop consumers)   │
│   - Use authentication config for login flows                        │
│   - Use apps.*.testing for framework details                         │
│   - On failure: retry up to 5 times with fix attempts               │
│   - After 5 failures: skip and log full detail, continue            │
│                                                                     │
│ For non-UI projects: run E2E only if resolved as `immediate`        │
│   - @e2e-reviewer identifies areas + finds dependents               │
│   - @e2e-playwright writes and runs tests                           │
└─────────────────────────────────────────────────────────────────────┘
    │
    ├─── PASS (or deferred/skip) ──► Continue
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

---

## Completion Prompt

After all checks pass:

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
| **E** | Run @playwright-dev to generate E2E tests |
| **C** | Commit the changes |
| **N** | Return to task prompt |

### E2E Sub-flow (When User Chooses "E")

1. Run @playwright-dev to generate E2E tests
2. Show prompt:
   ```
   📝 E2E tests generated:
      • e2e/[test-name].spec.ts
   
   [R] Run E2E tests now
   [S] Save for later (queue tests, return to task prompt)
   ```
3. If "R": Start dev server if needed, run tests, handle failures
4. If "S": Queue tests in `builder-state.json`

---

## Ad-hoc During PRD Completion Prompt

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

---

## Failure Reporting

After 3 failed attempts:

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

| Activity | Can Skip? | Rationale |
|----------|-----------|-----------|
| `typecheck` | ❌ Never | Broken types = broken code |
| `lint` | ✅ Yes | Style issues don't break runtime |
| `unit-test` | ✅ Yes | User accepts risk |
| `critic` | ✅ Yes | Suggestions, not blockers |
| `e2e-playwright` | ⚠️ Depends | See E2E bypass rules |

**E2E bypass rules:**
- Activities triggered by `immediate` signals → Cannot skip
- Activities triggered by `deferred` signals → Can skip with warning
- Activities in `testing.neverSkip[]` → Cannot skip

---

## Quality Checks (Optional)

If `project.json → testing.qualityChecks: true`:

After E2E tests pass, run @quality-critic:

```
Run @quality-critic with:
  devServerUrl: http://localhost:{devPort}
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

---

## Full-Site Visual Audit Flow

Run after substantial UI/content changes:

### Trigger Conditions

- Multiple user-facing pages changed in one batch/PRD
- Changes to navigation, docs/help pages, diagrams
- Explicit request for visual/UX coherence sweep

### Required Checks

For each audited route/state, test both desktop and mobile:

1. **Diagram/flow coherence** — Arrow direction, sequencing, labels
2. **Navigation behavior** — Mobile hamburger, overlay layering
3. **Code-block usability** — Copy button, long line handling
4. **Short-page spacing quality** — Avoid oversized empty gaps

### Findings Output Contract

Return structured report grouped by severity (`critical`, `high`, `medium`, `low`).
Each finding includes page URL, user impact, and fix recommendation.

### Post-Fix Re-Verification

After fixes:
- Re-test each prior finding at the same viewport(s)
- Mark each as resolved or still failing
- Block sign-off if unresolved `critical` issues remain

---

## Verification Contract Integration

When `builder-state.json` contains a `verificationContract`, use it to guide verification:

### Contract Criteria to Activity Mapping

| Contract Criterion | Test Activity | Execution |
|--------------------|---------------|-----------|
| `activity: "typecheck"` | Baseline typecheck | `npm run typecheck` |
| `activity: "lint"` | Baseline lint | `npm run lint` |
| `activity: "unit-test"` | Unit test generation + run | @tester → `npm test` |
| `activity: "e2e"` | E2E test generation + run | @e2e-playwright |
| `activity: "critic"` | Code review | @critic |

### Recording Verification Results

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

### Contract Types

| Contract Type | Verification Behavior |
|---------------|----------------------|
| `verifiable` | Run all criteria, all must pass |
| `advisory` | Skip automated verification, log for review |
| `skip` | Run only typecheck + lint |
