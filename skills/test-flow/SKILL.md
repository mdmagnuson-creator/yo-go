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

## UI Verification (Playwright Required Mode)

> 🎯 **For UI projects, Playwright browser verification is MANDATORY for UI changes.**
>
> When `project.json → agents.verification.mode` is `playwright-required`:
> - All UI changes must be visually verified in a browser before task completion
> - Verification generates reusable test scripts in `tests/ui-verify/`
> - Screenshots are captured for visual confirmation
>
> This applies to BOTH ad-hoc mode AND PRD mode.

### Configuration

Read verification settings from `project.json`:

```json
{
  "agents": {
    "workingDir": "ai-tmp",
    "verification": {
      "mode": "playwright-required",  // or "no-ui" for backends/CLIs
      "selectorStrategy": "strict",   // or "flexible"
      "testDir": "tests/ui-verify",
      "screenshotDir": "ai-tmp/verification/screenshots",
      "reviewGeneratedTests": true
    }
  }
}
```

| Setting | Values | Description |
|---------|--------|-------------|
| `mode` | `playwright-required` / `no-ui` | Whether UI verification is mandatory |
| `selectorStrategy` | `strict` / `flexible` | `strict` requires data-testid attributes |
| `testDir` | path | Where to save generated verification tests |
| `screenshotDir` | path | Where to save verification screenshots (gitignored) |
| `reviewGeneratedTests` | boolean | Whether @quality-critic reviews generated tests |

### Verification Status Returns

After running verification activities, return a structured status:

```typescript
interface VerificationResult {
  status: "verified" | "unverified" | "skipped" | "not-required";
  reason: string;
  details: {
    testsGenerated?: string[];     // paths to generated test files
    screenshotsCaptured?: string[]; // paths to screenshots
    testsPassed?: boolean;
    attemptCount?: number;
    errors?: string[];
  };
}
```

**Status meanings:**

| Status | When | Task Can Complete? |
|--------|------|-------------------|
| `verified` | UI change verified via Playwright, tests pass | ✅ Yes |
| `unverified` | UI change not yet verified | ❌ No (blocked) |
| `skipped` | User explicitly skipped verification (with warning) | ⚠️ Yes (with debt) |
| `not-required` | No UI changes, or mode is `no-ui` | ✅ Yes |

### Verification Flow

```
Task complete (file changes detected)
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: Check if UI verification required                           │
│                                                                     │
│ Read project.json → agents.verification.mode                        │
│   • "playwright-required" → Continue to Step 2                      │
│   • "no-ui" → Return { status: "not-required" }                     │
│                                                                     │
│ Check changed files:                                                │
│   • UI files (*.tsx, *.jsx, *.vue, etc.) → Continue to Step 2      │
│   • Non-UI files only → Return { status: "not-required" }           │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: Generate verification test                                   │
│                                                                     │
│ Run @e2e-playwright with mode: "verification"                       │
│   • Generates test in testDir (e.g., tests/ui-verify/[name].spec.ts)│
│   • If selectorStrategy: "strict", adds data-testid to components  │
│   • Test includes rich documentation header                         │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3: Run verification test                                       │
│                                                                     │
│ Start dev server if needed                                          │
│ Execute: npx playwright test <generated-test>                       │
│ Capture screenshot to screenshotDir                                 │
└─────────────────────────────────────────────────────────────────────┘
    │
    ├─── PASS ──► Return { status: "verified", details: {...} }
    │
    └─── FAIL ──► Fix loop (max 3 attempts)
                      │
                      ├─── Eventually passes ──► Return { status: "verified" }
                      │
                      └─── Still failing ──► Return { status: "unverified" }
                                              │
                                              ▼
                                    ┌─────────────────────────┐
                                    │ User prompt:            │
                                    │ [F] Fix manually       │
                                    │ [S] Skip (adds debt)   │
                                    │ [A] Abort              │
                                    └─────────────────────────┘
```

### Verification Test Format

Generated verification tests include rich documentation headers that enable **prerequisite failure detection**:

```typescript
/**
 * @verification-test
 * @component PaymentForm
 * @location src/components/PaymentForm.tsx
 * @reach /checkout → click "Proceed to Payment"
 * 
 * @prerequisites
 *   - User must be logged in
 *   - Checkout page must load successfully
 *   - Payment option must be available
 * 
 * @feature-assertions
 *   - Form renders with all required fields
 *   - Card number field accepts valid input
 *   - Submit button is disabled until form is valid
 *   - Error states display correctly
 * 
 * @success-criteria
 *   - Form renders with all required fields
 *   - Card number field accepts valid input
 *   - Submit button is disabled until form is valid
 *   - Error states display correctly
 * @generated-at 2026-03-03T10:30:00Z
 */
import { test, expect } from '@playwright/test';

test.describe('PaymentForm verification', () => {
  test('renders and accepts valid input', async ({ page }) => {
    // ═══════════════════════════════════════════════════════════════
    // PREREQUISITES — Failures here indicate a separate blocking issue
    // ═══════════════════════════════════════════════════════════════
    await page.goto('/checkout');
    await page.click('text=Proceed to Payment');
    
    // ═══════════════════════════════════════════════════════════════
    // FEATURE ASSERTIONS — Failures here indicate feature issues
    // ═══════════════════════════════════════════════════════════════
    
    // Verify form renders
    await expect(page.locator('[data-testid="payment-form"]')).toBeVisible();
    
    // Verify fields exist
    await expect(page.locator('[data-testid="card-number"]')).toBeVisible();
    await expect(page.locator('[data-testid="card-expiry"]')).toBeVisible();
    
    // Screenshot for visual confirmation
    await page.screenshot({ path: 'ai-tmp/verification/screenshots/payment-form.png' });
  });
});
```

### Selector Strategy Enforcement

When `selectorStrategy: "strict"`:

1. **Before generating verification test**, @e2e-playwright checks for `data-testid` attributes
2. **If missing**, @e2e-playwright:
   - Identifies components that need test IDs
   - Adds `data-testid` attributes to the source code
   - Commits the changes: "chore: add data-testid attributes for e2e testing"
3. **Then generates test** using the `data-testid` selectors

When `selectorStrategy: "flexible"`:
- Tests may use role-based selectors, text content, or test IDs
- No requirement to add `data-testid` attributes

### Integration with Workflows

**Ad-hoc workflow** must check verification status before task completion:

```
if verificationResult.status == "unverified":
    BLOCK task completion
    Show verification required prompt
    
if verificationResult.status == "skipped":
    WARN user
    Log to test-debt.json
    Allow completion with debt
```

**PRD workflow** must check verification status before story completion:

```
if verificationResult.status == "unverified":
    BLOCK story completion
    Show verification required prompt
    Story remains in_progress
```

### Recording Verification Results

After verification, update `builder-state.json`:

```json
{
  "currentTask": {
    "id": "task-123",
    "verificationStatus": "verified",
    "verificationDetails": {
      "testsGenerated": ["tests/ui-verify/payment-form.spec.ts"],
      "screenshotsCaptured": ["ai-tmp/verification/screenshots/payment-form.png"],
      "testsPassed": true,
      "attemptCount": 1,
      "completedAt": "2026-03-03T10:35:00Z"
    }
  }
}
```

### Skipping Verification (Escape Hatch)

Users can explicitly skip verification with `skip verification` command:

```
User: "skip verification"

⚠️ SKIPPING UI VERIFICATION

This will:
- Mark task as complete WITHOUT browser verification
- Add this file to test-debt.json for escalated future testing
- Log the skip reason

Are you sure? [Y/N]
```

If user confirms:
1. Return `{ status: "skipped", reason: "User requested skip" }`
2. Add changed UI files to `test-debt.json` with `"skipReason": "verification skipped"`
3. Allow task completion with warning banner

### Flaky Test Detection

When running verification tests or E2E tests, detect and handle flaky tests:

#### Detection Criteria

