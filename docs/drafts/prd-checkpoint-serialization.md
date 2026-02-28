# PRD Draft: Checkpoint & State Serialization

**Status:** Draft  
**Priority:** Medium  
**Source:** Intelligent AI Delegation paper (arXiv:2602.11865)

## Introduction

The paper emphasizes "checkpoint artifacts" that serialize partial work so another agent can resume mid-task. This enables dynamic reassignment, crash recovery, and context overflow handling. Yo-go has `builder-state.json` but it tracks status, not work artifacts.

## Problem Statement

1. **State tracks status, not work** — We know what task is in progress, not what's been done
2. **No handoff protocol** — Switching agents means starting over
3. **Context overflow loses progress** — When context is exceeded, partial work is lost
4. **No resume point** — After failure, unclear where to resume

## Goals

- Standardize checkpoint format that captures work artifacts
- Enable agent switches without losing progress
- Support recovery from context overflow
- Provide clear resume points for interrupted tasks

## Proposed Solution

### Checkpoint Schema

```json
{
  "schemaVersion": 1,
  "taskId": "US-003",
  "taskDescription": "Add dark mode toggle to settings page",
  "checkpoint": {
    "phase": "implementation",  // planning | implementation | verification
    "completedSteps": [
      {
        "step": "Created DarkModeToggle component",
        "filesCreated": ["src/components/DarkModeToggle.tsx"],
        "filesModified": [],
        "timestamp": "2026-02-28T10:00:00Z"
      },
      {
        "step": "Added theme context",
        "filesCreated": ["src/contexts/ThemeContext.tsx"],
        "filesModified": ["src/App.tsx"],
        "timestamp": "2026-02-28T10:05:00Z"
      }
    ],
    "pendingSteps": [
      "Wire toggle to theme context",
      "Add CSS for dark mode styles",
      "Write unit tests"
    ],
    "currentStep": {
      "description": "Wire toggle to theme context",
      "startedAt": "2026-02-28T10:10:00Z",
      "partialWork": "Started adding useTheme hook to toggle component"
    },
    "decisions": [
      {
        "decision": "Use CSS custom properties for theming",
        "rationale": "Avoids runtime style calculation",
        "timestamp": "2026-02-28T10:02:00Z"
      }
    ],
    "blockers": []
  },
  "verification": {
    "criteria": [...],  // From Verifiable Completion PRD
    "results": []
  },
  "metadata": {
    "createdBy": "react-dev",
    "lastUpdatedAt": "2026-02-28T10:10:00Z",
    "checkpointReason": "periodic",  // periodic | context_overflow | failure | reassignment
    "previousAgents": []
  }
}
```

### Checkpoint Triggers

When to create/update checkpoint:
- **Periodic:** Every N completed steps (configurable, default 3)
- **Pre-reassignment:** Before switching to alternative agent
- **Context warning:** When approaching context limit
- **On failure:** Before reporting failure to orchestrator
- **Manual:** Agent decides checkpoint is useful

### Resume Protocol

When agent receives checkpoint:
1. Read completed steps — know what's done
2. Read decisions — understand rationale
3. Read pending steps — know what's next
4. Read current step — resume from partial work
5. Verify files exist — checkpoint may be stale

```markdown
# Resume Prompt Template

You are resuming a task that was partially completed by another agent.

## Task
[taskDescription]

## Completed
[completedSteps formatted as checklist]

## Decisions Made
[decisions formatted as list]

## Pending
[pendingSteps formatted as list]

## Current Step (in progress)
[currentStep.description]
Partial work: [currentStep.partialWork]

## Files Created/Modified
[list of files from completedSteps]

## Your Job
Continue from where the previous agent left off. Verify the partial work, 
then complete the remaining steps.
```

## Open Questions

1. **How verbose should checkpoints be?**
   - More detail = better resume but more storage/context
   - Need to balance informativeness with size

2. **Should checkpoints include file content diffs?**
   - Would enable true "pick up where left off"
   - But could be very large
   - Alternative: just list files, let resuming agent read them

3. **Where do checkpoints live?**
   - Embedded in builder-state.json?
   - Separate checkpoint files per task?
   - Memory limit concerns

4. **How do we know a checkpoint is stale?**
   - Files may have changed since checkpoint
   - Need validation step

5. **What about non-file work?**
   - API calls, deployments, etc.
   - Can't easily resume these

## User Stories

### US-001: Create checkpoints during task execution

**Acceptance Criteria:**
- [ ] Checkpoint created every 3 completed steps (configurable)
- [ ] Checkpoint includes files created/modified, decisions, and pending steps
- [ ] Checkpoint is updated in-place (not appended)
- [ ] Checkpoint creation doesn't significantly slow task execution

### US-002: Create checkpoint before reassignment

**Acceptance Criteria:**
- [ ] When Dynamic Reassignment triggers, checkpoint is created first
- [ ] Checkpoint includes reason for reassignment
- [ ] Checkpoint is passed to alternative agent

### US-003: Resume from checkpoint

**Acceptance Criteria:**
- [ ] Agent can receive checkpoint in prompt
- [ ] Agent verifies files exist before proceeding
- [ ] Agent picks up from current step
- [ ] Agent reports completion of resumed task (not "started new task")

### US-004: Checkpoint on context overflow warning

**Acceptance Criteria:**
- [ ] Detect when approaching context limit (if possible)
- [ ] Create checkpoint before overflow
- [ ] Mark checkpoint reason as "context_overflow"
- [ ] Enable fresh session to resume

## Technical Considerations

- **Storage:** Checkpoints in builder-state.json could get large
- **Schema migration:** Need versioned schema for checkpoint format
- **Stale detection:** Compare file timestamps with checkpoint timestamp
- **Context budget:** Checkpoint in resume prompt uses tokens — keep concise
- **Integration:** Works with existing builder-state.json skill

## Dependencies

- Dynamic Reassignment PRD (primary consumer of checkpoints)
- Builder State skill (where checkpoints are stored)
- builder-state.schema.json (needs checkpoint schema addition)

## Success Metrics

- Agent switches don't require restarting tasks
- Context overflow recovery saves >50% of completed work
- Checkpoint creation adds <5% overhead to task time
- Resume success rate >80% (agent successfully continues)

## Credential & Service Access Plan

No external credentials required for this PRD.
