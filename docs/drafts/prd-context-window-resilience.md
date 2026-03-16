---
id: prd-context-window-resilience
title: Context Window Resilience
status: draft
priority: high
createdAt: 2026-03-13T00:00:00Z
---

# PRD: Context Window Resilience

## Introduction

Builder sessions hit context compaction too frequently, degrading session quality and losing behavioral guardrails. While the existing `prd-token-optimization` (status: ready) addresses the **supply side** — shrinking agent files, splitting skills, and archiving PRDs — this PRD addresses the **demand side**: reducing how much context Builder consumes during normal operation, and making the whole system more resilient when compaction does occur.

The two PRDs are complementary:
- `prd-token-optimization` → make the system prompt smaller (shrink the fixed cost)
- `prd-context-window-resilience` → make Builder's runtime behavior leaner (shrink the variable cost)

## Problem Statement

### Current Context Budget (Typical Ad-Hoc Session)

| Phase | Tokens | % of 200K |
|-------|--------|-----------|
| Builder system prompt | ~21K | 10.5% |
| OpenCode overhead (tools, etc.) | ~5K | 2.5% |
| Startup reads (projects.json, project.json, session discovery) | ~2K | 1% |
| Skill load: adhoc-workflow | ~25K | 12.5% |
| **Fixed cost before any work** | **~53K** | **26.5%** |
| Analysis phase (file reads, grep results) | ~5-15K | 2.5-7.5% |
| Subagent delegation prompts + responses (per round) | ~3-8K | 1.5-4% |
| Test-flow skill (when loaded) | ~9K | 4.5% |
| **Typical working session** | **~80-110K** | **40-55%** |
| **Remaining for continued work** | **~90-120K** | **45-60%** |

For sessions that need multiple delegation rounds, each round accumulates ~3-8K tokens of subagent responses that stay in Builder's context forever. After 5-10 delegation rounds (common in multi-story PRD sessions), that's 30-80K tokens of historical responses the model will never reference again.

### Observed Failure Modes

1. **Compaction during implementation** — Builder loses awareness of behavioral guardrails (identity checks, scope restrictions, analysis gates) after compaction summarizes them away
2. **Compaction during testing** — Test-flow is loaded, then compaction hits, and Builder loses the testing protocol mid-verification
3. **Exploration bloat** — Builder reads files to *investigate* how things work during analysis, all staying in context even after the investigation is complete and implementation is delegated
4. **Response accumulation** — Each subagent response (developer, tester, critic) adds to Builder's context permanently with no mechanism to shed completed results

### What prd-token-optimization Does NOT Address

| Gap | Why |
|-----|-----|
| adhoc-workflow is 100KB / ~25K tokens | Existing PRD focuses on test-flow split and builder.md extraction, not adhoc-workflow |
| Subagent responses accumulate unboundedly | No response size constraints exist anywhere |
| No "delegate exploration" pattern | Builder reads files directly during analysis instead of spawning explore subagents for investigation |
| No proactive context checkpoint at 50% | Only 75% and 90% thresholds exist (often too late) |
| adhoc-workflow Phase 0 (analysis) loaded alongside Phase 1-2 (execution/shipping) | Monolithic skill, no phase-based loading |

## Goals

1. **Split adhoc-workflow** into phase-based sub-skills so Builder loads only what it needs for the current phase
2. **Add exploration delegation pattern** — Builder delegates *investigation* to explore subagents the same way it delegates *implementation* to @developer, keeping file contents out of its own context
3. **Constrain subagent response sizes** — subagents return structured summaries, not full working logs
4. **Add 50% context checkpoint** — proactive warning and state save well before compaction risk
5. **Reduce average tokens-to-first-delegation** from ~63K to ~35K

## Non-Goals

- Changing the model's context window size (fixed by provider)
- Modifying OpenCode's compaction algorithm (platform-level change)
- Duplicating work from `prd-token-optimization` (the two PRDs are complementary)
- Optimizing Planner or Toolkit agents (their sessions are shorter and less prone to compaction)
- Changing the skill loading mechanism in OpenCode (use existing skill tool)

## Relationship to prd-token-optimization

These PRDs should be implemented in any order. They have zero story overlap:

