---
name: adhoc-workflow
description: "Ad-hoc mode workflow for Builder. Use when handling direct requests without a PRD, quick fixes, or one-off tasks. Triggers on: ad-hoc mode, quick fix, direct request, one-off task."
---

# Ad-hoc Workflow

> Load this skill when: handling direct requests without a PRD, ad-hoc mode, quick fixes, one-off tasks.

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

2. Read `docs/CONVENTIONS.md` and prepare a 2-5 sentence summary of key patterns

3. Store this context for the session — you'll pass it to @developer, @tester, @critic

**Why this matters:** Without context, @developer makes assumptions that violate project conventions. This causes fix loops, wasted tokens, and frustrated users.

## Git Auto-Commit Enforcement

> ⛔ **CRITICAL: Check `git.autoCommit` setting before ANY commit operation**
>
> **Trigger:** Before running `git commit` at any step in this workflow.
>
> **Check:** `project.json` → `git.autoCommit`
> - If `true` (default): Proceed with commits normally
> - If `false`: **NEVER run `git commit`** — failure to comply violates project constraint
>
> **When autoCommit is disabled, replace commit steps with:**
> 1. Stage changes: `git add -A` (or specific files)
> 2. Report what would be committed:
>    ```
>    📋 READY TO COMMIT (manual commit required)
>    
>    Staged files:
>      [list of files]
>    
>    Suggested commit message:
>      feat: [summary of changes]
>    
>    Run: git commit -m "feat: [summary of changes]"
>    ```
> 3. **Do NOT run `git commit`** — wait for user to commit manually
> 4. Continue workflow only after user confirms commit was made
>
> **This applies to ALL commit steps** including "Stop after each" and "All at once" modes.

## Overview

Ad-hoc mode handles direct requests without a PRD. It operates in three phases:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   BATCH PHASE   │ ──► │  VERIFY PHASE   │ ──► │   SHIP PHASE    │
│                 │     │                 │     │                 │
│ Add tasks,      │     │ Typecheck,      │     │ Commit, merge   │
│ implement each  │     │ lint, test,     │     │ to main, push   │
│                 │     │ critic (3x)     │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**⚠️ PRD PROTECTION:** If a PRD is currently checked out (`docs/prd.json` exists), do NOT modify it. Ad-hoc work is tracked separately.

## Git Execution Mode (Ad-hoc)

Resolve from `docs/project.json`:

1. `agents.gitWorkflow`
2. If `trunk`, resolve `agents.trunkMode` (default: `branchless`)
3. Resolve default branch from `git.defaultBranch` (fallback: `main`)

Rules:
- `trunk + branchless`: work directly on default branch, no ad-hoc branch creation, no PR flow by default
- Other workflows (or `trunk + pr-based`): use existing ad-hoc branch flow

---

## Workflow Preference Prompt

> ⚠️ **MANDATORY: Always ask this BEFORE starting any ad-hoc work**

When entering ad-hoc mode — whether from the main menu, a direct task description, or an off-script request during PRD work — prompt the user:

```
═══════════════════════════════════════════════════════════════════════
                        AD-HOC WORKFLOW
═══════════════════════════════════════════════════════════════════════

How would you like me to handle these changes?

  [S] Stop after each — I'll pause after each todo for verification,
                        testing, and commit decisions

  [A] All at once     — I'll complete all todos, then prompt for
                        testing and commit

> _
═══════════════════════════════════════════════════════════════════════
```

**Store this preference** for the duration of the ad-hoc session (in memory, not persisted).

### Behavior by Mode

| Mode | Behavior |
|------|----------|
| **Stop after each (S)** | Complete todo → verify (typecheck/lint) → prompt: "Run @tester? Commit?" → wait for response → next todo |
| **All at once (A)** | Complete all todos → verify all → prompt: "Run @tester? Commit?" |

### When to Show This Prompt

1. **Pure ad-hoc session** — User selects "A" from main menu or describes a task directly
2. **Ad-hoc during PRD** — User asks for something outside PRD scope while working a story

For case 2: Recognize the off-script request, inform user it's outside PRD scope, then show the workflow preference prompt before starting.

---

## Phase 1: Batch (Adding Tasks)

When user enters ad-hoc mode or gives a task:

### Resume Behavior

If `docs/builder-state.json` contains `uiTodos.flow = "adhoc"` with unfinished items:
- Restore those items to the right panel via `todowrite`
- Continue from the first `in_progress` item (or first `pending` if none in progress)
- Do not silently discard existing tasks

### Step 1: Setup Execution Branch

