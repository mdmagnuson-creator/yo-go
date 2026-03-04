---
name: test-e2e-flow
description: "PRD and ad-hoc E2E test execution flows. Use when running E2E tests, handling deferred tests, or managing E2E test execution. Triggers on: run e2e, e2e tests, deferred e2e, prd e2e, playwright tests."
---

# Test E2E Flow

> Load this skill when: running E2E tests, handling PRD/ad-hoc mode E2E execution, or managing deferred E2E tests.

## PRD Mode Test Flow

**After each story completion, run the mandatory per-task quality checks** (see test-quality-checks skill).

### Additional PRD-Specific Behavior

After the mandatory checks pass, PRD mode handles E2E based on **automatic activity resolution**:

| E2E Resolution | Behavior |
|----------------|----------|
| `immediate` | Run E2E tests now, before marking story complete |
| `deferred` | Queue E2E tests for PRD completion |
| `skip` | No E2E (docs, config, type definitions) |

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
┌─────────────────────────────────────────────────────────────────────┐
│ MANDATORY: Run resolved activities                                   │
│ (baseline, unit, critics, E2E if immediate)                         │
└─────────────────────────────────────────────────────────────────────┘
    │
    ├─── Any check fails ──► Fix loop ──► Still failing? STOP
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ If E2E = deferred: Queue for PRD completion                          │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
Next story (or PRD completion)
```

**After ALL stories complete:**

1. **Run all deferred E2E tests**
2. **If E2E tests fail:** Run @developer to fix (up to 3 attempts)
3. **Clear E2E queue** — Remove `deferredTo` flag, mark as passed

---

## Ad-hoc Mode Test Flow

**After each ad-hoc task completes, run the mandatory per-task quality checks.**

### Ad-hoc Task Completion Flow

```
Task complete
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ MANDATORY: Per-Task Quality Checks                                   │
│ (typecheck, lint, unit tests, critic)                               │
└─────────────────────────────────────────────────────────────────────┘
    │
    ├─── Any check fails ──► Fix loop ──► Still failing? STOP
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Show completion prompt                                               │
│ [E] Write E2E  [C] Commit  [N] Next task                            │
└─────────────────────────────────────────────────────────────────────┘
```

### E2E Deferral (During PRD)

After generating E2E tests in ad-hoc mode during PRD:

```
📝 E2E tests generated:
   • e2e/[test-name].spec.ts

