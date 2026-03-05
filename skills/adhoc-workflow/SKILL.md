---
name: adhoc-workflow
description: "Ad-hoc mode workflow for Builder. Use when handling direct requests without a PRD, quick fixes, or one-off tasks. Triggers on: ad-hoc mode, quick fix, direct request, one-off task."
---

# Ad-hoc Workflow

> Load this skill when: handling direct requests without a PRD, ad-hoc mode, quick fixes, one-off tasks.

## Overview

Ad-hoc mode now includes a **mandatory Analysis Phase** that generates **Task Specs** — planning documents that mirror the PRD lifecycle while maintaining strict separation from Planner's domain.

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  PHASE 0: ANALYSIS  │ ──► │  PHASE 1: EXECUTE   │ ──► │   PHASE 2: SHIP     │
│                     │     │                     │     │                     │
│ Analyze request,    │     │ Implement stories,  │     │ Commit, merge,      │
│ generate Task Spec, │     │ auto quality        │     │ push to main        │
│ confirm with user   │     │ checks per task     │     │                     │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
        │                                                       ▲
        │                    [N] Next story ────────────────────┘
        │                    [C] Commit ─────────────────────────┘
        │
        └── [P] Promote to PRD (handoff to Planner)
```

## Context Loading (CRITICAL — Do This First)

> ⚠️ **Ad-hoc tasks fail when project context is missing or stale.**
>
> Before starting ANY ad-hoc work, verify these files exist and read them:
> 1. `docs/project.json` — stack, commands, capabilities
> 2. `docs/CONVENTIONS.md` — coding standards
>
> **Failure behavior:** If you cannot read these files, STOP and ask the user to verify the project path. Do not proceed with assumptions.
>
> Keep this context in memory and pass it to ALL sub-agents via context blocks.

**On entering ad-hoc mode:**

1. Read `docs/project.json` and note:
   - `stack` — framework/language
   - `commands` — test, lint, build commands
   - `styling` — CSS framework, dark mode
   - `testing` — test framework, patterns
   - `agents.prdRecommendationThreshold` — when to recommend PRD (default: `medium`)
   - `agents.analysisTimeoutMs` — analysis time limit (default: 10000)
   - `agents.taskSpecEnabled` — whether Task Specs are enabled (default: true)

2. Read `docs/CONVENTIONS.md` and prepare a 2-5 sentence summary of key patterns

3. Store this context for the session — you'll pass it to @developer, @tester, @critic

---

## User Summary Detection

> ⛔ **CRITICAL: User summaries accelerate analysis — they do NOT skip verification.**
>
> When a user provides context about what they changed or what the fix does, this is helpful input for analysis. It is NOT a substitute for:
> - Running tests
> - Browser verification (for UI/CORS/security changes)
> - Quality checks
>
> **Failure behavior:** If you treat a user summary as verification evidence, you are skipping mandatory checks.

### What User Summaries Are

User summaries are helpful context that can:

| Benefit | Example |
|---------|---------|
| Accelerate file discovery | "I changed the CORS config in `src/middleware/cors.ts`" |
| Clarify intent | "This fixes the 403 error on cross-origin requests" |
| Identify scope | "It's a one-line change to add the missing header" |
| Suggest verification approach | "You can test it by hitting the API from a different origin" |

### What User Summaries Are NOT

User summaries are NOT verification evidence. They cannot:

| NOT This | Why |
|----------|-----|
| Replace browser testing | User may not have tested all scenarios |
| Confirm CORS works | CORS is browser-enforced — user may have tested with curl |
| Prove security is correct | Security requires systematic verification |
| Skip E2E tests | User summary ≠ automated test passing |

### Correct Response to User Summaries

When user provides a summary like "I fixed the CORS issue by adding the header":

```
✅ CORRECT: 
"Thanks for the context! I'll use this to focus my analysis on the CORS 
middleware. Let me run browser verification to confirm the fix works 
across different origins."

❌ WRONG:
"Great, since you've confirmed the fix works, I'll just commit it."
```

### Detection Patterns

Watch for these patterns that indicate user-provided summaries:

| Pattern | Example | Your Response |
|---------|---------|---------------|
| "I fixed..." | "I fixed the CORS issue" | Acknowledge, then verify |
| "The change is..." | "The change is adding X-Custom-Header" | Acknowledge, then verify |
| "It works now" | "I tested it and it works" | Ask HOW they tested, then verify with Playwright |
| "Just need to commit" | "Can you just commit this?" | Verify first, then commit |

### CORS-Specific Warning

> ⚠️ **CORS is BROWSER-ENFORCED. curl/wget bypass CORS entirely.**
>
> If user says "I tested with curl and it works" — this is NOT CORS verification.
> CORS headers are only enforced by browsers. You MUST use Playwright to verify CORS fixes.

---

## Task Specs vs PRDs

Task Specs follow the **same lifecycle as PRDs** but in a parallel folder structure:

| Aspect | Task Spec (Builder) | PRD (Planner) |
|--------|---------------------|---------------|
| **Created by** | Builder | Planner |
| **Drafts location** | `docs/tasks/drafts/` | `docs/drafts/` |
| **Ready location** | `docs/tasks/` | `docs/prds/` |
| **Completed location** | `docs/tasks/completed/` | `docs/completed/` |
| **Abandoned location** | `docs/tasks/abandoned/` | `docs/abandoned/` |
| **Registry** | `docs/task-registry.json` | `docs/prd-registry.json` |
| **Story prefix** | `TSK-001`, `TSK-002`, etc. | `US-001`, `US-002`, etc. |
| **User involvement** | Confirm understanding | Multi-round refinement |

**Strict separation:**

| Agent | Owns | Never touches |
|-------|------|---------------|
| Builder | `docs/tasks/`, `docs/task-registry.json` | `docs/prds/`, `docs/drafts/`, `docs/prd-registry.json` |
| Planner | `docs/prds/`, `docs/drafts/`, `docs/prd-registry.json` | `docs/tasks/`, `docs/task-registry.json` |

**Trigger:** Before any write to `docs/` subdirectories.

**Failure behavior:** If Builder is about to write to a Planner-owned path, STOP and redirect to `@planner`. If Planner is about to write to a Builder-owned path, STOP and redirect to `@builder`.

**Exception:** Builder MAY inject `TSK-###` stories into an active PRD at user request (this modifies a PRD file, which is allowed only for story injection).

---

## Phase 0: Analysis & Task Spec Generation

> ⛔ **MANDATORY: Every ad-hoc request goes through analysis.**
>
> **Trigger:** User provides an ad-hoc task request.
>
> **Evidence:** Analysis output block with alternatives/consequences MUST appear in response.
>
> **Failure behavior:** If proceeding to implementation without showing analysis output, STOP and run analysis first.

### Step 0.0: Initialize Analysis Gate (CRITICAL — First Step)

> ⛔ **This initialization is MANDATORY and must happen BEFORE any analysis.**
>
> This ensures the analysis gate is enforced even after context compaction.

**Immediately on entering ad-hoc mode, write to `builder-state.json`:**

```json
{
  "activeTask": {
    "id": null,
    "analysisCompleted": false,
    "enteredAt": "2026-03-03T10:30:00Z"
  }
}
```