If `trunk + branchless`, stay on default branch:

```bash
git checkout <default-branch>
```

Otherwise, on first task in a session, create or checkout the ad-hoc branch:

```bash
# Branch naming: adhoc/YYYY-MM-DD
BRANCH="adhoc/$(date +%Y-%m-%d)"

# Check if branch exists
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git checkout "$BRANCH"
else
    git checkout -b "$BRANCH" main
fi
```

If a branch `adhoc/YYYY-MM-DD` already exists from an earlier session today, continue on it.

### Step 2: Understand the Request

Parse the user's request to understand:
- What they want built/changed
- Which files are likely affected
- Whether this is a UI change (needs visual verification later)

---

## Root Cause Analysis (MANDATORY)

> ⛔ **No band-aid fixes. Every fix must address the root cause.**
>
> Before implementing ANY fix, @developer must document in the commit message or PR:
>
> 1. **Diagnose** — Explain WHY the bug occurs, not just WHAT is happening
> 2. **Identify the root** — What's the underlying structural/architectural issue?
> 3. **Propose fix** — How does this fix address the root cause?
>
> **Evidence:** Commit message must include "Root cause:" section explaining the underlying issue.
>
> **Failure behavior:** If the fix only masks the symptom without addressing why it happened, reject it and dig deeper.

### Band-Aid Pattern Detection

**STOP and reconsider** if your fix involves any of these patterns:

| Band-Aid Pattern | What It Masks | Ask Instead |
|------------------|---------------|-------------|
| `setTimeout` / `delay` / `sleep` | Timing/race condition | "What completion signal should I wait for? (Promise, event, state change)" |
| Incrementing `z-index` | Stacking context issue | "Why is this stacking context wrong? Should this be a portal? Is the DOM structure correct?" |
| Magic numbers (margins, pixels, offsets) | Layout relationship broken | "What flexbox/grid relationship is broken? What container is misconfigured?" |
| Adding boolean flags for races | Data flow issue | "What's the correct async pattern? Should this be a state machine?" |
| `!important` in CSS | Specificity war | "Why is specificity fighting me? Is there a cascade issue?" |
| Catching and swallowing errors | Unhandled error condition | "What error am I hiding? Should this propagate or be handled differently?" |
| Hardcoded viewport/screen values | Responsive design issue | "What breakpoint or container query should this use?" |
| `pointer-events: none` to fix click issues | Event bubbling/z-index issue | "Why isn't the intended element receiving events?" |
| `overflow: hidden` to hide layout bugs | Content/container mismatch | "Why is content overflowing? Is the container sized correctly?" |

### Examples

**❌ Bad (band-aid):**
```typescript
// "Fixed" redirect timing by adding delay
await new Promise(resolve => setTimeout(resolve, 100));
router.push('/dashboard');
```

**✅ Good (root cause):**
```typescript
// Wait for the actual operation to complete before redirecting
await saveUserData();
router.push('/dashboard');
```

**❌ Bad (band-aid):**
```css
/* "Fixed" menu appearing behind modal */
.dropdown-menu {
  z-index: 9999;
}
```

**✅ Good (root cause):**
```tsx
// Menu needs to escape the stacking context - use a portal
<Portal>
  <DropdownMenu />
</Portal>
```

### Enforcement

When delegating to @developer, include this instruction:

```
IMPORTANT: No band-aid fixes. Before implementing, explain:
1. WHY does this bug occur? (root cause)
2. How does your fix ADDRESS the root cause?

If your fix involves setTimeout, z-index changes, magic numbers, or
!important, STOP and find the structural fix instead.
```

---

### Step 3: Create Todo and Implement

1. **Create a todo** for the task (status: `in_progress`)
   - Write it to right panel with `todowrite`
   - Persist it in `docs/builder-state.json` under `uiTodos.items[]` with:
     - `content`: short task label
     - `status`: `in_progress`
     - `priority`: `high|medium|low` (default `medium`)
     - `flow`: `adhoc`
     - `refId`: `adhoc-###`

