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
>
> Desktop apps ALWAYS use `playwright-electron`, NEVER browser-based verification.
> The `webContent` field determines whether a rebuild is needed, not whether to use Electron.

### Step 0: Read App Architecture

```
function determineVerificationStrategy(project, changedFiles):
  # Check for postChangeWorkflow override first
  if project.postChangeWorkflow:
    return { strategy: "custom-workflow", steps: project.postChangeWorkflow.steps }
  
  for appName, appConfig in project.apps:
    if anyFileMatchesPath(changedFiles, appConfig.path):
      
      if appConfig.type == "desktop":
        if !appConfig.webContent:
          return { strategy: "error", message: "Missing 'webContent' field for desktop app. Add webContent: 'bundled' | 'remote' | 'hybrid' to apps[].'" }
        
        match appConfig.webContent:
          case "bundled":
            return { strategy: "rebuild-then-launch-app",
                     rebuild: true,
                     buildCommand: project.commands.build or appConfig.commands?.build,
                     devCommand: project.commands.dev or appConfig.commands?.dev,
                     playwright: "electron",
                     notes: "Electron loads bundled files — must rebuild + relaunch for changes to appear" }
          case "remote":
            return { strategy: "ensure-electron-running",
                     rebuild: false,
                     devCommand: project.commands.dev or appConfig.commands?.dev,
                     playwright: "electron",
                     notes: "HMR via dev server handles code changes, but Electron must be running for Playwright-Electron to connect" }
          case "hybrid":
            return { strategy: "rebuild-then-launch-app",
                     rebuild: true,
                     buildCommand: project.commands.build or appConfig.commands?.build,
                     devCommand: project.commands.dev or appConfig.commands?.dev,
                     playwright: "electron",
                     notes: "Hybrid app has both bundled and remote content — rebuild to be safe" }
      
      if appConfig.type == "mobile":
        if !appConfig.webContent:
          return { strategy: "error", message: "Missing 'webContent' field" }
        match appConfig.webContent:
          case "remote":
            return { strategy: "verify-web-url", baseUrl: appConfig.remoteUrl }
          default:
            return { strategy: "no-automated-verify", notes: "Mobile native verification not yet supported" }
      
      if appConfig.type in ["frontend", "fullstack"]:
        return { strategy: "browser", baseUrl: resolveTestBaseUrl(project) }
  
  return { strategy: "not-required" }
```

### Verification Strategy Table

| App Type | webContent | Strategy | How Verification Works |
|----------|------------|----------|------------------------|
| frontend/fullstack | n/a | `browser` | Standard Playwright against dev server (HMR) |
| desktop | `bundled` | `rebuild-then-launch-app` | **Build** → **relaunch Electron** → verify with Playwright-Electron |
| desktop | `remote` | `ensure-electron-running` | Ensure Electron process is running (HMR handles code changes) → verify with Playwright-Electron |
| desktop | `hybrid` | `rebuild-then-launch-app` | **Build** → **relaunch Electron** → verify with Playwright-Electron |
| mobile | `remote` | `verify-web-url` | Test web URL directly in browser |
| mobile | other | `no-automated-verify` | No automated UI verify yet |
| backend/cli | n/a | `not-required` | No UI verification |

> ⛔ **CRITICAL: ALL desktop strategies use `playwright: "electron"`. NEVER use browser-based verification for desktop apps.**
>
> Even `webContent: "remote"` (where HMR delivers changes via dev server) requires connecting Playwright to the Electron process. Opening `localhost` in a browser is NOT the same as testing inside Electron — Electron has its own window chrome, IPC, and process model.

### Custom Workflow Override

When `postChangeWorkflow` exists in `project.json`, execute its steps verbatim instead of auto-inferring:

```
if strategy == "custom-workflow":
  for step in steps:
    match step.type:
      case "command":
        run(step.command)
        if step.required and exitCode != 0: BLOCK
      case "process":
        startProcess(step.command)
        waitForReady()
      case "playwright-check":
        runPlaywrightVerification()
        if step.required and failed: BLOCK
```

### Rebuild + Relaunch Flow (for `bundled` and `hybrid`)

```
1. Run build command:
   $ {buildCommand}        # e.g., "pnpm --filter desktop build"
   
2. Kill existing Electron process (if running):
   $ pkill -f electron     # or project-specific kill command
   
3. Launch Electron in dev mode:
   $ {devCommand} &        # e.g., "pnpm --filter desktop dev"
   
4. Wait for Electron ready signal (window visible, IPC ready)

5. Connect Playwright-Electron to the running process

6. Run verification assertions
```

### Ensure-Running Flow (for `remote`)

```
1. Check if Electron process is already running
   
2. If not running:
   $ {devCommand} &        # Launch Electron
   Wait for ready signal

3. If running:
   No action needed (HMR handles code changes automatically)

4. Connect Playwright-Electron to the running process

5. Run verification assertions
```

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