**Why this matters:**
- The `analysisCompleted: false` flag serves as a technical checkpoint
- Even if behavioral guardrails are "forgotten" after context compaction, this flag persists
- The flag is checked before EVERY @developer delegation (see builder.md)
- The flag is ONLY set to `true` after user responds with `[G] Go ahead`

**Compaction resilience:**
- On session resume after compaction, Builder reads this flag
- If `analysisCompleted === false`, Builder knows analysis approval is pending
- If `analysisCompleted === true`, Builder can verify approval was received

When user gives a task in ad-hoc mode:

### Step 0.0a: Pre-Analysis Screenshot (MANDATORY)

> ⛔ **CRITICAL: ALWAYS capture a screenshot BEFORE analyzing the request.**
>
> This is NOT optional. Code analysis alone misses CSS inheritance, runtime state, and visual bugs.
> The screenshot reveals what the user actually sees, preventing "I'll fix the blue button" when the button is actually gray.

**Why this matters:**
- Visual issues are best caught visually — code analysis alone is insufficient
- Prevents misunderstandings between Builder and user about current state
- Catches CSS overrides, runtime state, and inheritance that code analysis misses

**Workflow:**

```
┌─────────────────────────────────────────────────────────────┐
│ Ad-Hoc Request Received                                     │
├─────────────────────────────────────────────────────────────┤
│ 1. Determine app type from project.json                     │
│ 2. Ensure app is running (auto-start if needed)             │
│ 3. Take screenshot of current state                         │
│ 4. Then proceed to code analysis (Step 0.1)                 │
│ 5. Present BOTH screenshot AND code findings to user        │
└─────────────────────────────────────────────────────────────┘
```

**Step 0.0a.1: Determine App Type**

Read `project.json` to determine the app architecture:

```bash
# Check for desktop app configuration
jq -r '.apps[] | select(.type == "desktop") | {framework, webContent, remoteUrl}' docs/project.json 2>/dev/null
```

| App Type | webContent | Action |
|----------|------------|--------|
| Web app | *(none)* | Start dev server if not running, screenshot localhost |
| Desktop | `bundled` | Launch app if not running, screenshot app window |
| Desktop | `remote` | Screenshot the deployed `remoteUrl` directly (no local app needed) |
| Desktop | `hybrid` | Start dev server for local content, screenshot |

**Step 0.0a.2: Ensure App is Running**

| App Type | If Not Running |
|----------|----------------|
| Web app | Load `start-dev-server` skill, start dev server |
| Desktop (bundled) | Load `start-dev-server` skill with `mode: desktop` |
| Desktop (remote) | No startup needed — screenshot deployed URL directly |

**Step 0.0a.3: Capture Screenshot**

Load the `screenshot` skill and capture the current state:

```
Capturing current state...
```

- Use `screenshot` skill with the appropriate URL:
  - Web app: `http://localhost:{devPort}`
  - Desktop (bundled): Capture running app window
  - Desktop (remote): `{apps[].remoteUrl}`
- Capture BOTH light and dark modes if applicable
- Store screenshots in `.tmp/screenshots/pre-analysis/`

**Step 0.0a.4: Attach to Analysis**

The screenshot will be attached to the analysis dashboard (Step 0.2). Do NOT show the screenshot separately — it's part of the analysis presentation.

### Step 0.1: Time-Boxed Analysis (10 seconds)

Run analysis with visible progress indicator:

```
═══════════════════════════════════════════════════════════════════════
                         ANALYZING REQUEST
═══════════════════════════════════════════════════════════════════════

"Add loading spinner to submit button"

⏳ Scanning imports...
⏳ Identifying affected files...
⏳ Checking for downstream impacts...
⏳ Estimating scope...

═══════════════════════════════════════════════════════════════════════
```

**Analysis methods (run in parallel, 10-second timeout):**

1. **AST/Import Analysis** — Find files importing affected components
2. **Semantic Understanding** — Identify related functionality
3. **Checklist Review** — Check for:
   - Database schema changes needed
   - API contract changes
   - Breaking changes to exports
   - Migration requirements
   - Test impact

If analysis times out, show what was found with note: "⚠️ Analysis may be incomplete (timed out)"

### Step 0.1b: Playwright Analysis Confirmation (MANDATORY)

> ⛔ **CRITICAL: Code analysis MUST be confirmed via Playwright probe before showing the dashboard.**
>
> Code-only analysis can miss runtime state, CSS inheritance, dynamic rendering, and route guards.
> Playwright confirmation catches discrepancies between what the code *says* and what *actually* renders.
>
> **Trigger:** After Step 0.1 code analysis completes, before Step 0.2 dashboard.
>
> **Evidence:** Probe results MUST appear in the ANALYSIS COMPLETE dashboard.
>
> **Failure behavior:** If proceeding to Step 0.2 without running the probe (when applicable), STOP and run the probe first.

> ⛔ **NO-BYPASS RULE: The probe cannot be skipped through rationalization.**
>
> The following are NOT valid reasons to skip the probe:
>
> | Invalid Rationalization | Why It's Wrong |
> |------------------------|----------------|
> | "This is an Electron/desktop app" | Electron apps have web content — probe the web UI |
> | "The analysis is clear from the code" | Code analysis misses runtime state, CSS, route guards |
> | "This is a UX flow restructuring, not element verification" | UX changes affect visible elements — probe them |
> | "The user described the issue clearly" | User descriptions are input, not verification |
> | "I already took a screenshot" | Screenshots show current state; probes verify specific assertions |
> | "This is a backend/config change" | If no UI assertions exist, the probe is skipped via valid skip conditions — don't preemptively decide |
>
> **The ONLY valid skip conditions** are listed in `test-ui-verification` skill → "Skip Conditions":
> - `agents.verification.mode: "no-ui"` in project.json
> - Dev server unreachable (after attempting to start it)
> - No page assertions generated (purely backend analysis)
> - `agents.analysisProbe: false` in project.json (explicit user opt-out)
>
> **If you catch yourself about to skip the probe for any other reason — STOP.** Run the probe.

**After Step 0.1 code analysis and Step 0.0a screenshot, run the Playwright probe:**

