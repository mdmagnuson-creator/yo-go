# E2E Full Audit Skill

> Load this skill when performing comprehensive E2E test audits of applications.
> Provides workflow patterns, manifest schema, and resilient execution strategies.

## Triggers

- "run e2e audit"
- "comprehensive e2e test"
- "full test coverage"
- "e2e-full-audit"
- "audit all features"
- When `@e2e-auditor` is invoked

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    E2E FULL AUDIT WORKFLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. LOAD CONTEXT                                                │
│     └─► project.json → platform, auth, commands                 │
│     └─► Check for existing manifest or PRD                      │
│                                                                 │
│  2. ANALYZE (if no manifest)                                    │
│     └─► Discover features (routes, components, APIs)            │
│     └─► Categorize into test groups                             │
│     └─► Generate e2e-audit-manifest.json                        │
│                                                                 │
│  3. GENERATE TESTS                                              │
│     └─► For each manifest entry without a test file             │
│     └─► Delegate to @e2e-playwright (audit-mode)                │
│     └─► Create auth helpers if needed                           │
│                                                                 │
│  4. EXECUTE                                                     │
│     └─► Run each test (max 5 retries)                           │
│     └─► On pass: commit, update manifest, continue              │
│     └─► On fail: analyze, attempt fix, retry                    │
│     └─► On permanent fail: log, screenshot, continue            │
│                                                                 │
│  5. REPORT                                                      │
│     └─► Generate e2e-audit-report.md                            │
│     └─► Summary: passed/failed/skipped                          │
│     └─► Failure details with suggested fixes                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Manifest Schema

The audit manifest tracks all tests and their execution status:

```json
{
  "$schema": "https://raw.githubusercontent.com/mdmagnuson-creator/yo-go/main/schemas/e2e-audit-manifest.schema.json",
  "version": "1.0.0",
  "generatedAt": "2026-02-28T10:00:00Z",
  "project": {
    "name": "helm-ade",
    "platform": "electron",
    "baseUrl": "http://localhost:3000"
  },
  "execution": {
    "maxRetries": 5,
    "retryDelayMs": 1000,
    "commitAfterPass": true,
    "continueOnFailure": true,
    "screenshotOnFailure": true,
    "parallelWorkers": 1
  },
  "categories": [
    {
      "id": "auth",
      "name": "Authentication",
      "description": "Login, logout, registration, password reset",
      "tests": [
        {
          "id": "auth-001",
          "name": "User can log in with valid credentials",
          "file": "e2e/auth/login.spec.ts",
          "priority": "critical",
          "status": "pending",
          "attempts": 0,
          "lastError": null,
          "lastRun": null,
          "commitHash": null
        }
      ]
    }
  ],
  "summary": {
    "total": 95,
    "passed": 0,
    "failed": 0,
    "skipped": 0,
    "pending": 95
  }
}
```

### Test Status Values

| Status | Meaning |
|--------|---------|
| `pending` | Not yet executed |
| `running` | Currently executing |
| `passed` | Test passed (committed) |
| `failed` | Failed after max retries |
| `skipped` | Intentionally skipped |
| `blocked` | Blocked by dependency |

### Priority Levels

| Priority | Meaning | Retry Strategy |
|----------|---------|----------------|
| `critical` | Must pass for release | 5 retries, high effort fixes |
| `high` | Important feature | 5 retries, moderate fixes |
| `medium` | Nice-to-have coverage | 3 retries, quick fixes |
| `low` | Edge cases | 2 retries, log and continue |

## Resilient Execution Algorithm

```typescript
async function executeTest(test: Test, manifest: Manifest): Promise<void> {
  const maxRetries = manifest.execution.maxRetries;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    manifest.updateTest(test.id, { status: 'running', attempts: attempt });
    
    const result = await runPlaywrightTest(test.file);
    
    if (result.passed) {
      manifest.updateTest(test.id, { 
        status: 'passed',
        lastRun: new Date().toISOString()
      });
      
      if (manifest.execution.commitAfterPass) {
        await commitTest(test);
      }
      return; // Success - move to next test
    }
    
    // Test failed
    manifest.updateTest(test.id, { lastError: result.error });
    
    if (attempt < maxRetries) {
      // Attempt AI-powered fix
      const fixed = await attemptFix(test, result);
      if (fixed) {
        await delay(manifest.execution.retryDelayMs);
        continue; // Retry with fix
      }
    }
  }
  
  // Permanent failure after all retries
  manifest.updateTest(test.id, { status: 'failed' });
  await captureFailureArtifacts(test);
  
  if (manifest.execution.continueOnFailure) {
    return; // Continue to next test
  } else {
    throw new Error(`Test ${test.id} failed permanently`);
  }
}
```