| Concern | prd-token-optimization | This PRD |
|---------|----------------------|----------|
| test-flow split | US-001 ✓ | — |
| Builder inline doc extraction | US-003 ✓ | — |
| PRD archive system | US-004 ✓ | — |
| Builder skill loading protocol | US-002 ✓ | — |
| adhoc-workflow split | — | US-001 ✓ |
| Exploration delegation | — | US-002 ✓ |
| Subagent response constraints | — | US-003 ✓ |
| Earlier context checkpoint | — | US-004 ✓ |

Combined impact estimate: system prompt + first skill load drops from ~53K to ~30K tokens, and runtime growth rate drops by ~40% per delegation round.

## User Stories

### US-001: Split adhoc-workflow into Phase-Based Sub-Skills

**Description:** As a Builder session, I want adhoc-workflow loaded in phases so that I only carry the instructions relevant to my current phase, not the entire 25K-token skill.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] adhoc-workflow split into 3 phase-based skills plus a slim router
- [ ] `adhoc-workflow` remains as slim orchestrator (~3KB) for backward compatibility
- [ ] Each phase skill is independently loadable
- [ ] No functionality lost — all current adhoc-workflow features preserved
- [ ] Builder loads only the current phase's skill at any time
- [ ] Phase transition sheds previous phase's skill from working context (via chunk transition)

**Proposed Split:**

| New Skill | Contents | Est. Lines | Est. Size |
|-----------|----------|------------|-----------|
| `adhoc-workflow` (router) | Overview, phase routing, context loading, user summary detection | ~150 | ~6KB |
| `adhoc-analysis` | Phase 0: Analysis, Task Spec generation, dashboards, clarifying questions, PRD recommendation, flow charts, task type classification, Playwright analysis, implementation decision detection | ~850 | ~35KB |
| `adhoc-execution` | Phase 1: Task execution, per-task quality checks, story completion prompts, mid-PRD injection, scope growth warning, multi-task chunking | ~350 | ~14KB |
| `adhoc-shipping` | Phase 2: Ship, git auto-commit, completion summary, archival, abandonment, promotion, toolkit update requests, configuration | ~450 | ~18KB |

**Loading Strategy:**

| Phase | Skills Loaded | Total |
|-------|---------------|-------|
| Entering ad-hoc mode | `adhoc-workflow` (router) | ~6KB (~1.5K tokens) |
| Analysis begins | + `adhoc-analysis` | ~41KB (~10K tokens) |
| First task starts | shed analysis, + `adhoc-execution` | ~20KB (~5K tokens) |
| All tasks done, shipping | shed execution, + `adhoc-shipping` | ~24KB (~6K tokens) |

**Typical session improvement:** Instead of loading 100KB (~25K tokens) on ad-hoc entry, Builder loads ~6KB immediately and ~35KB during analysis — shedding the analysis skill before execution begins. Peak load drops from 25K tokens to ~11.5K tokens.

### US-002: Add Exploration Delegation Pattern to Builder

**Description:** As Builder during the analysis phase, I want to delegate *investigation* to an explore subagent — the same way I delegate *implementation* to @developer — so that raw file contents from research don't bloat my own context window.

**Documentation:** No

**Tools:** No

**Design Rationale:** The delegation trigger is *purpose-based*, not file-count-based. Builder already delegates implementation by role (@developer), testing by role (@tester), and review by role (@critic). Investigation should follow the same pattern — delegate by purpose ("I need to understand how X works") rather than by an arbitrary file threshold. This is more reliable than a number heuristic because the model understands intent better than it counts files.

**Acceptance Criteria:**

- [ ] Builder has an explicit rule: "When the task requires understanding unfamiliar code, delegate investigation to an explore subagent"
- [ ] The explore subagent returns a structured summary (~500 tokens max), not raw file contents
- [ ] Rule is added to Builder's Token Budget Management section
- [ ] Rule applies during analysis phase (Phase 0) and mid-implementation investigation
- [ ] Builder reads files directly when it already knows what to change (targeted reads, not investigation)
- [ ] Rule documented with clear examples of investigation vs. targeted reads

**Decision Tree:**

```
Do I need to UNDERSTAND how something works before I can plan?
    │
    ├─── YES (investigation) ──► Delegate to explore subagent
    │    Examples:
    │    - "How does auth work in this project?"
    │    - "What components are involved in the checkout flow?"
    │    - "Where is state managed for the dashboard?"
    │    - "What patterns does this codebase use for error handling?"
    │
    └─── NO (targeted action) ──► Read files directly
         Examples:
         - "Read the component I'm about to modify"
         - "Check the test file I need to update"
         - "Look at the config file the user mentioned"
         - "Read the schema for a migration I'm writing"
```

