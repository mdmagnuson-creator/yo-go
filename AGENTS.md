# Common Coding Guidelines

## Protected System Resources

> ⛔ **CRITICAL: Never access protected macOS resources**
>
> Do NOT access anything that would trigger a macOS permission prompt.
> These operations block automated workflows and require user intervention.

**Never access:**
- `~/Desktop/`, `~/Documents/`, `~/Downloads/` — use project directories instead
- `~/Library/` — system preferences, keychains, app data
- Contacts, Calendar, Reminders, Photos, Mail
- Screen recording or accessibility APIs
- Other applications via AppleScript/osascript
- Clipboard (pbcopy/pbpaste) in automated scripts
- Keychain or credential stores
- System notifications

**Safe alternatives:**
- Store files in the project directory or `.tmp/`
- Use environment variables for secrets (never access Keychain)
- Write output to files instead of clipboard
- Log to files instead of system notifications

**If a command requires system access**, stop and tell the user to run it manually.

## Temporary Files

> ⛔ **CRITICAL: Never use system temp directories**
>
> Do NOT write to `/tmp/`, `/var/folders/`, or any system temporary directory.
> These paths are outside the agent's allowed directories and will cause OpenCode to prompt for access, blocking automated workflows.

**Always use project-local `.tmp/` directory:**

```bash
# Create project-local temp directory
mkdir -p .tmp

# Ensure it's gitignored (add if not present)
grep -q "^\.tmp/$" .gitignore 2>/dev/null || echo ".tmp/" >> .gitignore

# Store temporary files there
.tmp/screenshots/
.tmp/test-output.txt
.tmp/build-artifacts/
```

**Rules:**
- Use `.tmp/` in the project root for all temporary files
- Create subdirectories as needed (`.tmp/screenshots/`, `.tmp/logs/`)
- **Always ensure `.tmp/` is in `.gitignore`** — add it if missing
- Clean up temp files when no longer needed

## Comments

- Do NOT over-comment. If the code is self-explanatory, leave it uncommented.
- Only add inline comments for esoteric or non-obvious logic that cannot be reasonably understood from the code alone.
- All exported functions and classes MUST have doc comments. Use the standard doc comment format for the language (e.g. JSDoc for TypeScript/JavaScript, docstrings for Python, `///` for Rust).

## Library Usage

When writing code that uses external libraries, use the `context7` MCP tool to look up current documentation before calling library APIs. Do not rely on training data for API signatures, method names, or parameter types. Look them up. This avoids hallucinating deprecated or nonexistent methods.

## AWS CLI

If any command fails with a message about an expired AWS session, expired credentials, or a prompt to run `aws sso login`, **stop and tell the user**. Do not attempt to run `aws sso login` or refresh credentials yourself. The user must do this manually in their own terminal.

# Go Coding Guidelines

Follow the project's existing patterns first. These guidelines apply where the project has no established convention.

## Formatting

- All code must be `gofmt`/`goimports` formatted. No exceptions.

## Error Handling

- Always check returned errors. Never discard them with `_` unless there is a documented reason.
- Wrap errors with context using `fmt.Errorf("doing thing: %w", err)`. The caller should understand what failed without reading source.
- Do not `panic` in library code. Reserve `panic` for truly unrecoverable programmer errors (e.g. invalid state that indicates a bug).
- Return errors rather than logging and continuing. Let the caller decide how to handle them.

## Naming

- Short variable names (`i`, `r`, `ctx`) in small scopes. Longer, descriptive names as scope grows.
- Exported names must be descriptive and self-documenting.
- Use `MixedCaps` / `mixedCaps`. No underscores in Go names (except in test functions like `Test_thing`).
- Acronyms are all-caps when exported (`HTTPClient`, `ID`), all-lower when unexported (`httpClient`, `id`).
- Getters do not use `Get` prefix: use `Name()` not `GetName()`.

## Package Design

- Packages should be small and focused on a single responsibility.
- Package names are short, lowercase, singular nouns. No `util`, `common`, `misc`, `helpers`, or `base`.
- Avoid package-level state (global vars, `init()` functions). Prefer passing dependencies explicitly.
- Only use `init()` when there is no practical alternative (e.g. registering database drivers).

## Interfaces

- Keep interfaces small — 1 to 3 methods. Compose larger behaviors from small interfaces.
- Define interfaces where they are consumed, not where they are implemented.
- Accept interfaces, return concrete structs.
- Do not define interfaces preemptively. Extract them when a second implementation or a test boundary is needed.

## Context

- Use `context.Context` for cancellation, deadlines, and request-scoped values.
- Always pass it as the first parameter: `func DoThing(ctx context.Context, ...)`.
- Do not store `context.Context` in structs.

## Concurrency