A test is **flaky** when it:
- Passes on some runs but fails on others (intermittent)
- Fails with timing-related errors (timeouts, race conditions)
- Fails with non-deterministic assertion failures

**Detection method:** Run the test multiple times when a failure occurs:

```
Test fails on first run
    │
    ▼
Re-run the SAME test 2 more times
    │
    ├─── All 3 fail consistently ──► NOT flaky (genuine failure)
    │
    └─── Mixed results (e.g., 1/3 or 2/3 pass) ──► FLAKY
```

#### Flakiness Response

When a flaky test is detected:

```
⚠️ FLAKY TEST DETECTED

Test: payment-form.spec.ts → "renders and accepts valid input"
Results: 1/3 passes (66% failure rate)

Failure pattern:
- Run 1: FAIL — Timeout waiting for selector '[data-testid="submit-btn"]'
- Run 2: PASS
- Run 3: FAIL — Timeout waiting for selector '[data-testid="submit-btn"]'

Analysis: Likely timing issue — element takes variable time to render

Action: Escalating to @e2e-playwright for fix...
```

#### Escalation Logic

Analyze the failure pattern to determine the right fix agent:

| Failure Pattern | Analysis | Delegate To |
|-----------------|----------|-------------|
| Timeout waiting for selector | Timing/animation issue | @e2e-playwright |
| Element not visible | Race condition, render timing | @e2e-playwright |
| Text content mismatch | Dynamic content, async data | @developer |
| Network request timing | API response variability | @developer |
| State not ready | Component lifecycle issue | @developer |

**Escalation prompt format:**

```
@e2e-playwright (or @developer):

Fix flaky test: tests/ui-verify/payment-form.spec.ts

Failure pattern:
- Test passes 1/3 times
- Timeout on '[data-testid="submit-btn"]' in 2/3 runs

Root cause hypothesis:
- Button renders after async operation completes
- Current wait is insufficient

Required fix:
- Add explicit wait for async operation
- Or use auto-retrying assertion with appropriate timeout

After fix, verify stability with 3 consecutive passes (see "Verification After Fix" below).
```

#### Verification After Fix

After the delegate agent fixes the flaky test:

1. **Re-run the test 3 times consecutively**
2. **All 3 must pass** to consider the fix successful
3. **If still flaky**, escalate to user:

```
❌ FLAKY TEST NOT RESOLVED

Test still fails intermittently after fix attempt:
- Run 1: PASS
- Run 2: FAIL
- Run 3: PASS

Options:
  [F] Try another fix approach
  [M] Fix manually, then type "retry"
  [S] Skip test (adds to test-debt.json with flaky=true)
  [Q] Quarantine test (moves to tests/quarantine/)
```

#### Quarantine Option

For persistently flaky tests that can't be immediately fixed:

1. Move test file to `tests/quarantine/`
2. Add entry to `test-debt.json`:
   ```json
   {
     "quarantined": [
       {
         "file": "payment-form.spec.ts",
         "reason": "Intermittent timeout on submit button",
         "quarantinedAt": "2026-03-03T10:30:00Z",
         "failureRate": "66%",
         "reviewBy": "2026-03-10"
       }
     ]
   }
   ```
3. Quarantined tests are excluded from CI but tracked for follow-up
4. Review deadline is 7 days from quarantine

#### Flaky Test Metrics

Track flakiness in `builder-state.json`:

```json
{
  "testMetrics": {
    "flakyTestsDetected": 3,
    "flakyTestsFixed": 2,
    "flakyTestsQuarantined": 1,
    "lastFlakyTest": {
      "file": "payment-form.spec.ts",
      "detectedAt": "2026-03-03T10:30:00Z",
      "resolution": "fixed"
    }
  }
}
```

---

## Prerequisite Failure Detection

> 🎯 **Distinguish prerequisite failures from feature failures.**
>
> When a test fails, analyze WHERE it failed to determine the appropriate fix action.
> A login failure blocking a menu test is a different problem than a missing menu item.

### Failure Classification Algorithm

```
Test failure occurs
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: Parse test file for markers                                  │
│                                                                     │
│ Extract from JSDoc header:                                          │
│   • @prerequisites — Steps that must succeed before feature test    │
│   • @feature-assertions — The actual feature under test             │
│                                                                     │
│ If markers missing, use heuristic detection (Step 1b)               │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: Analyze failure location                                     │
│                                                                     │
│ Parse Playwright error output:                                       │
│   • Extract line number of failure                                   │
│   • Extract selector or assertion that failed                        │
│   • Compare against @prerequisites vs @feature-assertions            │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3: Classify failure                                             │
│                                                                     │
│ ├─── Failure in prerequisite step ──► PREREQUISITE FAILURE          │
│ │    (e.g., login failed, page didn't load)                         │
│ │                                                                   │
│ ├─── Failure in feature assertion ──► FEATURE FAILURE               │
│ │    (e.g., button not found, wrong text)                           │
│ │                                                                   │
│ ├─── Test syntax error or import ──► TEST_INVALID                   │
│ │    (e.g., SyntaxError, Module not found)                          │
│ │                                                                   │
│ └─── Environment/infrastructure ──► ENVIRONMENT (see next section) │
│      (e.g., port conflict, process conflict)                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Heuristic Detection (Fallback)

When test files lack `@prerequisites`/`@feature-assertions` markers, use these heuristics:

| Failure Pattern | Classification | Confidence |
|-----------------|----------------|------------|
| Login/auth error before feature test | Prerequisite | High |
| `page.goto()` fails with 404/500 | Prerequisite | High |
| `page.goto()` times out | Prerequisite | High |
| Navigation click fails before reaching feature | Prerequisite | Medium |
| Timeout waiting for element in feature component | Feature | High |
| Assertion failed on feature behavior | Feature | High |
| Element not found for feature under test | Feature | High |
| `SyntaxError` in test file | Test Invalid | High |
| `Cannot find module` / `Module not found` | Test Invalid | High |
| Test-specific variable `is not defined` | Test Invalid | High |

**Detection regex patterns:**

```javascript
const PREREQUISITE_PATTERNS = [
  /Error: page\.goto.*(?:404|500|timeout)/i,
  /Error: .*login.*(?:failed|timeout)/i,
  /Error: .*auth.*(?:failed|unauthorized)/i,
  /Timeout.*waiting for.*navigation/i,
  /net::ERR_CONNECTION_REFUSED/i,
  /ECONNREFUSED/i,
];

const TEST_INVALID_PATTERNS = [
  /SyntaxError:/,
  /Cannot find module/,
  /Module not found/,
  /is not defined/,
  /Unexpected token/,
];

const ENVIRONMENT_PATTERNS = [
  /EADDRINUSE/,
  /already running/i,
  /single instance/i,
  /port.*in use/i,
  /EACCES|EPERM|EBUSY/,
];
```

### Prerequisite Failure Detection Output

When a prerequisite failure is detected:

```typescript
interface FailureClassification {
  type: "PREREQUISITE" | "FEATURE" | "TEST_INVALID" | "ENVIRONMENT";
  component: string;           // e.g., "auth-login" or "payment-form"
  error: string;              // Full error message
  failedAt: string;           // Line/selector that failed
  confidence: "high" | "medium" | "low";
  existingTest?: string;      // If a dedicated test exists for this component
  suggestedFix?: {
    agent: "@developer" | "@e2e-playwright";
    description: string;
  };
}
```

**Example classifications:**

```json
// Prerequisite failure
{
  "type": "PREREQUISITE",
  "component": "auth-login",
  "error": "Timeout waiting for '[data-testid=\"login-submit\"]'",
  "failedAt": "page.click('[data-testid=\"login-submit\"]')",
  "confidence": "high",
  "existingTest": "tests/e2e/auth.spec.ts",
  "suggestedFix": {
    "agent": "@developer",
    "description": "Fix login form timeout issue"
  }
}

