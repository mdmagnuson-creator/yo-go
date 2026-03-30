# PRD: Eliminate Ad-Hoc Ceremony — Strengthen Core Builder

## Introduction

Builder currently maintains two parallel execution pipelines: **PRD mode** (structured stories from Planner) and **ad-hoc mode** (a 2,171-line skill that recreates PRD-like artifacts on the fly). The ad-hoc pipeline was built to solve four real problems — sprinting without understanding, wrong assumptions, unclear delegation specs, and skipped verification — but it solved them by creating a parallel process instead of strengthening Builder's core behaviors.

The result is excessive ceremony for simple tasks, a massive skill that duplicates logic already present in Builder's core pipeline, and a system where "fix the typo in the header" goes through the same 9-step analysis flow as "redesign the checkout wizard."

This PRD eliminates the ad-hoc process as a separate workflow and folds its valuable behaviors into Builder's core delegation protocol, making Builder better at *all* work — PRD and ad-hoc alike.

## Goals

- Eliminate the ad-hoc/PRD mode split — Builder has one way of working, not two
- Reduce ceremony for simple tasks while preserving guardrails for complex ones
- Shrink `adhoc-workflow` from 2,171 lines to ~200 or eliminate it entirely
- Move verification to where it belongs (post-implementation, via test-flow) instead of duplicating it pre-implementation
- Delete Task Specs as a concept — if work needs formal stories, it should be a PRD
- Preserve the valuable behaviors: understanding before delegation, asking when ambiguous, clear delegation specs, mandatory verification

## Problem Analysis

### The Four Original Problems and Where They Belong

| # | Problem | Current Solution (ad-hoc process) | Proposed Solution (core Builder behavior) |
|---|---------|-----------------------------------|------------------------------------------|
| 1 | Builder sprints without understanding | Full analysis phase + dashboard + `[G]` gate | **Delegation spec requirement**: Before any @developer delegation, Builder states what it understands and what it plans to change. Lightweight confirmation. |
| 2 | Wrong assumptions on ambiguous requests | Implementation decision detection + clarifying questions state machine | **Ambiguity detection**: If Builder identifies genuine ambiguity, ask the user. This is judgment, not a state machine. |
| 3 | Delegating without a clear spec | Task Specs with TSK-### stories | **Delegation prompt quality**: Every @developer delegation includes what to change, which files, expected behavior. A good prompt, not a formal document. |
| 4 | Skipping verification | Mandatory Playwright probe before AND after implementation | **test-flow is already mandatory after every commit.** Pre-implementation probing moves to post-implementation verification where it actually catches real bugs, not hypothetical ones. |

### What the Current Process Costs

- **Token budget**: `adhoc-workflow` is 61KB (~15K tokens) loaded into Builder's context for every ad-hoc task
- **Latency**: 9 steps before any implementation begins (session init → screenshot → analysis → classification → probe → decisions → validation → dashboard → wait for [G])
- **Cognitive overhead**: Builder spends more time on ceremony than on the actual work for simple tasks
- **Duplication**: The story processing pipeline (Steps 1-6) is identical between PRD and ad-hoc modes — only the *entry* differs
- **Shadow PRDs**: Task Specs duplicate Planner's domain with a parallel folder structure, registry, and lifecycle

### What's Actually Valuable in the Current Process

Not everything should be thrown away. These behaviors are genuinely useful:

1. **Confirmation before implementation** — Builder should always confirm what it's about to do. But a sentence, not a dashboard.
2. **Ambiguity detection** — Asking clarifying questions when confidence is low. But as judgment, not a state machine with probe loops.
3. **Scope assessment** — Knowing whether something is a 1-file fix or a 15-file refactor. But to scale ceremony, not to generate a formal document.
4. **PRD promotion** — Recognizing when an ad-hoc request is actually too complex and should become a PRD. This stays.
5. **Post-implementation verification** — test-flow, Playwright, critics. All of this stays — it's already in Builder's core pipeline.

## User Stories

### US-001: Replace Analysis Gate with Delegation Confirmation

**Description:** As Builder, before delegating to @developer, I confirm my understanding with the user in a way proportional to the task complexity, instead of running a multi-step analysis ceremony.

**Acceptance Criteria:**

- [ ] Remove the `ANALYSIS GATE` guardrail block from builder.md (lines 60-104)
- [ ] Remove the `State Checkpoint Enforcement` section (lines 106-127)
- [ ] Remove the `Clarifying Questions Enforcement` section (lines 129-150)
- [ ] Replace with a **Delegation Confirmation** protocol:
  - Before any @developer delegation, Builder shows a brief confirmation:
    - **Simple tasks** (1-3 files, clear intent): One-line summary + file list. E.g., `"I'll fix the typo in src/components/Header.tsx. Go ahead? [G/E]"`
    - **Medium tasks** (4-10 files, some complexity): Short paragraph with approach + file list + `[G/E/P]`
    - **Complex tasks** (10+ files, breaking changes, ambiguity): Multi-section summary similar to current dashboard but without probe ceremony + `[G/E/P]`
  - `[G]` Go ahead, `[E]` Edit/clarify, `[P]` Promote to PRD
