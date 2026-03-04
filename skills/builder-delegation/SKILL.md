---
name: builder-delegation
description: "Sub-agent delegation patterns for Builder. Use when delegating work to @developer, @tester, or other sub-agents. Triggers on: delegation, context block, sub-agent, semantic search context."
---

# Builder Sub-Agent Delegation

> Load this skill when: delegating tasks to sub-agents, building context blocks, or using semantic search for pre-delegation context.

---

## Context Block Format

When delegating to sub-agents, **always pass a context block** following the Context Protocol.

Generate a `<context>` block at the start of every sub-agent prompt:

```yaml
<context>
version: 1
project:
  path: {absolute path to project}
  stack: {stack from project.json}
  commands:
    dev: {commands.dev}
    test: {commands.test}
    build: {commands.build}
    lint: {commands.lint}
git:
  defaultBranch: {git.defaultBranch}
  pushTo: {git.agentWorkflow.pushTo or defaultBranch}
  createPrTo: {git.agentWorkflow.createPrTo or defaultBranch}
  requiresHumanApproval: {git.agentWorkflow.requiresHumanApproval or []}
  autoCommit: {git.autoCommit}
conventions:
  summary: |
    {2-5 sentence summary of key conventions relevant to the task}
  fullPath: {path}/docs/CONVENTIONS.md
currentWork:
  prd: {current PRD name, if in PRD mode}
  story: {current story, if applicable}
  branch: {current branch}
</context>
```

**Git context is required** — sub-agents need this to validate their git operations.

---

## Context Summary Guidelines

When generating `conventions.summary`:
- **Keep it concise** — 50-100 tokens, max 200
- **Make it relevant** — Include conventions that apply to the current task
- **Include key patterns** — Language, framework, component library, error handling
- **Omit details** — Sub-agents can read `fullPath` if they need more

---

## Example Delegation

```markdown
<context>
version: 1
project:
  path: /Users/dev/code/project
  stack: nextjs-prisma
  commands:
    test: npm test
    lint: npm run lint
conventions:
  summary: |
    TypeScript strict. Tailwind + shadcn/ui. App Router.
    Server components by default. Prisma ORM. Zod validation.
  fullPath: /Users/dev/code/project/docs/CONVENTIONS.md
currentWork:
  prd: print-templates
  story: US-003 Add print preview modal
  branch: feature/print-templates
</context>

Implement US-003: Add print preview modal

Requirements:
- Show modal with template rendered at actual size
- Use existing Modal component from components/ui/modal.tsx
```

---

## Primary Sub-Agents

| Agent | Purpose |
|-------|---------|
| @developer | All code changes |
| @tester | Test generation and orchestration |
| @playwright-dev | E2E test writing |
| @critic | Code review |
| @quality-critic | Visual/a11y/performance checks |

---

## Analysis Gate Pre-Delegation Check (Compaction-Resilient)

> ⛔ **MANDATORY CHECK BEFORE EVERY @developer DELEGATION**
>
> This check survives context compaction because it reads from the state file, not from conversation memory.

**Before delegating to @developer, ALWAYS run this check:**

```bash
# Read analysis gate status from state file
ANALYSIS_COMPLETED=$(jq -r '.activeTask.analysisCompleted // false' docs/builder-state.json 2>/dev/null)
echo "Analysis gate check: analysisCompleted=$ANALYSIS_COMPLETED"
```

**Decision tree:**

| `analysisCompleted` | Action |
|---------------------|--------|
| `true` | ✅ Proceed with delegation |
| `false` or missing | ⛔ STOP — must show ANALYSIS COMPLETE dashboard and get [G] first |
| File doesn't exist | ⛔ STOP — initialize state file, then show analysis dashboard |

**If check fails:**

1. Do NOT proceed with delegation
2. Output: `"⛔ Analysis gate not passed. Must show ANALYSIS COMPLETE dashboard and receive [G] before delegating."`
3. Run Phase 0 from `adhoc-workflow` skill
4. After receiving [G], update state: `activeTask.analysisCompleted: true`
5. Re-run the check (should now pass)

**Logging requirement:**

Always log the check result before delegation:
```
Analysis gate check: analysisCompleted=true ✓
Delegating to @developer...
```

This ensures the gate is enforced even after context compaction when behavioral guardrails may be summarized away.

---

## Semantic Search Context (US-017)

When vectorization is enabled (`project.json` → `vectorization.enabled: true`), use the `semantic_search` MCP tool to gather context BEFORE delegating to sub-agents.

### When to Use Semantic Search

| Scenario | Query | Why |
|----------|-------|-----|
| Before implementing a feature | `"how does [feature] work"` | Understand existing patterns |
| Before modifying a file | `"what calls [function/component]"` | Understand dependencies |
| Before adding tests | `"tests for [module]"` | Find test patterns |
| Understanding data flow | `"how does [data] flow through the system"` | See call graph |
| Git history context | `"why was [file/function] changed"` | Understand intent |

### Query Patterns

```typescript
// Semantic search for context
semantic_search({ query: "how does authentication work", topK: 5 })

// Call graph query (who calls this?)
semantic_search({ query: "functions that call [functionName]", topK: 10 })

// Test mapping query (which tests cover this?)
semantic_search({ query: "tests for [moduleName]", topK: 5 })

// Git history query (why was this written?)
semantic_search({ query: "changes to [filename] and why", topK: 5 })
```

### Pre-Delegation Checklist

When vectorization is enabled, BEFORE delegating to `@developer`:

1. **Check if index exists:** `.vectorindex/metadata.json`
2. **Run semantic search** for the feature/area being modified
3. **Include relevant results** in the context block:

```yaml
<context>
version: 1
project:
  path: {path}
  stack: nextjs-prisma
semanticContext:
  query: "how does user authentication work"
  results:
    - file: src/lib/auth.ts
      summary: "Auth helper using NextAuth.js with credentials provider"
    - file: src/app/api/auth/[...nextauth]/route.ts
      summary: "NextAuth route handler with JWT session"
  callGraph:
    - "login() is called by LoginForm, AuthProvider"
  testCoverage:
    - src/lib/auth.test.ts covers login(), logout(), getSession()
conventions:
  summary: |
    TypeScript strict. Tailwind + shadcn/ui. App Router.
</context>
```

### Graceful Fallback

- If vectorization not enabled: skip semantic search, use grep/glob as normal
- If index missing: suggest rebuild, then continue without
- If search returns no results: proceed with grep fallback
- Never block workflow on semantic search