// Feature failure  
{
  "type": "FEATURE",
  "component": "payment-form",
  "error": "Expected element to be visible",
  "failedAt": "expect(page.locator('[data-testid=\"card-number\"]')).toBeVisible()",
  "confidence": "high",
  "existingTest": null,
  "suggestedFix": {
    "agent": "@developer",
    "description": "Add missing card-number field to PaymentForm"
  }
}

// Test invalid
{
  "type": "TEST_INVALID",
  "component": "payment-form",
  "error": "SyntaxError: Unexpected token '=>'",
  "failedAt": "tests/ui-verify/payment-form.spec.ts:15",
  "confidence": "high",
  "existingTest": null,
  "suggestedFix": {
    "agent": "@e2e-playwright",
    "description": "Fix syntax error in test file"
  }
}
```

### Finding Existing Tests for Prerequisites

When a prerequisite fails, search for existing tests that cover it:

```bash
# Search for tests matching the prerequisite component
PREREQ="auth"  # or "login", "navigation", etc.

# Check common test locations
find tests/ apps/*/e2e/ -name "*.spec.ts" -exec grep -l "@component.*$PREREQ\\|describe.*$PREREQ" {} \;

# Check if there's a dedicated prerequisite test
ls tests/e2e/${PREREQ}*.spec.ts 2>/dev/null
ls apps/web/e2e/${PREREQ}*.spec.ts 2>/dev/null
```

**Test search priority:**

1. Direct match: `tests/e2e/auth.spec.ts` for auth prerequisite
2. Component match: Files containing `@component auth` or `describe('auth'`
3. Keyword match: Files containing the prerequisite keyword in test names

### Integration with Fix Loop

When a prerequisite failure is detected, modify the fix loop behavior:

```
PREREQUISITE FAILURE detected
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: Find existing test for prerequisite                          │
│                                                                     │
│ Search tests/e2e/ for: auth.spec.ts, login.spec.ts, etc.            │
│                                                                     │
│ ├─── FOUND ──► Run that test to confirm issue                       │
│ │                                                                   │
│ └─── NOT FOUND ──► Use error message to guide fix                   │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: Confirm the issue                                            │
│                                                                     │
│ Run the prerequisite test (if found):                                │
│   npx playwright test tests/e2e/auth.spec.ts                        │
│                                                                     │
│ ├─── PASS ──► Prerequisite actually works! Retry original test      │
│ │             (May have been transient)                             │
│ │                                                                   │
│ └─── FAIL ──► Confirmed: prerequisite is broken                     │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3: Fix the prerequisite (see Automated Fix Loop section)        │
│                                                                     │
│ Delegate fix to appropriate agent                                    │
│ After fix, re-run prerequisite test                                  │
│ If pass, retry original feature verification                         │
└─────────────────────────────────────────────────────────────────────┘
```

### Prerequisite Failure Report Format

Show this to the user when a prerequisite failure blocks verification:

```
═══════════════════════════════════════════════════════════════════════
              ⚠️ PREREQUISITE FAILURE DETECTED
═══════════════════════════════════════════════════════════════════════

Feature under test: Add "Settings" option to profile dropdown
Status: NOT TESTED (blocked by prerequisite)

Prerequisite that failed:
  ❌ Login: "Timeout waiting for '[data-testid="login-submit"]'"
  
  This appears to be an auth/login issue, not a problem with your feature.
  Your menu option change was NOT tested.

Classification confidence: HIGH
Existing test found: tests/e2e/auth.spec.ts

Screenshot: ai-tmp/verification/screenshots/login-failure.png

Entering automated fix loop...
═══════════════════════════════════════════════════════════════════════
```

---

## Environment Prerequisite Detection

> 🔧 **Environment prerequisites are infrastructure issues that cannot be fixed by code changes.**
>
> These require running commands, scripts, or using specialized skills — not @developer.

### Environment vs Application Prerequisites

| Type | Examples | Fix Method |
|------|----------|------------|
| **Application** | Login bug, missing element, API error | Code change via @developer |
| **Environment** | Process conflict, port in use, native app bootstrap | Skill-based recovery |

### Environment Prerequisite Categories

| Category | Detection Patterns | Example Skills |
|----------|-------------------|----------------|
| **Process management** | `EADDRINUSE`, `already running`, `single instance` | `electron-testing` |
| **Port/service availability** | `ECONNREFUSED`, `port in use`, connection timeout | `start-dev-server` |
| **Native app bootstrap** | Platform-specific launch errors | `electron-testing`, `tauri-testing` |
| **External services** | HTTP 503, 429, `service unavailable` | N/A (wait or mock) |
| **File system** | `EACCES`, `EBUSY`, `EPERM` | Manual intervention |

### Environment Detection Patterns

```javascript
const ENVIRONMENT_PATTERNS = {
  processConflict: [
    /EADDRINUSE/,
    /already running/i,
    /single instance/i,
    /another instance/i,
    /lock file exists/i,
  ],
  portConflict: [
    /port.*in use/i,
    /ECONNREFUSED/,
    /connection refused/i,
    /net::ERR_CONNECTION_REFUSED/,
  ],
  nativeAppBootstrap: [
    /electron.*failed/i,
    /app launch.*failed/i,
    /cannot connect to.*app/i,
    /BrowserContext.*launch/,
  ],
  externalService: [
    /503 Service Unavailable/,
    /429 Too Many Requests/,
    /rate limit/i,
    /service unavailable/i,
  ],
  fileSystem: [
    /EACCES/,
    /EPERM/,
    /EBUSY/,
    /permission denied/i,
    /file is locked/i,
  ],
};
```

### Environment Fix Flow

```
ENVIRONMENT prerequisite detected
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: Categorize the environment issue                            │
│                                                                     │
│ Match error against ENVIRONMENT_PATTERNS                            │
│ → processConflict, portConflict, nativeAppBootstrap, etc.           │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: Search for matching skill                                    │
│                                                                     │
│ Skill naming convention: {category}-testing                         │
│ Examples: electron-testing, docker-testing, tauri-testing           │
│                                                                     │
│ Search skills/ for:                                                  │
│   • Exact match by category                                         │
│   • Pattern match by detected technology                            │
│                                                                     │
│ ├─── SKILL FOUND ──► Load skill, run recovery procedure (Step 3)    │
│ │                                                                   │
│ └─── NO SKILL ──► Offer skill creation request (see Phase 4)       │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼ (SKILL FOUND)
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3: Execute skill recovery                                       │
│                                                                     │
│ 1. Load skill via skill tool: skill("electron-testing")             │
│ 2. Execute skill's environment recovery steps                       │
│ 3. Retry the original test                                          │
│    ├─── PASS ──► Continue to stability check (3 passes)             │
│    └─── FAIL ──► Classify new failure, continue fix loop            │
└─────────────────────────────────────────────────────────────────────┘
```

### Skill Search Logic

```bash
# Search for skill matching environment category
CATEGORY="electron"  # Detected from error message

# Check if skill exists
ls ~/.config/opencode/skills/${CATEGORY}-testing/SKILL.md 2>/dev/null

# Fallback: Search by keyword
find ~/.config/opencode/skills -name "SKILL.md" -exec grep -l "$CATEGORY" {} \;
```

**Skill mapping examples:**

| Error Pattern | Category | Skill to Load |
|---------------|----------|---------------|
| `EADDRINUSE` + Electron | processConflict | `electron-testing` |
| `ECONNREFUSED` on port 3000 | portConflict | `start-dev-server` |
| Docker container issue | nativeAppBootstrap | `docker-testing` |
| Tauri app launch failed | nativeAppBootstrap | `tauri-testing` |

### External Service Handling

External service failures (503, 429) **cannot be automatically fixed**:

```
═══════════════════════════════════════════════════════════════════════
              ⚠️ EXTERNAL SERVICE UNAVAILABLE
═══════════════════════════════════════════════════════════════════════

The test failed due to an external service issue:
  Service: api.stripe.com
  Error: 503 Service Unavailable

This cannot be automatically fixed. Options:
  [W] Wait and retry in 5 minutes
  [M] Use mock/stub for this service (creates fixture)
  [S] Skip verification
═══════════════════════════════════════════════════════════════════════
```

### Environment Failure Report

```
═══════════════════════════════════════════════════════════════════════
              🔧 ENVIRONMENT PREREQUISITE DETECTED
═══════════════════════════════════════════════════════════════════════

Feature under test: Add "Settings" option to profile dropdown
Status: BLOCKED (environment issue)

Environment issue:
  ❌ Electron: "Error: another instance is already running"
  
  Category: Process conflict
  This is an infrastructure issue, not a code problem.

Matching skill found: electron-testing
Action: Loading skill and attempting recovery...
═══════════════════════════════════════════════════════════════════════
```

---

## 3-Pass Stability Verification

> 🔄 **A single passing test run is not enough. Require 3 consecutive passes to declare verified.**
>
> **Trigger:** After a verification test passes for the first time (or after any fix is applied).
>
> **Why:** Transient issues, timing problems, and flaky behavior are only caught with multiple passes.

### Configuration

In `project.json` → `agents.verification`:

```json
{
  "agents": {
    "verification": {
      "requiredPasses": 3,        // Default: 3 consecutive passes required
      "runBroaderTestsAfterFix": true  // Run related tests after fixing
    }
  }
}
```

### Stability Verification Flow

```
Verification test PASSES
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ INCREMENT PASS COUNTER                                               │
│                                                                     │
│ State: { passCount: 1, requiredPasses: 3 }                           │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ CHECK: passCount >= requiredPasses?                                  │
│                                                                     │
│ ├─── NO ──► Run test again, increment counter, loop                 │
│ │                                                                   │
│ └─── YES ──► ✅ VERIFIED — declare feature stable                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Pass Counter Reset Rules

| Event | Pass Counter Action |
|-------|---------------------|
| Test passes | Increment by 1 |
| Test fails | Reset to 0, enter fix loop |
| Fix applied by @developer | Reset to 0 (require fresh 3 passes) |
| Environment recovery completed | Reset to 0 (require fresh 3 passes) |
| Manual intervention | Reset to 0 (require fresh 3 passes) |

### State Tracking

Track stability verification state in `builder-state.json`:

```json
{
  "verificationLoop": {
    "stabilityCheck": {
      "testPath": "tests/ui-verify/profile-dropdown.spec.ts",
      "feature": "Add Settings option to profile dropdown",
      "requiredPasses": 3,
      "currentPasses": 2,
      "lastPassAt": "2026-03-03T10:45:00Z",
      "resetReason": null
    }
  }
}
```

### Stability Progress Display

Show progress during stability verification:

```
═══════════════════════════════════════════════════════════════════════
              🔄 STABILITY VERIFICATION IN PROGRESS
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Test: tests/ui-verify/profile-dropdown.spec.ts

Stability check: 2/3 passes ██████████████░░░░░░░ 67%

Pass 1: ✅ 10:42:15 (2.3s)
Pass 2: ✅ 10:42:18 (2.1s)
Pass 3: ⏳ Running...
═══════════════════════════════════════════════════════════════════════
```

### Stability Failure (Mid-Stability Fail)

When a test fails during stability verification:

```
═══════════════════════════════════════════════════════════════════════
              ❌ STABILITY CHECK FAILED
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Test: tests/ui-verify/profile-dropdown.spec.ts

Progress: 2/3 passes, then FAILED on pass 3

Error: Timeout waiting for '[data-testid="settings-option"]'

This indicates a flaky test or intermittent issue.
Pass counter reset to 0. Entering fix loop...

───────────────────────────────────────────────────────────────────────
Analyzing failure pattern...
Classification: FEATURE (element timeout in feature assertion section)
═══════════════════════════════════════════════════════════════════════
```

### After Fix — Fresh Passes Required

After any fix is applied (code change, environment recovery, etc.):

```
═══════════════════════════════════════════════════════════════════════
              🔄 FIX APPLIED — RESTARTING STABILITY CHECK
═══════════════════════════════════════════════════════════════════════

Fix: Updated selector timing in ProfileDropdown component
Applied by: @developer

Stability check reset: 0/3 passes (fresh verification required)
Running pass 1...
═══════════════════════════════════════════════════════════════════════
```

### Stability Verified

When all passes complete:

```
═══════════════════════════════════════════════════════════════════════
              ✅ FEATURE VERIFIED (STABLE)
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Test: tests/ui-verify/profile-dropdown.spec.ts

Stability check: 3/3 passes ████████████████████ 100%

Pass 1: ✅ 10:42:15 (2.3s)
Pass 2: ✅ 10:42:18 (2.1s)
Pass 3: ✅ 10:42:21 (2.2s)

Feature is stable and verified.
═══════════════════════════════════════════════════════════════════════
```

---

## Automated Fix Loop

> 🔄 **When verification tests fail, automatically classify and fix the issue.**
>
> **Trigger:** Verification test fails (during initial run or stability check).
>
> **Why:** Automated fixing reduces manual intervention and ensures systematic issue resolution.

### Configuration

In `project.json` → `agents.verification`:

```json
{
  "agents": {
    "verification": {
      "autoFixLoop": true,              // Default: true
      "fixAttemptTimeoutMinutes": 5,    // Timeout per fix attempt
      "runBroaderTestsAfterFix": true   // Run related tests after fixing
    }
  }
}
```

### Fix Loop Algorithm

```
Verification test FAILS
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: CLASSIFY FAILURE                                             │
│                                                                     │
│ Use failure classification algorithm (see "Prerequisite Failure     │
│ Detection" section above)                                           │
│                                                                     │
│ Result: PREREQUISITE | FEATURE | ENVIRONMENT | TEST_INVALID         │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: CHECK STOP CONDITIONS                                        │
│                                                                     │
│ STOP if ANY of these are true:                                       │
│ • Component has 3 failed fix attempts                               │
│ • Same exact error occurred twice in a row (no progress)            │
│ • Total loop iterations > 10 (runaway prevention)                   │
│                                                                     │
│ ├─── STOP TRIGGERED ──► Log failure, offer manual options           │
│ │                                                                   │
│ └─── CONTINUE ──► Proceed to fix                                    │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3: FIND EXISTING TEST (for prerequisites)                       │
│                                                                     │
│ Search for existing test matching the failed component:              │
│ 1. Check tests/e2e/ for files matching component name               │
│ 2. Check test manifests/indexes if they exist                       │
│ 3. If no dedicated test exists, use error context to guide fix      │
│                                                                     │
│ ├─── TEST FOUND ──► Run that test to confirm issue                  │
│ └─── NO TEST ──► Use error message directly                         │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 4: DELEGATE FIX                                                 │
│                                                                     │
│ Based on classification:                                             │
│ • PREREQUISITE (code issue) ──► @developer                          │
│ • FEATURE (code issue) ──► @developer                               │
│ • ENVIRONMENT ──► Load skill-based recovery (see above)             │
│ • TEST_INVALID ──► @e2e-playwright for test fix                     │
│                                                                     │
│ Pass to delegate:                                                    │
│ • Error message and stack trace                                      │
│ • Component name and test file                                       │
│ • Number of previous attempts                                        │
│ • Previous fix attempts (to avoid repeating)                         │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 5: VERIFY FIX                                                   │
│                                                                     │
│ After fix is applied:                                                │
│ 1. Re-run the component's test (if separate from verification test) │
│ 2. If pass → Retry original verification test                       │
│ 3. If fail → Record attempt, check stop conditions, loop            │
│                                                                     │
│ On verification test pass → Enter 3-pass stability check            │
└─────────────────────────────────────────────────────────────────────┘
```

### State Tracking

Track fix loop state in `builder-state.json`:

```json
{
  "verificationLoop": {
    "originalFeature": "tests/ui-verify/profile-dropdown-settings.spec.ts",
    "startedAt": "2026-03-03T10:30:00Z",
    "totalIterations": 3,
    "lastError": null,
    "lastErrorCount": 0,
    "components": {
      "auth-login": {
        "type": "prerequisite",
        "testFile": "tests/e2e/auth.spec.ts",
        "attempts": [
          {
            "attemptNumber": 1,
            "error": "Timeout waiting for '[data-testid=\"login-submit\"]'",
            "fixAgent": "@developer",
            "fixDescription": "Fixed missing data-testid on login button",
            "result": "pass",
            "duration": "45s"
          }
        ],
        "status": "fixed"
      },
      "profile-dropdown-settings": {
        "type": "feature",
        "testFile": "tests/ui-verify/profile-dropdown-settings.spec.ts",
        "attempts": [],
        "status": "pending"
      }
    }
  }
}
```

### Stop Conditions

| Condition | Description | Action |
|-----------|-------------|--------|
| **3 attempts per component** | Component has failed 3 fix attempts | Stop fixing this component |
| **Same error twice** | Exact same error message twice in a row | Stop (no progress being made) |
| **10 total iterations** | Runaway prevention (entire loop) | Stop entire verification |

### Fix Delegation Format

When delegating to @developer:

```
Fix verification failure: [component name]

Classification: [PREREQUISITE | FEATURE]
Test file: [test file path]
Attempt: [N]/3

Error:
[error message]

Stack trace:
[relevant stack trace]

Previous attempts:
- Attempt 1: [fix description] → [result]
- Attempt 2: [fix description] → [result]

Context:
This is [a prerequisite / the feature under test].
[Additional context about what the test is trying to do]
```

### Fix Loop Progress Display

```
═══════════════════════════════════════════════════════════════════════
              🔧 AUTOMATED FIX LOOP IN PROGRESS
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Status: Fixing prerequisite failure

Component: auth-login (PREREQUISITE)
Attempt: 2/3
Agent: @developer

Error: Timeout waiting for '[data-testid="login-submit"]'

Previous attempt:
  Fix: Added explicit wait for login form
  Result: ❌ Still failing

Current fix in progress...
═══════════════════════════════════════════════════════════════════════
```

### Fix Loop Success

```
═══════════════════════════════════════════════════════════════════════
              ✅ FIX LOOP COMPLETE
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Duration: 3m 45s
Iterations: 4

Components fixed:
  ✅ auth-login (prerequisite) — 1 attempt
  ✅ profile-dropdown-settings (feature) — 2 attempts

Entering stability verification (3 passes required)...
═══════════════════════════════════════════════════════════════════════
```

### Fix Loop Stopped

```
═══════════════════════════════════════════════════════════════════════
              ❌ FIX LOOP STOPPED
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Stop reason: Component reached 3 failed attempts

Component: auth-login (PREREQUISITE)
Attempts: 3/3 (max reached)

Last error:
  Timeout waiting for '[data-testid="login-submit"]'

Attempts log:
  1. Fixed missing data-testid → Still failing
  2. Added explicit wait → Still failing
  3. Updated selector to use role → Still failing

This failure has been logged to verification-failures.json.

Options:
  [M] Fix manually, then type "retry"
  [S] Skip verification (marks feature as unverified)
  [A] Abandon feature (reverts story changes)
═══════════════════════════════════════════════════════════════════════
```

---

## Failure Logging (verification-failures.json)

> 📝 **Log all verification failures for debugging and pattern analysis.**
>
> **Trigger:** Fix loop stopped (any stop condition), or manual skip/abandon.
>
> **Why:** Enables debugging of recurring issues and identification of systemic problems.

### File Location

```
<project>/ai-tmp/verification-failures.json
```

### Structure

```json
{
  "schemaVersion": 1,
  "failures": [
    {
      "id": "2026-03-03T10:30:00Z-profile-dropdown-settings",
      "feature": "Add Settings option to profile dropdown",
      "testFile": "tests/ui-verify/profile-dropdown-settings.spec.ts",
      "prd": "print-templates",
      "story": "US-005",
      "startedAt": "2026-03-03T10:30:00Z",
      "stoppedAt": "2026-03-03T10:45:00Z",
      "stopReason": "max_attempts_reached",
      "totalIterations": 4,
      "failedComponent": {
        "name": "auth-login",
        "type": "prerequisite",
        "testFile": "tests/e2e/auth.spec.ts"
      },
      "attempts": [
        {
          "attemptNumber": 1,
          "error": "Timeout waiting for '[data-testid=\"login-submit\"]'",
          "fixAgent": "@developer",
          "fixDescription": "Fixed missing data-testid on login button",
          "result": "fail",
          "duration": "45s",
          "screenshot": "ai-tmp/verification/screenshots/auth-attempt-1.png"
        },
        {
          "attemptNumber": 2,
          "error": "Timeout waiting for '[data-testid=\"login-submit\"]'",
          "fixAgent": "@developer",
          "fixDescription": "Added explicit wait for login form",
          "result": "fail",
          "duration": "60s",
          "screenshot": "ai-tmp/verification/screenshots/auth-attempt-2.png"
        },
        {
          "attemptNumber": 3,
          "error": "Timeout waiting for '[data-testid=\"login-submit\"]'",
          "fixAgent": "@developer",
          "fixDescription": "Updated selector to use role",
          "result": "fail",
          "duration": "55s",
          "screenshot": "ai-tmp/verification/screenshots/auth-attempt-3.png"
        }
      ],
      "resolution": "manual",
      "resolutionDetails": "User chose [M] to fix manually"
    }
  ],
  "stats": {
    "totalFailures": 5,
    "autoFixed": 3,
    "manuallyFixed": 1,
    "skipped": 1,
    "abandoned": 0,
    "autoFixRate": 0.6,
    "lastUpdated": "2026-03-03T10:45:00Z"
  }
}
```

### Stop Reason Values

| Value | Description |
|-------|-------------|
| `max_attempts_reached` | Component had 3 failed fix attempts |
| `same_error_twice` | Exact same error occurred twice in a row |
| `max_iterations` | Total loop iterations exceeded 10 |
| `environment_no_skill` | Environment issue with no matching skill |
| `external_service_unavailable` | External service failure (503, 429) |
| `user_skip` | User selected [S] Skip |
| `user_abandon` | User selected [A] Abandon |

### Resolution Values

| Value | Description |
|-------|-------------|
| `auto_fixed` | Automated fix loop successfully resolved |
| `manual` | User fixed manually and retried |
| `skipped` | User skipped verification |
| `abandoned` | User abandoned the feature |
| `pending` | Not yet resolved |

### Writing to Failure Log

When a failure occurs:

1. Read existing `ai-tmp/verification-failures.json` (or create if missing)
2. Append new failure entry to `failures` array
3. Update `stats` counters
4. Write file atomically

```bash
# Ensure directory exists
mkdir -p ai-tmp

# Write failure log (pseudo-code, actual implementation in agents)
```

---

## Manual Fallback Options

> 🛑 **When automated fix fails, provide clear manual options.**
>
> **Trigger:** Fix loop stopped (any stop condition).
>
> **Why:** User must be able to proceed even when automation fails.

### Option: [M] Fix Manually

When user selects [M]:

1. **Display full context:**
   ```
   MANUAL FIX MODE
   
   Feature: Add "Settings" option to profile dropdown
   Blocked by: auth-login (prerequisite)
   
   Last error:
     Timeout waiting for '[data-testid="login-submit"]'
   
   Relevant files:
     - src/components/LoginForm.tsx
     - tests/e2e/auth.spec.ts
   
   Screenshots:
     - ai-tmp/verification/screenshots/auth-attempt-3.png
   
   Type "retry" when you've fixed the issue.
   Type "skip" to skip verification.
   Type "abandon" to abandon this feature.
   ```

2. **Wait for user input**
3. **On "retry":**
   - Reset fix loop state (clear component attempts)
   - Restart verification from the beginning
   - Enter 3-pass stability check on success

4. **Update failure log with resolution:** `"resolution": "manual"`

### Option: [S] Skip Verification

When user selects [S]:

1. **Require skip reason:**
   ```
   Skip reason (required):
   > _
   ```

2. **Log the skip:**
   ```json
   {
     "resolution": "skipped",
     "resolutionDetails": "User skip: [reason provided]"
   }
   ```

3. **Mark feature as unverified:**
   - PRD story continues but is flagged
   - Adds entry to `test-debt.json` (see Blocker Tracking section)

4. **Display warning:**
   ```
   ⚠️ FEATURE MARKED UNVERIFIED
   
   Feature: Add "Settings" option to profile dropdown
   Skip reason: [user's reason]
   
   This is logged in test-debt.json for follow-up.
   Continuing to next story...
   ```

### Option: [A] Abandon

When user selects [A]:

1. **Confirm abandonment:**
   ```
   ⚠️ ABANDON FEATURE?
   
   This will revert all changes made for this story.
   The story will be marked as "abandoned" in builder-state.json.
   
   Type "confirm" to proceed or "cancel" to go back.
   > _
   ```

2. **On confirm:**
   - Revert story changes (git checkout)
   - Update builder-state.json with abandoned status
   - Log to verification-failures.json with `"resolution": "abandoned"`

3. **Display result:**
   ```
   ❌ FEATURE ABANDONED
   
   Story: US-005 - Add "Settings" option to profile dropdown
   Changes have been reverted.
   
   Moving to next story...
   ```

---

## Blocker Tracking (test-debt.json)

> 🚧 **Track prerequisite blockers that affect multiple features.**
>
> **Trigger:** User selects [S] Skip or [B] Mark as verification blocked.
>
> **Why:** Enables bulk re-verification when blockers are fixed.

### File Location

```
<project>/ai-tmp/test-debt.json
```

### Structure

```json
{
  "schemaVersion": 1,
  "prerequisiteBlockers": [
    {
      "id": "auth-login-timeout",
      "prerequisite": "login",
      "type": "application",
      "error": "Timeout waiting for '[data-testid=\"login-submit\"]'",
      "firstSeen": "2026-03-03T10:30:00Z",
      "lastSeen": "2026-03-03T11:15:00Z",
      "affectedFeatures": [
        {
          "story": "US-005",
          "feature": "Add Settings menu option",
          "testFile": "tests/ui-verify/profile-dropdown-settings.spec.ts",
          "blockedAt": "2026-03-03T10:30:00Z"
        },
        {
          "story": "US-007",
          "feature": "Add Logout confirmation",
          "testFile": "tests/ui-verify/logout-confirmation.spec.ts",
          "blockedAt": "2026-03-03T11:15:00Z"
        }
      ],
      "status": "open",
      "fixAttempts": 3,
      "lastFixAttempt": "2026-03-03T10:45:00Z"
    }
  ],
  "skippedVerifications": [
    {
      "story": "US-012",
      "feature": "Add Profile edit link",
      "testFile": "tests/ui-verify/profile-edit-link.spec.ts",
      "skippedAt": "2026-03-03T14:00:00Z",
      "reason": "Manual testing confirmed working, CI will catch regressions",
      "blockerId": null
    }
  ],
  "stats": {
    "totalBlockers": 1,
    "openBlockers": 1,
    "resolvedBlockers": 0,
    "totalSkipped": 1,
    "lastUpdated": "2026-03-03T14:00:00Z"
  }
}
```

### Blocker Status Values

| Status | Description |
|--------|-------------|
| `open` | Blocker is active, features waiting for fix |
| `resolved` | Blocker has been fixed |
| `wont_fix` | Blocker marked as won't fix (legacy/known issue) |

### "Verification Blocked" Status

When user chooses [B] Mark as verification blocked:

1. **Story completion with special status:**
   ```
   ✅ STORY US-005 COMPLETE (verification blocked)
   
   Summary: Added Settings menu option to profile dropdown
   
   Verification: ⚠️ BLOCKED
     Reason: Login prerequisite failed (auth issue)
     Blocker ID: auth-login-timeout
     
   When auth is fixed, run: verify-blocked US-005
   ```

2. **Add to blocker tracking:**
   - Create or update blocker entry in `test-debt.json`
   - Add this feature to `affectedFeatures` array
   - Update `lastSeen` timestamp

3. **Builder-state story completion:**
   ```json
   {
     "stories": {
       "US-005": {
         "status": "complete",
         "verificationBlocked": "auth-login-timeout",
         "completedAt": "2026-03-03T10:45:00Z"
       }
     }
   }
   ```

### Blocker Detection (Same Prerequisite Multiple Times)

When the same prerequisite fails for a different feature:

1. **Check if blocker already exists:**
   - Match on `prerequisite` name and `error` pattern
   - If exact match found, add to existing blocker

2. **Update existing blocker:**
   ```json
   {
     "id": "auth-login-timeout",
     "affectedFeatures": [
       // ... existing features
       {
         "story": "US-007",
         "feature": "Add Logout confirmation",
         "blockedAt": "2026-03-03T11:15:00Z"
       }
     ],
     "lastSeen": "2026-03-03T11:15:00Z"
   }
   ```

3. **Display correlation:**
   ```
   ⚠️ KNOWN BLOCKER DETECTED
   
   This feature is blocked by a known issue:
     Blocker: auth-login-timeout
     First seen: 2026-03-03T10:30:00Z
     Other affected features: 1
   
   Options:
     [B] Mark as verification blocked (tracks for bulk re-verify)
     [M] Attempt manual fix
     [S] Skip verification
   ```

---

## Bulk Re-verification

> 🔄 **Re-verify all features blocked by a resolved prerequisite.**
>
> **Trigger:** User indicates a blocker has been fixed.
>
> **Why:** Efficiently verify multiple features waiting on the same fix.

### Triggering Bulk Re-verification

**User input patterns:**

- "auth is fixed"
- "login is working now"
- "verify-blocked auth-login-timeout"
- "re-verify blocked features"

**Detection and prompt:**

```
═══════════════════════════════════════════════════════════════════════
              🔄 BULK RE-VERIFICATION
═══════════════════════════════════════════════════════════════════════

Found blocker that may be resolved: auth-login-timeout

Affected features (3):
  1. US-005: Add Settings menu option
  2. US-007: Add Logout confirmation
  3. US-012: Add Profile edit link

Run verification for all? [Y/N]
> _
═══════════════════════════════════════════════════════════════════════
```

### Bulk Verification Flow

```
User confirms bulk re-verification
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: Verify blocker is fixed                                      │
│                                                                     │
│ Run prerequisite test first:                                         │
│   tests/e2e/auth.spec.ts                                            │
│                                                                     │
│ ├─── PASS ──► Blocker is fixed, proceed to verify features          │
│ └─── FAIL ──► Blocker still exists, abort bulk verification        │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼ (BLOCKER FIXED)
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: Verify each affected feature                                 │
│                                                                     │
│ For each feature in affectedFeatures:                                │
│   1. Run verification test                                           │
│   2. Apply 3-pass stability check                                    │
│   3. Record result                                                   │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3: Update blocker status                                        │
│                                                                     │
│ If all features pass:                                                │
│   • Set blocker status to "resolved"                                │
│   • Clear verificationBlocked from story completions                │
│                                                                     │
│ If some features fail:                                               │
│   • Keep blocker open for failed features                           │
│   • Remove passed features from affectedFeatures                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Bulk Verification Progress

```
═══════════════════════════════════════════════════════════════════════
              🔄 BULK RE-VERIFICATION IN PROGRESS
═══════════════════════════════════════════════════════════════════════

Blocker: auth-login-timeout
Status: Verifying blocker fix...

Prerequisite test: tests/e2e/auth.spec.ts
  ✅ PASSED (auth is now working)

Verifying affected features:
  1. US-005: Add Settings menu option
     ✅ Pass 1/3
     ✅ Pass 2/3
     ⏳ Pass 3/3 running...
  2. US-007: Add Logout confirmation
     ⏳ Pending
  3. US-012: Add Profile edit link
     ⏳ Pending

Progress: 1/3 features (0.67/3 stability passes)
═══════════════════════════════════════════════════════════════════════
```

### Bulk Verification Complete

```
═══════════════════════════════════════════════════════════════════════
              ✅ BULK RE-VERIFICATION COMPLETE
═══════════════════════════════════════════════════════════════════════

Blocker: auth-login-timeout
Status: RESOLVED

Results:
  ✅ US-005: Add Settings menu option — VERIFIED (3/3 passes)
  ✅ US-007: Add Logout confirmation — VERIFIED (3/3 passes)
  ❌ US-012: Add Profile edit link — FAILED (new issue)

Blocker resolved for 2/3 features.
US-012 has a new issue (feature-level failure, not prerequisite).

Updated:
  • test-debt.json — blocker marked resolved
  • builder-state.json — verificationBlocked cleared for US-005, US-007
═══════════════════════════════════════════════════════════════════════
```

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

### E2E Execution Steps

1. **Resolve test base URL (MANDATORY)**
   
   Before running any Playwright tests, resolve the test URL:
   
   ```bash
   # Resolution priority:
   # 1. project.json → agents.verification.testBaseUrl (explicit override)
   # 2. Preview URL env vars (Vercel, Netlify, Railway, Render, Fly.io)
   # 3. project.json → environments.staging.url
   # 4. http://localhost:{devPort} (from projects.json)
   
   # Check for explicit testBaseUrl first
   TEST_BASE_URL=$(jq -r '.agents.verification.testBaseUrl // empty' docs/project.json)
   
   # Check preview environment variables
   if [ -z "$TEST_BASE_URL" ]; then
     if [ -n "$VERCEL_URL" ]; then
       TEST_BASE_URL="https://${VERCEL_URL}"
     elif [ -n "$DEPLOY_URL" ]; then
       TEST_BASE_URL="$DEPLOY_URL"
     elif [ -n "$RAILWAY_PUBLIC_DOMAIN" ]; then
       TEST_BASE_URL="https://${RAILWAY_PUBLIC_DOMAIN}"
     elif [ -n "$RENDER_EXTERNAL_URL" ]; then
       TEST_BASE_URL="$RENDER_EXTERNAL_URL"
     elif [ -n "$FLY_APP_NAME" ]; then
       TEST_BASE_URL="https://${FLY_APP_NAME}.fly.dev"
     fi
   fi
   
   # Check staging URL
   if [ -z "$TEST_BASE_URL" ]; then
     TEST_BASE_URL=$(jq -r '.environments.staging.url // empty' docs/project.json)
   fi
   
   # Fall back to localhost
   if [ -z "$TEST_BASE_URL" ]; then
     DEV_PORT=$(jq -r '.projects[] | select(.path == "'$(pwd)'") | .devPort' ~/.config/opencode/projects.json)
     if [ -n "$DEV_PORT" ] && [ "$DEV_PORT" != "null" ]; then
       TEST_BASE_URL="http://localhost:${DEV_PORT}"
     fi
   fi
   
   # Verify we have a URL
   if [ -z "$TEST_BASE_URL" ]; then
     echo "⏭️  E2E skipped: No test URL available"
     exit 0
   fi
   
   export TEST_BASE_URL
   ```

2. **Ensure test environment is accessible**
   
   For localhost URLs, verify the dev server is running:
   ```bash
   if [[ "$TEST_BASE_URL" == http://localhost:* ]]; then
     # Start it using the shared script if not running
     ~/.config/opencode/scripts/check-dev-server.sh --project-path "$(pwd)"
   else
     # For remote URLs, perform a health check
     if ! curl -sf --max-time 10 "$TEST_BASE_URL" > /dev/null 2>&1; then
       echo "❌ Remote test URL not reachable: $TEST_BASE_URL"
       exit 1
     fi
   fi
   ```
   
   **Failure behavior:** If the dev server fails to start or remote URL is unreachable, stop and report the error. Do not run Playwright tests against a dead server.

3. **Set TEST_BASE_URL environment variable:**
   ```bash
   export TEST_BASE_URL
   # Also set DEV_PORT for backward compatibility if localhost
   if [[ "$TEST_BASE_URL" == http://localhost:* ]]; then
     export DEV_PORT=$(echo "$TEST_BASE_URL" | sed 's/.*://; s/\/.*//')
   fi
   ```

4. **Run all queued E2E tests:**
   ```bash
   npx playwright test --reporter=list [list of test files]
   ```

4. **Handle failures** with the fix loop above

5. **Update state** — Mark as passed or track failure count

### Playwright Config: No webServer

> ⚠️ **IMPORTANT: Do NOT use Playwright's `webServer` config option.**
>
> Playwright's default `webServer` behavior kills the dev server when tests complete.
> This violates the Builder policy: "ALWAYS LEAVE THE DEV SERVER RUNNING."
>
> The dev server is managed externally by `check-dev-server.sh` or Builder's session startup.
> For remote URLs (preview/staging), no local server management is needed.

**Correct playwright.config.ts pattern:**

```typescript
import { defineConfig, devices } from '@playwright/test';

