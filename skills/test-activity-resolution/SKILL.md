---
name: test-activity-resolution
description: "Signal-based automatic test activity resolution. Use when determining which tests and critics to run based on changed files and code patterns. Triggers on: resolve activities, test activities, activity rules, file patterns, what tests to run."
---

# Test Activity Resolution

> Load this skill when: determining which tests/critics to run, resolving test activities from file changes, or configuring activity rules.

## Overview

Test activities are determined **automatically** based on what changed — no prompts, no user selection. The system analyzes changed files, matches patterns, and collects activities.

## How It Works

```
Task complete
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: Collect Changed Files                                       │
│                                                                     │
│ • git diff --name-only HEAD~1 (or vs base branch)                  │
│ • Include staged + unstaged changes                                 │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: Resolve Activities                                          │
│                                                                     │
│ Read: ~/.config/opencode/data/test-activity-rules.json             │
│ Read: <project>/docs/test-debt.json (hotspots)                     │
│                                                                     │
│ For each changed file:                                              │
│   • Match against filePatterns → collect activities                 │
│   • Check e2eScope for dependent testing                           │
│                                                                     │
│ For diff content:                                                   │
│   • Match against codePatterns → collect additional activities      │
│                                                                     │
│ Check cross-cutting rules:                                          │
│   • Multiple directories touched? → add oddball-critic              │
│   • Shared module touched? → add dx-critic                          │
│                                                                     │
│ Check hotspots:                                                     │
│   • File in test-debt.json? → add its critics, force E2E           │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3: Display Activities (Informational Only)                     │
│                                                                     │
│ Show what's running — NO confirmation prompt                        │
│ Execution proceeds immediately after display                        │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 4: Execute Activities                                          │
│                                                                     │
│ 1. Baseline: typecheck, lint (always)                               │
│ 2. Unit tests: resolved testers for file types                      │
│ 3. Critics: resolved critics in parallel                            │
│ 4. E2E: immediate or deferred based on resolution                   │
│ 5. Quality: aesthetic-critic, tailwind-critic if resolved           │
└─────────────────────────────────────────────────────────────────────┘
```

## Activity Resolution Algorithm

```
function resolveActivities(changedFiles, diffContent, project):
  # Check if project has UI
  hasUI = project.capabilities.ui !== false
  
  # Load rules
  rules = read("~/.config/opencode/data/test-activity-rules.json")
  hotspots = read("<project>/docs/test-debt.json") or { hotspots: {} }
  
  activities = {
    baseline: ["typecheck", "lint"],
    unit: Set(),
    critics: Set(),
    e2e: hasUI ? rules.defaults.e2e : "skip-no-ui",
    e2eAreas: [],
    dependentSmoke: [],
    quality: Set(),
    reasoning: []
  }
  
  for file in changedFiles:
    for pattern, rule in rules.filePatterns:
      if globMatch(file, pattern):
        # Collect critics
        activities.critics.addAll(rule.critics or [])
        activities.reasoning.push(file + " → " + (rule.reason or pattern))
        
        # Determine unit tester
        if rule.unit === true:
          activities.unit.add(inferUnitTester(file))
        else if rule.unit is string:
          activities.unit.add(rule.unit)
        
        # Handle E2E
        if rule.e2e === "skip":
          continue  # This file doesn't need E2E
        
        if rule.e2e === "immediate" and hasUI:
          activities.e2e = "immediate"
          activities.e2eAreas.add(file)
        
        if rule.e2e === "deferred" and hasUI:
          # UI project override: if project has Playwright in postChangeWorkflow
          # or apps.*.testing, resolve as "immediate" instead of "deferred"
          if isUIProject(project):
            activities.e2e = "immediate"
          activities.e2eAreas.add(file)
        
        # Dependent smoke testing
        if rule.e2eScope === "dependents":
          activities.dependentSmoke.add(file)
        
        # Quality critics
        if rule.quality === true:
          activities.quality.addAll(["aesthetic-critic"])
        else if rule.quality is array:
          activities.quality.addAll(rule.quality)
  
  # Match code patterns in diff
  for pattern, rule in rules.codePatterns:
    if regexMatch(diffContent, pattern):
      activities.critics.addAll(rule.critics or [])
      if rule.e2e === "immediate" and hasUI:
        activities.e2e = "immediate"
      activities.reasoning.push("Code pattern: " + pattern)
  
  # Cross-cutting rules
  directories = countDistinctDirectories(changedFiles)
  if directories >= rules.crossCuttingRules.multipleDirectories.threshold:
    activities.critics.addAll(rules.crossCuttingRules.multipleDirectories.add.critics)
  
  sharedPaths = rules.crossCuttingRules.sharedModuleTouch.paths
  if anyMatch(changedFiles, sharedPaths):
    activities.critics.addAll(rules.crossCuttingRules.sharedModuleTouch.add.critics)
  
  # Hotspot escalation
  for file in changedFiles:
    if file in hotspots.hotspots:
      h = hotspots.hotspots[file]
      activities.critics.addAll(h.addedCritics or [])
      if h.forceE2E and hasUI:
        activities.e2e = "immediate"
      activities.reasoning.push(file + " → hotspot: " + h.reason)
  
  return activities

function isUIProject(project):
  # A project requires per-story Playwright verification when ANY of:
  # 1. postChangeWorkflow has a step with "playwright" in name or command
  # 2. apps.*.testing.framework contains "playwright"
  # 3. apps.*.type is "frontend" or "desktop"
  if project.postChangeWorkflow?.steps:
    for step in project.postChangeWorkflow.steps:
      if "playwright" in step.name?.toLowerCase() or "playwright" in step.command?.toLowerCase():
        return true
  for appName, appConfig in project.apps:
    if "playwright" in (appConfig.testing?.framework or "").toLowerCase():
      return true
    if appConfig.type in ["frontend", "desktop"]:
      return true
  return false

function inferUnitTester(file):
  if file.endsWith(".tsx") or file.endsWith(".jsx"):
    return "react-tester"
  if file.endsWith(".go"):
    return "go-tester"
  return "jest-tester"
```