2. **Run @developer with context block** (REQUIRED)

   > ⚠️ **CRITICAL: Always pass a context block when delegating to @developer**
   >
   > Ad-hoc tasks fail when @developer lacks project context. Build and pass the context block.

   Build the context block from project files you've already read:

   ```yaml
   <context>
   version: 1
   project:
     path: {absolute path to project}
     stack: {stack from project.json}
     commands:
       dev: {commands.dev}
       test: {commands.test}
       build: {commands.build}
       lint: {commands.lint}
   conventions:
     summary: |
       {2-5 sentence summary of key conventions relevant to the task}
     fullPath: {path}/docs/CONVENTIONS.md
   currentWork:
     mode: adhoc
     task: {short description of the task}
     branch: {current branch name}
   </context>
   ```

   **Example delegation:**

   ```markdown
   <context>
   version: 1
   project:
     path: /Users/dev/code/my-app
     stack: nextjs-prisma
     commands:
       test: npm test
       lint: npm run lint
   conventions:
     summary: |
       TypeScript strict. Tailwind + shadcn/ui. App Router.
       Server components by default. Prisma ORM. Zod validation.
     fullPath: /Users/dev/code/my-app/docs/CONVENTIONS.md
   currentWork:
     mode: adhoc
     task: Add loading spinner to submit button
     branch: adhoc/2026-02-25
   </context>

   Implement: Add a loading spinner to the submit button.

   Requirements:
   - Show spinner while form is submitting
   - Disable button during submission
   - Use existing Spinner component if available
   ```

3. **Mark todo complete** immediately when @developer finishes
   - Update right panel via `todowrite`
   - Update `uiTodos.items[]` and `uiTodos.lastSyncedAt`

4. **Track changed files** — store list of files modified for later verification

### Todo Sync Rules (Ad-hoc)

- Keep exactly one `in_progress` todo at any time
- If multiple pending tasks are queued, set only the active one to `in_progress`
- On user "status", read from `uiTodos.items` (not memory-only)
- Before ending ad-hoc mode, ensure panel and `uiTodos.items` are synchronized

### Step 4: Post-Todo Flow (Depends on Workflow Preference)

**If "Stop after each" (S) mode:**

After each todo completes, run quick verification and prompt:

```
═══════════════════════════════════════════════════════════════════════
                          TODO COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ Add loading spinner to submit button

Verification:
  ✅ Typecheck: passed
  ✅ Lint: passed

Changed files: 2 (SubmitButton.tsx, SubmitButton.css)

Options:
  [T] Run @tester for regression tests
  [C] Commit this change now
  [N] Next todo (keep working)
  [V] Full verify (all quality checks)

> _
═══════════════════════════════════════════════════════════════════════
```

Wait for user response before proceeding. User can:
- "T" → Run @tester, then return to this prompt
- "C" → Commit just this change, then prompt for next task
- "N" → Continue to next task (or prompt for new task if none queued)
- "V" → Jump to Phase 2: Verify

**If "All at once" (A) mode:**

After each todo completes, show brief status and continue:

```
═══════════════════════════════════════════════════════════════════════
                          TASK COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ Add loading spinner to submit button

Completed: 1 task
Changed files: 2 (SubmitButton.tsx, SubmitButton.css)

Options:
  • Describe another task to add to this batch
  • Type "verify" to run tests and quality checks
  • Type "status" to see all completed tasks

> _
═══════════════════════════════════════════════════════════════════════
```

**Keep accepting tasks** until user says "verify".

> ⚠️ **Required: Always show post-todo prompts**
>
> After @developer finishes a task, perform this sequence:
> 1. Mark the todo complete
> 2. Display the appropriate prompt based on workflow preference (see above)
> 3. Wait for user input
>
> Do NOT skip this prompt. Do NOT just say "Done, what's next?" or wait silently.

---

## Phase 2: Verify (US-004)

When user says "verify", run automatic test generation and quality checks.

### Step 1: Check for Active PRD

First, determine if this is standalone ad-hoc or ad-hoc during PRD:

```bash
# Check if PRD is active
cat docs/builder-state.json 2>/dev/null | grep -q '"activePrd"'
```

- If `activePrd` exists and is not null → **Ad-hoc during PRD** (use Deferral Flow below)
- If no active PRD → **Standalone ad-hoc** (continue with this flow)

### Step 2: Auto-Generate Unit Tests (no prompt)

Run @tester in ad-hoc mode to generate/update tests for changed files:

```
Run @tester with:
  mode: adhoc
  changedFiles: [all files modified in this ad-hoc batch]
```

This generates tests without prompting the user.

### Step 3: Run Unit Tests and Quality Checks

Run these in order (with auto-fix retry loop):

1. **Typecheck** — `npm run typecheck` (or project equivalent)
2. **Lint** — `npm run lint` (or project equivalent)
3. **Unit tests** — Run generated/updated tests for changed files
4. **Critic** — Run @critic for code review

See test-flow skill for the fix loop algorithm (3 attempts max).

### Step 4: Auto-Generate E2E Tests (no prompt)

After unit tests pass, generate E2E tests:

```
Run @playwright-dev with:
  mode: adhoc
  description: [summary of ad-hoc changes]
  changedFiles: [files modified]
```

Add generated tests to queue:

```json
// Update builder-state.json
{
  "pendingTests": {
    "e2e": {
      "generated": ["e2e/spinner.spec.ts", "e2e/footer.spec.ts"],
      "status": "pending"
    }
  }
}
```

### Step 5: Show E2E Test Prompt

Display the test options:

```
═══════════════════════════════════════════════════════════════════════
                          TESTS GENERATED
═══════════════════════════════════════════════════════════════════════

✅ Unit tests: 3 generated, all passing
✅ Typecheck: passed
✅ Lint: passed
✅ Critic: no issues

📝 E2E tests queued:
   • e2e/loading-spinner.spec.ts
   • e2e/footer-alignment.spec.ts

Options:
   [T] Run E2E tests now (then ship)
   [W] Keep working (tests stay queued for later)

> _
═══════════════════════════════════════════════════════════════════════
```

**Handle response:**

- "T" or "Tests":
  1. Start dev server if needed
  2. Run E2E tests (with retry loop on failure)
  3. If pass → Continue to Phase 3: Ship
  4. If fail after 3 attempts → Report failure, ask user

- "W" or "Work":
  1. E2E tests remain queued in `builder-state.json`
  2. Return to "TASK COMPLETE" prompt
  3. User can add more tasks or type "verify" again later

### Deferral Flow (Ad-hoc During PRD) (US-005)

If `activePrd` exists in state, use the deferral prompt instead:

```
═══════════════════════════════════════════════════════════════════════
                          TESTS GENERATED
═══════════════════════════════════════════════════════════════════════

✅ Unit tests: 2 generated, all passing

📝 E2E tests queued:
   • e2e/quick-fix.spec.ts

⚠️  Active PRD: prd-error-logging (US-003)

Options:
   [N] Run E2E tests now (then return to PRD)
   [D] Defer to PRD completion (run with PRD's E2E tests)
   [W] Keep working (tests stay queued)

> _
═══════════════════════════════════════════════════════════════════════
```

**Handle response:**

- "N" or "Now":
  1. Start dev server if needed
  2. Run E2E tests
  3. If pass → Commit ad-hoc work separately, return to PRD
  4. If fail → Fix loop, then commit and return

- "D" or "Defer":
  1. Add E2E tests to PRD's deferred queue:
     ```json
     {
       "pendingTests": {
         "e2e": {
           "generated": ["e2e/story1.spec.ts", "e2e/quick-fix.spec.ts"],
           "deferredTo": "prd-completion"
         }
       }
     }
     ```
  2. Commit ad-hoc work with separate commit message
  3. Return to PRD work

- "W" or "Work":
  1. E2E tests remain queued (not deferred)
  2. Return to task prompt

---

## Phase 3: Ship (US-007)

When verification passes and user confirms (or types "ship anyway"):

**The behavior depends on commit strategy** — see Commit Strategy section below.

### For `batch-per-session` (default):

#### Step 1: Show Commit Prompt

Display summary with all changes:

```
═══════════════════════════════════════════════════════════════════════
                          READY TO COMMIT
═══════════════════════════════════════════════════════════════════════

Summary: [summary of all completed todos]

Files changed: [count]
  [list of files]

Status:
  ✅ Unit tests: passed
  ✅ E2E tests: passed (or skipped)
  ✅ Docs: [completed/skipped/pending]

Commit message:
  feat: [auto-generated message]

[C] Commit with this message
[E] Edit commit message
[W] Keep working

> _
═══════════════════════════════════════════════════════════════════════
```

#### Step 2: Commit Changes

Commit behavior depends on git mode:

- `trunk + branchless`: commit on default branch
- otherwise: commit on ad-hoc branch

```bash
git add -A
git commit -m "feat: [summary of changes]"
```

#### Step 3: Push Prompt

```
═══════════════════════════════════════════════════════════════════════
                          COMMIT COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ Committed: feat: [message]

Push to remote? [Y/n]

> _
═══════════════════════════════════════════════════════════════════════
```

#### Step 4: Merge/Push Behavior (if pushing)

If `trunk + branchless`:

```bash
git push origin <default-branch>
```

Skip local branch merge/delete steps.

If not branchless trunk mode:

```bash
git checkout main
git merge adhoc/YYYY-MM-DD --no-ff -m "Merge adhoc/YYYY-MM-DD"
```

If merge conflicts occur:
- Attempt to resolve automatically
- If unresolvable, report to user and wait for guidance

