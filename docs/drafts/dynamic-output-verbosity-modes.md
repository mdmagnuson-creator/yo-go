# PRD 004: Dynamic Output Verbosity Modes

**Status:** draft  
**Priority:** high  
**Effort:** medium  
**Impact:** high

## Overview

Introduce dynamic output verbosity controls so agents minimize token usage on happy paths while preserving debugging quality when tasks fail.

This PRD defines:

1. A shared verbosity policy (`lean`, `balanced`, `debug`)
2. Agent/task-aware default behavior (without heavy per-turn reasoning)
3. Automatic escalation to richer output only when failure signals appear
4. Clear acceptance criteria to verify cost reduction without reduced completion quality

---

## Problem

Current tool usage is effective but inconsistent in output volume. Most token/cost waste comes from large command output and broad file reads that are unnecessary for successful runs.

Observed characteristics:

- High volume tools: `read` and `bash`
- High-risk output patterns: dev server logs, full test output, verbose build output, broad docs dumps
- No global policy linking output verbosity to task state (success vs failure)

Result:

- Cost predictability is low
- Context windows can fill with low-signal output
- Agents spend tokens processing logs that do not affect decisions

---

## Goals

- Reduce token consumption for routine success-path work
- Preserve or improve task success rate and failure diagnosis quality
- Make output behavior deterministic by task type and failure signals
- Keep policy simple enough to apply without extra reasoning overhead

## Non-Goals

- Replacing tool infrastructure
- Disabling all logs globally
- Eliminating debug output when explicitly requested

---

## User Stories

### Story 1: Define shared verbosity modes

As a user, I want explicit logging modes so I can balance cost and diagnostics.

#### Modes

- **lean**
  - One-line status for routine operations
  - No log streaming
  - Minimal file read windows
- **balanced** (default)
  - Concise success output
  - Short failure reason and key evidence
  - Expand only when needed
- **debug**
  - Full or near-full logs/read windows
  - Deep diagnostics

#### Acceptance Criteria

- [ ] Mode definitions documented in toolkit guidance
- [ ] Each mode has explicit output limits and escalation behavior
- [ ] Default mode is `balanced`

---

### Story 2: Add dynamic routing without overthinking

As a user, I want agents to choose output detail automatically by task/failure state, not by expensive meta-reasoning.

#### Routing Rules

1. Apply static defaults by operation type:
   - Dev-server startup: `lean`
   - Standard build/test on first run: `balanced`
   - Investigations and explicit "debug" requests: `debug`
2. Escalate when failure signals occur:
   - non-zero exit
   - timeout
   - repeated failure (same command fails twice)
3. On escalation, include only bounded evidence unless in `debug` mode.

#### Acceptance Criteria

- [ ] Agent prompts encode deterministic routing rules
- [ ] No step requires a separate "analyze logging strategy" loop
- [ ] Escalation triggers are explicit and testable

---

### Story 3: Standardize primary-agent behavior

As a user, I want consistent output policy across primary agents so behavior is predictable.

#### Scope

- `builder`
- `planner`
- `toolkit`

#### Requirements

- Shared policy section in each primary agent prompt
- Consistent status vocabulary for runtime operations:
  - `running`
  - `startup failed`
  - `timed out`
- Failure output includes concise reason and where to find full logs if collected

#### Acceptance Criteria

- [ ] All primary agents contain aligned verbosity policy language
- [ ] No conflicting status wording across primary prompts

---

### Story 4: Extend policy to high-impact subagents

As a user, I want cost-heavy subagents to follow the same output principles.

#### Initial subagent set

- `developer`
- `tester`
- `playwright-dev`
- `go-tester`
- `jest-tester`
- `react-tester`

#### Requirements

- Use concise result summaries by default
- For failures, emit short diagnostic excerpts and next-action hint
- Avoid dumping full command output unless mode is `debug`

#### Acceptance Criteria

- [ ] Target subagents updated with policy references
- [ ] Validators pass after prompt changes

---

### Story 5: Add operator controls and observability

As a user, I want to control mode and verify whether it is saving tokens.

#### Controls

- Session-level mode override via user instruction:
  - "use lean mode"
  - "switch to debug mode"
- Optional agent-level default in configuration (future extension)