// Read base URL from environment (set by test-flow before running)
// Supports localhost, preview URLs, and staging URLs
const TEST_BASE_URL = process.env.TEST_BASE_URL || `http://localhost:${process.env.DEV_PORT || '3000'}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  
  use: {
    baseURL: TEST_BASE_URL,
    trace: 'on-first-retry',
  },

  // NO webServer config — dev server is managed externally
  // This prevents Playwright from killing the server after tests
  // For remote URLs (Vercel preview, staging), no server management needed

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
});
```

**Why no webServer:**
- `webServer` starts a server AND kills it when tests complete (default behavior)
- `reuseExistingServer: true` only helps if server is already running
- External management via `check-dev-server.sh` is more reliable and keeps the server running across test runs
- For remote URLs (preview deployments, staging), no local server is needed at all

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

---

## E2E Auditor Integration (Full-App Coverage Audits)

The `@e2e-auditor` agent provides **proactive full-app E2E auditing** — a comprehensive workflow that differs from the reactive story-driven testing above.

### When to Use E2E Auditor

| Scenario | Use @e2e-auditor |
|----------|------------------|
| Full regression testing before release | ✅ |
| Periodic coverage audits (weekly/monthly) | ✅ |
| After large refactors | ✅ |
| Inheriting a project to assess coverage | ✅ |
| PRD-driven comprehensive testing (e.g., `prd-comprehensive-e2e-suite`) | ✅ |
| Testing a specific story change | ❌ Use @e2e-playwright |
| Testing a bug fix | ❌ Use @tester |

