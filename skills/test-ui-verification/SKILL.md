---
name: test-ui-verification
description: "Playwright-based UI verification for UI projects. Use when verifying UI changes in browser, generating verification tests, or handling selector strategies. Triggers on: ui verification, playwright required, browser verification, verification test, visual verification."
---

# Test UI Verification

> Load this skill when: verifying UI changes in browser, generating verification tests, or managing playwright-required mode.

## UI Verification (Playwright Required Mode)

> 🎯 **For UI projects, Playwright browser verification is MANDATORY for UI changes.**
>
> When `project.json → agents.verification.mode` is `playwright-required`:
> - All UI changes must be visually verified in a browser before task completion
> - Verification generates reusable test scripts in `tests/ui-verify/`
> - Screenshots are captured for visual confirmation

### Configuration

Read verification settings from `project.json`:

```json
{
  "agents": {
    "verification": {
      "mode": "playwright-required",
      "selectorStrategy": "strict",
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
| `screenshotDir` | path | Where to save verification screenshots |
| `reviewGeneratedTests` | boolean | Whether @quality-critic reviews generated tests |

---

## Architecture-Aware Verification

> 🎯 **Before running verification, detect app architecture to choose the optimal strategy.**

### Step 0: Read App Architecture

```
function determineVerificationStrategy(project, changedFiles):
  for appName, appConfig in project.apps:
    if anyFileMatchesPath(changedFiles, appConfig.path):
      
      if appConfig.type in ["desktop", "mobile"]:
        if !appConfig.webContent:
          return { strategy: "error", message: "Missing 'webContent' field" }
        
        match appConfig.webContent:
          case "bundled":
            return { strategy: "launch-app", ... }
          case "remote":
            return { strategy: "verify-web-url", ... }
          case "hybrid":
            return { strategy: "hybrid", ... }
      
      if appConfig.type in ["frontend", "fullstack"]:
        return { strategy: "browser", baseUrl: resolveTestBaseUrl(project) }
  
  return { strategy: "not-required" }
```

### Verification Strategy Table

| App Type | webContent | Strategy | How Verification Works |
|----------|------------|----------|------------------------|
| frontend/fullstack | n/a | `browser` | Standard Playwright against dev server |
| desktop | `bundled` | `launch-app` | Launch Electron/Tauri, test with Playwright |
| desktop | `remote` | `verify-web-url` | Test web URL directly |
| desktop | `hybrid` | `hybrid` | Mixed approach |
| backend/cli | n/a | `not-required` | No UI verification |

---

## Verification Flow

```
Task complete (file changes detected)
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 0: Determine Verification Strategy (Architecture Check)        │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: Check if UI verification required                           │
│                                                                     │
│ Read project.json → agents.verification.mode                        │
│   • "playwright-required" → Continue                                │
│   • "no-ui" → Return { status: "not-required" }                     │
│                                                                     │
│ Check changed files:                                                │
│   • UI files (*.tsx, *.jsx, *.vue) → Continue                       │
│   • Non-UI files only → Return { status: "not-required" }           │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: Generate verification test                                   │
│                                                                     │
│ Run @e2e-playwright with mode: "verification"                       │
│   • Generates test in testDir                                        │
│   • If selectorStrategy: "strict", adds data-testid to components  │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3: Run verification test                                       │
│                                                                     │
│ Execute: npx playwright test <generated-test>                       │
│ Capture screenshot to screenshotDir                                 │
└─────────────────────────────────────────────────────────────────────┘
    │
    ├─── PASS ──► Return { status: "verified" }
    │
    └─── FAIL ──► Fix loop (max 3 attempts)
                      │
                      └─── Still failing ──► User prompt [F/S/A]