## Informational Activity Display

After resolution, display what's running — **no confirmation, execution proceeds immediately:**

```
═══════════════════════════════════════════════════════════════════════
                      TEST ACTIVITIES FOR THIS CHANGE
═══════════════════════════════════════════════════════════════════════

Changed files:
  • src/components/PaymentForm.tsx
  • src/api/payments/charge.ts

Running:
  ✓ Baseline: typecheck, lint
  ✓ Unit tests: @react-tester, @jest-tester
  ✓ Critics: @frontend-critic, @backend-critic-ts, @security-critic
  ✓ E2E: IMMEDIATE (payment code detected)
  ✓ Quality: @aesthetic-critic

═══════════════════════════════════════════════════════════════════════
```

**Note:** This display is informational. User is NOT asked to confirm or modify.

## E2E Timing Rules

| Timing | Meaning | When |
|--------|---------|------|
| `immediate` | Run E2E now, before task marked complete | Auth, payment, API, middleware, database |
| `immediate` (UI override) | Run E2E now for UI projects | Components, hooks, pages, styling — when project has Playwright in `postChangeWorkflow` or `apps.*.testing` |
| `deferred` | Queue for PRD/batch completion | Components, hooks, pages, styling — only for non-UI projects |
| `skip` | No E2E for this file type | Type definitions, tests, docs, config |
| `skip-no-ui` | Project has no UI | CLI tools, libraries, backend-only |

> ℹ️ **UI Project Override:** For projects with Playwright in `postChangeWorkflow.steps[]` or
> `apps.*.testing.framework`, files that would normally resolve as `deferred` (components, hooks,
> pages, styling) instead resolve as `immediate`. This ensures per-story Playwright verification
> in both PRD and ad-hoc modes. Non-UI projects retain the original deferral behavior.

## Skip Playwright Entirely

These file types never trigger Playwright (even in UI projects):

- `*.d.ts` — Type definitions
- `*.test.ts`, `*.spec.ts`, `__tests__/**` — Test files
- `*.md`, `README*`, `docs/**` — Documentation
- `.eslintrc*`, `.prettierrc*`, `tsconfig*.json` — Dev config
- `.gitignore`, `.github/**` — Git/CI config
- `*.lock`, `package-lock.json` — Lockfiles

## Project UI Detection

Before running Playwright, check if project has a UI:

```json
// project.json
{
  "capabilities": {
    "ui": true   // Has web UI → Playwright runs
    "ui": false  // No UI → Skip Playwright entirely
  }
}
```

If `capabilities.ui` is not declared, detect from:
- Has `apps/web/`, `src/app/`, `src/pages/` → UI project
- Has React/Vue/Svelte/Next.js in dependencies → UI project
- Has `playwright.config.*` → UI project
- Otherwise → assume no UI

## Test Execution Mode (CRITICAL)

> ⚠️ **ALWAYS run tests in CI/non-watch mode to prevent orphaned processes.**

### Required Flags by Runner

| Runner | Watch Mode (DO NOT USE) | CI Mode (USE THIS) |
|--------|------------------------|-------------------|
| **Vitest** | `vitest` (default) | `vitest run` |
| **Jest** | `jest --watch` | `jest` (default) |
| **Playwright** | N/A | Default is single-run |
| **Go test** | N/A | Default is single-run |

### Enforcement

When executing test commands:

1. **Check if project uses Vitest** — look for `vitest` in `package.json` dependencies
2. **If Vitest detected**, verify the test script includes `run`:
   - ✅ `"test": "vitest run"`
   - ❌ `"test": "vitest"` (will watch)
3. **If the script is wrong or uncertain**, run with explicit flags:
   ```bash
   CI=true npx vitest run
   ```
4. **CI environment variable** — set `CI=true` as a safety net:
   ```bash
   CI=true npm test
   ```

## Escape Hatches (Power Users Only)

These overrides exist but are **never required**:

### Per-Task Force

```
User: "force full"
Builder: "Adding all critics + unit tests..."
```

### Per-Task Skip

```
User: "skip security-critic"
Builder: "Removing @security-critic from this run..."
```

### Project-Level Configuration

```json
{
  "testing": {
    "alwaysInclude": ["security-critic"],
    "neverSkip": ["exploit-critic"]
  }
}
```

### Legacy Rigor Profiles (DEPRECATED)

> ⚠️ **`rigorProfile` is deprecated and ignored.**
>
> If you have `testing.rigorProfile` in `project.json`, it will be ignored.
> Test activities are now determined automatically based on what changed.
