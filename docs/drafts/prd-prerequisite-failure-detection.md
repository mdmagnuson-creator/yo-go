# PRD: Prerequisite Failure Detection and Automated Fix Loop

**Status:** DRAFT  
**Created:** 2026-03-03  
**Author:** @toolkit (on behalf of user)

---

## Problem Statement

When a verification test fails, the current system assumes the failure is related to the feature being tested. However, tests often fail at **prerequisite steps** that are unrelated to the feature:

**Example scenario:**
1. User adds a new menu option nested deep in the UI
2. Playwright verification test tries to navigate to that menu
3. Test fails at the **login step** due to an auth bug
4. Current system treats this as "verification failed" and blocks the task

**What's wrong:**
- The menu feature might be perfectly fine
- The auth bug is a **separate, pre-existing issue**
- User is blocked from completing their feature work
- No clear path forward — fix auth first? Skip? Override?
- **No automation** — user has to manually orchestrate fixing the prerequisite

This creates confusion, false blockers, and unnecessary manual intervention.

---

## Goals

1. **Detect prerequisite failures** — Distinguish "login failed" from "menu option broken"
2. **Automated fix loop** — Automatically attempt to fix prerequisites, verify, and retry the original test
3. **Clear reporting** — Tell user exactly what failed and what was attempted
4. **Bounded attempts** — Stop after 3 failed fix attempts on any single component
5. **Track blockers** — Log prerequisite failures and fix attempts for visibility
6. **Graceful degradation** — When automation fails, provide clear manual options

---

## Non-Goals

- Running partial verification (skipping login) — tests should be realistic
- Complex dependency graphs between tests
- Infinite fix loops — bounded to 3 attempts per component

---

## User Stories

### Story 1: Detect Prerequisite Failures

**As a** developer whose verification test failed at login  
**I want** Builder to recognize this is a prerequisite failure  
**So that** I understand the menu feature itself wasn't tested

**Acceptance Criteria:**
- [ ] Test failures are categorized as "prerequisite" vs "feature"
- [ ] Prerequisite failures identified by failure location (before reaching feature under test)
- [ ] Common prerequisites detected: login, navigation to page, page load, data setup
- [ ] Failure report clearly labels "PREREQUISITE FAILURE" vs "FEATURE FAILURE"

### Story 2: Automated Prerequisite Fix Loop

**As a** developer whose verification test failed at a prerequisite  
**I want** Builder to automatically attempt to fix the prerequisite and retry  
**So that** I don't have to manually orchestrate the fix

**Acceptance Criteria:**
- [ ] When prerequisite failure detected, check if existing test covers that prerequisite
- [ ] If test exists, run that test to confirm the issue
- [ ] Delegate fix to appropriate agent (@developer or @e2e-playwright)
- [ ] After fix, re-run the prerequisite test to verify
- [ ] If prerequisite now passes, retry original feature verification
- [ ] Loop continues until feature test passes OR 3 failed fix attempts on any component
- [ ] Each fix attempt is logged with: what was tried, result, time taken

### Story 3: Bounded Fix Attempts with Clear Stop Conditions

**As a** developer  
**I want** the automated fix loop to stop after reasonable attempts  
**So that** I don't wait forever on an unfixable issue

**Acceptance Criteria:**
- [ ] Max 3 fix attempts per component (prerequisite or feature)
- [ ] Stop immediately if same exact error occurs twice in a row (no progress)
- [ ] Track attempts per component separately (auth: 2/3, feature: 1/3)
- [ ] When stopped, log full situation to `verification-failures.json`
- [ ] Clear report to user: what was attempted, what failed, why stopped

### Story 4: Clear Failure Reporting (Manual Fallback)

**As a** developer when automation couldn't fix the issue  
**I want** a clear explanation of what happened and what was tried  
**So that** I can take over manually

**Acceptance Criteria:**
- [ ] Report shows: original feature, prerequisite that failed, fix attempts made
- [ ] Report explicitly states: "Automated fix failed after X attempts"
- [ ] Report includes: error messages, screenshots at each failure point
- [ ] Manual options provided: [M] Fix manually, [S] Skip with reason, [A] Abandon
- [ ] All fix attempt history preserved for debugging

### Story 5: Track Fix Attempts and Blockers

**As a** team lead reviewing test health  
**I want** to see patterns in prerequisite failures and fix success rates  
**So that** I can identify systemic issues

**Acceptance Criteria:**
- [ ] `verification-failures.json` tracks all automated fix attempts
- [ ] Each entry includes: feature, prerequisite, attempts, outcome, duration
- [ ] Aggregated view: "Auth login failed 5 times this week, 3 auto-fixed, 2 manual"
- [ ] Prerequisite health score: % of prerequisite failures that auto-resolve

---

## Technical Specification

### Prerequisite Detection Logic

**How to detect a prerequisite failure:**

