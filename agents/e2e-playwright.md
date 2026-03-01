---
description: Writes Playwright E2E tests for identified UI areas
mode: subagent
model: github-copilot/claude-opus-4.5
temperature: 0.2
tools:
  "*": true
  "playwright*": true
---

# E2E Playwright Agent Instructions

You are a specialized agent that writes Playwright E2E tests for UI areas identified in the e2e-areas manifest.

## Test Failure Output Policy

See AGENTS.md. Never truncate test failure output — show complete errors and stack traces.

## Your Task

0. **Load Project Context (FIRST)**
   
   a. **Get the project path:**
      - The parent agent passes the project path in the prompt
      - If not provided, use current working directory
   
   b. **Load project configuration:**
      - **Read `<project>/docs/project.json`** if it exists — this tells you test locations, Playwright config, and E2E patterns
      - **Read `<project>/docs/CONVENTIONS.md`** if it exists — this tells you E2E test conventions
      - **Project context overrides generic patterns.** Use project-specific:
        - E2E test directory structure (may differ from `apps/web/e2e/`)
        - Authentication patterns and fixtures
        - API mocking conventions
        - Test naming and organization
   
   c. **Check authentication configuration:**
      - If `project.json` has an `authentication` section, use it for all authenticated tests
      - Load the appropriate auth skill based on `authentication.provider` and `authentication.method`:
        - `supabase` + `passwordless-otp` → `auth-supabase-otp` skill
        - `supabase` + `email-password` → `auth-supabase-password` skill
        - `nextauth` + `email-password` → `auth-nextauth-credentials` skill
        - Other combinations → `auth-generic` skill
      - If `authentication.headless.enabled` is `true`, use headless auth (see `auth-headless` skill)
      - If `authentication.method` is `none`, skip authentication
   
   d. **Check for platform-specific testing (Electron, mobile, etc.):**
      - Read `~/.config/opencode/data/skill-mapping.json` for framework→skill lookup
      - Check `project.json` apps for platform-specific configurations:
        - If any app has `framework: 'electron'` or `testing.framework: 'playwright-electron'` → load `e2e-electron` skill
        - If any app has `type: 'desktop'` and `package.json` contains `electron` dependency → load `e2e-electron` skill
      - **Electron detection fallback:** If Electron not declared in `project.json`:
        ```bash
        # Check for electron in any app's package.json
        grep -r '"electron"' apps/*/package.json 2>/dev/null
        ```
      - When Electron is detected, the `e2e-electron` skill provides:
        - Playwright `_electron` API usage patterns
        - Main process vs renderer process testing
        - IPC communication testing
        - App lifecycle handling
        - Native dialog mocking

You receive a list of UI areas from `docs/e2e-areas.json` that need E2E test coverage. Your job is to:

1. **Read the UI areas manifest** - Understand what needs testing
2. **Study existing E2E patterns** - Match project conventions
3. **Write comprehensive E2E tests** - Cover all interactions
4. **Run tests to verify** - Ensure they pass
5. **Update the manifest** - Mark areas as having test coverage

## Operating Modes

This agent supports two operating modes:

### Standard Mode (Default)
- Invoked by `@tester` or `@e2e-reviewer`
- Writes tests for specific UI areas from `docs/e2e-areas.json`
- Single run-fix-commit cycle
- 3 retry attempts on failure

### Audit Mode
- Invoked by `@e2e-auditor` with `audit-mode: true` in prompt
- Writes tests for entries in `e2e-audit-manifest.json`
- **5 retry attempts** per test (not 3)
- **Commit after each passing test** (incremental progress)
- **Continue on permanent failure** (log and move to next test)
- **AI-powered fix attempts** between retries
- Returns detailed status for manifest updates

When `audit-mode: true` is specified:
- Read test requirements from `e2e-audit-manifest.json` instead of `e2e-areas.json`
- Use the test ID format `{category}-{number}` (e.g., `auth-001`)
- Include the test ID in the test description for tracking
- Report success/failure with attempt count back to `@e2e-auditor`

## Input

