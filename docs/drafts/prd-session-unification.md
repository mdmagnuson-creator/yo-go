# PRD: Session Unification (Always-On Coordination)

**Status:** Draft
**Priority:** Low
**Created:** 2026-03-05
**Author:** @toolkit

---

## Problem Statement

Builder and Developer currently branch on `project.json` → `agents.multiSession` (default: `false`) to choose between "Solo Mode" (no coordination) and "Multi-Session Mode" (session locks, heartbeat, merge queue). This creates:

1. **Unnecessary complexity** — 14 references in builder.md alone, plus branching in developer.md, builder-state skill, and multi-session skill, all checking the same flag and diverging behavior
2. **False safety** — A solo developer can still open multiple Builder sessions accidentally, with no coordination to prevent conflicts
3. **Configuration burden** — Users must know to flip `multiSession: true` before running parallel sessions, but the consequence of forgetting is silent PRD conflicts

### Current Overhead Analysis

The multi-session operations and their cost when running solo (no other sessions exist):

| Operation | Cost When Solo | Can Be Made Zero-Cost? |
|-----------|---------------|----------------------|
| Generate session ID | Negligible (one `openssl rand`) | Already negligible |
| Read `session-locks.json` | Negligible (empty file or `{"sessions":[]}`) | Already negligible |
| Check for stale sessions | Zero (empty array loop) | Already zero |
| Claim PRD (write lock + commit + push) | **1 extra git commit+push** | Yes — skip push if only session |
| Heartbeat (stash→checkout main→update→commit→push→checkout branch→pop) | **1 round-trip per story** — the expensive operation | Yes — skip entirely if only session |
| Release lock on completion | Bundled with completion commit | Already bundled |
| Dashboard session info | Shows "no other sessions" | Already negligible |

**The only real cost is heartbeat**, and it can be eliminated by checking `sessions.length === 1` before doing the stash/checkout/push cycle.

---

## Proposed Solution

Remove the `agents.multiSession` flag and always run coordination, but make the expensive operations **lazy** — only pay the cost when other sessions actually exist.

### Always Do (Zero Cost)

- Generate session ID at startup
- Read/write `session-locks.json`
- Claim PRDs via lock entry
- Show session info in dashboard
- Release lock on completion

### Lazy (Only When Others Present)

- **Heartbeat push cycle:** Before doing stash→checkout→push, check if `sessions` array has >1 entry. If you're the only session, update the JSON locally but skip the git round-trip.
- **Merge queue:** Only coordinate merges if other sessions have completed work targeting the same branch.
- **Conflict risk analysis:** Only compute if >1 session is active.

---

## Goals

- Remove `agents.multiSession` configuration flag (always-on coordination)
- Eliminate all solo/multi branching logic from builder.md, developer.md, builder-state skill
- Make heartbeat zero-cost when running as the only session
- Preserve full coordination when multiple sessions exist
- Simplify the multi-session skill (remove the "Solo Mode Check" guard)

## Non-Goals

- Changing the session lock format or merge queue protocol
- Adding new coordination features
- Modifying how PRDs are claimed or branches are created
- Changing `git.agentWorkflow` or `git.autoCommit` behavior

---

## Affected Files

| File | Current Solo/Multi Branching | Change |
|------|------------------------------|--------|
| `agents/builder.md` | 14 references — startup detection (789-792), dashboard mode (903), comparison table (1477-1489), dashboard solo notes (1627-1633), session lock section guard (2048-2050) | Remove all branching; always run coordination |
| `agents/developer.md` | Step 3 mode detection (101-103), Phase 0B guard (105-113), heartbeat skip (198-199), multi-session note (670) | Remove mode detection; always run Phase 0B |
| `skills/multi-session/SKILL.md` | "Solo Mode Check" guard at top (8-12) | Remove guard; always active |
| `skills/builder-state/SKILL.md` | "Solo vs Multi-Session Mode" section (206-211) | Remove; always multi-session |
| `schemas/project.schema.json` | `agents.multiSession` field (line 1519) | Deprecate field (ignore if present) |

---

## Clarifying Questions (To Resolve Before Ready)

1. **Heartbeat frequency:** Currently heartbeat runs per-story. Should lazy heartbeat also update on a time interval (e.g., every 10 min) when solo, so that if a second session starts mid-work it can detect the first?
   A. Per-story only (current behavior, just skip the push when solo)
   B. Per-story + time-based background check for new sessions
   C. Only when another session is detected (fully lazy)

2. **Migration path for existing projects:** Projects with `multiSession: true` in their `project.json` — how should we handle the now-unnecessary flag?
   A. Silently ignore it (no migration needed)
   B. Show one-time info message: "multiSession flag is no longer needed, coordination is always active"
   C. Auto-remove the field from project.json

3. **session-locks.json creation:** Currently this file only exists if `multiSession: true`. Should we auto-create it on first Builder startup?
   A. Yes — create `{"sessions":[]}` if missing
   B. Yes — but only when entering PRD mode (ad-hoc doesn't need it)
   C. No — only create when first PRD is claimed

4. **Developer agent Phase 0B:** Currently skipped entirely in Solo Mode. If always-on, should Developer always run the full session setup, or keep a lightweight version?
   A. Always full Phase 0B (claim PRD, create branch, rebase)
   B. Lightweight: just register session, skip claim if no registry
   C. Conditional: full Phase 0B only if `prd-registry.json` exists

---

## User Stories (Skeleton — Flesh Out After Questions Resolved)

### US-001: Make coordination always-on in Builder

Remove solo/multi branching from builder.md. Always generate session ID, read session locks, show session info in dashboard.

### US-002: Implement lazy heartbeat

Heartbeat only does the expensive git round-trip when `sessions.length > 1`. Local JSON update always happens.

### US-003: Make coordination always-on in Developer

Remove Phase 0B guard from developer.md. Always run session setup.

### US-004: Update multi-session skill

Remove "Solo Mode Check" guard. Remove conditional from builder-state skill. Skill is always active.

### US-005: Deprecate `agents.multiSession` schema field

Mark as deprecated in schema. Silently ignore if present (or show one-time message per Q2 answer).

### US-006: Post-change workflow

toolkit-structure.json, README, website sync, governance validators.

---

## Relationship to Other PRDs

| PRD | Relationship |
|-----|-------------|
| `prd-builder-skill-extraction` (draft) | **Adjacent** — extraction keeps Solo Mode section inline; this PRD would simplify/remove it |
| `prd-token-optimization` (ready) | **Independent** — no overlap |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Existing projects break with `multiSession: true` | Silently ignore the flag — backward compatible |
| session-locks.json conflicts on shared repos | Already handled by multi-session skill's push rejection + retry |
| Overhead for users who never run parallel sessions | Lazy heartbeat makes cost near-zero |

---

## Timeline Estimate

| Story | Estimate |
|-------|----------|
| US-001 (Builder always-on) | 1-2 hours |
| US-002 (Lazy heartbeat) | 1-2 hours |
| US-003 (Developer always-on) | 30 min |
| US-004 (Skill updates) | 30 min |
| US-005 (Schema deprecation) | 30 min |
| US-006 (Post-change) | 30 min |
| **Total** | **4-6 hours** |

---

## Credential & Service Access Plan

No external credentials required for this PRD.