1. **Test structure analysis** — Verification tests have documented "how to reach" steps
2. **Failure location** — Did the test fail BEFORE reaching the feature assertions?
3. **Common patterns** — Login failures, 404s, timeouts on navigation, missing test data

**Detection heuristics:**

| Failure Pattern | Classification | Confidence |
|-----------------|----------------|------------|
| Login/auth error before feature test | Prerequisite | High |
| 404/500 on navigation to feature | Prerequisite | High |
| Timeout on page load (not on feature element) | Prerequisite | Medium |
| Missing test data (user, account, etc.) | Prerequisite | High |
| Element not found for feature under test | Feature | High |
| Assertion failed on feature behavior | Feature | High |
| Timeout on feature element specifically | Feature | High |

**Test file analysis:**

```typescript
/**
 * @verification-test
 * @component ProfileDropdown
 * @reach /dashboard → click user avatar
 * @prerequisites
 *   - User must be logged in
 *   - Dashboard page must load
 * @feature-assertions
 *   - Dropdown appears on click
 *   - Menu items are visible
 */
```

If failure occurs BEFORE `@feature-assertions`, it's a prerequisite failure.

### Automated Fix Loop Algorithm

**Core loop:**

```
Run feature verification test
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ TEST RESULT?                                                         │
│                                                                     │
│ ├─── PASS ──► ✅ Feature verified, DONE                             │
│ │                                                                   │
│ └─── FAIL ──► Classify failure (prerequisite vs feature)           │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼ (FAIL)
┌─────────────────────────────────────────────────────────────────────┐
│ CLASSIFY FAILURE                                                     │
│                                                                     │
│ ├─── PREREQUISITE (e.g., login failed) ──► Fix prerequisite first  │
│ │                                                                   │
│ └─── FEATURE (e.g., menu item not found) ──► Fix feature           │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FIX LOOP (for failed component)                                      │
│                                                                     │
│ 1. Check: Is there an existing test for this component?             │
│    ├─── YES ──► Run that test to confirm the issue                  │
│    └─── NO ──► Use error message to guide fix                       │
│                                                                     │
│ 2. Delegate fix to appropriate agent:                               │
│    • @developer — for code/logic issues                             │
│    • @e2e-playwright — for test/selector issues                     │
│                                                                     │
│ 3. After fix, re-run the component's test                           │
│    ├─── PASS ──► Component fixed, retry original feature test       │
│    └─── FAIL ──► Increment attempt counter, check stop conditions   │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STOP CONDITIONS (check after each fix attempt)                       │
│                                                                     │
│ STOP if ANY of these are true:                                       │
│ • Component has 3 failed fix attempts                               │
│ • Same exact error occurred twice in a row (no progress)            │
│ • Total loop iterations > 10 (runaway prevention)                   │
│                                                                     │
│ If stopped ──► Log to verification-failures.json, report to user   │
└─────────────────────────────────────────────────────────────────────┘
```

**State tracking during loop:**

```json
{
  "verificationLoop": {
    "originalFeature": "tests/ui-verify/profile-dropdown-settings.spec.ts",
    "startedAt": "2026-03-03T10:30:00Z",
    "totalIterations": 0,
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

**Finding existing tests for prerequisites:**

When a prerequisite fails (e.g., "login"), search for existing tests:

1. Check `tests/e2e/` for files matching the prerequisite name (auth.spec.ts, login.spec.ts)
2. Check test manifests or indexes if they exist
3. If no dedicated test exists, use the error context to guide the fix

**Example flow — Auth failure blocks menu feature:**

```
Iteration 1:
  Run: profile-dropdown-settings.spec.ts
  Result: FAIL at login step
  Classification: PREREQUISITE (auth-login)
  
  → Found existing test: tests/e2e/auth.spec.ts
  → Run auth.spec.ts to confirm issue
  → Result: FAIL — confirms auth is broken
  → Delegate to @developer: "Fix login timeout issue"
  → @developer fixes: adds missing data-testid to login button
  → Re-run auth.spec.ts
  → Result: PASS — auth fixed
  
Iteration 2:
  Run: profile-dropdown-settings.spec.ts (retry original)
  Result: FAIL at feature assertion
  Classification: FEATURE (profile-dropdown-settings)
  
  → Delegate to @developer: "Fix missing settings menu item"
  → @developer fixes: adds Settings option to dropdown
  → Re-run profile-dropdown-settings.spec.ts
  → Result: PASS
  
✅ FEATURE VERIFIED (after 2 iterations, 1 prerequisite fix, 1 feature fix)
```

**Example flow — Unfixable issue after 3 attempts:**

```
Iteration 1-3:
  Run: profile-dropdown-settings.spec.ts
  Result: FAIL at login step each time
  
  Attempts on auth-login:
    1. @developer: Added data-testid → still fails
    2. @developer: Fixed form submit handler → still fails  
    3. @developer: Updated auth API call → still fails
  
  STOP: auth-login has 3 failed attempts
  