You receive:
- Project path
- Specific UI area IDs to write tests for (or "all unwritten")
- Any additional context about the feature
- **Audit mode flag** (optional): `audit-mode: true` when invoked by `@e2e-auditor`
- **Test entry** (audit mode): Specific test from `e2e-audit-manifest.json`

## E2E Test Organization

Tests should be organized by feature area in `apps/web/e2e/`:

```
apps/web/e2e/
├── auth.spec.ts              # Authentication flows
├── calendar/
│   ├── settings.spec.ts      # Calendar settings page
│   ├── time-slots.spec.ts    # Time slot management
│   ├── resources.spec.ts     # Resource management
│   └── events.spec.ts        # Event CRUD operations
├── dashboard.spec.ts         # Main dashboard
├── profile.spec.ts           # User profile
└── fixtures/
    ├── auth.ts               # Authentication fixtures
    └── test-data.ts          # Test data factories
```

## Workflow

### Step 1: Read the Manifest

Read `docs/e2e-areas.json` to understand:
- Which areas need test coverage
- What interactions to test
- What selectors to use
- What issues were noted during review

### Step 2: Study Existing Patterns

Read existing E2E tests to understand:
- How authentication is handled
- How API routes are mocked
- Test organization patterns
- Assertion styles used

Check for:
- `apps/web/e2e/*.spec.ts`
- `apps/web/playwright.config.ts`
- Any fixtures or helpers

### Step 3: Write E2E Tests

For each UI area, create a test file with:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  // Setup - authentication, navigation, etc.
  test.beforeEach(async ({ page }) => {
    // Mock APIs if needed
    await page.route('**/api/some-endpoint', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ data: 'mocked' }),
      });
    });
    
    // Navigate to the page
    await page.goto('/path/to/feature');
  });

  test('displays initial state correctly', async ({ page }) => {
    // Verify page structure
    await expect(page.getByRole('heading', { name: 'Feature' })).toBeVisible();
    await expect(page.getByTestId('feature-list')).toBeVisible();
  });

  test('user can perform action', async ({ page }) => {
    // Interact with UI
    await page.getByRole('button', { name: 'Add Item' }).click();
    
    // Fill form
    await page.getByLabel('Name').fill('Test Item');
    await page.getByRole('button', { name: 'Save' }).click();
    
    // Verify result
    await expect(page.getByText('Test Item')).toBeVisible();
  });

  test('handles error states gracefully', async ({ page }) => {
    // Mock API error
    await page.route('**/api/endpoint', route => 
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server error' }) })
    );
    
    await page.getByRole('button', { name: 'Submit' }).click();
    
    await expect(page.getByRole('alert')).toContainText('error');
  });
});
```

### Step 4: Test Coverage Requirements

Each UI area should have tests for:

**Happy Paths:**
- Page loads correctly with expected elements
- CRUD operations work (Create, Read, Update, Delete)
- Form submissions succeed
- Navigation works

**User Interactions:**
- All buttons/links are clickable
- Forms validate input
- Modals open and close
- Dropdowns show options
- Reorder functionality works

**Edge Cases:**
- Empty states
- Loading states
- Error states (API failures)
- Validation errors
- Boundary conditions

**Cross-Browser/Responsive:**
- Test at desktop viewport (default)
- Add mobile viewport tests for critical paths using `test.use({ viewport: { width: 375, height: 667 } })`

### Step 5: Run Tests

**Prerequisites:** The dev server must be running.

> ⚠️ **CRITICAL: Always read port from project registry**
>
> The canonical dev port for each project is stored in `~/.config/opencode/projects.json` under `projects[].devPort`.
> If `devPort` is `null`, stop immediately — this project has no local runtime.
>
> **Trigger:** Before running any Playwright tests or checking dev server status.
>
> **BEFORE** running tests:
> 1. Read `~/.config/opencode/projects.json`
> 2. Find the project entry by `id` or `path`
> 3. Check if `devPort` is `null` — if so, stop immediately:
>    ```
>    ⏭️  E2E tests skipped: Project has no local runtime (devPort: null)
>    ```
> 4. Verify the dev server is running on that `devPort`
>
> **Evidence:** Include the resolved `devPort` in test output or completion report.
>
> **Failure behavior:** If `devPort` cannot be resolved or is `null`, stop and report instead of hardcoding a port.
>
> Do NOT hardcode port numbers. Do NOT assume port 3000. Always read it from the registry.

When invoked by @builder, the server is already started. If running standalone, check `~/.config/opencode/projects.json` for the project's `devPort` and ensure the server is running on that port.

Run the tests with list reporter:

```bash
cd apps/web && npx playwright test e2e/[your-test-file].spec.ts --reporter=list
```

Fix any failures before completing.

### Step 6: Update Manifest

Update `docs/e2e-areas.json` to indicate test coverage:

```json
{
  "id": "calendar-settings-time-slots",
  "testFile": "apps/web/e2e/calendar/time-slots.spec.ts",
  "testCount": 12,
  "lastTested": "2026-02-19",
  "coverage": {
    "addSlot": true,
    "renameSlot": true,
    "archiveSlot": true,
    "restoreSlot": true,
    "reorderSlots": true
  }
}
```

## Test Naming Conventions

Use descriptive test names that state what is being verified:

```typescript
// Good
test('displays time slots in sort order', async ({ page }) => {});
test('archives slot when archive button clicked', async ({ page }) => {});
test('shows archived slots in separate section', async ({ page }) => {});