#### Step 5: Push Main to GitHub (non-branchless mode)

```bash
git push origin main
```

#### Step 6: Cleanup and Clear State

```bash
# Delete the ad-hoc branch locally (non-branchless mode)
git branch -d adhoc/YYYY-MM-DD

# Clear test checkpoint
rm -f .tmp/.test-checkpoint.json

# Clear builder state
rm docs/builder-state.json 2>/dev/null
```

### For `per-todo`:

Commits happen after each todo completion (in the task flow), so Phase 3 only handles:

1. **Push prompt** — Push all commits to remote
2. **Merge and cleanup** — Same as above

### For `manual`:

1. **Stage changes:** `git add -A`
2. **Report:** "Changes staged. Commit manually when ready."
3. **Clear state** (except `uncommittedWork` tracking)

---

## Commit Strategy Configuration

Read from `docs/project.json`:

```json
{
  "agents": {
    "commitStrategy": "batch-per-session"  // default
  }
}
```

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `batch-per-session` | One commit for all work after tests pass | Default, clean history |
| `per-todo` | One commit per completed todo | Granular history, easier bisect |
| `manual` | Builder stages changes, user commits | Full control |

---

## Ad-hoc Report Generation

After shipping, generate report to `docs/completed/adhoc/adhoc-YYYY-MM-DD-brief-description.md`

Include:
- All tasks completed in this batch
- Files modified
- Testing notes

---

## Example Flow

```
User: "Add a loading spinner to the submit button"

Builder:
1. [setup] Creating branch adhoc/2026-02-20...
   ✅ Branch created

2. [build] Creating todo, running @developer...
   ✅ Developer completed: Modified SubmitButton.tsx, SubmitButton.css
   ✅ Todo marked complete

═══════════════════════════════════════════════════════════════════════
✅ Task complete. Add more todos or type "verify"?
═══════════════════════════════════════════════════════════════════════

User: "Also fix the footer alignment"

Builder:
3. [build] Creating todo, running @developer...
   ✅ Developer completed: Modified Footer.tsx
   ✅ Todo marked complete

═══════════════════════════════════════════════════════════════════════
✅ 2 tasks complete. Add more todos or type "verify"?
═══════════════════════════════════════════════════════════════════════

User: "verify"

Builder:
4. [unit-tests] Generating unit tests (@tester)...
   ✅ Generated: SubmitButton.test.tsx, Footer.test.tsx

5. [typecheck] Running typecheck...
   ✅ No type errors

6. [lint] Running lint...
   ✅ No lint errors

7. [unit-tests] Running unit tests...
   ✅ 8 tests passed

8. [critic] Running @critic...
   ✅ No issues found

9. [e2e-tests] Generating E2E tests (@playwright-dev)...
   ✅ Generated: e2e/spinner.spec.ts, e2e/footer.spec.ts

═══════════════════════════════════════════════════════════════════════
                          TESTS GENERATED
═══════════════════════════════════════════════════════════════════════

✅ Unit tests: 2 generated, all passing
✅ Typecheck: passed
✅ Lint: passed
✅ Critic: no issues

📝 E2E tests queued:
   • e2e/spinner.spec.ts
   • e2e/footer.spec.ts

Options:
   [T] Run E2E tests now (then ship)
   [W] Keep working (tests stay queued for later)

> _
═══════════════════════════════════════════════════════════════════════

User: "T"

Builder:
10. [dev-server] Starting dev server on port 4000...
    ✅ Server ready

11. [e2e] Running E2E tests...
    ✅ 2 tests passed

═══════════════════════════════════════════════════════════════════════
✅ All tests passed. Ship now? (y/n)
═══════════════════════════════════════════════════════════════════════

User: "y"

Builder:
12. [commit] Committing on adhoc/2026-02-20...
    ✅ Committed: "feat: Add loading spinner, fix footer alignment"

13. [merge] Merging to main...
    ✅ Merged adhoc/2026-02-20 → main

14. [push] Pushing main to GitHub...
    ✅ Pushed to origin/main

15. [cleanup] Cleaning up...
    ✅ Deleted branch adhoc/2026-02-20
    ✅ Report saved to docs/completed/adhoc/adhoc-2026-02-20-spinner-footer.md

Done! Changes are live on main.
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

Sub-agents queued 2 toolkit update request(s) during this session:

  • 2026-02-20-jest-tester-mock-pattern.md (from @jest-tester)
  • 2026-02-20-react-tester-rtl-version.md (from @react-tester)

Run @toolkit to review and apply these updates.
───────────────────────────────────────────────────────────────────────
```