❌ AUTOMATED FIX FAILED

Logged to verification-failures.json
Report to user with full history
```

### Failure Report Format

**During automated fix (progress update):**

```
═══════════════════════════════════════════════════════════════════════
              🔄 AUTO-FIXING PREREQUISITE FAILURE
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Status: Fixing prerequisite...

Prerequisite that failed:
  ❌ Login: "Timeout waiting for '[data-testid="login-submit"]'"

Action in progress:
  → Running existing test: tests/e2e/auth.spec.ts (confirming issue)
  → Will delegate fix to @developer
  → Will retry feature test after fix

Progress: Attempt 1/3 on auth-login
═══════════════════════════════════════════════════════════════════════
```

**After successful auto-fix:**

```
═══════════════════════════════════════════════════════════════════════
              ✅ VERIFICATION PASSED (Auto-Fixed)
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Status: VERIFIED

Auto-fix summary:
  ✅ auth-login: Fixed in 1 attempt (added data-testid to login button)
  ✅ profile-dropdown-settings: Fixed in 1 attempt (added Settings option)

Total time: 2m 15s
Iterations: 2

Tests updated:
  • tests/e2e/auth.spec.ts (prerequisite)
  • tests/ui-verify/profile-dropdown-settings.spec.ts (feature)
═══════════════════════════════════════════════════════════════════════
```

**After automated fix fails (manual fallback):**

```
═══════════════════════════════════════════════════════════════════════
              ❌ AUTOMATED FIX FAILED
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Status: BLOCKED (could not auto-fix)

Component that couldn't be fixed:
  ❌ auth-login: 3 attempts, still failing
  
Fix attempts made:
  1. @developer: Added data-testid to login button
     Result: FAIL — same timeout error
  2. @developer: Fixed form submit handler async issue
     Result: FAIL — same timeout error
  3. @developer: Updated auth API endpoint call
     Result: FAIL — same timeout error

Last error: "Timeout waiting for '[data-testid="login-submit"]'"
Screenshot: ai-tmp/verification/screenshots/auth-attempt-3.png

This has been logged to verification-failures.json

Options:
  [M] Fix manually, then type "retry"
  [S] Skip verification (override with reason)
  [A] Abandon task

> _
═══════════════════════════════════════════════════════════════════════
```

**Prerequisite failure (legacy format, shown only if auto-fix disabled):**

```
═══════════════════════════════════════════════════════════════════════
              ⚠️ VERIFICATION BLOCKED (Prerequisite Failure)
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Status: NOT TESTED (blocked by prerequisite)

Prerequisite that failed:
  ❌ Login: "Timeout waiting for '[data-testid="login-submit"]'"
  
  This appears to be an auth/login issue, not a problem with your feature.
  Your menu option change was NOT tested.

Screenshot: ai-tmp/verification/screenshots/login-failure.png

Options:
  [F] Fix auth issue first (creates new task)
  [R] Retry verification (in case transient)
  [B] Mark complete as "verification blocked" (tracks blocker)
  [S] Skip verification (override with reason)

> _
═══════════════════════════════════════════════════════════════════════
```

**Feature failure (for contrast):**

```
═══════════════════════════════════════════════════════════════════════
                    ❌ VERIFICATION FAILED (Feature Issue)
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Status: FAILED

Feature assertion that failed:
  ❌ Element [data-testid="settings-menu-item"] not found
  
  The test reached the dropdown but could not find your new menu item.
  This suggests an issue with the feature implementation.

Screenshot: ai-tmp/verification/screenshots/dropdown-open-no-settings.png

Options:
  [D] Debug with @developer
  [R] Retry verification
  [S] Skip verification (adds to test debt)

> _
═══════════════════════════════════════════════════════════════════════
```

### test-debt.json Structure

```json
{
  "prerequisiteBlockers": [
    {
      "id": "auth-login-timeout",
      "prerequisite": "login",
      "error": "Timeout waiting for '[data-testid=\"login-submit\"]'",
      "firstSeen": "2026-03-03T10:30:00Z",
      "affectedFeatures": [
        {
          "story": "US-005",
          "feature": "Add Settings menu option",
          "blockedAt": "2026-03-03T10:30:00Z"
        },
        {
          "story": "US-007", 
          "feature": "Add Logout confirmation",
          "blockedAt": "2026-03-03T11:15:00Z"
        }
      ],
      "status": "open"
    }
  ],
  "featureFailures": [
    // ... existing structure for actual feature failures
  ]
}
```

### "Verification Blocked" Status

When user chooses `[B] Mark complete as "verification blocked"`:

1. Task/story marked complete with special status
2. Completion message shows:
   ```
   ✅ STORY US-005 COMPLETE (verification blocked)
   
   Summary: Added Settings menu option to profile dropdown
   
   Verification: ⚠️ BLOCKED
     Reason: Login prerequisite failed (auth issue)
     Blocker ID: auth-login-timeout
     
   When auth is fixed, run: verify-blocked US-005
   ```
3. Story completion notes include: `"verificationBlocked": "auth-login-timeout"`
4. Feature is tracked for re-verification when blocker is resolved

### Bulk Re-verification

When a prerequisite blocker is fixed:

```
User: auth is fixed