Options:
   [R] Run E2E tests now (then return to PRD)
   [D] Defer to PRD completion (run with PRD's E2E tests)
   [S] Save for later (queue without deferring)
```

---

## Running E2E Tests

### Step 1: Resolve Test Base URL (MANDATORY)

Before running any Playwright tests:

```bash
# Resolution priority:
# 1. project.json → agents.verification.testBaseUrl (explicit override)
# 2. Preview URL env vars (Vercel, Netlify, Railway, Render, Fly.io)
# 3. project.json → environments.staging.url
# 4. http://localhost:{devPort} (from projects.json)

TEST_BASE_URL=$(jq -r '.agents.verification.testBaseUrl // empty' docs/project.json)

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

if [ -z "$TEST_BASE_URL" ]; then
  TEST_BASE_URL=$(jq -r '.environments.staging.url // empty' docs/project.json)
fi

if [ -z "$TEST_BASE_URL" ]; then
  DEV_PORT=$(jq -r '.projects[] | select(.path == "'$(pwd)'") | .devPort' ~/.config/opencode/projects.json)
  if [ -n "$DEV_PORT" ] && [ "$DEV_PORT" != "null" ]; then
    TEST_BASE_URL="http://localhost:${DEV_PORT}"
  fi
fi

if [ -z "$TEST_BASE_URL" ]; then
  echo "⏭️  E2E skipped: No test URL available"
  exit 0
fi

export TEST_BASE_URL
```

### Step 2: Ensure Test Environment is Accessible

```bash
if [[ "$TEST_BASE_URL" == http://localhost:* ]]; then
  ~/.config/opencode/scripts/check-dev-server.sh --project-path "$(pwd)"
else
  if ! curl -sf --max-time 10 "$TEST_BASE_URL" > /dev/null 2>&1; then
    echo "❌ Remote test URL not reachable: $TEST_BASE_URL"
    exit 1
  fi
fi
```

### Step 3: Run Tests

```bash
export TEST_BASE_URL
npx playwright test --reporter=list [list of test files]
```

### Playwright Config: No webServer

> ⚠️ **Do NOT use Playwright's `webServer` config option.**
>
> Playwright's default `webServer` behavior kills the dev server when tests complete.

**Correct pattern:**

```typescript
import { defineConfig, devices } from '@playwright/test';

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

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
});
```

---

## Deferred E2E Test Flow (Post-PRD-Completion)

> 🎯 **This is NOT ad-hoc work.** Do NOT load the adhoc-workflow skill.

### Step 0: Check for Local Runtime

```bash
DEV_PORT=$(jq -r '.projects[] | select(.path == "'"$(pwd)"'") | .devPort' ~/.config/opencode/projects.json)

if [ "$DEV_PORT" = "null" ]; then
  echo "⏭️  Cannot run E2E tests: Project has no local runtime (devPort: null)"
fi
```

### Step 1: Identify the Source

Read `builder-state.json` → `pendingTests.e2e`:

```json
{
  "pendingTests": {
    "e2e": {
      "generated": ["apps/web/e2e/recurrence-ui.spec.ts"],
      "status": "pending",
      "deferredTo": "prd-completion",
      "sourcePrd": "prd-recurring-events"
    }
  }
}
```

### Step 2: Determine Where to Run

```bash
BRANCH=$(jq -r '.prds[] | select(.id == "prd-recurring-events") | .branchName' docs/prd-registry.json)
git show-ref --verify --quiet "refs/heads/$BRANCH" 2>/dev/null || \
git show-ref --verify --quiet "refs/remotes/origin/$BRANCH" 2>/dev/null
```

**If branch exists:** Checkout the PRD branch
**If branch is gone:** Stay on current branch (likely `main`)

### Step 3: Confirm and Run

```
═══════════════════════════════════════════════════════════════════════
                    RUN DEFERRED E2E TESTS
═══════════════════════════════════════════════════════════════════════

Source: prd-recurring-events (awaiting_e2e)
Branch: feature/recurring-events (checked out)

E2E tests to run:
  • apps/web/e2e/recurrence-ui.spec.ts

[R] Run tests    [C] Cancel

> _
═══════════════════════════════════════════════════════════════════════
```

### Step 4: Update PRD Status to Completed

On successful E2E tests:

1. Clear `pendingTests.e2e` from `builder-state.json`
2. Update `prd-registry.json`: `status: "completed"`
3. Archive the PRD

---

## E2E Auditor Integration

The `@e2e-auditor` agent provides **proactive full-app E2E auditing**.

### When to Use E2E Auditor

| Scenario | Use @e2e-auditor |
|----------|------------------|
| Full regression testing before release | ✅ |
| Periodic coverage audits | ✅ |
| After large refactors | ✅ |
| Testing a specific story change | ❌ Use @e2e-playwright |

### Key Differences from Story-Driven Testing

| Aspect | Story-Driven | Audit Mode |
|--------|--------------|------------|
| Trigger | Code change | User request |
| Scope | Changed files only | Entire application |
| Retries | 3 attempts | 5 attempts |
| On failure | Stop, report | Log, continue |
| Commits | Batch at end | After each passing test |

### Invoking E2E Auditor

```
Run @e2e-auditor with:
  project: {project path}
  mode: full-audit | resume | prd-driven
  prd: {prd path, if prd-driven mode}
```

---

## State Updates During Test Flow

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
      "deferredTo": "prd-completion"
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
      "status": "passed",
      "lastRunAt": "ISO8601",
      "failureCount": 0
    }
  }
}
```