1. **Generate probe assertions** from code analysis findings:

   For each key conclusion in the analysis, create a probe assertion:

   | Analysis Conclusion | Probe Assertion |
   |---------------------|-----------------|
   | "Button exists at /checkout" | `page: "/checkout", selector: "button[type='submit']", expect: "visible"` |
   | "No spinner currently shown" | `page: "/checkout", selector: ".spinner", expect: "absent"` |
   | "Form has 3 fields" | `page: "/checkout", selector: "input, select, textarea", expect: "exists"` |
   | "Component renders at /dashboard" | `page: "/dashboard", selector: "[data-testid='component']", expect: "visible"` |

   **Assertion generation rules:**
   - Generate 2-5 assertions per affected page (keep it focused)
   - Prioritize assertions about elements the implementation will modify
   - Include at least one "existence" check for the primary target element
   - Include at least one "absence" check for the feature being added (confirms it doesn't exist yet)
   - **CRITICAL: Assertions MUST target the actual pages being changed** — not just whatever public pages are accessible

   > ⛔ **PAGE TARGETING RULE: Probe the pages you plan to modify.**
   >
   > If the analysis identifies changes to `/dashboard`, `/settings`, and `/onboarding`:
   > - ✅ Generate assertions for `/dashboard`, `/settings`, `/onboarding`
   > - ❌ Do NOT generate assertions only for `/login` because it's the only public page
   >
   > If the target pages require authentication:
   > 1. Follow the **Autonomous Auth Resolution** protocol below to authenticate
   > 2. Authenticate in the probe's Playwright context BEFORE navigating to protected pages
   > 3. Generate assertions for the actual protected pages being modified
   >
   > **Never declare `probeStatus: "partially-confirmed"` when you only probed public pages**
   > **but the actual changes target authenticated pages.** That's not "partially confirmed" —
   > **that's "not probed at all."**

2. **Build probe spec and invoke `@e2e-playwright` with `mode: "analysis-probe"`:**

   ```yaml
   <probe-spec>
     mode: analysis-probe
     baseUrl: "http://localhost:{devPort}"
     timeout: 5000
     assertions:
       - page: "/checkout"
         description: "Submit button exists"
         checks:
           - selector: "button[type='submit']"
             expect: "visible"
           - selector: ".spinner"
             expect: "absent"
             description: "No loading indicator yet"
   </probe-spec>
   ```

   See `test-ui-verification` skill → "Analysis Probe Mode" for full probe specification format, assertion types, and execution flow.

3. **Process probe results:**

   | Probe Status | Action |
   |-------------|--------|
   | `confirmed` | Proceed to Step 0.2 with `✅ Playwright-confirmed` badge |
   | `partially-confirmed` | Update analysis with corrections from discrepancies, note in dashboard |
   | `contradicted` | **Re-analyze:** Revise code analysis using probe data, lower confidence to MEDIUM minimum |
   | `skipped` | Proceed to Step 0.2 with `➖ Probe skipped: [reason]` note |

4. **On contradiction — mandatory re-analysis:**

   When probe results contradict the code analysis:

   ```
   ═══════════════════════════════════════════════════════════════════════
                        ⚠️ ANALYSIS CONTRADICTED
   ═══════════════════════════════════════════════════════════════════════

   Playwright probe found discrepancies with code analysis:

     ❌ Expected button[type='submit'] visible at /checkout
        Actual: not found (page renders a link instead)

     ❌ Expected .form-container visible at /checkout
        Actual: hidden (display: none, gated by feature flag)

   Revising analysis with probe data...
   ═══════════════════════════════════════════════════════════════════════
   ```

   After revision:
   - Confidence is lowered to MEDIUM (minimum), forcing clarifying questions
   - The revised analysis replaces the original in the dashboard
   - Discrepancies are listed in a new `🔍 PROBE RESULTS` section

5. **Progress indicator:**

   Show probe progress inline with the analysis progress:

   ```
   ═══════════════════════════════════════════════════════════════════════
                            ANALYZING REQUEST
   ═══════════════════════════════════════════════════════════════════════

   "Add loading spinner to submit button"

   ⏳ Scanning imports...
   ⏳ Identifying affected files...
   ⏳ Checking for downstream impacts...
   ⏳ Estimating scope...
   ✅ Code analysis complete
   ⏳ Running Playwright probe (confirming analysis)...
   ✅ Probe confirmed: 3/3 assertions match

   ═══════════════════════════════════════════════════════════════════════
   ```

#### Autonomous Auth Resolution (for probing authenticated pages)

> ⛔ **NEVER ask the user for credentials, env vars, or auth help when probing.**
> Builder has auth skills and project config — use them autonomously.
> The user already configured auth (or it can be auto-detected). Asking them
> "Do you have SUPABASE_SERVICE_ROLE_KEY?" is a failure of autonomy.

When the probe targets pages that require authentication, resolve auth **before** invoking `@e2e-playwright`:

1. **Check `project.json` → `authentication`:**
   ```bash
   jq '.authentication' docs/project.json
   ```

2. **If auth is configured** → Load the matching auth skill silently:

   | Provider + Method | Load Skill |
   |-------------------|------------|
   | `supabase` + `passwordless-otp` | `auth-supabase-otp` |
   | `supabase` + `email-password` | `auth-supabase-password` |
   | `nextauth` + `email-password` | `auth-nextauth-credentials` |
   | `headless.enabled: true` | `auth-headless` (fastest) |
   | Any other / `custom` | `auth-generic` |

   Execute the auth skill's login flow. Pass the authenticated session/cookies to the probe context.

3. **If auth is NOT configured** → Load `setup-auth` skill and run it:
   - `setup-auth` scans the project for auth patterns (package.json deps, code patterns)
   - It derives the provider and method automatically
   - It checks for existing env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.)
   - It writes the `authentication` config to `project.json`
   - Then loop back to step 2 with the new config

4. **If `setup-auth` fails** (truly no auth infrastructure detectable):
   - Proceed with probe on public pages only
   - Mark `probeStatus: "degraded-no-auth"` (NOT "partially-confirmed")
   - Show prominent warning in the analysis dashboard:
     ```
     ⚠️ AUTH RESOLUTION FAILED — probe could not authenticate
     Attempted: [list what was tried]
     Protected pages NOT probed: /dashboard, /settings
     ```

**What to NEVER do:**
- ❌ Ask "Do you have a test user email I can use?"
- ❌ Ask "Do you have SUPABASE_SERVICE_ROLE_KEY available?"
- ❌ Present options like "Option A: provide credentials, Option B: skip auth"
- ❌ Suggest the user run `/setup-auth` — Builder should run it itself
- ❌ Fall back to probing only public pages without attempting all auth approaches first

### Step 0.2: Show Analysis Dashboard

Display results with progressive disclosure. **The pre-analysis screenshot from Step 0.0a MUST be attached.**

```
═══════════════════════════════════════════════════════════════════════
                         ANALYSIS COMPLETE
═══════════════════════════════════════════════════════════════════════

📸 CURRENT STATE: [screenshot attached]
   (screenshot from .tmp/screenshots/pre-analysis/)

📋 REQUEST: "Add loading spinner to submit button"

📊 UNDERSTANDING                          Confidence: HIGH ✅ Playwright-confirmed
───────────────────────────────────────────────────────────────────────
Based on visual + code + Playwright probe analysis:
- The submit button is currently a blue primary button (visible in screenshot)
- No loading indicator exists — button stays static during submission
- Existing Spinner component available in design system

Proposed:
- Show spinner icon during form submission
- Disable button while loading to prevent double-submit
- Use existing Spinner component from design system

🔍 PROBE RESULTS                                              3/3 ✅
───────────────────────────────────────────────────────────────────────
  ✅ /checkout → button[type='submit'] visible (confirmed)
  ✅ /checkout → .spinner absent (confirmed: no spinner yet)
  ✅ /checkout → button[type='submit'] enabled (confirmed)

🎯 SCOPE: Small (2 files, no breaking changes)

📁 AFFECTED FILES
───────────────────────────────────────────────────────────────────────
• src/components/SubmitButton.tsx (modify)
• src/components/SubmitButton.test.tsx (add/modify tests)

⚠️ CONSEQUENCES: None identified

🔀 ALTERNATIVES                                              [D] Details
───────────────────────────────────────────────────────────────────────
1. Use Spinner component ← RECOMMENDED (consistent, accessible)
2. CSS-only animation (simpler but inconsistent)
3. Full-page overlay (overkill for single button)

📝 STORY PREVIEW
───────────────────────────────────────────────────────────────────────
TSK-001: Add loading state to SubmitButton
TSK-002: Show Spinner when loading  
TSK-003: Disable button during submission
TSK-004: Add unit tests

═══════════════════════════════════════════════════════════════════════

[G] Go ahead — create Task Spec and start
[E] Edit/Clarify — refine understanding  
[P] Promote to PRD — hand off to Planner
[C] Cancel — abort this request

> _
═══════════════════════════════════════════════════════════════════════
```