Builder: Found 3 features blocked by auth-login-timeout:
  - US-005: Add Settings menu option
  - US-007: Add Logout confirmation  
  - US-012: Add Profile edit link

Run verification for all? [Y/N]
```

---

## Implementation Plan

### Phase 1: Test Structure Markers

**Files to modify:**
- `agents/e2e-playwright.md` — Add `@prerequisites` and `@feature-assertions` markers to verification test format

**Deliverables:**
- [ ] Test file JSDoc format with @prerequisites and @feature-assertions sections
- [ ] Documentation on how markers are used for failure classification
- [ ] Example test file structure

### Phase 2: Prerequisite Detection Logic

**Files to modify:**
- `skills/test-flow/SKILL.md` — Add prerequisite failure detection algorithm

**Deliverables:**
- [ ] Failure classification logic (prerequisite vs feature)
- [ ] Detection heuristics table (login failures, 404s, timeouts, etc.)
- [ ] Parse @prerequisites/@feature-assertions markers from test files
- [ ] Screenshot capture at failure point with classification label

### Phase 3: Automated Fix Loop

**Files to modify:**
- `skills/test-flow/SKILL.md` — Add automated fix loop workflow
- `agents/builder.md` — Add fix loop orchestration and state tracking

**Deliverables:**
- [ ] Fix loop algorithm with state tracking (verificationLoop object)
- [ ] Finding existing tests for prerequisites (search tests/e2e/)
- [ ] Delegation to @developer or @e2e-playwright for fixes
- [ ] Component-level attempt tracking (auth: 2/3, feature: 1/3)
- [ ] Stop conditions: 3 attempts per component, same error twice, >10 iterations
- [ ] Progress report format during fix loop

### Phase 4: Failure Logging & Manual Fallback

**Files to modify:**
- `skills/test-flow/SKILL.md` — Add verification-failures.json logging
- `agents/builder.md` — Add manual fallback options after auto-fix failure

**Deliverables:**
- [ ] verification-failures.json structure and write logic
- [ ] Full failure report with fix attempt history
- [ ] Manual options: [M] Fix manually, [S] Skip with reason, [A] Abandon
- [ ] Screenshot preservation for all failure states

### Phase 5: Blocker Tracking & Bulk Re-verification

**Files to modify:**
- `agents/builder.md` — Add blocker resolution command and bulk re-verification
- `skills/test-flow/SKILL.md` — Add blocker status management

**Deliverables:**
- [ ] test-debt.json prerequisiteBlockers section
- [ ] "Verification blocked" completion status
- [ ] Bulk re-verification when blocker fixed (verify-blocked command)
- [ ] Blocker status updates (open → resolved)
- [ ] Affected features list and batch re-run

---

## Open Questions

1. **How should Builder route fixes?**
   - Currently spec says "delegate to @developer or @e2e-playwright"
   - Heuristic needed: code/logic issues → @developer, selector/test issues → @e2e-playwright
   - Could parse error type: "element not found" → likely selector; "TypeError" → likely code

2. **Should we support auto-fix disable per project?**
   - Some teams may prefer manual control
   - Add `agents.verification.autoFixLoop: boolean` to project.json?
   - Default: true (auto-fix enabled)

3. **What if the fix breaks something else?**
   - @developer might fix auth but break another test
   - Should we run a broader test suite after each fix?
   - Or just trust the targeted test and catch regressions later?

4. **How to handle long-running fix attempts?**
   - What if @developer takes 5 minutes to analyze + fix?
   - Should we have a per-attempt timeout?
   - Or trust the delegated agent to complete or fail?

---

## Resolved Questions

| Question | Resolution |
|----------|------------|
| Confidence in prerequisite detection | Use @prerequisites/@feature-assertions markers — failure location determines classification |
| What if prerequisite is flaky | Transient failures handled by flaky test detection (PRD 1) before this logic runs |
| Should we diagnose WHY prerequisite failed | Yes — error message + screenshot provided; @developer gets full context |
| "Verification blocked" as tech debt | Tracked in test-debt.json separately as prerequisiteBlockers |

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-03-03 | @toolkit | Initial draft based on user question about auth failures blocking feature verification |
| 2026-03-03 | @toolkit | Added automated fix loop algorithm, state tracking, implementation phases, resolved open questions |
