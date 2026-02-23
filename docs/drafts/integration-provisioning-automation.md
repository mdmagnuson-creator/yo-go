# PRD: Integration Skill Provisioning (Simple Workflow)

## Introduction

Projects repeatedly re-teach common integrations (Supabase, Stripe, Resend, SendGrid, QuickBooks, Xero). The fastest fix is a simple repeatable workflow:

1. Planner detects integration needs and adds integration skill tasks to the PRD.
2. Builder creates the required integration skill during build when needed.
3. Builder files a toolkit pending update so the integration skill pattern is promoted.

This avoids over-design and keeps the loop practical.

## Goals

- Eliminate repeated integration instruction across projects.
- Make integration skill creation an expected part of PRD execution.
- Promote integration skills to toolkit by default once Builder creates them.
- Keep process simple: detect, create, use, promote.

## Non-Goals

- Building a large specialist-subagent framework in phase 1.
- Adding complex promotion scoring/approval heuristics.
- Requiring monthly quotas for promotion success.

## User Stories

### US-001: Planner Adds Integration Skill Tasks

**Description:** As a user, I want Planner to include integration skill tasks in PRDs so Builder knows exactly what to generate and use.

**Acceptance Criteria:**

- [ ] Planner detects integration dependencies from request + `docs/project.json`.
- [ ] Planner adds a `## Integration Skill Plan` section whenever integrations are present.
- [ ] Planner creates explicit PRD stories for required integration skills before dependent implementation stories.
- [ ] If no integration is present, Planner does not add integration skill tasks.

### US-002: Builder Creates Integration Skills On Demand

**Description:** As a user, I want Builder to create missing integration skills at build time so implementation can proceed without reteaching.

**Acceptance Criteria:**

- [ ] Before an integration-dependent story, Builder checks whether the integration skill exists.
- [ ] If missing, Builder creates the project integration skill in `docs/skills/<integration>/SKILL.md`.
- [ ] Builder uses that skill for subsequent integration stories in the PRD.
- [ ] Builder records created skills in build state/progress output.

### US-003: Builder Always Queues Toolkit Promotion

**Description:** As a toolkit maintainer, I want every newly created integration skill to generate a toolkit pending update so it can be promoted.

**Acceptance Criteria:**

- [ ] When Builder creates an integration skill not yet in toolkit defaults, it writes a `pending-updates/*.md` request.
- [ ] Update includes integration name, project context, generated skill path, and recommended reusable rules.
- [ ] Promotion request is treated as the default action for integration skills.
- [ ] Toolkit can apply or refine, but Builder always queues the request.

### US-004: Seed Common Integration Skill Coverage

**Description:** As a toolkit maintainer, I want an initial common integration list so repeated providers are handled first.

**Acceptance Criteria:**

- [ ] Establish common integration seed list:
  - [ ] `supabase`
  - [ ] `stripe`
  - [ ] `resend`
  - [ ] `sendgrid`
  - [ ] `quickbooks`
  - [ ] `xero`
- [ ] Planner integration detection and Builder creation flow supports this list.
- [ ] Additional integrations can be added incrementally as encountered.

## Functional Requirements

1. Planner must create integration skill tasks in PRDs when integrations exist.
2. Builder must create missing integration skills at story time and use them.
3. Builder must queue toolkit promotion updates for newly created integration skills.
4. The process must remain incremental and extensible for new integrations.

## Technical Considerations

- Keep project-generated integration skills under `docs/skills/` in project repos.
- Keep toolkit promotion requests under `pending-updates/` in toolkit repo.
- Reuse existing credential timing handling in PRD/build flows (`upfront` and `after-initial-build`).

## Success Metrics

- 100% of PRDs with integrations include integration skill tasks.
- 100% of integration-dependent stories run with an integration skill available.
- Reduced follow-up correction prompts for common integrations, especially Supabase.

## Open Questions

1. Should `resend` and `sendgrid` be generated through one shared email integration skill or two provider-specific skills?
2. Should `quickbooks` and `xero` share one accounting integration skill template or stay provider-specific?

## Credential & Service Access Plan

No external credentials required for this PRD.

## Definition of Done

This PRD is complete when:

- Planner consistently includes integration skill tasks in integration PRDs.
- Builder creates and uses integration skills during build whenever missing.
- Builder always queues toolkit promotion updates for newly created integration skills.
- Seed integrations (Supabase, Stripe, Resend, SendGrid, QuickBooks, Xero) are covered by the workflow.