> ⚠️ **The screenshot is NOT optional.** If screenshot capture failed:
> - Show error reason (e.g., "Dev server not running", "Remote URL unreachable")
> - Offer options: `[R] Retry screenshot`, `[S] Skip screenshot (not recommended)`, `[C] Cancel`
> - If user chooses `[S]`, proceed but note "⚠️ Analysis based on code only — visual state not verified"

> ⚠️ **The Playwright probe is NOT optional for UI projects.** If probe was skipped:
> - Show skip reason in dashboard (e.g., "no-ui project", "dev server not reachable")
> - If probe was skipped due to a fixable issue (dev server), offer `[R] Retry probe`
> - See `test-ui-verification` skill → "Skip Conditions" for valid skip reasons

**Probe results display in dashboard:**

| Probe Status | Dashboard Badge | Probe Section |
|-------------|-----------------|---------------|
| `confirmed` | `Confidence: HIGH ✅ Playwright-confirmed` | `🔍 PROBE RESULTS  N/N ✅` |
| `partially-confirmed` | `Confidence: HIGH ⚠️ Playwright: N/M confirmed` | `🔍 PROBE RESULTS  N/M ⚠️` with discrepancies listed |
| `contradicted` | `Confidence: MEDIUM 🔴 Playwright contradicted` | `🔍 PROBE RESULTS  N/M 🔴` with contradictions expanded |
| `skipped` | `Confidence: [original] ➖ Probe skipped` | `🔍 PROBE: ➖ Skipped ([reason])` |

**Dashboard rules:**
- **Confidence:** HIGH (clear request) / MEDIUM (some ambiguity) / LOW (needs clarification)
- **Scope:** Small (<5 files, no breaking changes) / Medium (5-15 files, minor impacts) / Large (15+ files, breaking changes)
- **Consequences:** Collapsed if none; expanded if any exist
- **Alternatives:** Collapsed to recommendation if only one sensible approach

**Dashboard options by confidence level:**

| Confidence | Available Options |
|------------|-------------------|
| HIGH | `[G]` Go ahead, `[E]` Edit/Clarify, `[P]` Promote, `[C]` Cancel |
| MEDIUM | `[Q]` Answer questions (mandatory), `[J]` Just do it, `[P]` Promote, `[C]` Cancel |
| LOW | `[Q]` Answer questions (mandatory), `[J]` Just do it, `[P]` Promote, `[C]` Cancel |

> ⛔ **CRITICAL: [G] is NOT shown for MEDIUM/LOW confidence.**
>
> The user MUST either answer clarifying questions `[Q]` or explicitly choose `[J]` to proceed with best interpretation.
> After either action, show an UPDATED dashboard with `[G]` available.

**MEDIUM/LOW dashboard example:**

```
═══════════════════════════════════════════════════════════════════════
                         ANALYSIS COMPLETE
═══════════════════════════════════════════════════════════════════════

📋 REQUEST: "Fix the caching issue"

📊 UNDERSTANDING                                    Confidence: MEDIUM
───────────────────────────────────────────────────────────────────────
There appears to be a caching issue but I need clarification:
- Could be browser cache, API cache, or database query cache
- Multiple components involve caching

🎯 SCOPE: Unknown (depends on root cause)

...

═══════════════════════════════════════════════════════════════════════

[Q] Answer clarifying questions — I'll ask about the specific issue
[J] Just do it — proceed with my best interpretation
[P] Promote to PRD — hand off to Planner
[C] Cancel — abort this request

> _
═══════════════════════════════════════════════════════════════════════
```

### Step 0.3: Clarifying Questions (MANDATORY for MEDIUM/LOW)

> ⛔ **This step is MANDATORY when confidence is MEDIUM or LOW.**
>
> Do NOT proceed to Step 0.5 (Task Spec) without either:
> 1. User answers questions → Re-run analysis → Show updated dashboard with [G]
> 2. User chooses [J] → Show updated dashboard with [G] and note "proceeding with best interpretation"

For MEDIUM or LOW confidence, show questions in series format:

```
═══════════════════════════════════════════════════════════════════════
                       CLARIFYING QUESTIONS
═══════════════════════════════════════════════════════════════════════

I need to clarify a few things:

1. Where should the spinner appear?
   A. Inside the button (replaces text)
   B. Next to the button
   C. Overlay on the entire form

2. Should the spinner use the existing design system component?
   A. Yes, use <Spinner /> from @/components/ui
   B. No, create a new custom spinner

3. What triggers the loading state?
   A. Form submission only
   B. Any button click that triggers async action

Reply with codes (e.g., "1A, 2A, 3A") or describe your preference.
Type "just do it" to proceed with my best interpretation.

> _
═══════════════════════════════════════════════════════════════════════
```

**Question rules:**
- Single round of questions — ask all at once
- User can reply with letter codes for speed
- User can type "just do it" or choose `[J]` to proceed with best interpretation

**After questions answered or [J] chosen:**

1. Re-analyze with new information (if questions were answered)
2. Update confidence level (typically becomes HIGH after clarification)
3. Show UPDATED analysis dashboard with `[G]` now available:

```
═══════════════════════════════════════════════════════════════════════
                    ANALYSIS COMPLETE (UPDATED)
═══════════════════════════════════════════════════════════════════════

📋 REQUEST: "Fix the caching issue"

📊 UNDERSTANDING                                    Confidence: HIGH
───────────────────────────────────────────────────────────────────────
Fix browser cache issue in ProductList component:
- Clear stale cache on navigation
- Add cache invalidation on data updates
(Based on your clarification: "It's the browser cache for product data")

...

═══════════════════════════════════════════════════════════════════════

[G] Go ahead — create Task Spec and start
[E] Edit/Clarify — refine understanding  
[P] Promote to PRD — hand off to Planner
[C] Cancel — abort this request

> _
═══════════════════════════════════════════════════════════════════════
```

If user chose `[J]` instead of answering questions, show dashboard with note:

```
📊 UNDERSTANDING                       Confidence: MEDIUM → proceeding
───────────────────────────────────────────────────────────────────────
Proceeding with best interpretation: [state what you're assuming]
User chose to proceed without clarification.
```

### Step 0.4: PRD Recommendation (For Medium/Large Scope)

For medium or large scope requests, recommend PRD with auto-created promotion doc:

```
═══════════════════════════════════════════════════════════════════════
                       PRD RECOMMENDED
═══════════════════════════════════════════════════════════════════════

⚠️ This request is MEDIUM scope with potential impacts:

• Affects 12 files across 3 modules
• Requires database schema changes
• Has downstream impacts on API consumers

💡 I recommend creating a formal PRD for proper planning.
   (Promotion document ready: docs/tasks/promotions/promote-to-prd.md)

[P] Promote to Planner — use prepared promotion doc
[O] Override and continue — proceed with Task Spec anyway

> _
═══════════════════════════════════════════════════════════════════════
```

**Before showing this prompt:**
1. Auto-create promotion document at `docs/tasks/promotions/promote-task-YYYY-MM-DD-name-to-prd.md`
2. Include full analysis, understanding, alternatives, consequences