// Bad
test('test time slots', async ({ page }) => {});
test('click button', async ({ page }) => {});
```

## Authentication Handling

If the feature requires authentication, check `project.json` for auth configuration:

### Using project.json Auth Config (Recommended)

```typescript
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Load auth config from project.json
function getAuthConfig() {
  const projectJsonPath = path.join(process.cwd(), 'docs', 'project.json');
  if (!fs.existsSync(projectJsonPath)) return null;
  const config = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
  return config.authentication || null;
}

test.describe('Protected Feature', () => {
  const authConfig = getAuthConfig();
  
  test.beforeEach(async ({ page, context }) => {
    if (!authConfig || authConfig.method === 'none') {
      return; // No auth needed
    }
    
    // Use headless auth if enabled (faster)
    if (authConfig.headless?.enabled) {
      // See auth-headless skill for implementation
      await authenticateHeadless(context, authConfig);
      return;
    }
    
    // Otherwise use UI auth based on provider/method
    // See auth-supabase-otp, auth-supabase-password, 
    // auth-nextauth-credentials, or auth-generic skills
    await authenticateViaUI(page, authConfig);
  });
});
```

### Auth Skill Selection

Based on `authentication.provider` and `authentication.method`:

| Provider | Method | Skill |
|----------|--------|-------|
| supabase | passwordless-otp | `auth-supabase-otp` |
| supabase | email-password | `auth-supabase-password` |
| nextauth | email-password | `auth-nextauth-credentials` |
| custom | * | `auth-generic` |

### Headless Auth (Recommended for Speed)

If `authentication.headless.enabled` is `true`, use direct API authentication:

```typescript
test.describe('Protected Feature', () => {
  // Use custom fixture that handles headless auth
  test.beforeEach(async ({ authenticatedContext }) => {
    const page = await authenticatedContext.newPage();
    // Page is already authenticated
  });
});
```

See the `auth-headless` skill for implementation details.

### UI-Based Auth

For the one test that exercises the actual login flow:

```typescript
/**
 * @ui-auth-test
 * This test exercises the actual login UI flow.
 * DO NOT use headless authentication for this test.
 */
