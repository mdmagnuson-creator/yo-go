# PRD Draft: Verifiable Task Completion

**Status:** Draft  
**Priority:** Medium  
**Source:** Intelligent AI Delegation paper (arXiv:2602.11865)

## Introduction

The paper advocates for "contract-first decomposition" — only delegate a task if you can verify its completion. Currently, yo-go has verification (tests, E2E, definition of done), but verification criteria aren't always explicit before delegation begins.

## Problem Statement

1. **Implicit acceptance criteria** — What counts as "done" is often unclear until task ends
2. **Verification afterthought** — Tests written after implementation, not before delegation
3. **Inconsistent verification** — Some tasks get rigorous verification, others get none
4. **Unverifiable tasks delegated** — Tasks with no clear success criteria are still delegated

## Goals

- Require explicit verification criteria before delegation
- Define "verifiable" vs. "advisory" tasks
- Ensure every delegated task has a clear acceptance test
- Block delegation of unverifiable tasks (or flag for user decision)

## Proposed Solution

### Task Contract Schema

Before delegation, Builder must define:

```json
{
  "taskId": "US-003",
  "description": "Add dark mode toggle to settings page",
  "verificationCriteria": [
    {
      "type": "unit-test",
      "description": "Toggle component renders and fires onClick",
      "command": "npm test -- --grep 'DarkModeToggle'"
    },
    {
      "type": "e2e",
      "description": "Settings page shows toggle, clicking changes theme",
      "file": "e2e/settings.spec.ts"
    },
    {
      "type": "visual",
      "description": "Dark mode styles apply correctly",
      "method": "screenshot-comparison"
    }
  ],
  "verifiable": true
}
```

### Verification Types

| Type | Description | Automation |
|------|-------------|------------|
| unit-test | Specific test file/pattern passes | Fully automated |
| e2e | E2E test scenario passes | Fully automated |
| build | Build succeeds without errors | Fully automated |
| lint | No lint errors introduced | Fully automated |
| visual | Screenshot matches expectation | Semi-automated |
| manual | User must verify | Not automated |
| advisory | No verification possible | Flag to user |

### Delegation Flow Change

```
Current: Builder → Delegate to Specialist → Specialist works → Verify at end

Proposed: Builder → Define criteria → Check verifiable? 
          → If yes: Delegate with criteria → Specialist works → Verify
          → If no: Flag to user ("This task has no clear verification, proceed?")
```

## Open Questions

1. **What about exploratory tasks?**
   - "Investigate performance issue" has no clear success criteria
   - Should these be flagged or have different contract type?

2. **How much overhead is acceptable?**
   - Defining criteria for every task adds cognitive load
   - Balance thoroughness with velocity

3. **Who writes verification criteria?**
   - Builder before delegation?
   - Specialist as first step?
   - Both (Builder outline, Specialist refine)?

4. **What if verification criteria change mid-task?**
   - Discovery during implementation may reveal new requirements
   - Need amendment process

## User Stories

### US-001: Require verification criteria before delegation

**Acceptance Criteria:**
- [ ] Builder must define at least one verification criterion before delegating
- [ ] Criterion includes type, description, and (if automated) command/file
- [ ] Criteria passed to specialist as part of task specification
- [ ] Specialist knows upfront how success will be measured

### US-002: Flag unverifiable tasks

**Acceptance Criteria:**
- [ ] If no criteria can be defined, task is "advisory"
- [ ] Builder flags advisory tasks to user
- [ ] User can approve delegation or provide criteria
- [ ] Advisory tasks don't count toward automated success metrics

### US-003: Run verification automatically on completion

**Acceptance Criteria:**
- [ ] When specialist reports done, Builder runs verification criteria
- [ ] All automated criteria must pass for success
- [ ] Manual/visual criteria prompt user
- [ ] Failure triggers retry or reassignment (per Dynamic Reassignment PRD)

## Technical Considerations

- **Schema extension:** Add `verificationCriteria` to task format
- **Backwards compatibility:** Old tasks without criteria = advisory
- **Verification commands:** Must be idempotent and fast
- **Integration with test-flow skill:** Reuse existing test patterns

## Dependencies

- Dynamic Reassignment PRD (verification failure triggers reassignment)
- Test Flow skill (provides verification patterns)

## Success Metrics

- All delegated tasks have explicit verification criteria
- Verification pass rate improves (clearer criteria = better outcomes)
- Time spent on unclear tasks decreases
- Fewer "is this done?" back-and-forth exchanges

## Credential & Service Access Plan

No external credentials required for this PRD.