### E2E Auditor Workflow Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    E2E AUDITOR WORKFLOW                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. LOAD CONTEXT                                                    │
│     └─► project.json → platform, auth, commands                     │
│     └─► Check for existing e2e-audit-manifest.json or PRD           │
│                                                                     │
│  2. ANALYZE (if no manifest)                                        │
│     └─► Discover features (routes, components, APIs)                │
│     └─► Categorize into test groups                                 │
│     └─► Generate e2e-audit-manifest.json                            │
│                                                                     │
│  3. GENERATE TESTS                                                  │
│     └─► For each manifest entry without a test file                 │
│     └─► Delegate to @e2e-playwright (audit-mode)                    │
│     └─► Create auth helpers if needed                               │
│                                                                     │
│  4. EXECUTE (resilient loop)                                        │
│     └─► Run each test (max 5 retries)                               │
│     └─► On pass: commit, update manifest, continue                  │
│     └─► On fail: analyze, attempt fix, retry                        │
│     └─► On permanent fail: log, screenshot, CONTINUE (never stop)   │
│                                                                     │
│  5. REPORT                                                          │
│     └─► Generate e2e-audit-report.md                                │
│     └─► Summary: passed/failed/skipped                              │
│     └─► Failure details with suggested fixes                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Differences from Story-Driven Testing