---

## Analysis Probe Mode (Pre-Implementation Verification)

> 🎯 **Use this mode during ad-hoc Analysis Gate (Phase 0) to confirm code analysis conclusions against live app state.**
>
> Analysis probes are lightweight, fast, ephemeral checks — NOT full E2E tests.
> They verify that the elements, pages, and states referenced in the analysis actually exist at runtime.

### When to Use

This mode is invoked by Builder during the ad-hoc workflow **Step 0.1b** — after code analysis (Step 0.1) and before showing the ANALYSIS COMPLETE dashboard (Step 0.2).

**Trigger:** `@e2e-playwright` with `mode: "analysis-probe"`

### Configuration

Analysis probe mode uses project-level verification settings but with lighter constraints:

| Setting | Value | Why |
|---------|-------|-----|
| `timeout` | 5 seconds per page | Probes must be fast — analysis is time-boxed |
| `testGeneration` | None — probes are ephemeral | No files saved to `testDir` |
| `screenshots` | Optional — only on contradiction | Save screenshot when probe contradicts analysis |
| `retries` | 0 | Probes are one-shot; failure = useful signal |

### Probe Specification Format

Builder generates a probe specification from Step 0.1 code analysis and passes it to `@e2e-playwright`:

```yaml
<probe-spec>
  mode: analysis-probe
  baseUrl: "http://localhost:{devPort}"
  timeout: 5000
  assertions:
    - page: "/checkout"
      description: "Submit button exists on checkout page"
      checks:
        - selector: "[data-testid='submit-btn'], button[type='submit']"
          expect: "visible"
        - selector: ".spinner, [data-testid='loading-spinner']"
          expect: "absent"
          description: "No loading indicator currently exists"
    - page: "/checkout"
      description: "Form is interactive"
      checks:
        - selector: "button[type='submit']"
          expect: "enabled"
</probe-spec>
```

### Probe Assertion Types

| Expect Value | What It Checks | Passes When |
|-------------|----------------|-------------|
| `visible` | Element exists and is visible | `element.isVisible() === true` |
| `absent` | Element does not exist or is hidden | `element.count() === 0` or `!element.isVisible()` |
| `enabled` | Element exists and is not disabled | `element.isEnabled() === true` |
| `disabled` | Element exists and is disabled | `element.isEnabled() === false` |
| `text-contains:{value}` | Element contains specific text | `element.textContent().includes(value)` |
| `exists` | Element exists in DOM (visible or not) | `element.count() > 0` |

### Probe Execution Flow

```
Builder passes probe-spec to @e2e-playwright
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: Validate probe spec                                          │
│   • Ensure baseUrl is reachable                                      │
│   • Validate assertion format                                        │
│   • If baseUrl unreachable → return { status: "skipped",             │
│     reason: "Dev server not reachable" }                             │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: Execute probes (5s timeout per page)                         │
│                                                                     │
│ For each page in assertions:                                         │
│   1. Navigate to page                                                │
│   2. Wait for networkidle (max 3s)                                   │
│   3. Run each check against the DOM                                  │
│   4. Record result: { match: true/false, actual: "..." }            │
│                                                                     │
│ If page navigation fails → record as contradiction                   │
│ If timeout → record as { match: false, actual: "timeout" }          │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3: Aggregate results                                            │
│                                                                     │
│ overallStatus:                                                       │
│   • ALL assertions match → "confirmed"                               │
│   • ≥50% match → "partially-confirmed"                               │
│   • <50% match → "contradicted"                                      │
│                                                                     │
│ If "contradicted": capture screenshot of contradicting page          │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
Return ProbeResult to Builder
```

### Probe Result Format

```typescript
interface ProbeResult {
  status: "confirmed" | "partially-confirmed" | "contradicted" | "skipped";
  reason?: string;
  assertions: ProbeAssertionResult[];
  discrepancies: ProbeDiscrepancy[];
  screenshotsCaptured?: string[];
  executionTimeMs: number;
}

interface ProbeAssertionResult {
  page: string;
  description: string;
  selector: string;
  expected: string;
  actual: string;
  match: boolean;
}

interface ProbeDiscrepancy {
  page: string;
  description: string;
  expected: string;
  actual: string;
  impact: "analysis-invalid" | "analysis-incomplete" | "minor";
}
```

### How Builder Uses Probe Results

| Probe Status | Effect on Analysis | Dashboard Display |
|-------------|-------------------|-------------------|
| `confirmed` | Analysis proceeds as-is | `Confidence: HIGH ✅ Playwright-confirmed` |
| `partially-confirmed` | Analysis updated with corrections; confidence may remain or lower | `Confidence: HIGH ⚠️ Playwright: N/M assertions confirmed` |
| `contradicted` | Analysis MUST be revised; confidence lowered to MEDIUM minimum | `Confidence: MEDIUM 🔴 Playwright contradicted analysis` |
| `skipped` | Analysis proceeds without probe (note shown) | `Confidence: [original] ➖ Playwright probe skipped: [reason]` |