- [ ] Confirmation is always required — Builder never delegates without user acknowledgment
- [ ] Scope assessment (simple/medium/complex) is done via quick file search (grep/glob), not a formal analysis phase
- [ ] Remove `analysisCompleted` and `probeStatus` checkpoints from session.json
- [ ] Validators pass

### US-002: Fold Ambiguity Detection into Builder Judgment

**Description:** As Builder, when I encounter genuine ambiguity in a request, I ask clarifying questions as a natural part of conversation rather than a formal state machine.

**Acceptance Criteria:**

- [ ] Remove the confidence-level state machine (HIGH/MEDIUM/LOW → different menu options)
- [ ] Add guidance to Builder's delegation confirmation: "If the request is ambiguous or could be interpreted multiple ways, ask clarifying questions before showing the confirmation. Use lettered options for speed."
- [ ] No formal confidence scoring — Builder uses judgment about whether it understands the request well enough
- [ ] Clarifying questions are asked inline, not in a separate ceremony step
- [ ] The `[Q]` and `[J]` menu options are removed — questions are just asked naturally
- [ ] Validators pass

### US-003: Eliminate Task Specs and Shadow PRD Infrastructure

**Description:** As a toolkit maintainer, I remove the Task Spec concept and its parallel folder structure, replacing it with inline story generation in Builder's delegation flow.

**Acceptance Criteria:**

- [ ] Remove Task Spec file generation (docs/tasks/drafts/, docs/tasks/, docs/tasks/completed/, docs/tasks/abandoned/)
- [ ] Remove task-registry.json references and management
- [ ] Remove TSK-### story prefix system
- [ ] For multi-step ad-hoc work, Builder generates stories inline (in session.json chunks) without writing formal spec files
- [ ] For single-step ad-hoc work (the common case), Builder delegates directly with no story overhead
- [ ] PRD promotion (`[P]`) remains available — when work is complex enough to need formal stories, it becomes a real PRD
- [ ] Validators pass

### US-004: Move Pre-Implementation Probing to Post-Implementation Verification

**Description:** As Builder, I verify implementation results after @developer completes work (via test-flow), instead of running a Playwright probe ceremony before implementation begins.

**Acceptance Criteria:**