- Use goroutines and channels where they simplify the design. Do not use them to look clever.
- Every goroutine must have a clear shutdown path. Do not leak goroutines.
- Use `sync.WaitGroup` or `errgroup.Group` to manage goroutine lifetimes.
- Prefer `sync.Mutex` over channels for simple state protection. Use channels for communication between goroutines.

## Testing

- Use table-driven tests for functions with multiple input/output cases.
- Test names should describe the scenario: `TestParseConfig_MissingFile`, `TestHandler_InvalidInput`.
- Use `t.Helper()` in test helper functions.
- Use `t.Parallel()` where tests are independent.
- Prefer stdlib `testing` over test frameworks unless the project already uses one.

## Struct Embedding

- Use embedding for composition, not for inheritance simulation.
- Be aware that embedding promotes all exported methods to the outer type's method set. Only embed when that promotion is intentional.

## General

- Follow [Effective Go](https://go.dev/doc/effective_go) and the [Go Proverbs](https://go-proverbs.github.io/).
- A little copying is better than a little dependency.
- Make the zero value useful.
- `defer` for cleanup. Keep `defer` close to the resource acquisition.
- Use guard clauses and early returns to reduce nesting.
# Git Workflow: Single Project Repo

## Branches and Environments

| Branch | Environment |
|---|---|
| `main` | Dev, Test, Stage, Production |

## Workflow

1. Create short-lived feature branches from `main`.
2. Open PRs targeting `main`.
3. Keep branches small and merge quickly after checks pass.
4. Deploy from `main`.

## Autodeploy

Commits pushed to designated branches trigger automatic deployment. Do not push directly to `main` — always use a PR.
# Branch Naming Conventions

Use a short descriptive summary as the branch name:

```
short-summary
```

Examples:
- `fix-login-bug`
- `add-retry-logic`

## Rules

- Use lowercase and hyphens in the summary portion.
- Keep the summary short — 2 to 4 words.
- Never include spaces or uppercase letters in branch names.
# Project Memory

Use `docs/memory/` to store lessons learned during development.

## What belongs here

Things that are NOT easily discoverable from the code or documentation alone:

- Gotchas and footguns
- Non-obvious configuration requirements
- Workarounds for known issues
- Decisions that were made and why
- Things that broke in surprising ways

## Where to write memories

- **Unirepo:** `docs/memory/<description>.md` in the project root.
- **Monorepo, project-specific lesson:** `{project}/docs/memory/<description>.md`.
- **Monorepo, root/cross-project lesson:** `docs/memory/<description>.md` in the repo root.

## Where to read memories

- **Unirepo:** Read all files in `docs/memory/`.
- **Monorepo:** Read all files in BOTH `docs/memory/` (root) AND `{project}/docs/memory/` for the project you are working in.

## How to use it

- **At the start of work:** Read all applicable memory files (see above) to benefit from past lessons.
- **During work:** When you discover something non-obvious, write it to a new memory file.
- **Sub-agents (developer, felix, etc.):** When you learn something worth remembering — a gotcha, a workaround, a non-obvious project behavior — write it to the appropriate `docs/memory/` location before finishing your task.
- **File format:** Markdown files with descriptive names (e.g., `docs/memory/postgres-connection-pooling-limits.md`).
- **Keep entries focused.** One topic per file. Be direct. State the problem, the cause, and the fix or workaround.

## What does NOT belong here

- Things obvious from reading the code
- Standard library or framework usage
- Information already in project documentation
- Temporary notes or TODOs
# Tool Usage

## Code Search

Use the `code_search` MCP tool to discover how projects and services communicate with each other. This is critical for understanding the downstream and upstream consequences of changes.

Before modifying any of the following, run `code_search` to find all affected services:

- API endpoints or request/response schemas
- Event schemas and message formats
- Shared contracts, interfaces, or types
- Inter-service communication (REST calls, queue messages, shared databases)

Do not assume you know the full blast radius of a change. Search first.

# Visual Verification for UI Changes

**Any change that affects user-visible UI must be visually verified before committing.** Unit tests and TypeScript checks are not sufficient — they do not catch layout overflow, misalignment, clipping, or styling regressions.

## When Required

- Adding or modifying components that render to the DOM
- Changing styles, spacing, padding, or layout
- Adding icons, buttons, or interactive elements
- Modifying dropdowns, modals, tooltips, or popovers
- Dark mode styling changes
- Responsive layout changes

## How to Verify

1. **Take a screenshot** using the `qa-explorer` agent or screenshot skill
2. **Review the screenshot yourself** — do not rely solely on the agent's textual report
3. **Check all states**: hover, active, disabled, loading, error, empty
4. **Check edge cases**: long text, many items, small viewports, both light and dark themes

## What to Look For

- Text truncation or overflow
- Elements bleeding outside containers
- Misaligned icons or buttons
- Broken spacing or padding
- Contrast issues in dark mode
- Clipped content at viewport edges

**Do not skip visual verification.** A screenshot takes seconds; fixing a bug reported by a user after deployment takes much longer.