If user chooses [O] (override), proceed but warn again at ~50% completion if scope grew.

### Step 0.5: Generate Task Spec

On [G] Go ahead:

1. **Create Task Spec file** at `docs/tasks/drafts/task-YYYY-MM-DD-brief-name.md`:

```markdown
---
id: task-2026-03-01-add-spinner
title: Add Loading Spinner to Submit Button
status: draft
scope: small
confidence: high
createdAt: 2026-03-01T10:30:00Z
---

# Task: Add Loading Spinner to Submit Button

## Summary

Add visual loading feedback to SubmitButton component with spinner icon
during form submission, disabled state to prevent double-submit.

**Original Request:** "Add loading spinner to submit button"

## Analysis

**Scope:** Small (2 files, no breaking changes)
**Confidence:** High

**Approach:** Use existing Spinner component, disable button during submission.

**Alternatives Considered:**
- CSS-only animation — simpler but inconsistent with design system
- Full-page overlay — overkill for single button

**Recommendation:** Use Spinner component (consistent, accessible, already styled)

**Consequences:** None identified

## Stories

### TSK-001: Add loading state to SubmitButton component

**Description:** Add isLoading prop to track submission state.

**Acceptance Criteria:**

- [ ] Add `isLoading` prop to SubmitButton
- [ ] Pass loading state from parent form
- [ ] Typecheck passes

### TSK-002: Show Spinner when loading

**Description:** Display spinner icon during submission.

**Acceptance Criteria:**

- [ ] Import Spinner component
- [ ] Render Spinner when `isLoading` is true
- [ ] Hide button text while loading
- [ ] Verify in browser

### TSK-003: Disable button during submission

**Description:** Prevent double-submit during loading.

**Acceptance Criteria:**

- [ ] Add `disabled={isLoading}` to button
- [ ] Style disabled state appropriately
- [ ] Works in both light and dark mode

### TSK-004: Add unit tests

**Description:** Test loading behavior.

**Acceptance Criteria:**

- [ ] Test loading state renders spinner
- [ ] Test button is disabled during loading
- [ ] Unit tests pass
```

2. **Register in task-registry.json:**

```json
{
  "$schema": "https://opencode.ai/schemas/task-registry.json",
  "tasks": [
    {
      "id": "task-2026-03-01-add-spinner",
      "title": "Add Loading Spinner to Submit Button",
      "status": "draft",
      "scope": "small",
      "confidence": "high",
      "filePath": "docs/tasks/drafts/task-2026-03-01-add-spinner.md",
      "storyCount": 4,
      "createdAt": "2026-03-01T10:30:00Z"
    }
  ]
}
```

3. **Move to ready and start:**
   - Move file from `docs/tasks/drafts/` to `docs/tasks/`
   - Update status to `ready` in registry
   - Update `builder-state.json` with `activeTask` and **set `analysisCompleted: true`**
   - Proceed to Phase 1

> ⚠️ **CRITICAL: Only set `analysisCompleted: true` after user responds with [G] Go ahead.**
>
> This flag is the technical checkpoint that prevents implementation without approval.
> If this flag is `false`, @developer delegation is BLOCKED.

---

## Phase 1: Task Execution

### Step 1.0: Setup State

Update `builder-state.json`:

```json
{
  "activePrd": null,
  "activeTask": {
    "id": "task-2026-03-01-add-spinner",
    "currentStory": "TSK-001",
    "completedStories": [],
    "analysisCompleted": true
  },
  "uiTodos": {
    "items": [
      {"content": "TSK-001: Add loading state", "status": "in_progress", "priority": "high"},
      {"content": "TSK-002: Show Spinner", "status": "pending", "priority": "high"},
      {"content": "TSK-003: Disable button", "status": "pending", "priority": "high"},
      {"content": "TSK-004: Add unit tests", "status": "pending", "priority": "high"}
    ],
    "flow": "task"
  }
}
```

> ⛔ **Before ANY @developer delegation, verify `activeTask.analysisCompleted === true`.**
>
> If not true, STOP and show the analysis dashboard first.

Update right panel todos via `todowrite` to match.

---

## Per-Task Quality Checks (MANDATORY)

> ⛔ **Quality checks run automatically after EVERY story. No prompts, no skipping.**
>
> **Trigger:** After @developer completes each story.
>
> **Failure behavior:** If any check fails after 3 fix attempts, STOP and report to user.

After @developer completes each story, Builder automatically runs:

| Step | Check | Command | Fix loop |
|------|-------|---------|----------|
| 1 | **Typecheck** | `npm run typecheck` (or project equivalent) | Yes, max 3 attempts |
| 2 | **Lint** | `npm run lint` (or project equivalent) | Yes, max 3 attempts |
| 3 | **Unit tests** | `CI=true npm test` (MUST include CI=true) | Yes, max 3 attempts |
| 3.5 | **Rebuild/Relaunch** | Architecture-aware rebuild (see below) | Yes, max 3 attempts |
| 4 | **Critic** | Run @critic for code review | Report findings, @developer fixes |
| 5 | **UI Verification** | Playwright browser verification (if required) | Yes, max 3 attempts |

> ⚠️ **CI=true is MANDATORY for test commands.**
>
> Without CI=true, test runners (Vitest, Jest) may start in **watch mode** and become orphaned processes consuming CPU indefinitely.
>
> **Correct:** `CI=true npm test`
> **Wrong:** `npm test` (may trigger watch mode)

### Architecture-Aware Rebuild/Relaunch (Step 3.5)

> 🏗️ **After unit tests pass, BEFORE critic/UI verification, check if a rebuild is needed.**
>
> This step is auto-inferred from `apps[]` in `project.json`. If `postChangeWorkflow` exists, use it instead.

```
After unit tests pass (step 3):
    │
    ▼
Read apps[] from project.json
    │
    ├── No apps[] or web-only → Skip rebuild, continue to step 4
    │
    ├── Desktop + webContent: "bundled" or "hybrid":
    │   1. Run build command (commands.build or apps[].commands.build)
    │   2. Kill existing Electron process
    │   3. Relaunch Electron (apps[].commands.dev or commands.dev)
    │   4. Wait for app ready
    │   5. Continue to step 4 (critic) then step 5 (Playwright-Electron verify)
    │
    └── Desktop + webContent: "remote":
        1. Ensure Electron process is running (launch if not)
        2. No rebuild needed (HMR via dev server handles code changes)
        3. Continue to step 4 (critic) then step 5 (Playwright-Electron verify)

CRITICAL: Desktop apps ALWAYS use Playwright-Electron for step 5, never browser-based verification.
```

**Override:** If `postChangeWorkflow` exists in `project.json`, execute its `steps[]` in order instead of auto-inference.

### UI Verification Enforcement

> 🎯 **For UI projects with `playwright-required` mode, UI changes MUST be browser-verified.**
>
> **Trigger:** After steps 1-4 pass, check if UI verification is required.
>
> **Check:** Read `project.json` → `agents.verification.mode`
>
> **Failure behavior:** If verification status is `unverified`, BLOCK story completion.

**Verification flow:**