| Aspect | Story-Driven (@tester/@e2e-playwright) | Audit Mode (@e2e-auditor) |
|--------|----------------------------------------|---------------------------|
| Trigger | Code change, story completion | User request, scheduled audit |
| Scope | Changed files only | Entire application |
| Retries | 3 attempts | 5 attempts |
| On failure | Stop, report to user | Log, continue to next test |
| Commits | Batch at end | After each passing test |
| Manifest | docs/e2e-areas.json | e2e-audit-manifest.json |
| Goal | Verify change didn't break | Comprehensive coverage audit |

### Invoking E2E Auditor

From Builder or Tester:

```
Run @e2e-auditor with:
  project: {project path}
  mode: full-audit | resume | prd-driven
  prd: {prd path, if prd-driven mode}
```

### Manifest-Driven Execution

E2E Auditor tracks progress in `e2e-audit-manifest.json`:

```json
{
  "version": "1.0.0",
  "project": { "name": "my-app", "platform": "web" },
  "execution": {
    "maxRetries": 5,
    "commitAfterPass": true,
    "continueOnFailure": true
  },
  "categories": [
    {
      "id": "auth",
      "name": "Authentication",
      "tests": [
        {
          "id": "auth-001",
          "name": "User can log in",
          "status": "passed",
          "attempts": 1,
          "commitHash": "abc1234"
        },
        {
          "id": "auth-002",
          "name": "User can log out",
          "status": "pending"
        }
      ]
    }
  ],
  "summary": {
    "total": 95,
    "passed": 45,
    "failed": 2,
    "pending": 48
  }
}
```

