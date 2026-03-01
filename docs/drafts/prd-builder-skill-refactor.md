# PRD Draft: Builder Agent Skill-Based Refactor

**Status:** Draft  
**Priority:** High  
**Created:** 2026-03-01  
**Author:** @toolkit

## Problem Statement

Builder has grown to **2,246 lines / ~136KB** — more than **2x larger** than the next largest agent (tester at 958 lines). This creates several problems:

1. **Context window pressure** — Builder consumes significant tokens just loading its instructions
2. **Maintenance burden** — Changes risk breaking unrelated functionality
3. **Cognitive load** — Hard to understand the full agent at a glance
4. **Duplication risk** — Some sections duplicate logic that could be shared
5. **Testing difficulty** — Monolithic agents are harder to test in isolation

### Current Size Comparison

| Agent | Lines | Notes |
|-------|-------|-------|
| **builder.md** | 2,246 | Target of this refactor |
| tester.md | 958 | 2.3x smaller |
| toolkit.md | 957 | 2.3x smaller |
| planner.md | 926 | 2.4x smaller |
| e2e-playwright.md | 742 | 3x smaller |

## Goals

1. **Reduce builder.md to ~800-1000 lines** (55-65% reduction)
2. **Extract reusable behaviors into skills** that can be shared across agents
3. **Improve maintainability** by separating concerns
4. **Preserve all existing functionality** — no behavior changes
5. **Enable skill composition** — agents load only what they need

## Non-Goals

- Changing Builder's external behavior or API
- Modifying how users interact with Builder
- Creating new agents (this is about skill extraction, not agent splitting)
- Changing the delegation model

## Current Structure Analysis

Builder currently contains these major sections that are candidates for extraction:

### Sections Already Partially Extracted (Enhance)

| Section | Lines | Current Skill | Proposed Change |
|---------|-------|---------------|-----------------|
| Workflow modes | ~200 | `prd-workflow`, `adhoc-workflow` | Already extracted; remove duplication from builder.md |
| Session state | ~150 | `builder-state` | Absorb checkpoint management into existing skill |
| Dev server | ~80 | `start-dev-server` | Already extracted; verify no duplication |
| Visual debugging | ~60 | `browser-debugging` | Already extracted; verify no duplication |

### Sections to Extract (New Skills)

| Section | Lines | Proposed Skill | Shared By |
|---------|-------|----------------|-----------|
| Verification Contracts | ~120 | `verification-contracts` | builder, developer, overlord |
| Dynamic Reassignment | ~170 | `dynamic-reassignment` | builder, developer |
| Deferred E2E Flow | ~180 | `deferred-e2e` | builder (merge into `test-flow`) |
| Checkpoint Management | ~140 | (merge into `builder-state`) | builder |
| Loop Detection | ~80 | `self-correction` | builder, developer, overlord |
| Authentication Config | ~130 | `auth-config-check` | builder, qa-explorer |
| Team Sync / Push | ~60 | `git-team-sync` | builder (enhance existing `git-sync`) |
| Critic Batching | ~50 | `critic-dispatch` | builder, developer |
| Architecture Guardrails | ~40 | `architecture-guardrails` | builder |

### Sections to Keep in Builder (Core Identity)

| Section | Lines | Why Keep |
|---------|-------|----------|
| Startup / Dashboard | ~200 | Core UX, Builder-specific |
| Project Selection | ~100 | Builder-specific UX |
| Pending Updates | ~80 | Builder orchestration |
| Right-Panel Todo Contract | ~50 | Shared pattern but integrated |
| Session Lock (multi-session) | ~50 | Builder coordination |
| Planning Detection (redirect) | ~70 | Core routing |
| What You Never Do | ~80 | Builder-specific restrictions |

## Proposed Solution

### Phase 1: Deduplicate Existing Skills

Remove duplicated content from builder.md that's already in skills:

1. **prd-workflow** — Remove inline PRD story handling; reference skill
2. **adhoc-workflow** — Remove inline ad-hoc handling; reference skill
3. **builder-state** — Remove duplicate checkpoint docs; merge into skill
4. **start-dev-server** — Verify no duplication; remove if exists
5. **browser-debugging** — Verify no duplication; remove if exists

**Estimated reduction:** ~150-200 lines

### Phase 2: Extract New Skills