```
Steps 1-4 pass
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Check if UI verification required:                                   │
│                                                                     │
│ Read project.json → agents.verification.mode                        │
│   • "no-ui" → Skip verification, proceed to completion              │
│   • "playwright-required" → Check changed files                     │
│                                                                     │
│ Check changed files against SKIP PATTERNS:                          │
│   • *.md (documentation) → Skip with reason                         │
│   • .*rc, *.config.* (config) → Skip with reason                   │
│   • *.test.*, *.spec.* (test files) → Skip with reason             │
│   • .github/* (CI/CD) → Skip with reason                           │
│   • No UI files (*.tsx, *.jsx, *.vue) → Skip with reason           │
│   • Has UI files → REQUIRE verification                             │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼ (verification required)
┌─────────────────────────────────────────────────────────────────────┐
│ Run UI verification:                                                 │
│                                                                     │
│ 1. Invoke @e2e-playwright with mode: "verification"                 │
│ 2. Generate test in tests/ui-verify/                                │
│ 3. Run test, capture screenshot                                     │
│ 4. Return verification status                                       │
└─────────────────────────────────────────────────────────────────────┘
    │
    ├─── status: "verified" ──► Proceed to completion prompt
    │
    ├─── status: "unverified" ──► BLOCK story completion
    │                              │
    │                              ▼
    │                    ┌─────────────────────────┐
    │                    │ Verification Required   │
    │                    │                         │
    │                    │ [R] Retry verification  │
    │                    │ [S] Skip (adds debt)    │
    │                    │ [M] Fix manually        │
    │                    └─────────────────────────┘
    │
    └─── status: "skipped" ──► WARN, add to test-debt.json, proceed
```

#### Skip Patterns

When ALL changed files match skip patterns, verification is automatically skipped:

| Pattern | Example Files | Skip Reason |
|---------|---------------|-------------|
| `*.md` | `README.md`, `docs/guide.md` | Documentation changes don't affect UI |
| `.*rc`, `*.config.*` | `.eslintrc`, `tailwind.config.js` | Config changes require rebuild, not visual test |
| `*.test.*`, `*.spec.*` | `Button.test.tsx`, `api.spec.ts` | Test files don't render in browser |
| `.github/*` | `.github/workflows/ci.yml` | CI/CD changes don't affect UI |
| Non-UI extensions | `*.go`, `*.py`, `*.sql` | Backend files don't affect UI |

**Skip reason in completion message:**

```
✅ STORY COMPLETE

Summary: Updated API documentation

Verification: ➖ SKIPPED (auto)
  Reason: All changed files are documentation (*.md)
  Files: README.md, docs/api-guide.md

Files changed: 2
```

#### Override Mechanism

Users can override verification requirements with explicit reason:

**To force verification when skipped:**
```
User: verify anyway

Builder: Running UI verification for documentation changes...
         (Normally skipped, but you requested manual verification)
```

**To skip verification when required:**
```
User: mark complete without verification

Builder: ⚠️ OVERRIDE REQUESTED

         This bypasses mandatory verification for UI changes.
         Reason required: _

User: component is behind a feature flag that's disabled

Builder: ⚠️ SKIPPING VERIFICATION (user override)

         Reason: Component behind disabled feature flag
         Files: src/components/FeatureFlagged.tsx
         
         Recommendation: Verify manually when feature flag is enabled.
         
         Added to test-debt.json with:
         - overrideReason: "Component behind disabled feature flag"
         - requiresFollowUp: true
```

**Verification required prompt (when blocked):**

```
═══════════════════════════════════════════════════════════════════════
                  ⚠️ UI VERIFICATION REQUIRED
═══════════════════════════════════════════════════════════════════════

This story modified UI components that require browser verification:
  • src/components/SubmitButton.tsx

Verification status: UNVERIFIED

The verification test failed after 3 attempts:
  ❌ Element [data-testid="submit-spinner"] not found

Options:
  [R] Retry verification (after manual fix)
  [S] Skip verification (adds to test-debt.json)
  [M] Debug with @developer

> _
═══════════════════════════════════════════════════════════════════════
```

**After all checks pass**, show the story completion prompt (see Step 1.4 below).

---

### Step 1.1: Setup Execution Branch

Read git workflow from `project.json`:

- If `trunk + branchless`: Stay on default branch
- Otherwise: Create/checkout ad-hoc branch

```bash
# Branch naming: adhoc/YYYY-MM-DD
BRANCH="adhoc/$(date +%Y-%m-%d)"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git checkout "$BRANCH"
else
    git checkout -b "$BRANCH" main
fi
```

### Step 1.2: Execute Story

For each story (TSK-001, TSK-002, etc.):

1. **Mark story in_progress** in todos and registry
2. **Generate verification contract** (see builder.md)
3. **Delegate to @developer** with context block:

```yaml
<context>
version: 1
project:
  path: {absolute path}
  stack: {stack from project.json}
  commands:
    test: {commands.test}
    lint: {commands.lint}
conventions:
  summary: |
    {2-5 sentence summary}
currentWork:
  mode: task-spec
  taskId: task-2026-03-01-add-spinner
  story: TSK-001
  title: Add loading state to SubmitButton component
  acceptanceCriteria:
    - Add isLoading prop to SubmitButton
    - Pass loading state from parent form
    - Typecheck passes
</context>

Implement TSK-001: Add loading state to SubmitButton component

Requirements:
- Add `isLoading` prop to SubmitButton
- Pass loading state from parent form
- Ensure typecheck passes
```

