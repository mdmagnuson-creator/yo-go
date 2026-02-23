# Yo Go

A comprehensive collection of AI agents, skills, templates, and scaffolds for autonomous software development. Built for [OpenCode](https://opencode.ai) but adaptable to other AI coding platforms.

## What's Inside

| Directory | Description |
|-----------|-------------|
| [`agents/`](#agents) | 63 autonomous agents for development, testing, reviewing, and orchestration |
| [`skills/`](#skills) | 32 reusable skills for PRDs, screenshots, scaffolding, and more |
| [`agent-templates/`](#agent-templates) | Templates for generating project-specific agents |
| [`scaffolds/`](#scaffolds) | Full project starters (Next.js + Supabase, Next.js + Prisma, Go + Chi) |
| [`templates/`](#templates) | Coding convention templates per language/framework |
| `opencode.json` | OpenCode defaults and agent startup prompts |
| [`automations/`](#github-actions) | GitHub Actions for CI triage and PRD automation |

## Quick Start

### 1. Install OpenCode

```bash
# macOS
brew install opencode

# Or see https://opencode.ai for other platforms
```

### 2. Clone and Link

```bash
git clone https://github.com/mdmagnuson-creator/yo-go.git ~/code/yo-go

# Create symlinks in your OpenCode config
mkdir -p ~/.config/opencode
cd ~/.config/opencode
ln -s ~/code/yo-go/agents agents
ln -s ~/code/yo-go/skills skills
```

### 3. Run an Agent

```bash
cd your-project
opencode
# Press <leader>a to see available agents
# Select "overlord" or "planner" to get started
```

### 4. Optional Local Overrides (Gitignored)

Use `.local/toolkit-overrides.json` for machine-specific Toolkit behavior that should not ship to other users.

Example (auto-queue website sync updates locally):

```json
{
  "websiteSync": {
    "mode": "queue-file",
    "projectId": "opencode-toolkit-website"
  }
}
```

Supported `websiteSync.mode` values:
- `disabled` (default, public-safe)
- `owner-managed` (manual checklist only)
- `queue-file` (auto-create `project-updates/<projectId>/...`)

---

## Agents

Agents are autonomous AI workers defined in Markdown with YAML frontmatter. They run inside OpenCode and coordinate through files in your project's `docs/` directory.

### Agent Types

| Type | Description | Example |
|------|-------------|---------|
| **Primary** | Entry points you invoke directly | `planner`, `builder`, `toolkit` |
| **Subagent** | Called by other agents via `@name` | `developer`, `critic`, `felix`, `tester` |

### Primary Agents (Entry Points)

| Agent | Purpose |
|-------|---------|
| **planner** | Refines draft PRDs, asks clarifying questions, moves PRDs to ready status |
| **builder** | Claims ready PRDs and coordinates implementation via subagents |
| **toolkit** | Maintains the AI toolkit (agents, skills, templates) |

### Testing Agents

The testing hierarchy consists of orchestrators that delegate to specialists:

| Agent | Role | Purpose |
|-------|------|---------|
| **tester** | Orchestrator | Test orchestrator — routes to specialists, supports Story/Ad-hoc/Full Suite modes |
| **qa** | Orchestrator | QA coordinator — dispatches exploratory testing subagents |
| **go-tester** | Specialist | Go tests with testify |
| **jest-tester** | Specialist | Backend TypeScript tests |
| **react-tester** | Specialist | React component tests with RTL |
| **e2e-playwright** | Specialist | Playwright E2E tests |
| **qa-explorer** | Specialist | Exploratory testing to find bugs |
| **qa-browser-tester** | Specialist | Writes Playwright tests for QA-found bugs |
| **quality-critic** | Specialist | Visual regression, CLS, accessibility, performance |

**Testing Modes:**
- **Story Mode**: Auto-generate unit tests after completing a story
- **Ad-hoc Mode**: Generate tests for ad-hoc changes, prompt to run E2E
- **Full Suite Mode**: Run complete test suite including E2E
- **Visual Audit Mode**: Run full-site desktop/mobile UX sweeps with severity-ranked findings and post-fix re-verification

### Implementation Agents

| Agent | Purpose |
|-------|---------|
| **developer** | Implements user stories autonomously, one at a time |
| **hammer** | Fixes build failures and PR feedback |
| **react-dev** | React/TypeScript specialist |
| **go-dev** | Go specialist |
| **python-dev** | Python specialist |
| **java-dev** | Java/Netty specialist |
| **playwright-dev** | E2E test specialist |

### Code Review Agents (Critics)

The `critic` agent routes reviews to specialists based on file types:

| Critic | Scope |
|--------|-------|
| **frontend-critic** | React, Vue, Svelte, CSS |
| **backend-critic-ts** | TypeScript backends (Express, Lambda) |
| **backend-critic-go** | Go backends (Chi, Gin, Lambda) |
| **backend-critic-java** | Java backends (Netty, Lambda) |
| **network-critic** | HTTP clients, database connections, timeouts |
| **security-critic** | CSP, CORS, XSS, dependency CVEs |
| **exploit-critic** | Adversarial review (injection, auth bypass) |
| **api-critic** | REST/GraphQL API design |
| **requirements-critic** | Alignment with PRD requirements |
| **aesthetic-critic** | UI styling consistency |
| **quality-critic** | Visual regression, CLS, accessibility (axe-core), performance |
| **tailwind-critic** | Tailwind CSS patterns |
| **workflow-enforcement-critic** | Mandatory toolkit post-change workflow compliance |
| **handoff-contract-critic** | Builder/Planner/Toolkit routing consistency |
| **update-schema-critic** | `project-updates` schema and required sections |
| **policy-testability-critic** | Flags non-testable MUST/CRITICAL/NEVER rules |

### Operational Agents

| Agent | Purpose |
|-------|---------|
| **felix** | Monitors PRs for build failures and review feedback |
| **wall-e** | Cleans up workspace and switches branches |
| **debugger** | Investigates production issues via logs and code search |
| **session-status** | Shows multi-session coordination dashboard |

### Agent Communication

Agents communicate through files in `docs/`:

```
docs/
├── prd.json          # User stories to implement
├── progress.txt      # Running log of completed work
├── review.md         # Code review feedback
├── felix.json        # Build/PR fix tasks
├── qa-findings.json  # QA test findings
└── diagnosis.md      # Debugger investigation results
```

### Primary Agent Todo Resume Behavior

Primary agents persist right-panel todos to disk so interrupted sessions can resume cleanly.

| Agent | Live checklist | Durable state |
|-------|----------------|---------------|
| **builder** | OpenCode right panel (`todowrite`) | `<project>/docs/builder-state.json` (`uiTodos`) |
| **planner** | OpenCode right panel (`todowrite`) | `<project>/docs/planner-state.json` (`uiTodos`) |
| **toolkit** | OpenCode right panel (`todowrite`) | `~/.config/opencode/.tmp/toolkit-state.json` (`uiTodos`) |

Builder maintains todos in two places:

- **OpenCode right panel** via the `todowrite` tool (live checklist)
- **`docs/builder-state.json` (`uiTodos`)** as durable state for crash/session recovery

This applies to all Builder workflows:

- **PRD mode**: one todo per story (`US-001`, `US-002`, ...)
- **Ad-hoc mode**: one todo per user task (`adhoc-###`)
- **Pending updates (`U`)**: one todo per update file
- **Deferred E2E (`E`)**: one todo per queued test file

On project selection, Builder restores the right-panel todos from `uiTodos` so a new session can continue where the previous one stopped.

---

## Skills

Skills are loadable instruction sets that provide specialized workflows. Agents invoke them with the `skill` tool.

| Skill | Purpose |
|-------|---------|
| **prd** | Generate Product Requirements Documents |
| **prd-to-json** | Convert PRD markdown to structured JSON |
| **screenshot** | Capture authenticated screenshots |
| **product-screenshots** | Maintain marketing/support screenshots |
| **marketing-copy** | Generate marketing text from PRDs |
| **public-page** | Build landing pages, legal pages, error pages |
| **cve** | Assess CVEs for exposure, exploitability, and remediation |
| **merge-conflicts** | Resolve git merge conflicts |
| **spec-analyzer** | Analyze project specs and dependencies |
| **stack-advisor** | Recommend technology stacks |
| **project-bootstrap** | Initialize new projects with conventions |
| **project-scaffold** | Generate full project from scaffold |
| **agent-onboard** | Add new agents with proper conventions |
| **agent-audit** | Audit agents for compliance |

---

## Agent Templates

Templates for generating **project-specific agents**. When a project is bootstrapped, these templates are rendered with project-specific values and placed in `<project>/docs/agents/`.

```
agent-templates/
├── backend/
│   ├── go-chi.md
│   ├── node-express.md
│   └── python-fastapi.md
├── frontend/
│   ├── react.md
│   ├── vue.md
│   └── svelte.md
├── testing/
│   ├── go-test.md
│   ├── jest-react.md
│   ├── playwright.md
│   └── pytest.md
├── critics/
│   ├── go.md
│   ├── typescript.md
│   └── python.md
└── styling/
    └── tailwind.md
```

Templates use Handlebars-style syntax: `{{PROJECT.stack.frontend}}`, `{{#if HAS_TESTS}}...{{/if}}`

---

## Scaffolds

Full project starters with authentication, database setup, and coding conventions pre-configured.

### Available Scaffolds

| Scaffold | Stack |
|----------|-------|
| **nextjs-supabase** | Next.js 15 + Supabase + Tailwind + TypeScript |
| **nextjs-prisma** | Next.js 15 + Prisma + PostgreSQL + NextAuth |
| **go-chi-postgres** | Go + Chi router + PostgreSQL + JWT auth |

### Using a Scaffold

```bash
# In OpenCode, invoke the project-scaffold skill
@project-scaffold

# Or manually copy and render templates
cp -r scaffolds/nextjs-supabase/files ./my-new-project
```

Each scaffold includes:
- Complete directory structure
- Authentication setup
- Database schema/migrations
- Environment configuration
- AGENTS.md with conventions
- CI/CD workflow templates

---

## Templates

Coding convention templates organized by language and concern. Used by the bootstrap script to generate project-specific `AGENTS.md` files.

```
templates/
├── coding-go.md
├── coding-typescript.md
├── coding-react.md
├── coding-python.md
├── coding-java.md
├── coding-playwright.md
├── coding-terraform.md
├── coding-cloudformation.md
├── git-single-repo.md
├── git-monorepo.md
├── branching.md
└── ...
```

---

## GitHub Actions

### CI Failure Triage

Automatically analyze CI failures with AI and optionally auto-fix:

```yaml
# .github/workflows/ci.yml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: make build

  triage:
    runs-on: ubuntu-latest
    needs: [build]
    if: failure()
    steps:
      - uses: actions/checkout@v4
      - uses: mdmagnuson-creator/yo-go/triage@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          slack_webhook_url: ${{ secrets.SLACK_WEBHOOK }}
          auto_fix: 'true'
```

---

## Project Context System

Agents are **project-context aware**. On startup, they:

1. Read `~/.config/opencode/projects.json` to find the active project
2. Load `<project>/docs/project.json` for stack configuration
3. Load `<project>/docs/CONVENTIONS.md` for coding standards

This allows the same agents to adapt behavior per-project.

### Project Registry (`~/.config/opencode/projects.json`)

```json
{
  "projects": [
    {
      "name": "My App",
      "path": "/Users/me/code/my-app",
      "hasAgentSystem": true
    }
  ],
  "activeProject": "/Users/me/code/my-app"
}
```

### Project Config (`docs/project.json`)

```json
{
  "name": "My App",
  "stack": {
    "frontend": "react",
    "backend": "node-express",
    "database": "postgresql",
    "orm": "prisma",
    "styling": "tailwind",
    "testing": {
      "unit": "jest",
      "e2e": "playwright"
    }
  },
  "commands": {
    "dev": "npm run dev",
    "build": "npm run build",
    "test": "npm test",
    "typecheck": "npm run typecheck"
  }
}
```

---

## Writing Your Own Agent

Create a `.md` file in `agents/`:

```markdown
---
description: Does the thing
mode: primary
model: github-copilot/claude-sonnet-4
temperature: 0.3
tools:
  "*": true
---

# My Agent Instructions

You are an autonomous agent that does the thing.

## Your Task

0. **Load Project Context (FIRST)**
   
   a. **Find the active project:**
      ```bash
      cat ~/.config/opencode/projects.json
      ```
   
   b. **Load project configuration:**
      - Read `<project>/docs/project.json`
      - Read `<project>/docs/CONVENTIONS.md`

1. Do step one
2. Do step two
3. Signal completion with `<promise>COMPLETE</promise>`
```

### Frontmatter Fields

| Field | Description |
|-------|-------------|
| `description` | Short description shown in agent picker |
| `mode` | `primary` (user-invokable) or `subagent` (called by other agents) |
| `model` | AI model to use (e.g., `github-copilot/claude-opus-4.5`) |
| `temperature` | Sampling temperature (0.0–1.0) |
| `tools` | Tool access: `"*": true` for all, or selective |

---

## Bootstrap Script

Generate `AGENTS.md` for a new project:

```bash
./bootstrap.sh /path/to/your/project
```

This interactive wizard:
1. Asks about your stack (languages, frameworks, database)
2. Asks about your git workflow
3. Generates customized coding conventions
4. Creates project configuration files

---

## License

MIT

---

## Contributing

Contributions welcome! Please:
1. Follow existing agent patterns
2. Include project context loading in new agents
3. Add appropriate frontmatter
4. Test with OpenCode before submitting
