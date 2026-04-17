---
name: session-handoff
description: Produce a Planner session handoff by writing the five structured fields to planner-state.json and emitting the standard copy/paste message for the next session. Use when asked to produce a handoff, update session state, or write a copy/paste message for the next Planner session.
---

# Session Handoff Skill

Use when: asked to produce a handoff, update session state, or write a
copy/paste message for the next Planner session.

## The five fields

currentIntent
  What the current work is trying to achieve. Not what happened — what we
  are pointed at. 2-3 sentences. Makes sense to someone with zero prior context.

recentDecisions
  What was just decided that the next session must honor without re-litigating.
  Most recent first. Max 10. One sentence each.
  Only include what the next session needs to act on — not reasoning or history.

nextAction
  One sentence. Unambiguous. Include the specific file path, phase number, or
  artifact name so the next session can act immediately without inferring.

processState
  The current stage of work and what governs behavior at this stage.
  Must include a hard rule for what is NOT allowed at this stage.
  Include a status map when work spans multiple items.

activeConstraints
  Older rules still in force that predate this session.
  The constraints a fresh session will most likely violate without knowing them.
  Max 5. These are persistent background rules, not recent decisions.

## What NOT to do

- Do not summarize session history as the handoff
- Do not explain why decisions were made — state them
- Do not include anything the next session does not need to act on
- Do not write prose that lets the next session draw its own conclusions

## Progressive disclosure

If the next session needs more context it reads deeper into the file system:

  - planner-state.json in full (resumePrompt for audit history)
  - the specific PRD phase file being worked on
  - CONVENTIONS.md sections relevant to current work

The five fields are the entry point. File reads are how this agent goes deeper —
not a database, not a message history, not an external service.

## Workflow

1. Write all five fields to docs/planner-state.json
2. Verify valid JSON: `python3 -c "import json; json.load(open('docs/planner-state.json'))"`
3. Produce copy/paste message using the standard template from planner.md
4. The state file is the source of truth — the message points to it