## Feature Discovery Patterns

### React/Next.js Apps

```bash
# Find pages/routes
find src/app -name "page.tsx" -o -name "page.js"
find src/pages -name "*.tsx" -o -name "*.js"

# Find components with user interactions
grep -r "onClick\|onSubmit\|onChange" src/components/

# Find API routes
find src/app/api -name "route.ts"
find src/pages/api -name "*.ts"
```

### Vue/Nuxt Apps

```bash
# Find pages
find pages -name "*.vue"

# Find components with events
grep -r "@click\|@submit\|v-on:" components/

# Find API endpoints
find server/api -name "*.ts"
```

### Electron Apps

```bash
# Find IPC handlers
grep -r "ipcMain.handle\|ipcMain.on" src/main/

# Find renderer entry points
find src/renderer -name "*.tsx" -o -name "*.vue"

# Find preload scripts
find src/preload -name "*.ts"
```

## Test Categories Template

Standard categories for most applications:

```json
{
  "categories": [
    {
      "id": "auth",
      "name": "Authentication",
      "patterns": ["login", "logout", "register", "password", "session"]
    },
    {
      "id": "onboarding", 
      "name": "Onboarding",
      "patterns": ["wizard", "setup", "welcome", "first-time", "tutorial"]
    },
    {
      "id": "dashboard",
      "name": "Dashboard",
      "patterns": ["dashboard", "home", "overview", "summary"]
    },
    {
      "id": "navigation",
      "name": "Navigation",
      "patterns": ["menu", "nav", "sidebar", "breadcrumb", "routing"]
    },
    {
      "id": "forms",
      "name": "Forms & Input",
      "patterns": ["form", "input", "validation", "submit", "editor"]
    },
    {
      "id": "data",
      "name": "Data Display",
      "patterns": ["table", "list", "grid", "card", "chart"]
    },
    {
      "id": "settings",
      "name": "Settings",
      "patterns": ["settings", "preferences", "config", "profile"]
    },
    {
      "id": "integrations",
      "name": "Integrations",
      "patterns": ["api", "webhook", "oauth", "connect", "sync"]
    },
    {
      "id": "errors",
      "name": "Error Handling",
      "patterns": ["error", "404", "500", "fallback", "boundary"]
    }
  ]
}
```

## Auth Helper Generation

Based on `project.json` authentication config, generate appropriate helpers:

### Supabase Passwordless OTP

```typescript
// e2e/helpers/auth.ts
import { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // Service key for OTP retrieval
);

export async function loginWithOTP(page: Page, email: string): Promise<void> {
  // Request OTP
  await page.goto('/login');
  await page.fill('[data-testid="email"]', email);
  await page.click('[data-testid="send-otp"]');
  
  // Wait for OTP to arrive
  await page.waitForTimeout(2000);
  
  // Retrieve OTP from database
  const { data } = await supabase
    .from('auth.users')
    .select('confirmation_token')
    .eq('email', email)
    .single();
  
  // Enter OTP
  await page.fill('[data-testid="otp-input"]', data.confirmation_token);
  await page.click('[data-testid="verify-otp"]');
  
  // Wait for auth to complete
  await page.waitForURL('/dashboard');
}
```

### Email/Password

```typescript
// e2e/helpers/auth.ts
import { Page } from '@playwright/test';

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.fill('[data-testid="email"]', email);
  await page.fill('[data-testid="password"]', password);
  await page.click('[data-testid="submit"]');
  await page.waitForURL('/dashboard');
}

export async function logout(page: Page): Promise<void> {
  await page.click('[data-testid="user-menu"]');
  await page.click('[data-testid="logout"]');
  await page.waitForURL('/login');
}
```

## Failure Analysis Patterns

When a test fails, analyze using this decision tree:

```
Test Failed
    │
    ├─► Timeout waiting for selector?
    │   └─► Add explicit wait: page.waitForSelector('[data-testid="x"]')
    │
    ├─► Element not visible?
    │   └─► Scroll into view: element.scrollIntoViewIfNeeded()
    │
    ├─► Wrong element count?
    │   └─► Check for loading states, add waitForLoadState('networkidle')
    │
    ├─► Navigation didn't complete?
    │   └─► Check for redirects, use waitForURL with regex
    │
    ├─► API call failed?
    │   └─► Check network tab, verify test data exists
    │
    ├─► Auth expired mid-test?
    │   └─► Refresh auth token, check session timeout
    │
    └─► Flaky/intermittent?
        └─► Add retry logic, check for race conditions
```