Create new skills for reusable patterns:

#### 2.1 `verification-contracts` skill

Extract verification contract generation and checking:
- Contract Generation Algorithm
- Contract Types
- Store Contract in State
- Verification on Completion
- Advisory Task Handling

**Consumers:** builder, developer, overlord

#### 2.2 `dynamic-reassignment` skill

Extract reassignment logic:
- Fallback Chain Lookup
- Failure Detection
- Rate Limit Handling
- Alternative Selection
- Reassignment State
- Context Overflow Handling
- Escalation Protocol

**Consumers:** builder, developer

#### 2.3 `self-correction` skill

Extract loop detection and bulk fix:
- Detection Triggers
- Self-Check Protocol
- Bulk Fix Protocol
- Reporting Template

**Consumers:** builder, developer, overlord

#### 2.4 `auth-config-check` skill

Extract authentication configuration checking:
- When to Check
- Check Flow
- Detection Patterns
- Sub-Agent Delegation with Auth

**Consumers:** builder, qa-explorer, e2e-playwright

#### 2.5 Enhance `test-flow` skill

Merge deferred E2E flow into existing test-flow skill:
- Check for Local Runtime
- Identify the Source
- Determine Where to Run
- Confirm and Run
- Execute Tests
- Update PRD Status

**Consumers:** builder, tester

#### 2.6 `critic-dispatch` skill

Extract critic batching configuration:
- Configuration Cascade
- Critic Modes
- Balanced Mode Logic
- Implementation

**Consumers:** builder, developer

**Estimated reduction:** ~700-800 lines

### Phase 3: Streamline Core Builder

After extraction, builder.md should contain:
- Frontmatter and identity
- Skills Reference (updated list)
- Startup flow and dashboards
- Project selection and session scope
- Pending updates handling
- Right-panel todo contract
- Sub-agent delegation patterns
- Session lock format
- What You Never Do
- Requesting toolkit updates

**Target:** 800-1000 lines

## Skill Loading Pattern

Builder already uses conditional skill loading. The pattern should be:

```markdown
## Skills Reference

Builder workflows are defined in loadable skills. Load the appropriate skill based on context:

| Trigger | Skill to Load |
|---------|---------------|
| PRD mode selected | `prd-workflow` |
| Ad-hoc mode selected | `adhoc-workflow` |
| Delegating to specialist | `verification-contracts` |
| Specialist fails or rate-limited | `dynamic-reassignment` |
| 3+ similar fixes detected | `self-correction` |
| Running deferred E2E tests | `test-flow` |
| Auth-related task detected | `auth-config-check` |
| Visual issue or screenshot needed | `browser-debugging` |
| Dev server required | `start-dev-server` |
| Dispatching critics | `critic-dispatch` |
```

## Migration Strategy

### Step 1: Create Skills (Non-Breaking)

Create all new skills without modifying builder.md:
- `skills/verification-contracts/SKILL.md`
- `skills/dynamic-reassignment/SKILL.md`
- `skills/self-correction/SKILL.md`
- `skills/auth-config-check/SKILL.md`
- `skills/critic-dispatch/SKILL.md`

Update existing skills:
- `skills/builder-state/SKILL.md` — add checkpoint content
- `skills/test-flow/SKILL.md` — add deferred E2E content

### Step 2: Update Builder to Reference Skills

Replace inline sections with skill references:
```markdown
## Verification Contracts

> Load `skills/verification-contracts/SKILL.md` for contract generation and verification.

Use verification contracts when delegating complex tasks to specialists.
```

### Step 3: Validate Behavior

- Run existing E2E tests
- Manual testing of key workflows
- Verify skill loading works correctly

### Step 4: Clean Up

- Remove fully-extracted content from builder.md
- Update toolkit-structure.json
- Update website documentation

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| builder.md line count | 2,246 | 800-1000 |
| New reusable skills | 0 | 5-6 |
| Context tokens consumed | ~50K | ~20K |
| Time to load Builder | Baseline | No regression |

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Skill loading adds latency | Low | Medium | Skills are already loaded conditionally |
| Extracted logic diverges | Medium | High | Clear ownership in skill headers |
| Breaking existing workflows | Medium | High | Comprehensive testing before/after |
| Over-extraction (too many skills) | Low | Medium | Keep related logic together |

## Open Questions