#### Observability

- Track before/after with `opencode stats`
- Compare:
  - avg tokens/session
  - median tokens/session
  - total input tokens over comparable periods

#### Acceptance Criteria

- [ ] Prompts define override phrases and precedence
- [ ] README/docs include measurement procedure

---

## Proposed Implementation Plan

1. Add a reusable verbosity policy block to toolkit docs/skills.
2. Update primary agent prompts to consume policy.
3. Update high-impact subagents.
4. Add examples for common workflows:
   - dev server startup
   - test run success
   - test failure escalation
5. Validate with governance scripts.
6. Compare token metrics after a 3-7 day window.

---

## Implementation Tickets

Use this checklist as the execution backlog.

### Phase 1: Policy and Contracts

- [ ] `V-001` Define canonical verbosity policy block in toolkit docs (lean/balanced/debug definitions, escalation triggers, bounded failure evidence)
- [ ] `V-002` Add policy testability language (trigger, verification, failure behavior) for all hard rules introduced by this PRD
- [ ] `V-003` Document standard runtime status vocabulary: `running`, `startup failed`, `timed out`

### Phase 2: Primary Agent Rollout

- [ ] `V-010` Update `agents/builder.md` with deterministic mode routing by task type and escalation triggers
- [ ] `V-011` Update `agents/planner.md` with lean-by-default policy for planning-time commands/reads
- [ ] `V-012` Update `agents/toolkit.md` with balanced default and debug escalation rules for maintenance workflows
- [ ] `V-013` Add explicit mode override phrases and precedence rules to all primary agents

### Phase 3: Subagent Rollout (High Impact)

- [ ] `V-020` Update `agents/developer.md` for concise success outputs and bounded failure excerpts
- [ ] `V-021` Update `agents/tester.md` for bounded test output by default plus failure escalation behavior
- [ ] `V-022` Update `agents/playwright-dev.md` for lean startup checks and escalation rules
- [ ] `V-023` Update `agents/go-tester.md`, `agents/jest-tester.md`, and `agents/react-tester.md` with consistent verbosity behavior

### Phase 4: Documentation and Examples

- [ ] `V-030` Add README section describing verbosity modes, defaults, overrides, and escalation behavior
- [ ] `V-031` Add concrete examples (dev server startup, test success, test failure escalation)
- [ ] `V-032` Add operator runbook for comparing baseline vs post-change token usage (`opencode stats` procedure)

### Phase 5: Validation and Measurement

- [ ] `V-040` Run governance validators and fix violations (`toolkit-postchange`, `handoff-contracts`, `project-updates`, `policy-testability`)
- [ ] `V-041` Establish baseline token metrics (7-day window) before rollout
- [ ] `V-042` Capture post-rollout metrics after 3-7 days and compare against baseline
- [ ] `V-043` Record decision: keep `balanced` default or tune thresholds based on findings

### Definition of Done

- [ ] All Phase 1-5 tickets completed
- [ ] No contradictory verbosity rules remain across primary and selected subagents
- [ ] Success metrics section has measured values, not placeholders
- [ ] PRD status updated from `draft` to `ready`

---

## Tradeoffs

### Benefits

- Lower token spend for routine tasks
- Cleaner context with higher signal-to-noise
- Faster agent turns due to less output processing

### Risks

- Under-reporting may hide root cause on first failure
- Overly strict truncation can require extra retries

### Mitigations

- Automatic escalation on failure/timeouts
- Explicit `debug` override always available
- Keep concise but sufficient failure evidence in `balanced`

---

## Success Metrics

Primary:

- 20%+ reduction in average input tokens/session over baseline window
- No increase in user-reported "insufficient diagnostics" incidents

Secondary:

- Reduced median turn latency for tool-heavy tasks
- Fewer long-output tool responses in successful runs

---

## Open Questions

1. Should mode defaults be set globally in `opencode.json`, agent prompts, or both?
2. Should mode state persist across sessions by default?
3. Do we want per-tool hard caps (e.g., max lines for `bash` output in `lean`)?

---

## Out of Scope Follow-ups

- Adaptive token budgets per repository/project size
- Automatic anomaly detection for unusually verbose runs
- UI indicators showing current verbosity mode in real time
