# PRD Draft: Integration Skill Gaps

**Status:** Draft  
**Priority:** Medium  
**Source:** Gaps from `integration-provisioning-automation.md` (mostly complete)

## Introduction

The integration skill provisioning workflow is 90% implemented. This PRD covers the two remaining gaps:

1. **Auto-promotion:** Builder should queue toolkit pending updates when creating new integration skills
2. **Supabase database patterns:** Auth skills exist, but database/RLS patterns are missing

## Problem Statement

1. **No auto-promotion loop** — When Builder creates a project-specific skill, the pattern stays local. Toolkit doesn't learn from it automatically.

2. **Supabase auth ≠ Supabase database** — We have `auth-supabase-otp` and `auth-supabase-password`, but agents still get corrected on:
   - RLS policy patterns
   - Supabase client usage (server vs browser)
   - Realtime subscriptions
   - Edge function patterns

## User Stories

### US-001: Auto-Promote Skills to Toolkit

**Description:** As a toolkit maintainer, I want Builder to automatically queue a toolkit pending update when it creates a new integration skill, so patterns flow back to the toolkit.

**Acceptance Criteria:**

- [ ] After Builder creates a project skill via meta-skill generator, check if a matching toolkit skill exists
- [ ] If no toolkit skill exists, create `~/.config/opencode/pending-updates/promote-[skill-name].md`
- [ ] Update includes: skill name, project context, generated skill path, recommended reusable patterns
- [ ] Toolkit maintainer can refine and promote or dismiss
- [ ] This is automatic — no user prompt required

**Implementation notes:**
- Add to Developer Phase 3B.1 after skill generation
- Add to Builder's skill generation flow
- Use same pending-update format as other toolkit updates

### US-002: Supabase Database Skill Generator

**Description:** As a developer, I want a `supabase-skill-generator` that documents database patterns for Supabase projects, so agents don't repeat RLS and client usage mistakes.

**Acceptance Criteria:**

- [ ] Create `skills/meta/supabase-skill-generator/SKILL.md`
- [ ] Generator analyzes: Supabase client setup, RLS policies, table structure, realtime usage
- [ ] Generates `docs/skills/supabase/SKILL.md` with project-specific patterns
- [ ] Covers:
  - [ ] Server vs browser client creation
  - [ ] RLS policy patterns (select, insert, update, delete)
  - [ ] Common query patterns with proper typing
  - [ ] Realtime subscription patterns (if used)
  - [ ] Edge function patterns (if used)
- [ ] Add trigger: `integrations: [{name: "supabase"}]` or `database.client: "supabase"`

**Implementation notes:**
- Follow pattern of existing meta-skill generators
- Reference `auth-supabase-*` skills for auth patterns (don't duplicate)
- Focus on database/RLS patterns that auth skills don't cover

## Functional Requirements

1. Builder/Developer must queue promotion updates for newly created skills
2. Supabase skill generator must cover database patterns distinct from auth
3. Both stories are independent — can be implemented in any order

## Technical Considerations

- **Pending update location:** Use `~/.config/opencode/pending-updates/` (toolkit's inbox)
- **Skill trigger:** Add to `data/meta-skill-triggers.json` after creating generator
- **Non-duplication:** Supabase database skill should reference auth skills, not reimplement

## Success Metrics

- Every project-created skill generates a promotion request
- Supabase database correction prompts reduced by 80%

## Credential & Service Access Plan

No external credentials required for this PRD.