4. **Run quality checks** (automatic — see [Per-Task Quality Checks](#per-task-quality-checks-mandatory) above)
5. **Mark story complete** — update todos, registry, Task Spec file
6. **Update scope estimate** — check if scope is growing

### Step 1.3: Scope Growth Warning

If at ~50% story completion, scope has grown significantly (files or stories increased by >50%):

```
═══════════════════════════════════════════════════════════════════════
                       ⚠️ SCOPE GROWTH DETECTED
═══════════════════════════════════════════════════════════════════════

This task has grown beyond the original estimate:

Original: Small (2 files, 4 stories)
Current:  Medium (8 files, 7 stories)

Consider promoting to formal PRD for better tracking.
(Promotion document ready)

[P] Promote to PRD now
[K] Keep going with Task Spec

> _
═══════════════════════════════════════════════════════════════════════
```

This is a one-time warning per task.

### Step 1.4: Story Completion Prompt

After each story completes:

```
═══════════════════════════════════════════════════════════════════════
                         STORY COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ TSK-001: Add loading state to SubmitButton component

Quality checks:
  ✅ Typecheck: passed
  ✅ Lint: passed
  ✅ Unit tests: passed
  ✅ UI Verification: verified (screenshot captured)

Progress: 1/4 stories (25%)

[N] Next story (TSK-002: Show Spinner when loading)
[C] Commit and continue later
[P] Promote to PRD
[A] Abandon task

> _
═══════════════════════════════════════════════════════════════════════
```

**Verification status indicators:**

| Status | Display | Meaning |
|--------|---------|---------|
| `verified` | `✅ UI Verification: verified (screenshot captured)` | Browser test passed |
| `not-required` | `➖ UI Verification: not required (no UI changes)` | No UI files changed |
| `skipped` | `⚠️ UI Verification: SKIPPED (added to test debt)` | User chose to skip |

---

## Mid-PRD Task Injection

When user says "add a task to handle X after US-002" during active PRD work:

### Step 1: Generate TSK Story

```markdown
### TSK-001: Handle error states for theme save [INJECTED]

**Description:** As a user, I want to see error feedback if theme save fails.

**Acceptance Criteria:**

- [ ] Show toast on save failure
- [ ] Allow retry
- [ ] Verify in browser
```

### Step 2: Inject into PRD File

Insert after the specified story (US-002 in this example).

### Step 3: Update Builder State

```json
{
  "activePrd": {
    "id": "prd-user-settings",
    "currentStory": "US-002",
    "injectedTasks": ["TSK-001"]
  }
}
```

### Step 4: Update Todos

Insert TSK-001 at correct position in right panel todos.

---

## Task Spec Completion (US-011)

When all stories complete:

### Step 1: Generate Completion Summary (MANDATORY)

> ⛔ **This completion report MUST be shown before offering to commit.**
>
> The user cannot proceed to commit without seeing this report.
> Do not skip any section — all fields are required.

```
═══════════════════════════════════════════════════════════════════════
                       TASK SPEC COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ All stories complete!

📋 ORIGINAL REQUEST
───────────────────────────────────────────────────────────────────────
"Add loading spinner to submit button"

📊 UNDERSTANDING (How I Interpreted It)
───────────────────────────────────────────────────────────────────────
Add visual loading feedback to SubmitButton component:
- Show spinner icon during form submission
- Disable button while loading to prevent double-submit
- Use existing Spinner component from design system

📝 STORIES COMPLETED
───────────────────────────────────────────────────────────────────────
  ✅ TSK-001: Add loading state to SubmitButton
  ✅ TSK-002: Show Spinner when loading
  ✅ TSK-003: Disable button during submission
  ✅ TSK-004: Add unit tests

📁 FILES MODIFIED
───────────────────────────────────────────────────────────────────────
  • src/components/SubmitButton.tsx
  • src/components/SubmitButton.test.tsx

🧪 TESTS RUN
───────────────────────────────────────────────────────────────────────
  Unit tests: 3 tests passed
  Verification tests: 1 test passed

✅ VERIFICATION STATUS (per story)
───────────────────────────────────────────────────────────────────────
  TSK-001: ✅ verified (screenshot: submit-button-loading-state.png)
  TSK-002: ✅ verified (screenshot: submit-button-spinner.png)
  TSK-003: ✅ verified (screenshot: submit-button-disabled.png)
  TSK-004: ➖ not required (test file only)

📸 SCREENSHOTS CAPTURED
───────────────────────────────────────────────────────────────────────
  • .tmp/verification/screenshots/submit-button-loading-state.png
  • .tmp/verification/screenshots/submit-button-spinner.png
  • .tmp/verification/screenshots/submit-button-disabled.png

📦 COMMITS MADE
───────────────────────────────────────────────────────────────────────
  • abc1234: feat: Add loading state to SubmitButton
  • def5678: feat: Add spinner and disable during loading
  • ghi9012: test: Add unit tests for loading behavior

⏱️ TIME TAKEN
───────────────────────────────────────────────────────────────────────
  Started: 10:30 AM
  Completed: 10:45 AM
  Duration: ~15 minutes

═══════════════════════════════════════════════════════════════════════

[C] Commit and ship
[E] Write additional E2E tests

> _
═══════════════════════════════════════════════════════════════════════
```

### Completion Report Field Reference

| Field | Required | Source |
|-------|----------|--------|
| Original Request | ✅ Yes | User's initial message that triggered ad-hoc mode |
| Understanding | ✅ Yes | From ANALYSIS COMPLETE dashboard |
| Stories Completed | ✅ Yes | From Task Spec file |
| Files Modified | ✅ Yes | Aggregated from all story implementations |
| Tests Run | ✅ Yes | Count of unit tests + verification tests |
| Verification Status | ✅ Yes | Per-story: verified / skipped / not-required |
| Screenshots Captured | ✅ Yes | Paths to any screenshots taken (empty if none) |
| Commits Made | ✅ Yes | Git log for this task (hash + message) |
| Time Taken | ✅ Yes | From activeTask.startedAt to now |

### Step 2: Archive Task Spec

1. Move file to `docs/tasks/completed/`
2. Update registry status to `completed` with `completedAt` timestamp
3. Update Task Spec file with completion section:

```markdown
## Completion

**Completed:** 2026-03-01T11:15:00Z
**Files Changed:** 2
**Tests Added:** 3 unit tests
**Summary:** Added loading spinner to SubmitButton with isLoading prop, Spinner component, and disabled state during submission.
```

4. Clear `activeTask` from `builder-state.json`

---

## Task Spec Abandonment (US-012)

When user types "abandon" or chooses [A]:

```
═══════════════════════════════════════════════════════════════════════
                       ABANDON TASK SPEC
═══════════════════════════════════════════════════════════════════════

Task: Add Loading Spinner to Submit Button
Progress: 2/4 stories complete

Optional: Why are you abandoning? (press Enter to skip)
> _

Revert uncommitted changes? 
[Y] Yes — discard uncommitted work
[N] No — keep all changes as-is

> _
═══════════════════════════════════════════════════════════════════════
```

### On Abandonment:

1. If [Y]: `git checkout -- .` to discard uncommitted changes
2. Move Task Spec to `docs/tasks/abandoned/`
3. Update registry with `status: abandoned`, `abandonedAt`, `abandonReason`
4. Clear `activeTask` from `builder-state.json`
5. Notify: "Task abandoned. You can resume later with `resume task-2026-03-01-add-spinner`"

### Resuming Abandoned Task:

When user says "resume task-2026-03-01-add-spinner":

1. Move Task Spec from `docs/tasks/abandoned/` to `docs/tasks/`
2. Update registry with `status: in_progress`
3. Update `activeTask` in `builder-state.json`
4. Resume from first incomplete story

---

## Task Spec Promotion (US-008, US-011)

When user chooses [P] Promote to PRD:

### Step 1: Create/Update Promotion Document

Save to `docs/tasks/promotions/promote-task-YYYY-MM-DD-name-to-prd.md`:

```markdown
---
taskId: task-2026-03-01-add-spinner
promotedAt: 2026-03-01T11:00:00Z
preserveWork: true
reason: User requested promotion
---

# Promotion Request: Add Loading Spinner Feature

## Original Request

"Add loading spinner to submit button"

## Analysis Summary

**Original Scope Estimate:** Small
**Actual Scope:** Medium (scope grew during implementation)
**Confidence:** High

**Why promotion is recommended:**
- Discovered need for accessibility improvements
- Animation timing requires design input
- Should be part of larger button component refactor

## Work Completed

### TSK-001: Add loading state ✅
- Added isLoading prop to SubmitButton
- Passes typecheck

### TSK-002: Show Spinner ✅
- Using existing Spinner component

## Remaining Scope (for PRD)

- TSK-003: Disable button during submission
- TSK-004: Add unit tests
- (Additional stories may be needed for accessibility)

## Files Modified

- src/components/SubmitButton.tsx

## Recommended PRD Structure

1. **Loading State** — completed (TSK-001, TSK-002)
2. **Disable Behavior** — from TSK-003
3. **Testing** — from TSK-004
4. **Accessibility Audit** — new story needed
5. **Animation Timing** — design review needed
```

### Step 2: Ask About Work Preservation

```
═══════════════════════════════════════════════════════════════════════
                       PROMOTE TO PRD
═══════════════════════════════════════════════════════════════════════

Promotion document created:
  docs/tasks/promotions/promote-task-2026-03-01-add-spinner-to-prd.md

Completed work (2 stories):
  ✅ TSK-001: Add loading state
  ✅ TSK-002: Show Spinner

[K] Keep completed work — PRD continues from here
[F] Fresh start — Planner re-evaluates everything

> _
═══════════════════════════════════════════════════════════════════════
```

### Step 3: Update State

1. Update Task Spec registry: `status: promoted`, `promotedTo: null` (set when PRD created)
2. Clear `activeTask` from `builder-state.json`
3. Notify: "Promotion request created. Run @planner to continue."

---

## Git Auto-Commit Enforcement

> ⛔ **CRITICAL: Check `git.autoCommit` setting before ANY commit operation**
>
> **Trigger:** Before running `git commit` or any commit delegation.
>
> **Check:** Read `project.json` → `git.autoCommit` value.
>
> **Failure behavior:** If `autoCommit` is `manual` or `false`, do NOT run `git commit`. Stage files and report suggested commit message instead.
>
> See AGENTS.md for full rules.

---

## Phase 2: Ship

When all stories complete and user chooses [C] Commit:

### Step 1: Commit Changes

```bash
git add -A
git commit -m "feat: Add loading spinner to submit button

- TSK-001: Add loading state
- TSK-002: Show Spinner when loading
- TSK-003: Disable button during submission
- TSK-004: Add unit tests

Task-Spec: task-2026-03-01-add-spinner"
```

### Step 2: Push and PR (Git Completion Workflow)

> ⚓ **AGENTS.md: Git Completion Workflow**
>
> This step follows the canonical Git Completion Workflow defined in AGENTS.md.
> Both PRD mode and ad-hoc mode use the same workflow for consistency.

> ⛔ **CRITICAL: Follow `git.agentWorkflow` settings strictly.**
>
> **Trigger:** After commit, before push/PR operations.
>
> **Check:** Read `project.json` → `git.agentWorkflow` for `pushTo`, `createPrTo`, `requiresHumanApproval`.
>
> **Failure behavior:** If `git.agentWorkflow` is not defined, STOP with Missing Config Error (see AGENTS.md).

**Flow based on project settings:**

1. **Push to configured `pushTo` branch:**
   ```bash
   git push origin {git.agentWorkflow.pushTo}
   ```

2. **If `createPrTo` differs from `pushTo`, offer to create PR:**
   ```
   ═══════════════════════════════════════════════════════════════════════
                          PUSH COMPLETE
   ═══════════════════════════════════════════════════════════════════════
   
   ✅ Pushed to origin/{pushTo}
   
   Your workflow is configured to create PRs to '{createPrTo}'.
   
   [P] Create PR to {createPrTo}
   [S] Stay on {pushTo} (no PR yet)
   
   > _
   ═══════════════════════════════════════════════════════════════════════
   ```

3. **If user chooses [P] and `createPrTo` is in `requiresHumanApproval`:**
   - Create the PR: `gh pr create --base {createPrTo}`
   - Do NOT auto-merge
   - Report: "PR created. Human approval required to merge."

4. **If user chooses [S]:**
   - Stay on current branch
   - Report: "Changes pushed to {pushTo}. Create PR when ready."

### Step 3: Cleanup

1. Clear test checkpoints
2. Archive Task Spec to `docs/tasks/completed/`
3. Clear `activeTask` from `builder-state.json`

---

## Configuration

Read from `docs/project.json`:

```json
{
  "agents": {
    "prdRecommendationThreshold": "medium",
    "analysisTimeoutMs": 10000,
    "taskSpecEnabled": true,
    "analysisProbe": true,
    "analysisProbeTimeoutMs": 5000
  }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `prdRecommendationThreshold` | `"medium"` | Scope at which PRD is recommended: `small`, `medium`, `large` |
| `analysisTimeoutMs` | `10000` | Max analysis time in milliseconds |
| `taskSpecEnabled` | `true` | Set `false` for legacy behavior (not recommended) |
| `analysisProbe` | `true` | Enable Playwright analysis probe during Phase 0 |
| `analysisProbeTimeoutMs` | `5000` | Timeout per page for Playwright probe |

---

## Example Flow (Complete)

```
User: "Add loading spinner to submit button"

Builder:
═══════════════════════════════════════════════════════════════════════
                         ANALYZING REQUEST
═══════════════════════════════════════════════════════════════════════

⏳ Scanning imports...
⏳ Identifying affected files...
⏳ Estimating scope...
✅ Code analysis complete
⏳ Running Playwright probe (confirming analysis)...
✅ Probe confirmed: 3/3 assertions match

═══════════════════════════════════════════════════════════════════════
                         ANALYSIS COMPLETE
═══════════════════════════════════════════════════════════════════════

📋 REQUEST: "Add loading spinner to submit button"

📊 UNDERSTANDING                          Confidence: HIGH ✅ Playwright-confirmed
Add visual loading feedback to SubmitButton component.

🔍 PROBE RESULTS                                              3/3 ✅
  ✅ /checkout → button[type='submit'] visible
  ✅ /checkout → .spinner absent (no spinner yet)
  ✅ /checkout → button[type='submit'] enabled

🎯 SCOPE: Small (2 files, no breaking changes)

📁 AFFECTED FILES
• src/components/SubmitButton.tsx
• src/components/SubmitButton.test.tsx

⚠️ CONSEQUENCES: None identified

📝 STORY PREVIEW
TSK-001: Add loading state
TSK-002: Show Spinner
TSK-003: Disable button
TSK-004: Add unit tests

[G] Go ahead | [E] Edit | [P] Promote to PRD | [C] Cancel

> _

User: G

Builder:
✅ Task Spec created: docs/tasks/task-2026-03-01-add-spinner.md
📋 Registered in task-registry.json

Starting TSK-001: Add loading state...

[Delegates to @developer, runs quality checks, completes story]

═══════════════════════════════════════════════════════════════════════
                         STORY COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ TSK-001: Add loading state

Progress: 1/4 stories (25%)

[N] Next | [C] Commit | [P] Promote | [A] Abandon

> _

User: N

[Continues through TSK-002, TSK-003, TSK-004...]

═══════════════════════════════════════════════════════════════════════
                       TASK SPEC COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ All 4 stories complete!

Files changed: 2
Tests added: 3

[C] Commit and ship | [E] Write E2E tests

> _

User: C

═══════════════════════════════════════════════════════════════════════
                         COMMIT COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ Committed: feat: Add loading spinner to submit button
✅ Archived to docs/tasks/completed/

Pushing to origin/staging (configured pushTo)...
✅ Pushed to origin/staging

Your workflow is configured to create PRs to 'main'.

[P] Create PR to main
[S] Stay on staging (no PR yet)

> _

User: P

✅ PR #5 created: staging → main
⚠️ Human approval required to merge (main is protected)
✅ Task complete!
```

---

## End-of-Session: Check for Toolkit Update Requests

**After shipping**, check if sub-agents created toolkit update requests:

```bash
ls ~/.config/opencode/pending-updates/*.md 2>/dev/null | grep -v README.md
```

If any files exist, notify the user:

```
───────────────────────────────────────────────────────────────────────
📋 TOOLKIT UPDATE REQUESTS
───────────────────────────────────────────────────────────────────────

Sub-agents queued update request(s) during this session.
Run @toolkit to review and apply these updates.
───────────────────────────────────────────────────────────────────────
```
