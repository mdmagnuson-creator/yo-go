# PRD: Token Optimization for Large Agents and Skills

**Status:** DRAFT  
**Created:** 2026-03-04  
**Author:** @toolkit

---

## Problem Statement

### Context Limit Exhaustion

Builder sessions are hitting context limits (128K tokens) too quickly due to:

1. **Oversized agent files** — `builder.md` is 2,887 lines (113KB, ~28K tokens)
2. **Monolithic skills** — `test-flow` skill is 133KB (~33K tokens alone)
3. **Large registry files** — `prd-registry.json` grows unbounded with project history

**Observed impact:**
- New Builder session + project selection + "ad-hoc mode" = 97K tokens consumed
- Context compaction triggered within 2-3 user interactions
- After compaction, behavioral guardrails can be lost

### Root Causes

1. **builder.md includes inline documentation** that could be extracted to skills
2. **test-flow skill includes all verification workflows** when most sessions use 1-2
3. **prd-registry.json retains full history** including completed PRD details that are rarely needed

---

## Proposed Solution

### 1. Split test-flow Skill (HIGH IMPACT)

Current: Single 133KB file covering:
- Unit test execution
- E2E test writing and execution
- Verification loops (3-pass stability, fix loops)
- Flaky test handling
- Deferred E2E flow
- Prerequisite failure detection
- Environment issue handling

**Proposed split:**

| New Skill | Contents | Est. Size |
|-----------|----------|-----------|
| `test-unit` | Unit test execution, Jest patterns | ~15KB |
| `test-e2e` | E2E test writing with Playwright | ~25KB |
| `test-verification` | Verification loops, 3-pass stability | ~35KB |
| `test-flaky` | Flaky test detection and quarantine | ~15KB |
| `test-deferred` | Deferred E2E post-PRD flow | ~10KB |
| `test-prereq` | Prerequisite failure detection, environment issues | ~25KB |

**Loading strategy:**
- `test-unit`: Load when running unit tests
- `test-e2e`: Load when writing/running E2E tests
- `test-verification`: Load when verification loop starts
- Others: Load on-demand when specific patterns detected

### 2. Extract Builder Inline Documentation (MEDIUM IMPACT)

Current: builder.md has extensive inline documentation sections that are loaded every session but rarely consulted.

**Candidates for extraction:**

| Section | Lines | Extract to |
|---------|-------|------------|
| CLI Triggers/Commands reference | ~100 lines | `skill: cli-reference` |
| Visual Debugging Escalation | ~80 lines | Already references `browser-debugging` skill |
| Environment Context diagnosis | ~80 lines | `skill: environment-diagnosis` |
| Dev Server Management | ~150 lines | `skill: dev-server` (already exists as `start-dev-server`) |

**Target:** Reduce builder.md from 2,887 to ~2,000 lines (30% reduction)

### 3. Archive Completed PRDs (MEDIUM IMPACT)

Current: `prd-registry.json` contains full history including detailed metadata for every PRD ever created.

**Proposed:**

1. **Active registry** (`prd-registry.json`) — Contains only:
   - PRDs with status: `ready`, `in_progress`, `awaiting_e2e`
   - Last 5 completed PRDs (for recent context)
   - Minimal fields: `id`, `name`, `status`, `estimatedStories`, `storiesCompleted`

2. **Archive file** (`prd-archive.json`) — Contains:
   - All completed/abandoned PRDs with full details
   - Read only when needed (e.g., "show me PRD history")

**Migration:**
- On startup, if registry >20KB, auto-archive completed PRDs older than 30 days
- Or provide manual archive command: `archive-prds`

---

## Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Tokens at Builder startup | ~60K | <25K |
| builder.md lines | 2,887 | <2,200 |
| test-flow skill size | 133KB | Largest chunk <35KB |
| prd-registry.json typical size | 50KB | <10KB |

---

## User Stories

### US-001: Split test-flow into focused skills

**As** a Builder session  
**I want** test-related skills loaded only when needed  
**So that** I don't consume 33K tokens for unused verification workflows

**Acceptance Criteria:**
- [ ] test-flow split into 5-6 smaller skills
- [ ] Each skill <40KB
- [ ] Builder loads skills on-demand based on current operation
- [ ] No functionality lost — all current test-flow features preserved
- [ ] Skills cross-reference each other where needed

### US-002: Extract Builder inline docs to skills

**As** a Builder agent definition  
**I want** rarely-used documentation sections extracted to loadable skills  
**So that** I load lean and fast for common workflows

**Acceptance Criteria:**
- [ ] CLI reference extracted to skill (loaded when CLI operations detected)
- [ ] Environment diagnosis extracted (loaded when environment errors detected)
- [ ] builder.md reduced to <2,200 lines
- [ ] All extracted content accessible via skill loading when needed

### US-003: Implement PRD archive system

**As** a project with extensive PRD history  
**I want** completed PRDs archived to a separate file  
**So that** startup reads only active PRDs

**Acceptance Criteria:**
- [ ] Archive file format defined
- [ ] Auto-archive PRDs completed >30 days ago when registry >20KB
- [ ] Manual archive command available
- [ ] Dashboard still shows "recent completed" from archive
- [ ] Full history accessible via explicit "show history" command

---

## Technical Considerations

### Skill Dependencies

When splitting test-flow, some skills will need to load others:
- `test-verification` may need patterns from `test-e2e`
- `test-flaky` may need to trigger `test-verification`

**Solution:** Use skill cross-references:
```markdown
> 📚 **SKILL: test-e2e** → "E2E Test Patterns"
>
> Load the `test-e2e` skill for Playwright patterns if not already loaded.
```

### Backward Compatibility

- Old `test-flow` skill remains as entry point, loads sub-skills as needed
- Or: deprecate with clear migration path in CHANGELOG

### Token Calculation Reference

Rough conversion: 4 characters ≈ 1 token
- 133KB file ≈ 33K tokens
- 50KB file ≈ 12K tokens  
- 10KB file ≈ 2.5K tokens

---

## Out of Scope

- Reducing model context window (fixed at 128K for claude-opus-4.5)
- Changing skill loading mechanism in OpenCode (use existing skill tool)
- Optimizing other agents (planner, developer, etc.) — separate PRD if needed

---

## Dependencies

- None — this is internal toolkit optimization

---

## Risks

| Risk | Mitigation |
|------|------------|
| Skill split introduces bugs | Thorough testing of each split skill |
| Over-fragmentation makes skills hard to maintain | Keep splits logical, document cross-references |
| Archive query slow | Index archive by status for fast filtering |

---

## Timeline Estimate

| Story | Estimate |
|-------|----------|
| US-001 (test-flow split) | 3-4 hours |
| US-002 (Builder extraction) | 2-3 hours |
| US-003 (PRD archive) | 1-2 hours |
| **Total** | 6-9 hours |