**Explore Subagent Response Format:**

```yaml
exploration:
  question: "How does authentication work in this project?"
  summary: |
    Auth uses NextAuth.js with credentials provider. Session stored in JWT.
    Login form at src/app/login/page.tsx, auth config at src/lib/auth.ts.
    Protected routes use middleware at src/middleware.ts.
  keyFiles:
    - src/lib/auth.ts (auth configuration, 85 lines)
    - src/middleware.ts (route protection, 42 lines)
    - src/app/login/page.tsx (login UI, 120 lines)
  patterns:
    - Server-side session validation via getServerSession()
    - Client-side auth state via useSession() hook
```

### US-003: Add Subagent Response Size Constraints

**Description:** As Builder, I want subagents to return concise structured summaries so that delegation round-trips don't bloat my context window.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Developer agent returns a structured completion summary (< 300 tokens) rather than echoing all changes
- [ ] Tester agent returns a structured test result summary (< 200 tokens) rather than full test output
- [ ] Critic agent returns a structured review summary (< 400 tokens) rather than full file reviews
- [ ] Response format documented in each agent's instructions
- [ ] Builder can request "verbose mode" when debugging (override default concise mode)

**Developer Response Format (default):**

```
STATUS: success | partial | failed
FILES_CHANGED: 3 (src/lib/auth.ts, src/app/login/page.tsx, src/middleware.ts)
SUMMARY: Implemented JWT session validation with NextAuth credentials provider.
         Added route protection middleware for /dashboard/* paths.
TESTS: 2 unit tests added (auth.test.ts), all passing
ISSUES: none
```

**Tester Response Format (default):**

```
STATUS: pass | fail | partial
RESULTS: 12 passed, 0 failed, 0 skipped
DURATION: 4.2s
FAILURES: none
COVERAGE: auth module 85% (+12%)
```

**Estimated savings:** ~2-5K tokens per delegation round × 5-10 rounds = 10-50K tokens saved per session.

### US-004: Add 50% Context Checkpoint to Session Log

**Description:** As a Builder session approaching context limits, I want an earlier warning at 50% usage so I can proactively save state and consider session strategies before compaction becomes imminent.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] New 50% context usage threshold added to session-log Context Overflow Handling section
- [ ] At 50%, Builder writes a checkpoint and logs a brief informational message
- [ ] Message includes: tokens used (approx), chunks completed, chunks remaining
- [ ] No user interruption at 50% — informational only (unlike 90% which stops)
- [ ] Existing 75% (warning) and 90% (stop) thresholds unchanged
- [ ] If exploration delegation rule (US-002) is in effect, 50% checkpoint reminds Builder to prefer delegation over direct reads for remaining work

**50% Checkpoint Behavior:**

```
ℹ️ Context at ~50%. Session state current.
   Completed: 2/5 chunks | Remaining: 3 chunks
   Strategy: Preferring explore delegation for remaining investigation.
```

### US-005: Update Builder Token Budget with Runtime Context Rules

**Description:** As Builder's Token Budget Management section, I want runtime context rules that complement the existing file-read rules so that Builder actively manages context growth during operation, not just during reads.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Token Budget Management section expanded with "Runtime Context Rules" subsection
- [ ] Rules cover: exploration delegation pattern, subagent response expectations, context checkpoints
- [ ] Rules reference the new skills/formats from US-001 through US-004
- [ ] New decision tree: "Am I investigating or acting? Investigate → delegate, Act → read directly"
- [ ] New table: expected response sizes per subagent type
- [ ] Existing file-read rules (jq for JSON, offset/limit, etc.) unchanged

**New Runtime Context Rules Table:**

| Situation | Rule | Savings |
|-----------|------|---------|
| Investigating unfamiliar code | Delegate to explore subagent (purpose-based, not file-count) | ~5-15K tokens |
| Receiving subagent response | Expect concise format (<300 tokens) | ~2-5K per round |
| Phase transition (analysis → execution) | Shed previous phase context via chunk transition | ~10-25K tokens |
| Reaching 50% context | Write checkpoint, prefer delegation | Proactive protection |

## Functional Requirements