1. **Should verification-contracts be required for ALL delegations?**
   - Currently seems advisory for some task types
   - Need to clarify when it's mandatory vs optional

2. **Should self-correction apply to sub-agents too?**
   - Currently described for Builder's own behavior
   - Could be valuable for specialists like react-dev

3. **How should skill dependencies work?**
   - If `dynamic-reassignment` needs `verification-contracts`, should it load it?
   - Or should Builder load both?

4. **Should we version skills?**
   - As builder evolves, skills may need backward compatibility
   - Or strict coupling is acceptable

## User Stories

### US-001: Extract verification contracts to skill

**As a** toolkit maintainer  
**I want** verification contract logic in a separate skill  
**So that** other agents (developer, overlord) can use the same pattern

**Acceptance Criteria:**
- [ ] Create `skills/verification-contracts/SKILL.md`
- [ ] Move contract generation algorithm from builder.md
- [ ] Move contract types from builder.md
- [ ] Move verification on completion from builder.md
- [ ] Update builder.md to reference skill
- [ ] Verify builder still generates contracts correctly

### US-002: Extract dynamic reassignment to skill

**As a** toolkit maintainer  
**I want** dynamic reassignment logic in a separate skill  
**So that** developer agent can handle specialist failures consistently

**Acceptance Criteria:**
- [ ] Create `skills/dynamic-reassignment/SKILL.md`
- [ ] Move fallback chain lookup from builder.md
- [ ] Move failure detection patterns from builder.md
- [ ] Move alternative selection algorithm from builder.md
- [ ] Update builder.md to reference skill
- [ ] Verify reassignment still works

### US-003: Extract self-correction to skill

**As a** toolkit maintainer  
**I want** loop detection and bulk fix logic in a separate skill  
**So that** developer and overlord can avoid repetitive fix patterns

**Acceptance Criteria:**
- [ ] Create `skills/self-correction/SKILL.md`
- [ ] Move detection triggers from builder.md
- [ ] Move self-check protocol from builder.md
- [ ] Move bulk fix protocol from builder.md
- [ ] Update builder.md to reference skill
- [ ] Add skill loading trigger to developer.md and overlord.md

### US-004: Merge deferred E2E into test-flow skill

**As a** toolkit maintainer  
**I want** deferred E2E test flow merged into test-flow skill  
**So that** all test-related flows are in one place

**Acceptance Criteria:**
- [ ] Add deferred E2E section to `skills/test-flow/SKILL.md`
- [ ] Include runtime check, source identification, execution
- [ ] Include PRD status update on completion
- [ ] Remove deferred E2E section from builder.md
- [ ] Reference test-flow skill from builder.md

### US-005: Extract auth config check to skill

**As a** toolkit maintainer  
**I want** authentication configuration checking in a skill  
**So that** qa-explorer and e2e-playwright can use the same logic

**Acceptance Criteria:**
- [ ] Create `skills/auth-config-check/SKILL.md`
- [ ] Move check flow from builder.md
- [ ] Move detection patterns from builder.md
- [ ] Update builder.md to reference skill
- [ ] Add skill reference to qa-explorer.md

### US-006: Validate builder.md reduction

**As a** toolkit maintainer  
**I want** builder.md reduced to 800-1000 lines  
**So that** context window pressure is reduced

**Acceptance Criteria:**
- [ ] All skills created and populated
- [ ] builder.md references skills instead of inline content
- [ ] builder.md line count between 800-1000
- [ ] All existing tests pass
- [ ] Manual workflow verification complete

## Timeline Estimate

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1: Deduplicate existing | 2-3 hours | None |
| Phase 2: Extract new skills | 4-6 hours | Phase 1 |
| Phase 3: Streamline core | 2-3 hours | Phase 2 |
| Testing and validation | 2-3 hours | Phase 3 |
| **Total** | **10-15 hours** | |

## Related Documents

- `agents/builder.md` — Current Builder agent
- `skills/builder-state/SKILL.md` — Existing state management skill
- `skills/prd-workflow/SKILL.md` — Existing PRD workflow skill
- `skills/adhoc-workflow/SKILL.md` — Existing ad-hoc workflow skill
- `skills/test-flow/SKILL.md` — Existing test flow skill
- `docs/drafts/prd-agent-reputation.md` — Related (dynamic reassignment could use reputation)
