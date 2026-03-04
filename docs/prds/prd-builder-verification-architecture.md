# PRD: Builder Verification Architecture

**Status:** Ready  
**Priority:** High  
**Created:** 2026-03-04  
**Approved:** 2026-03-04  
**Source:** Consolidated from 3 pending updates:
- `2026-03-03-builder-mandatory-ui-verification.md` (HIGH)
- `2026-03-03-builder-app-type-detection-before-testing.md` (CRITICAL)
- `2026-03-04-electron-e2e-cleanup-patterns.md` (documentation)

---

## Problem Statement

Builder completes UI changes without proper verification, often attempting the wrong verification approach for the app architecture. This wastes significant time (10+ minutes observed) and leaves users with unverified changes.

### Observed Failures

1. **Wrong Platform Verification**
   - Builder showed `[V] Verify in browser` for an Electron app
   - Verification should be automatic BEFORE completion, not optional AFTER

2. **Wrong Deployment Model Assumptions**
   - Builder tried to start a localhost dev server for an Electron app that loads remote URLs
   - Wasted 10+ minutes trying approaches that could never work
   - Root cause: didn't check app architecture before attempting verification

3. **Zombie Processes from Failed E2E Tests**
   - Electron E2E tests leave zombie processes when they fail
   - Multiple dock icons appear on macOS
   - No cleanup patterns documented for Electron test teardown

### Root Cause

**Builder doesn't understand app architecture before attempting verification.** The `project.json` schema lacks sufficient information about:
- How the app delivers web content (bundled vs remote)
- What verification method is appropriate
- What cleanup is needed after E2E tests

---

## Proposed Solution

### 1. Schema Enhancement: `webContent` Field

Add a `webContent` field to the `apps[]` schema in `project.json`:

```json
{
  "apps": [
    {
      "name": "desktop",
      "type": "desktop",
      "framework": "electron",
      "webContent": "remote",  // NEW FIELD
      "remoteUrl": "https://app.example.com"  // Required when webContent: "remote"
    }
  ]
}
```

**`webContent` values:**
| Value | Description | Verification Method |
|-------|-------------|---------------------|
| `bundled` | HTML/JS packaged with app (typical Electron) | Local dev or packaged app |
| `remote` | App loads content from deployed URL | Must deploy first, then verify |
| `hybrid` | Some local, some remote content | Context-dependent |
| *(omit)* | Web apps (default localhost dev server) | `npm run dev` + browser |

### 2. Mandatory Pre-Completion Verification Gate

Builder MUST run verification BEFORE showing completion prompt. The verification method depends on app architecture:

```
┌─────────────────────────────────────────────────────────────┐
│ UI Change Detected                                          │
├─────────────────────────────────────────────────────────────┤
│ 1. Check project.json → apps[].type + webContent            │
│ 2. Select verification method:                              │
│    - Web app → Screenshot localhost:PORT                    │
│    - Electron (bundled) → Run Electron E2E or manual        │
│    - Electron (remote) → Screenshot deployed URL            │
│ 3. Run verification automatically                           │
│ 4. Show results to user                                     │
│ 5. THEN show completion prompt                              │
└─────────────────────────────────────────────────────────────┘
```

**Key change:** Remove the generic `[V] Verify in browser` option. Replace with architecture-aware automatic verification.

### 3. Electron E2E Cleanup Patterns

Add `globalSetup.ts` pattern to `e2e-electron` skill (or create if missing):

```typescript
// playwright/globalSetup.ts
import { execSync } from 'child_process';

export default async function globalSetup() {
  // Kill any zombie Electron processes from previous runs
  if (process.platform === 'darwin') {
    try {
      execSync('pkill -9 -f "Electron" || true', { stdio: 'ignore' });
      execSync('killall -9 "YourAppName" || true', { stdio: 'ignore' });
      // Brief delay to ensure processes are fully terminated
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch {
      // Ignore errors - processes may not exist
    }
  }
}
```