- FR-1: adhoc-workflow must be split into router + 3 phase skills while preserving all current functionality
- FR-2: The adhoc-workflow router must be loadable independently and route to phase skills on demand
- FR-3: Builder must delegate investigation (understanding unfamiliar code) to an explore subagent during analysis
- FR-4: Explore subagent must return a structured summary under 500 tokens
- FR-5: Developer, tester, and critic agents must return concise structured responses by default
- FR-6: Builder must be able to request verbose subagent responses when needed (debugging)
- FR-7: Session-log must include a 50% context checkpoint that writes state and logs informational message
- FR-8: Builder's Token Budget Management must document runtime context rules alongside existing file-read rules
- FR-9: Phase transitions must shed previous phase's context (aligned with existing lean execution chunk transitions)

## Technical Considerations

### adhoc-workflow Split Complexity

The adhoc-workflow skill has significant cross-references between phases:
- Phase 0 generates the Task Spec that Phase 1 executes
- Phase 1's completion triggers Phase 2's shipping flow
- Configuration section is referenced across all phases

**Approach:** Shared state lives in session files on disk (already the pattern). Each phase skill reads session state independently. Configuration section stays in the router (small, always loaded).

### Subagent Response Format Enforcement

Subagent response size constraints are behavioral instructions — the model may not always comply perfectly. To mitigate:
- Include explicit response format examples in each agent
- Add "RESPONSE CONSTRAINT" callout boxes (similar to existing CRITICAL callouts)
- Builder can detect verbose responses and note it for future rounds

### Context Usage Estimation

Builder cannot directly query its own context usage. The 50%/75%/90% thresholds are approximate, based on:
- Token count of system prompt (known)
- Token count of loaded skills (known)
- Estimated token count of conversation turns (heuristic: ~4 chars per token)

This is the same approach as existing 75%/90% thresholds — no new mechanism needed.

### Backward Compatibility

- `adhoc-workflow` skill name is preserved (slim router) — existing references work
- Subagent response constraints are additive — no existing behavior broken
- 50% checkpoint is informational only — no workflow change
- Exploration delegation is a new rule, not a change to existing rules

## Out of Scope

- Splitting prd-workflow (currently 36KB — significant but less urgent than adhoc-workflow's 100KB)
- Optimizing model context window size (provider-controlled)
- Modifying OpenCode's compaction algorithm
- Implementing explicit context tracking (counting exact tokens per turn) — use heuristics
- Changes to Planner or Toolkit agents (shorter sessions, less compaction-prone)

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Tokens at ad-hoc mode entry (router only) | ~25K (full skill) | ~1.5K (router) |
| Peak tokens during analysis phase | ~35K (router + analysis) | ~11.5K (router + analysis skill) |
| Tokens per delegation round (subagent response) | ~3-8K | ~0.5-1K |
| Context checkpoint thresholds | 75%, 90% | 50%, 75%, 90% |
| Exploration delegation | none (always direct read) | Purpose-based: investigate → delegate, act → read directly |

## Risks

| Risk | Mitigation |
|------|------------|
| adhoc-workflow split introduces subtle bugs in phase transitions | Test each phase independently; session state on disk is already the recovery mechanism |
| Subagent response constraints reduce useful information | "Verbose mode" override allows Builder to request full output when debugging |
| 50% checkpoint is inaccurate (token counting is heuristic) | Conservative estimate — trigger slightly early rather than late |
| Explore delegation adds latency (subagent spawn vs. direct read) | Only applies for investigation, not targeted reads; net time savings from smaller context |
| Phase skill shedding is implicit (depends on chunk transition) | Document clearly that phase transition = chunk transition = context shed |

## Open Questions

1. Should prd-workflow also be split into phases? It's 36KB (~9K tokens) — significant but not as extreme as adhoc-workflow's 100KB. Could be a follow-up PRD.
2. Should subagent response constraints be enforced at the Builder level (truncating verbose responses) or purely behavioral (trusting the subagent to comply)?
3. For the exploration delegation pattern, should Builder pass investigation questions to the existing `explore` agent type, or should we create a dedicated `investigation` subagent with the structured response format baked in?

## Credential & Service Access Plan

No external credentials required for this PRD. All changes are internal toolkit modifications.

## Timeline Estimate

| Story | Estimate |
|-------|----------|
| US-001 (adhoc-workflow split) | 3-4 hours |
| US-002 (exploration delegation rule) | 1-2 hours |
| US-003 (subagent response constraints) | 2-3 hours |
| US-004 (50% context checkpoint) | 1 hour |
| US-005 (runtime context rules in builder) | 1 hour |
| **Total** | **8-11 hours** |