## Commit Message Format

```
test(e2e): ✅ {test-id} - {test-name}

- Category: {category}
- File: {file-path}
- Attempts: {attempt-count}
```

Example:
```
test(e2e): ✅ auth-001 - User can log in with valid credentials

- Category: auth
- File: e2e/auth/login.spec.ts
- Attempts: 1
```

## Report Generation

### Summary Section

```markdown
## Summary

| Metric | Value |
|--------|-------|
| Total Tests | 95 |
| Passed | 87 (91.6%) |
| Failed | 5 (5.3%) |
| Skipped | 3 (3.1%) |
| Duration | 45m 32s |
| Commits | 87 |
```

### Failure Details

For each failed test:

```markdown
### ❌ auth-003: User can reset password

**File:** `e2e/auth/password-reset.spec.ts`
**Attempts:** 5
**Last Error:**
```
Error: Timeout waiting for selector [data-testid="reset-email"]
    at resetPassword (e2e/auth/password-reset.spec.ts:15:3)
```

**Screenshot:** [test-results/auth-003-failure.png](./auth-003-failure.png)

**Suggested Fix:**
The email input may be loading asynchronously. Add:
```typescript
await page.waitForSelector('[data-testid="reset-email"]', { timeout: 10000 });
```
```

### Coverage Heatmap

```markdown
## Coverage by Category

| Category | Tests | Passed | Failed | Coverage |
|----------|-------|--------|--------|----------|
| 🟢 auth | 10 | 8 | 2 | 80% |
| 🟢 onboarding | 12 | 12 | 0 | 100% |
| 🟢 dashboard | 25 | 25 | 0 | 100% |
| 🟡 forms | 15 | 13 | 2 | 87% |
| 🟢 navigation | 8 | 8 | 0 | 100% |
| 🔴 settings | 10 | 6 | 4 | 60% |
| 🟢 integrations | 15 | 15 | 0 | 100% |

Legend: 🟢 >90% | 🟡 70-90% | 🔴 <70%
```

## PRD-Driven Mode

When using a PRD as the test manifest:

### Extracting Tests from PRD

```typescript
function extractTestsFromPRD(prd: PRD): Test[] {
  const tests: Test[] = [];
  
  for (const story of prd.stories) {
    for (const criterion of story.acceptanceCriteria) {
      tests.push({
        id: `${story.id.toLowerCase()}-${tests.length + 1}`,
        name: criterion,
        storyId: story.id,
        storyTitle: story.title,
        priority: story.priority || 'medium',
        status: 'pending'
      });
    }
  }
  
  return tests;
}
```

### Updating PRD Status

After tests complete, update the PRD:

```json
{
  "stories": [
    {
      "id": "US-001",
      "title": "User Authentication",
      "status": "tested",
      "testResults": {
        "total": 3,
        "passed": 2,
        "failed": 1,
        "lastRun": "2026-02-28T15:30:00Z"
      }
    }
  ]
}
```

## Recovery from Interruption

If the audit is interrupted:

1. **Load manifest** — Read `e2e-audit-manifest.json`
2. **Find resume point** — First test with status `pending` or `running`
3. **Reset running tests** — Change `running` back to `pending`
4. **Continue execution** — Pick up from resume point

```bash
# Check for interrupted audit
if [ -f "e2e-audit-manifest.json" ]; then
  PENDING=$(jq '[.categories[].tests[] | select(.status == "pending" or .status == "running")] | length' e2e-audit-manifest.json)
  echo "Found interrupted audit with $PENDING tests remaining"
fi
```

## Environment Setup

Before running audit, ensure:

1. **Test environment running:**
   ```bash
   npm run dev  # or appropriate dev server command
   ```

2. **Test database seeded:**
   ```bash
   npm run db:seed:test
   ```

3. **Auth credentials available:**
   ```bash
   export TEST_USER_EMAIL="test@example.com"
   export TEST_USER_PASSWORD="testpassword"
   # Or for OTP: SUPABASE_SERVICE_KEY
   ```

4. **Playwright installed:**
   ```bash
   npx playwright install
   ```

## Integration Points

| Agent | Integration |
|-------|-------------|
| `@e2e-auditor` | Primary consumer of this skill |
| `@e2e-playwright` | Writes individual tests (audit-mode) |
| `@builder` | May invoke auditor before PRD completion |
| `@tester` | Can delegate to auditor for full coverage |
| `@qa` | Complementary: QA finds bugs, auditor verifies features |
