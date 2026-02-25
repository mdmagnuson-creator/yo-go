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

Ad-hoc mode handles direct requests without a PRD. Quality checks run automatically after each task:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   TASK PHASE    │ ──► │  E2E (OPTIONAL) │ ──► │   SHIP PHASE    │
│                 │     │                 │     │                 │
│ Implement task, │     │ Write/run E2E   │     │ Commit, merge   │
│ auto quality    │     │ tests if user   │     │ to main, push   │
│ checks per task │     │ chooses [E]     │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               ▲
        │ [N] Next task ─────────────────────────────── │
        │ [C] Commit ────────────────────────────────────┘
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

## Per-Task Quality Checks (MANDATORY)

> ⛔ **Quality checks run automatically after EVERY task. No prompts, no skipping.**
>
> This behavior is defined in the `test-flow` skill and applies to both ad-hoc and PRD modes.

After @developer completes each task, Builder automatically runs:

1. **Typecheck** — `npm run typecheck` (or project equivalent)
2. **Lint** — `npm run lint` (or project equivalent)
3. **Unit tests** — Auto-generate with @tester, then run
4. **Critic** — Run @critic for code review

If any check fails, Builder runs a fix loop (max 3 attempts). If still failing, STOP and report to user.

**After all checks pass**, show the task completion prompt (see Step 4 below).

---

## Phase 1: Task Execution

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

4. **Track changed files** — store list of files modified for quality checks

### Todo Sync Rules (Ad-hoc)

- Keep exactly one `in_progress` todo at any time
- If multiple pending tasks are queued, set only the active one to `in_progress`
- On user "status", read from `uiTodos.items` (not memory-only)
- Before ending ad-hoc mode, ensure panel and `uiTodos.items` are synchronized

### Step 4: Run Quality Checks (Automatic)

> ⛔ **These checks run automatically after EVERY task. No user prompt needed.**

After @developer finishes and the todo is marked complete, immediately run:

1. **Typecheck** — `npm run typecheck` (or project equivalent)
2. **Lint** — `npm run lint` (or project equivalent)
3. **Unit tests** — Run @tester to generate tests, then run them
4. **Critic** — Run @critic for code review

**Fix loop:** If any check fails, run @developer to fix (max 3 attempts). If still failing, STOP and report to user.

### Step 5: Show Completion Prompt

After all quality checks pass, show:

```
═══════════════════════════════════════════════════════════════════════
                          TASK COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ Add loading spinner to submit button

Quality checks:
  ✅ Typecheck: passed
  ✅ Lint: passed
  ✅ Unit tests: 3 generated, all passing
  ✅ Critic: no issues

Changed files: 2 (SubmitButton.tsx, SubmitButton.css)

Options:
  [E] Write E2E tests (Playwright automated UI testing)
  [C] Commit this change
  [N] Next task (add more work)

> _
═══════════════════════════════════════════════════════════════════════
```

**Handle response:**

| Choice | Action |
|--------|--------|
| **E** | Run @playwright-dev to generate E2E tests, then prompt to run them (see E2E Sub-flow below) |
| **C** | Commit the changes (respecting `git.autoCommit` setting), then prompt for next task |
| **N** | Return to task prompt for more work |

### E2E Sub-flow (When User Chooses "E")

1. Run @playwright-dev to generate E2E tests for changed files
2. Show prompt:
   ```
   📝 E2E tests generated:
      • e2e/loading-spinner.spec.ts
   
   [R] Run E2E tests now
   [S] Save for later (queue tests, continue working)
   ```
3. If "R": Start dev server if needed, run tests, handle failures with fix loop
4. If "S": Queue tests in `builder-state.json`, return to completion prompt

### E2E During Active PRD

If an active PRD exists (`docs/builder-state.json` has `activePrd`), add a deferral option:

```
📝 E2E tests generated:
   • e2e/quick-fix.spec.ts

⚠️  Active PRD: prd-error-logging (US-003)

[R] Run E2E tests now (then return to PRD)
[D] Defer to PRD completion (run with PRD's E2E tests)
[S] Save for later
```

> ⚠️ **Required: Always show completion prompts**
>
> After quality checks pass, you MUST show the completion prompt.
> Do NOT skip this prompt. Do NOT just say "Done, what's next?" or wait silently.

---

## Phase 2: E2E Test Batch (Optional)

> ℹ️ **Quality checks now run automatically after every task (see Per-Task Quality Checks above).**
>
> Phase 2 is for running **batched E2E tests** when you want to test multiple changes together,
> or when you have queued E2E tests from multiple tasks.