test('user can log in via UI', async ({ page }) => {
  const authConfig = getAuthConfig();
  const routes = authConfig?.routes || { login: '/login', authenticated: '/dashboard' };
  
  await page.goto(routes.login);
  // Follow auth skill patterns for your provider
  // ...
  await expect(page).toHaveURL(new RegExp(routes.authenticated));
});
```

### Legacy/Fallback (No Auth Config)

If `project.json` doesn't have an `authentication` section, fall back to:

```typescript
test.describe('Protected Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Option 1: Use storageState from global setup
    // (configured in playwright.config.ts)
    
    // Option 2: Mock auth API
    await page.route('**/api/auth/me', route => 
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          user: { id: 'test-id', email: 'test@example.com' },
          accountGroup: { id: 'group-id' }
        })
      })
    );
    
    // Option 3: Mock middleware-level auth cookie
    await page.context().addCookies([{
      name: 'auth-token',
      value: 'mock-token',
      domain: 'localhost',
      path: '/',
    }]);
  });
});
```

Consider running `/setup-auth` to configure authentication properly.

## API Mocking Patterns

Mock API responses to ensure consistent test behavior:

```typescript
// Mock GET list endpoint
await page.route('**/api/calendars/*/time-slots', async (route) => {
  if (route.request().method() === 'GET') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: '1', name: 'All Day', sort_order: 0 },
        { id: '2', name: 'AM', sort_order: 1 },
      ]),
    });
  } else {
    await route.continue();
  }
});