**Integration with test-flow skill:**
- Add Electron zombie detection to environment prerequisite checks
- Warn if multiple Electron processes detected before test run
- Auto-cleanup option when detected

---

## User Stories

### Story 1: Architecture-Aware Verification Selection
**As** Builder  
**When** I complete a UI change  
**I should** automatically select the correct verification method based on `project.json` app configuration  
**So that** I don't waste time trying approaches that can't work

**Acceptance Criteria:**
- [ ] Builder reads `apps[].type`, `apps[].framework`, and `apps[].webContent` before verification
- [ ] Web apps → localhost dev server + screenshot
- [ ] Electron (bundled) → Electron E2E or skip with user confirmation
- [ ] Electron (remote) → Check deployed URL + screenshot
- [ ] Unknown architecture → Ask user before attempting

### Story 2: Mandatory Pre-Completion Verification
**As** a user  
**When** Builder completes a UI change  
**I should** see verification results BEFORE the completion prompt  
**So that** I know the change actually works

**Acceptance Criteria:**
- [ ] Verification runs automatically before completion prompt
- [ ] User sees screenshot or test results
- [ ] `[V] Verify` option removed from completion prompt (verification already done)
- [ ] If verification fails, Builder reports failure instead of claiming completion

### Story 3: Electron Zombie Process Cleanup
**As** a developer running Electron E2E tests  
**When** tests fail or are interrupted  
**I should** not accumulate zombie Electron processes  
**So that** my system stays clean and subsequent tests work correctly

**Acceptance Criteria:**
- [ ] `globalSetup.ts` pattern documented in Electron E2E skill
- [ ] Cleanup runs before each test suite
- [ ] Platform-specific cleanup (macOS pkill patterns)
- [ ] test-flow skill detects zombie processes as environment issue

---

## Files to Modify

| File | Changes |
|------|---------|
| `skills/test-flow/SKILL.md` | Add platform/architecture detection, pre-completion verification gate |
| `skills/adhoc-workflow/SKILL.md` | Enforce verification before completion prompt |
| `skills/e2e-electron/SKILL.md` | Add globalSetup cleanup patterns (create if missing) |
| `agents/builder.md` | Remove generic `[V]` option, add architecture-aware verification logic |
| `schemas/project.schema.json` | Add `webContent` field to `apps[]` schema |
| `skills/project-bootstrap/SKILL.md` | Document `webContent` field during project setup |

---

## Out of Scope

- Automatic deployment for Electron remote apps (user must deploy manually)
- Windows/Linux Electron cleanup patterns (macOS only for now)
- Hybrid webContent detection heuristics (user must specify)

---

## Decisions

1. **`webContent` is required for desktop apps**
   - Must be specified when `apps[].type: "desktop"`
   - Prevents wrong verification assumptions at the cost of one config field during setup

2. **Allow override when verification fails but code is correct**
   - Builder can allow user to mark complete even if verification fails
   - Requires explicit user confirmation
   - Warning logged for audit trail

3. **Create new `e2e-electron` skill**
   - Electron testing has unique concerns (zombie processes, app packaging, IPC)
   - Follows existing pattern (`e2e-playwright` is a specialist)
   - `test-flow` remains the router, delegates to `e2e-electron` for Electron apps

---

## Success Metrics

- Zero instances of "tried localhost for Electron remote app"
- Zero post-completion verification prompts (all pre-completion)
- No zombie Electron processes after test runs
- Time-to-verification reduced (no wasted attempts)

---

## Consolidation Notes

This PRD consolidates 3 related pending updates that all stem from the same root issue. After implementation:

1. Delete `pending-updates/2026-03-03-builder-mandatory-ui-verification.md`
2. Delete `pending-updates/2026-03-03-builder-app-type-detection-before-testing.md`
3. Delete `pending-updates/2026-03-04-electron-e2e-cleanup-patterns.md`

All three issues are addressed by understanding app architecture before verification.