When user chooses `[E]` from the task completion prompt, or has multiple queued E2E tests:

### Step 1: Check for Active PRD

```bash
# Check if PRD is active
cat docs/builder-state.json 2>/dev/null | grep -q '"activePrd"'
```

- If `activePrd` exists and is not null → Use **Deferral Flow** (option to defer to PRD completion)
- If no active PRD → Continue with this flow

### Step 2: Run Queued E2E Tests

1. Start dev server if needed
2. Run all queued E2E tests (with retry loop on failure)
3. If pass → Continue to Phase 3: Ship
4. If fail after 3 attempts → Report failure, ask user

### Deferral Flow (Ad-hoc During PRD)

If `activePrd` exists, show deferral option:

```
═══════════════════════════════════════════════════════════════════════
                          E2E TESTS READY
═══════════════════════════════════════════════════════════════════════

📝 Queued E2E tests:
   • e2e/quick-fix.spec.ts

⚠️  Active PRD: prd-error-logging (US-003)

Options:
   [R] Run E2E tests now (then return to PRD)
   [D] Defer to PRD completion (run with PRD's E2E tests)
   [S] Save for later (stay in ad-hoc mode)

> _
═══════════════════════════════════════════════════════════════════════
```

**Handle response:**

- "R" or "Run":
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

- "S" or "Save":
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

3. [quality] Running automatic quality checks...
   ✅ Typecheck: passed
   ✅ Lint: passed
   ✅ Unit tests: 2 generated, all passing
   ✅ Critic: no issues

═══════════════════════════════════════════════════════════════════════
                          TASK COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ Add loading spinner to submit button

Quality checks:
  ✅ Typecheck: passed
  ✅ Lint: passed
  ✅ Unit tests: 2 generated, all passing
  ✅ Critic: no issues

Changed files: 2 (SubmitButton.tsx, SubmitButton.css)

Options:
  [E] Write E2E tests (Playwright automated UI testing)
  [C] Commit this change
  [N] Next task (add more work)

> _
═══════════════════════════════════════════════════════════════════════

User: "N"  (next task)
User: "Also fix the footer alignment"

Builder:
4. [build] Creating todo, running @developer...
   ✅ Developer completed: Modified Footer.tsx

5. [quality] Running automatic quality checks...
   ✅ Typecheck: passed
   ✅ Lint: passed
   ✅ Unit tests: 1 generated, all passing
   ✅ Critic: no issues

═══════════════════════════════════════════════════════════════════════
                          TASK COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ Fix footer alignment

Quality checks:
  ✅ Typecheck: passed
  ✅ Lint: passed
  ✅ Unit tests: 1 generated, all passing
  ✅ Critic: no issues

Changed files: 1 (Footer.tsx)

Options:
  [E] Write E2E tests (Playwright automated UI testing)
  [C] Commit this change
  [N] Next task (add more work)

> _
═══════════════════════════════════════════════════════════════════════

User: "E"  (write E2E tests)

Builder:
6. [e2e-gen] Generating E2E tests (@playwright-dev)...
   ✅ Generated: e2e/footer.spec.ts

📝 E2E tests generated:
   • e2e/footer.spec.ts

[R] Run E2E tests now
[S] Save for later (queue tests, continue working)

> _

User: "R"  (run now)

Builder:
7. [dev-server] Starting dev server on port 4000...
   ✅ Server ready

8. [e2e] Running E2E tests...
   ✅ 1 test passed

═══════════════════════════════════════════════════════════════════════
                          TASK COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ Fix footer alignment

All checks passed:
  ✅ Quality checks: passed
  ✅ E2E tests: 1 passed

Options:
  [C] Commit this change
  [N] Next task (add more work)

> _
═══════════════════════════════════════════════════════════════════════

User: "C"  (commit)

Builder:
9. [commit] Committing changes...
   ✅ Committed: "feat: Add loading spinner, fix footer alignment"

═══════════════════════════════════════════════════════════════════════
                          COMMIT COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ Committed: feat: Add loading spinner, fix footer alignment

Push to remote? [Y/n]

> _
═══════════════════════════════════════════════════════════════════════

User: "Y"

Builder:
10. [merge] Merging to main...
    ✅ Merged adhoc/2026-02-20 → main

11. [push] Pushing main to GitHub...
    ✅ Pushed to origin/main

12. [cleanup] Cleaning up...
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