### Confidence Impact Rules

> ⛔ **Probe contradictions ALWAYS lower confidence.**

| Original Confidence | Probe Status | Resulting Confidence |
|---------------------|-------------|---------------------|
| HIGH | `confirmed` | HIGH |
| HIGH | `partially-confirmed` | HIGH (if discrepancies are `minor`) or MEDIUM |
| HIGH | `contradicted` | MEDIUM (forces clarifying questions) |
| MEDIUM | `confirmed` | MEDIUM (probe alone cannot raise confidence) |
| MEDIUM | `contradicted` | LOW |
| LOW | any | LOW (already at minimum) |

### Skip Conditions

Probes are **skipped** (not failed) when:

| Condition | Skip Reason | Dashboard Note |
|-----------|-------------|----------------|
| `agents.verification.mode: "no-ui"` | Project has no UI | `➖ Probe skipped: no-ui project` |
| Dev server unreachable | Cannot probe without running app | `➖ Probe skipped: dev server not reachable` |
| No page assertions generated | Analysis is purely backend | `➖ Probe skipped: no UI assertions to verify` |
| `project.json` → `agents.analysisProbe: false` | User opted out | `➖ Probe skipped: disabled in project.json` |

**Important:** When probes are skipped, analysis proceeds normally — skipping is NOT a failure. The probe is an enhancement that catches discrepancies when available.

> ⛔ **NOT valid skip conditions (common mistakes):**
>
> | Condition | Why It's NOT a Valid Skip |
> |-----------|--------------------------|
> | Electron/Tauri/desktop app | Desktop apps with `webContent: "remote"` or `"bundled"` have web UI — probe it |
> | "Code analysis is clear" | Probes verify runtime state, not code correctness |
> | "UX/flow restructuring" | If the change affects visible pages, probe those pages |
> | "Screenshot already captured" | Screenshots ≠ probes — probes verify specific assertions |
>
> **Rule:** If the app has web content (any `webContent` value or web-based app), the probe MUST run.
> The probe target URL depends on app type — see "Architecture-Aware Verification" above.

### Project Configuration

Projects can configure probe behavior in `project.json`:

```json
{
  "agents": {
    "analysisProbe": true,
    "analysisProbeTimeoutMs": 5000
  }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `analysisProbe` | `true` | Enable/disable analysis probes |
| `analysisProbeTimeoutMs` | `5000` | Timeout per page probe in milliseconds |

### Integration with Authentication

> ⛔ **Authenticated pages are NOT optional probe targets.**
> If the pages being changed require auth, you MUST authenticate before probing.
> Skipping authenticated pages is a **last resort**, not a default.

**Authentication escalation ladder** (try each step before moving to the next):

1. **Check `project.json` → `authentication`** for existing auth configuration
2. **If configured:** Load the matching auth skill and authenticate in the Playwright context:
   - `provider: supabase` + `method: passwordless-otp` → load `auth-supabase-otp` skill
   - `provider: supabase` + `method: email-password` → load `auth-supabase-password` skill
   - `provider: nextauth` + `method: email-password` → load `auth-nextauth-credentials` skill
   - `headless: true` → load `auth-headless` skill for faster API-based auth
   - Other providers → load `auth-generic` skill
3. **If NOT configured:** Load the `setup-auth` skill to detect and configure auth autonomously
4. **Only if all auth approaches fail** (no config, no env vars, no service keys, setup-auth cannot resolve):
   ```
   ⚠️ PROBE DEGRADED: Cannot authenticate for /dashboard, /settings
   
   Attempted: [list what was tried]
   Reason: [specific failure reason]
   
   Probing public pages only. Authenticated page assertions are UNVERIFIED.
   Do NOT report probeStatus as "confirmed" — use "degraded-no-auth".
   ```

**Page routing:**

| Page type | Action |
|-----------|--------|
| Public (login, marketing, docs) | Probe directly, no auth needed |
| Authenticated (dashboard, settings, admin) | Authenticate first using escalation ladder above, then probe |
| Mixed (some public, some authenticated) | Probe public pages immediately; authenticate then probe protected pages |

### Example Probe Flow

```
Builder (after code analysis):
  "Analysis says: Submit button exists at /checkout, no spinner present"

Builder generates probe-spec:
  assertions:
    - page: "/checkout"
      checks:
        - selector: "button[type='submit']"  expect: "visible"
        - selector: ".spinner"               expect: "absent"

@e2e-playwright runs probe:
  ✅ button[type='submit'] → visible (match)
  ✅ .spinner → absent (match)

Result: { status: "confirmed", assertions: 2/2 match }

Builder shows dashboard:
  📊 UNDERSTANDING                          Confidence: HIGH ✅ Playwright-confirmed
```
