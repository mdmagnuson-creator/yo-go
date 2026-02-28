# PRD Draft: Dynamic Reassignment

**Status:** Draft  
**Priority:** High  
**Source:** Intelligent AI Delegation paper (arXiv:2602.11865)

## Introduction

When a specialist agent fails mid-execution (crashes, hits rate limits, exceeds context, or produces unacceptable output), the current toolkit has no automatic fallback mechanism. The orchestrator (Builder/Developer) must either retry with the same agent or escalate to the user. This is fragile and wastes time.

The paper describes "adaptive execution" — the ability to switch delegatees mid-execution when context shifts or agents fail. This PRD proposes implementing dynamic reassignment for the yo-go toolkit.

## Problem Statement

1. **No automatic retry** — When a specialist fails, Builder/Developer don't automatically try an alternative
2. **No escalation protocol** — Failures require user intervention or manual retry
3. **No partial work recovery** — If a specialist fails 80% through, all progress is lost
4. **Single point of failure** — One bad specialist blocks the entire task

### Current Failure Scenarios

| Scenario | Current Behavior | Desired Behavior |
|----------|-----------------|------------------|
| Specialist hits rate limit | Task fails, user must resume | Auto-retry with same agent after delay, or switch to alternative |
| Specialist exceeds context | Task fails mid-execution | Checkpoint work, resume with fresh context or different agent |
| Specialist produces bad output | Developer retries once, then fails | Try alternative specialist, then escalate |
| Specialist crashes/hangs | Task hangs indefinitely | Detect timeout, switch to alternative |

## Goals

- Automatic retry with exponential backoff for transient failures (rate limits)
- Alternative agent selection when primary specialist fails persistently
- Checkpoint serialization before agent switches to preserve partial work
- Clear escalation protocol when all alternatives exhausted
- User visibility into reassignment decisions (not silent)

## Proposed Solution

### Approach: Reassignment Protocol

Add a reassignment protocol to Builder/Developer that:

1. **Detects failure type** — transient (rate limit) vs. persistent (bad output, crash)
2. **Chooses strategy** — retry same agent, try alternative, or escalate
3. **Preserves state** — checkpoint partial work before switching
4. **Logs decision** — record why reassignment happened for auditability

### Agent Fallback Chains

Define fallback chains for common task types:

```yaml
# Example fallback configuration
reassignment:
  react-component:
    primary: react-dev
    alternatives: [frontend-dev, developer]
    maxRetries: 2
    
  go-service:
    primary: go-dev
    alternatives: [backend-dev, developer]
    maxRetries: 2
    
  tests:
    primary: tester  # Already routes to specialists
    alternatives: [developer]
    maxRetries: 2
```

### Failure Detection

| Failure Type | Detection | Strategy |
|--------------|-----------|----------|
| Rate limit (429) | Error message contains "rate limit" | Retry with backoff |
| Context overflow | Agent reports context limit | Checkpoint, retry with fresh context |
| Bad output | Verification fails | Try alternative specialist |
| Timeout | No response in N seconds | Try alternative specialist |
| Repeated failures | Same error 3+ times | Escalate to user |

### Checkpoint Format

Before switching agents, serialize current state:

```json
{
  "taskId": "US-003",
  "checkpoint": {
    "filesCreated": ["src/components/Button.tsx"],
    "filesModified": ["src/styles/theme.ts"],
    "completedSteps": ["Created component skeleton", "Added props interface"],
    "pendingSteps": ["Implement click handler", "Add tests"],
    "lastAgentOutput": "...",
    "timestamp": "2026-02-28T10:00:00Z"
  },
  "reassignmentReason": "Agent exceeded context limit",
  "previousAgents": ["react-dev"],
  "nextAgent": "frontend-dev"
}
```

## Open Questions

1. **Where should fallback chains be defined?**
   - Option A: In project.json (per-project customization)
   - Option B: In toolkit config (global defaults)
   - Option C: Both, with project overriding defaults

2. **How much retry is too much?**
   - Need to balance persistence with user time
   - Consider cost implications (more retries = more API calls)

3. **Should users be notified of every reassignment?**
   - Too noisy = annoying
   - Too quiet = user doesn't know why things take longer
   - Propose: One-line notification, detailed log available

4. **How do we verify the alternative agent is "better"?**
   - If react-dev failed, will frontend-dev succeed?
   - May need capability matching, not just fallback chains

5. **What about multi-agent tasks?**
   - If task requires multiple specialists, reassignment is more complex
   - Propose: Focus on single-specialist tasks first

## User Stories

### US-001: Retry with backoff on rate limits

**Description:** As a user, I want Builder to automatically retry when a specialist hits a rate limit, so I don't have to manually resume.

**Acceptance Criteria:**
- [ ] Detect rate limit errors (429, "rate limit", "quota exceeded")
- [ ] Wait with exponential backoff (30s, 60s, 120s)
- [ ] Retry up to 3 times before escalating
- [ ] Show brief status: "Rate limited, retrying in 30s..."
- [ ] After 3 failures, escalate to user

### US-002: Switch to alternative on persistent failure

**Description:** As a user, I want Builder to try an alternative specialist when the primary one fails repeatedly.

**Acceptance Criteria:**
- [ ] Define fallback chains for common task types
- [ ] After 2 failures with primary, try first alternative
- [ ] Pass same task context to alternative
- [ ] Log the switch decision
- [ ] If all alternatives fail, escalate to user

### US-003: Checkpoint before switching agents

**Description:** As a developer, I want partial work to be preserved when switching agents, so progress isn't lost.

**Acceptance Criteria:**
- [ ] Before switching, serialize checkpoint to builder-state.json
- [ ] Include files created/modified, completed steps, pending steps
- [ ] Alternative agent receives checkpoint in prompt
- [ ] Alternative agent can resume from checkpoint
- [ ] Checkpoint is cleared on task success

### US-004: Escalate with context when all options exhausted

**Description:** As a user, I want clear information when reassignment fails, so I can make an informed decision.

**Acceptance Criteria:**
- [ ] Show what was tried and why each failed
- [ ] Suggest next steps (manual fix, different approach, etc.)
- [ ] Include checkpoint so user can resume manually
- [ ] Don't leave task in ambiguous state

## Functional Requirements

- FR-1: Rate limit detection must work across all model providers
- FR-2: Fallback chains must be configurable per-project
- FR-3: Checkpoint serialization must capture all in-progress state
- FR-4: Alternative agents must receive full task context including checkpoint
- FR-5: Escalation must provide actionable information to user
- FR-6: All reassignment decisions must be logged for auditability

## Non-Goals

- Automatic repair of code that specialists couldn't write (this requires different capabilities, not just retry)
- User preference learning (which alternatives work best for this user)
- Cost optimization (choosing cheaper alternatives when appropriate)
- Multi-agent coordination for complex tasks (focus on single-specialist first)

## Technical Considerations

- **State file extension:** Add `reassignment` section to builder-state.json
- **Timeout detection:** May need background monitoring (complex in current architecture)
- **Checkpoint size:** Could get large for big tasks — may need truncation
- **Context passing:** Checkpoint in prompt could use significant context budget

## Dependencies

- Checkpoint & State Serialization PRD (for standardized checkpoint format)
- May benefit from Agent Trust & Reputation (to inform alternative selection)

## Success Metrics

- Rate limit failures recovered automatically 90% of the time
- Task completion rate improves by reducing single-agent failure impact
- User intervention required for <10% of recoverable failures
- Average task completion time not significantly impacted by reassignment overhead

## Credential & Service Access Plan

No external credentials required for this PRD.
