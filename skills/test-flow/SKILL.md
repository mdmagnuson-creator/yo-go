---
name: test-flow
description: "Test flow orchestrator - routes to specialized testing skills. Use when generating unit/E2E tests, handling test failures, or managing E2E deferral. Triggers on: generate tests, run tests, test failures, E2E deferral, test flow."
---

# Test Flow Orchestrator

> This is a routing skill. Load the appropriate sub-skill based on what you need to do.

## Quick Reference

| Need to... | Load this skill |
|------------|-----------------|
| Determine what tests to run | `test-activity-resolution` |
| Run the 3-pass verification loop | `test-verification-loop` |
| Detect/handle prerequisite failures | `test-prerequisite-detection` |
| Execute E2E tests (PRD or ad-hoc) | `test-e2e-flow` |
| Run Playwright UI verification | `test-ui-verification` |
| Run per-task quality checks | `test-quality-checks` |
| Handle failures, manual fallback | `test-failure-handling` |

---

## Skill Descriptions

### test-activity-resolution
**When:** Starting test execution, determining what to test
**Contains:** Signal-based activity resolution algorithm, file pattern matching, E2E timing rules, CI mode detection, informational display format

### test-verification-loop
**When:** Running the main test/fix cycle
**Contains:** 3-pass stability verification, automated fix loop algorithm, state tracking, fix attempt limits, declaring victory

### test-prerequisite-detection
**When:** Tests fail due to missing dependencies or environment issues
**Contains:** Failure classification (code vs prerequisite), environment detection, blocker tracking, bulk re-verification, `verification-blockers.json` format

### test-e2e-flow
**When:** Running end-to-end tests
**Contains:** PRD-mode E2E execution, ad-hoc mode E2E, deferred E2E tracking, E2E auditor integration, `e2e-deferred.json` format

### test-ui-verification
**When:** Verifying UI changes with Playwright
**Contains:** Playwright Required Mode rules, verification flow, flaky test detection, success criteria, visual regression

### test-quality-checks
**When:** Completing a task, running quality gates
**Contains:** Per-task quality checks, completion prompts, verification contracts, escape hatches

### test-failure-handling
**When:** Tests keep failing, need manual intervention
**Contains:** Failure logging, `verification-failures.json` format, manual fallback options, escalation paths

---

## Typical Flow

```
Task Complete
    │
    ▼
┌─────────────────────────────────────┐
│ 1. test-activity-resolution         │
│    • Analyze changed files          │
│    • Resolve test activities        │
│    • Display what will run          │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 2. test-verification-loop           │
│    • Run baseline (typecheck, lint) │
│    • Run unit tests                 │
│    • Run critics                    │
│    • 3-pass stability check         │
│    • Fix loop if failures           │
└─────────────────────────────────────┘
    │
    ├─── Prerequisite failure? ───► test-prerequisite-detection
    │                                  • Classify failure
    │                                  • Track blocker
    │                                  • Skip or escalate
    │
    ├─── UI verification needed? ──► test-ui-verification
    │                                  • Playwright required mode
    │                                  • Visual checks
    │
    ├─── Quality checks? ──────────► test-quality-checks
    │                                  • Per-task checks
    │                                  • Completion prompts
    │
    └─── E2E tests? ───────────────► test-e2e-flow
                                       • Run or defer E2E
                                       • E2E auditor
    │
    ▼
┌─────────────────────────────────────┐
│ On persistent failures:             │
│                                     │
│ test-failure-handling               │
│    • Log to verification-failures   │
│    • Offer manual fallback          │
│    • Escalation options             │
└─────────────────────────────────────┘
```

---

## Loading Skills

Use the `skill` tool to load a sub-skill when you need its detailed instructions.

**Example:** To load the activity resolution skill:
```
skill(name="test-activity-resolution")
```

Load skills incrementally — only when you reach that phase of testing. This reduces token consumption compared to loading the entire test flow upfront.

---

## Migration Notes

This orchestrator replaces the original monolithic `test-flow` skill (133KB, ~33K tokens). The content has been split into 7 focused skills totaling ~45KB combined, but you only load what you need.

**Token savings:** Instead of loading ~33K tokens upfront, Builder now loads:
- Orchestrator: ~800 tokens (this file)
- Sub-skills: ~5-8K tokens each (loaded on demand)
- Typical flow: ~10-15K tokens (orchestrator + 1-2 sub-skills)