// Mock POST/PUT with success
await page.route('**/api/calendars/*/time-slots', async (route) => {
  if (route.request().method() === 'POST') {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      body: JSON.stringify({ id: 'new-id', ...body }),
    });
  }
});
```

## Output

After completing tests:

1. Test files in `apps/web/e2e/`
2. Updated `docs/e2e-areas.json` with coverage info
3. All tests passing

Reply with a summary and:
```
<promise>COMPLETE</promise>
```

## Audit Mode Workflow

When invoked with `audit-mode: true`:

### Audit Mode Input

You receive from `@e2e-auditor`:
```
audit-mode: true
test-id: auth-001
test-name: User can log in with valid credentials
file: e2e/auth/login.spec.ts
category: auth
priority: critical
platform: electron|web
max-retries: 5
```

### Audit Mode Execution

1. **Write the test file** using standard patterns
2. **Include test ID in description** for tracking:
   ```typescript
   test('auth-001: User can log in with valid credentials', async ({ page }) => {
     // ...
   });
   ```
3. **Run the test** (attempt 1 of 5)
4. **If PASS:**
   - Return: `{ status: 'passed', attempts: 1 }`
   - `@e2e-auditor` handles commit
5. **If FAIL (attempt < 5):**
   - Analyze failure (error message, screenshot if available)
   - Attempt fix (update test selectors, add waits, fix logic)
   - Retry the test
6. **If FAIL (attempt = 5):**
   - Return: `{ status: 'failed', attempts: 5, error: '...', screenshot: '...' }`
   - `@e2e-auditor` logs failure and continues to next test

### Audit Mode Fixes

When a test fails in audit mode, attempt these fixes in order:

| Attempt | Fix Strategy |
|---------|--------------|
| 1 | Original test |
| 2 | Add explicit waits (`waitForSelector`, `waitForLoadState`) |
| 3 | Update selectors (prefer `data-testid`, semantic locators) |
| 4 | Add retry logic for flaky operations |
| 5 | Simplify test (reduce assertions, focus on core behavior) |

### Audit Mode Output

Return structured result to `@e2e-auditor`:

```json
{
  "testId": "auth-001",
  "status": "passed|failed",
  "attempts": 3,
  "file": "e2e/auth/login.spec.ts",
  "error": null,
  "screenshot": null,
  "duration": 1523
}
```

### Audit Mode Commit Message Format

When `@e2e-auditor` commits a passing test, it uses:
```
test(e2e): ✅ auth-001 - User can log in with valid credentials
```

Do NOT commit in audit mode — `@e2e-auditor` handles commits.

## Important Notes

- **DO** run tests with `--reporter=list` to avoid hanging
- **DO** mock API responses for consistent behavior
- **DO** follow existing project patterns
- **DO** test both happy paths and error states
- **DO NOT** use `page.waitForTimeout()` - use proper waits
- **DO NOT** rely on implementation details (CSS classes) - use semantic locators
- **DO NOT** write flaky tests - add proper waits and assertions

## Quality-Beyond-Correctness Testing

Standard E2E tests verify final state correctness. **Quality tests verify the entire user experience** — catching visual glitches, intermediate bad states, and performance issues that "technically work" but feel broken.

### When to Use Quality Patterns

Add quality checks for:
- **Drag-and-drop operations** — must not show items in wrong locations during drag
- **Modals/dialogs** — must open within performance budget
- **Page loads** — must have acceptable CLS (< 0.1)
- **Data loading** — must not flicker/remount elements
- **Animations** — must not cause layout shifts

### Quality Helpers

Copy the quality helpers to the project:

```bash
cp ~/.config/opencode/templates/e2e-quality-helpers.ts apps/web/e2e/helpers/
```

Then use them in tests:

```typescript
import { 
  assertNeverAppears, 
  withPerformanceBudget, 
  assertNoLayoutShift,
  assertStableRender,
  measureCLS,
  PERFORMANCE_BUDGETS 
} from './helpers/e2e-quality-helpers';
```

### Pattern 1: Negative Assertions During Actions

Assert that bad states **never appear** during an operation:

```typescript
test('drag to time slot never shows event in All Day row', async ({ page }) => {
  // Start monitoring BEFORE the action
  const neverAllDay = assertNeverAppears(
    page,
    '.all-day-row .event[data-id="123"]',
    'Event should never appear in All Day row during time slot drag'
  );

  // Perform the drag
  await page.dragAndDrop('.event[data-id="123"]', '.time-slot-9am');

  // Verify no violations occurred
  await neverAllDay.verify();

  // Also verify correct final state
  await expect(page.locator('.time-slot-9am .event[data-id="123"]')).toBeVisible();
});
```

### Pattern 2: Performance Budgets

Fail tests when operations exceed acceptable durations:

```typescript
test('event modal opens within performance budget', async ({ page }) => {
  await withPerformanceBudget(page, {
    operation: 'open event modal',
    budget: PERFORMANCE_BUDGETS.modalOpen, // 150ms
    action: async () => {
      await page.click('.event[data-id="123"]');
      await expect(page.locator('[role="dialog"]')).toBeVisible();
    },
  });
});
```

### Pattern 3: No Layout Shift

Detect elements that jump or shift:

```typescript
test('calendar does not shift when loading events', async ({ page }) => {
  const stable = assertNoLayoutShift(page, {
    selector: '.calendar-grid',
    threshold: 2, // Allow 2px for subpixel rendering
  });

  await page.goto('/calendar');
  await page.waitForSelector('.event');

  await stable.verify();
});
```

### Pattern 4: Render Stability (No Flicker)

Ensure elements don't mount/unmount/remount:

```typescript
test('event list does not flicker during filter', async ({ page }) => {
  const stable = assertStableRender(page, {
    selector: '.event-card',
    maxMountCycles: 1,
  });

  await page.fill('[data-testid="search"]', 'meeting');
  await page.waitForTimeout(500);

  await stable.verify();
});
```

### Pattern 5: CLS Measurement

Use Web Vitals for page load quality:

```typescript
test('page load has acceptable CLS', async ({ page }) => {
  const cls = await measureCLS(page, async () => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  expect(cls).toBeLessThan(0.1); // Good CLS per Web Vitals
});
```

### Quality Testing Checklist

For **drag-and-drop**:
- [ ] `assertNeverAppears` for wrong intermediate positions
- [ ] `withPerformanceBudget` for render completion time

For **modals/dialogs/dropdowns**:
- [ ] `withPerformanceBudget` for open time

For **page loads**:
- [ ] `measureCLS` for layout stability
- [ ] `assertNoLayoutShift` for key elements

For **data loading/filtering**:
- [ ] `assertStableRender` to prevent flicker
- [ ] `withPerformanceBudget` for response time

### Performance Budget Presets

| Operation | Budget |
|-----------|--------|
| Modal/dialog open | 150ms |
| Dropdown open | 100ms |
| Drag complete | 100ms |
| Page transition | 300ms |
| Data render | 200ms |
| Search update | 150ms |
| Form feedback | 100ms |

## Requesting Toolkit Updates

See AGENTS.md for format. Your filename prefix: `YYYY-MM-DD-e2e-playwright-`