```

---

## Verification Status Returns

```typescript
interface VerificationResult {
  status: "verified" | "unverified" | "skipped" | "not-required";
  reason: string;
  details: {
    testsGenerated?: string[];
    screenshotsCaptured?: string[];
    testsPassed?: boolean;
    attemptCount?: number;
    errors?: string[];
  };
}
```

| Status | When | Task Can Complete? |
|--------|------|-------------------|
| `verified` | UI change verified via Playwright | ✅ Yes |
| `unverified` | UI change not yet verified | ❌ No (blocked) |
| `skipped` | User explicitly skipped verification | ⚠️ Yes (with debt) |
| `not-required` | No UI changes, or mode is `no-ui` | ✅ Yes |

---

## Verification Test Format

Generated verification tests include rich documentation headers:

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
 * 
 * @feature-assertions
 *   - Form renders with all required fields
 *   - Card number field accepts valid input
 *   - Submit button is disabled until form is valid
 * 
 * @generated-at 2026-03-03T10:30:00Z
 */
import { test, expect } from '@playwright/test';

test.describe('PaymentForm verification', () => {
  test('renders and accepts valid input', async ({ page }) => {
    // ═══════════════════════════════════════════════════════════════
    // PREREQUISITES
    // ═══════════════════════════════════════════════════════════════
    await page.goto('/checkout');
    await page.click('text=Proceed to Payment');
    
    // ═══════════════════════════════════════════════════════════════
    // FEATURE ASSERTIONS
    // ═══════════════════════════════════════════════════════════════
    await expect(page.locator('[data-testid="payment-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="card-number"]')).toBeVisible();
    
    await page.screenshot({ path: 'ai-tmp/verification/screenshots/payment-form.png' });
  });
});
```

---

## Selector Strategy Enforcement

### When `selectorStrategy: "strict"`

1. **Before generating verification test**, check for `data-testid` attributes
2. **If missing**, @e2e-playwright:
   - Identifies components that need test IDs
   - Adds `data-testid` attributes to source code
   - Commits: "chore: add data-testid attributes for e2e testing"
3. **Then generates test** using the `data-testid` selectors

### When `selectorStrategy: "flexible"`

- Tests may use role-based selectors, text content, or test IDs
- No requirement to add `data-testid` attributes

---

## Integration with Workflows

**Ad-hoc workflow:**
```
if verificationResult.status == "unverified":
    BLOCK task completion
    
if verificationResult.status == "skipped":
    WARN user
    Log to test-debt.json
```

**PRD workflow:**
```
if verificationResult.status == "unverified":
    BLOCK story completion
    Story remains in_progress
```

---

## Recording Verification Results

Update `builder-state.json`:

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

---

## Skipping Verification (Escape Hatch)

```
User: "skip verification"

⚠️ SKIPPING UI VERIFICATION

This will:
- Mark task as complete WITHOUT browser verification
- Add this file to test-debt.json for escalated future testing
- Log the skip reason

Are you sure? [Y/N]
```

If confirmed:
1. Return `{ status: "skipped", reason: "User requested skip" }`
2. Add changed UI files to `test-debt.json`
3. Allow task completion with warning

---

## Flaky Test Detection

### Detection Criteria

A test is **flaky** when it:
- Passes on some runs but fails on others
- Fails with timing-related errors
- Fails with non-deterministic assertion failures

### Detection Method

```
Test fails on first run
    │
    ▼
Re-run the SAME test 2 more times
    │
    ├─── All 3 fail consistently ──► NOT flaky (genuine failure)
    │
    └─── Mixed results ──► FLAKY
```

### Flakiness Response

```
⚠️ FLAKY TEST DETECTED

Test: payment-form.spec.ts → "renders and accepts valid input"
Results: 1/3 passes (66% failure rate)

Failure pattern:
- Run 1: FAIL — Timeout waiting for selector
- Run 2: PASS
- Run 3: FAIL — Timeout waiting for selector

Analysis: Likely timing issue

Action: Escalating to @e2e-playwright for fix...
```

### Verification After Fix

After the delegate agent fixes the flaky test:

1. **Re-run the test 3 times consecutively**
2. **All 3 must pass** to consider the fix successful
3. **If still flaky**, offer quarantine option

### Quarantine Option

For persistently flaky tests:

1. Move test file to `tests/quarantine/`
2. Add entry to `test-debt.json`
3. Quarantined tests excluded from CI but tracked for follow-up