### Resume After Interruption

If audit is interrupted (crash, rate limit, user abort):

1. Read `e2e-audit-manifest.json`
2. Find first test with `status: "pending"` or `status: "running"`
3. Reset any `running` tests back to `pending`
4. Continue execution from that point

### Report Output

After audit completes, `test-results/e2e-audit-report.md` contains:

- Summary table (passed/failed/skipped)
- Failed test details with error messages, screenshots, suggested fixes
- Coverage heatmap by category
- List of commits made
- Next steps for manual resolution

### Integration with Test Debt

Failed tests in audit are NOT automatically added to `test-debt.json` — they're tracked in the manifest. However, if the same test fails across multiple audits, consider adding it to hotspots for escalated attention.

### Skill Dependency

E2E Auditor loads these skills as needed:
- `e2e-full-audit` — Audit workflow patterns
- `e2e-electron` — Electron-specific testing (if platform is electron)
- `auth-*` — Authentication skills based on project.json config

---

## Deferred E2E Test Flow (Post-PRD-Completion)

> 🎯 **This is NOT ad-hoc work.** Running deferred E2E tests from a completed PRD is post-completion work — do NOT load the adhoc-workflow skill or ask about workflow preferences.

When the dashboard shows deferred E2E tests and user selects "E":

### Step 0: Check for Local Runtime