- [ ] Remove the mandatory pre-implementation Playwright probe (Step 0.1b in adhoc-workflow)
- [ ] Remove the Playwright validation step (Step 0.1d in adhoc-workflow)
- [ ] Remove the probe re-probe loop (contradiction handling, max 2 retries)
- [ ] Remove the Auth Resolution Escalation protocol from the pre-implementation flow (auth resolution remains available for test-flow's post-implementation Playwright verification)
- [ ] Remove the `probeStatus` state field and its gate logic
- [ ] test-flow (already mandatory after every commit) remains the verification mechanism — it already runs Playwright, critics, typecheck, lint, and tests
- [ ] The pre-analysis screenshot (Step 0.0a) is preserved as an optional diagnostic — Builder *may* take a screenshot to understand current state, but it's not a mandatory gate
- [ ] Remove the NO-BYPASS RULE and its 15+ rationalization table entries
- [ ] Validators pass

### US-005: Shrink or Eliminate adhoc-workflow Skill

**Description:** As a toolkit maintainer, I reduce the adhoc-workflow skill from 2,171 lines to the minimal content that isn't already covered by Builder's core pipeline, or eliminate it entirely.

**Acceptance Criteria:**

- [ ] Audit remaining content after US-001 through US-004 are applied
- [ ] Content that belongs in Builder's core pipeline moves to builder.md
- [ ] Content that duplicates the story processing pipeline is deleted (not moved)
- [ ] If the remaining content is <100 lines, fold it into builder.md and delete the skill
- [ ] If the remaining content is 100-300 lines, keep as a slimmed skill focused only on ad-hoc-specific differences (multi-task grouping, PRD promotion logic)
- [ ] Update builder.md skill loading table to reflect changes
- [ ] Token budget savings documented (before/after line counts and estimated token savings)
- [ ] Validators pass

### US-006: Unify PRD and Ad-Hoc Entry Points

**Description:** As Builder, I have one way of working regardless of whether the work came from a PRD or a direct user request, eliminating the mode split.

**Acceptance Criteria:**

- [ ] Remove the concept of "entering ad-hoc mode" as a distinct mode with its own initialization
- [ ] Builder's startup flow offers: work on a PRD, or handle a direct request — but both feed into the same pipeline
- [ ] The story processing pipeline (Steps 1-6) is unchanged — it already handles both
- [ ] For PRD work: stories come from the PRD file (no change)
- [ ] For direct requests: Builder generates chunks from the user's request inline, then feeds them into the same pipeline
- [ ] Session.json still tracks `mode: "prd"` vs `mode: "adhoc"` for logging/resume purposes, but the execution path is identical
- [ ] Remove workflow preference prompt ("stop after each todo or complete all?") — this is already handled by the pipeline's per-chunk confirmation
- [ ] Validators pass

### US-007: Preserve User Summary Detection

**Description:** As Builder, I retain awareness that user-provided summaries are helpful context but not verification evidence, as a core behavior rather than an ad-hoc-specific rule.

**Acceptance Criteria:**

- [ ] Move the User Summary Detection section from adhoc-workflow to builder.md's delegation protocol
- [ ] Trim to essential guidance (~15-20 lines, not the current ~50 lines)
- [ ] Core rule preserved: "User summaries accelerate analysis — they do NOT skip verification"
- [ ] CORS-specific warning preserved (curl/wget bypass CORS)
- [ ] Validators pass

## Functional Requirements

- FR-1: Builder MUST confirm its understanding with the user before any @developer delegation (replaces analysis gate)
- FR-2: Confirmation ceremony MUST scale to task complexity (one line for simple, paragraph for medium, multi-section for complex)
- FR-3: Builder MUST ask clarifying questions when it identifies genuine ambiguity (replaces confidence state machine)
- FR-4: Builder MUST offer PRD promotion when scope exceeds threshold (preserved from current system)
- FR-5: test-flow remains mandatory and unconditional after every commit (no change)
- FR-6: Builder MUST NOT delegate to @developer without user acknowledgment (the `[G]` concept survives in simplified form)
- FR-7: For multi-step ad-hoc work, Builder generates chunks in session.json without writing Task Spec files
- FR-8: Builder's story processing pipeline (Steps 1-6) is unchanged and handles all work identically

## Non-Goals

- Not changing how PRD mode works (Planner → stories → Builder pipeline is unchanged)
- Not removing test-flow or any post-implementation verification
- Not removing the story processing pipeline
- Not changing how Builder delegates to @developer (delegation prompt format stays the same)
- Not removing session logging or chunk tracking
- Not changing how @developer, @tester, or @critic work
- Not removing the pre-analysis screenshot capability — just making it optional rather than mandatory

## Design Considerations

### The Forced Pause Problem

The current `[G]` gate exists because Builder historically couldn't be trusted to assess "do I understand this well enough?" The analysis gate is essentially a circuit breaker.

The simplified confirmation still provides this circuit breaker — Builder still stops and shows what it plans to do, and the user still says go. The difference is that the *content* of the pause is proportional to the task, and the *process* to generate it is a quick assessment rather than a multi-step ceremony.

### Risk: Regression to "Sprint Without Understanding"

The main risk of this change is that without the heavy ceremony, Builder might regress to the behaviors the ceremony was designed to prevent. Mitigations:

1. **Confirmation is still mandatory** — Builder can't delegate without showing what it plans to do
2. **test-flow catches implementation errors** — even if Builder's understanding was wrong, verification catches it
3. **The delegation prompt quality requirement** means Builder must articulate its understanding in the delegation to @developer
4. **User still has `[E]` to edit/clarify** if the confirmation looks wrong

### Migration Path

This is a significant refactor of builder.md and adhoc-workflow. Suggested implementation order:

1. US-003 first (eliminate Task Specs) — removes the most infrastructure
2. US-004 next (move probing to post-implementation) — removes the most ceremony
3. US-001 (replace analysis gate) — the core behavior change
4. US-002 (fold ambiguity detection) — cleanup
5. US-005 (shrink/eliminate skill) — final consolidation
6. US-006 (unify entry points) — ties it all together
7. US-007 (preserve user summary detection) — final migration of valuable content

## Technical Considerations

- **builder.md** will gain ~50-100 lines of delegation confirmation protocol but lose references to the analysis gate, state checkpoints, and probe enforcement (~100 lines removed)
- **adhoc-workflow** will shrink from 2,171 lines to <300 or be eliminated
- **session.json schema** changes: remove `analysisCompleted`, `probeStatus`, `taskType` fields
- **Task Spec directories** and task-registry.json are deleted
- **test-ui-verification** skill's "analysis-probe mode" may be removed or simplified (the probe mode was primarily for pre-implementation analysis)
- Other skills that reference adhoc-workflow phases will need reference updates

## Success Metrics

- Builder's token budget for ad-hoc work drops by ~15K tokens (adhoc-workflow skill no longer loaded)
- Time from user request to first @developer delegation drops by 50%+ for simple tasks
- Zero regression in implementation quality (test-flow still catches everything)
- Builder's core pipeline handles both PRD and ad-hoc work identically

## Open Questions

1. **Should the pre-analysis screenshot be preserved at all?** It's useful for visual bugs but adds latency. Could be opt-in via project.json config.
2. **What's the right threshold for "simple vs medium vs complex"?** File count? Blast radius? Both? Should it be configurable per project?
3. **Should multi-task ad-hoc requests still show grouping?** The chunk grouping logic (related files, dependencies, logical domain) is useful but could be simplified.
4. **Does the Implementation Decision Detection (Step 0.1c) have standalone value?** The concept of surfacing design decisions before implementation is good — should it survive as part of the delegation confirmation for complex tasks?

## Credential & Service Access Plan

No external credentials required for this PRD.