Before proceeding, verify this project can run E2E tests locally:

```bash
# Check devPort from projects.json
DEV_PORT=$(jq -r '.projects[] | select(.path == "'"$(pwd)"'") | .devPort' ~/.config/opencode/projects.json)

if [ "$DEV_PORT" = "null" ]; then
  echo "⏭️  Cannot run E2E tests: Project has no local runtime (devPort: null)"
  echo "   Deferred E2E tests cannot be executed for code-only projects."
  # Do NOT mark as complete — just report the situation
fi
```

**If devPort is null:** Report to user that E2E tests cannot run for this project type. The tests remain deferred but cannot be executed locally.

### Step 1: Identify the Source

Read `builder-state.json` → `pendingTests.e2e`:

```json
{
  "pendingTests": {
    "e2e": {
      "generated": ["apps/web/e2e/recurrence-ui.spec.ts"],
      "status": "pending",
      "deferredTo": "prd-completion",
      "sourcePrd": "prd-recurring-events"  // tracks which PRD generated these tests
    }
  }
}
```

Also check `prd-registry.json` for the PRD's current status:
- If `status: "awaiting_e2e"` → PRD merged but E2E tests not yet run
- If `status: "completed"` → This shouldn't happen (E2E should have been handled)

### Step 2: Determine Where to Run

Check if the source PRD's branch still exists:

```bash
# Get branch name from PRD registry or prd.json
BRANCH=$(jq -r '.prds[] | select(.id == "prd-recurring-events") | .branchName' docs/prd-registry.json)

# Check if branch exists locally or remotely
git show-ref --verify --quiet "refs/heads/$BRANCH" 2>/dev/null || \
git show-ref --verify --quiet "refs/remotes/origin/$BRANCH" 2>/dev/null
```

**If branch exists:**
- Checkout the PRD branch: `git checkout $BRANCH`
- E2E tests run against the feature branch
- If tests pass and branch not merged, offer to create PR

**If branch is gone (merged/deleted):**
- Stay on current branch (likely `main`)
- E2E tests run against `main` (the code should already be there)
- Tests are validation-only — no PR needed

### Step 3: Confirm and Run

Show a simple confirmation (no workflow preference prompt):

```
═══════════════════════════════════════════════════════════════════════
                    RUN DEFERRED E2E TESTS
═══════════════════════════════════════════════════════════════════════

Source: prd-recurring-events (awaiting_e2e)
Branch: feature/recurring-events (checked out)  ← or "Running on main"

E2E tests to run:
  • apps/web/e2e/recurrence-ui.spec.ts

This will:
  1. Start dev server if needed
  2. Run the E2E test(s)
  3. Update PRD status from awaiting_e2e → completed

[R] Run tests    [C] Cancel

> _
═══════════════════════════════════════════════════════════════════════
```

### Step 4: Execute Tests

1. **Start dev server** if not already running
2. **Run the E2E tests:**
   ```bash
   npx playwright test apps/web/e2e/recurrence-ui.spec.ts
   ```
3. **Handle results:**
   - **Pass:** Continue to Step 5
   - **Fail:** Use fix loop (up to 3 attempts with @developer), then report

### Step 5: Update PRD Status to Completed

On successful E2E tests:

1. **Clear `pendingTests.e2e`** from `builder-state.json`
2. **Update `prd-registry.json`:**
   - Set `status: "completed"`
   - Set `completedAt: <now>`
   - Set `e2ePassedAt: <now>`
   - Move entry to `completed` array
3. **Archive the PRD** (if not already archived):
   - Create `docs/completed/[prd-id]/` folder
   - Move PRD files to archive
   - Generate human testing script

### Step 6: Report Results

**On success:**

```
═══════════════════════════════════════════════════════════════════════
                    ✅ E2E TESTS PASSED — PRD COMPLETED
═══════════════════════════════════════════════════════════════════════

  ✅ apps/web/e2e/recurrence-ui.spec.ts (1 test, 4.2s)

PRD: prd-recurring-events
Status: awaiting_e2e → completed ✅

📋 Human testing script ready:
   docs/completed/prd-recurring-events/human-testing-script.md

What would you like to do?
  [P] PRD Mode    [A] Ad-hoc Mode    [S] Status

> _
═══════════════════════════════════════════════════════════════════════
```

**On failure (after 3 fix attempts):**

```
═══════════════════════════════════════════════════════════════════════
                    ❌ E2E TESTS FAILED
═══════════════════════════════════════════════════════════════════════

  ❌ apps/web/e2e/recurrence-ui.spec.ts
     • Test "should display recurrence options" failed
     • Element not found: [data-testid="recurrence-select"]

Failed after 3 fix attempts.

PRD remains in `awaiting_e2e` status.

Options:
  [M] Fix manually, then type "retry"
  [S] Skip E2E tests (mark completed anyway)
  [D] Debug with @developer

> _
═══════════════════════════════════════════════════════════════════════
```

**If user chooses [S] Skip:**
- Update PRD to `completed` with `e2eSkipped: true`
- Log: "E2E tests skipped by user after failures"
- Clear the pending E2E queue
