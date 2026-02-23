# Global Agent Guardrails

## Protected System Resources

> ⛔ **CRITICAL: Never access protected macOS resources**
>
> Do NOT access anything that would trigger a macOS permission prompt.
> These operations block automated workflows and require user intervention.

**Never access:**
- `~/Desktop/`, `~/Documents/`, `~/Downloads/`
- `~/Library/`
- Contacts, Calendar, Reminders, Photos, Mail
- Screen recording or accessibility APIs
- Other applications via AppleScript/osascript
- Clipboard (`pbcopy`/`pbpaste`) in automated scripts
- Keychain or credential stores
- System notifications

**Safe alternatives:**
- Store files in the project directory or `.tmp/`
- Use environment variables for secrets
- Write output to files instead of clipboard
- Log to files instead of system notifications

If a command requires system access, stop and tell the user to run it manually.

## Temporary Files

> ⛔ **CRITICAL: Never use system temp directories**
>
> Do NOT write to `/tmp/`, `/var/folders/`, or any system temporary directory.

Use project-local `.tmp/` for temporary artifacts.

Rules:
- Use `.tmp/` in the project root for all temporary files
- Create subdirectories as needed (`.tmp/screenshots/`, `.tmp/logs/`)
- Ensure `.tmp/` is listed in `.gitignore`
- Clean up temp files when no longer needed

## Global Coding Behavior

- Do not over-comment; add comments only for non-obvious logic
- Exported functions/classes must include language-standard doc comments
- When using external libraries, use a documentation lookup tool if available
- If a docs tool is not available, use primary upstream docs and project source references as fallback

## AWS CLI Sessions

If a command fails due to expired AWS credentials or requires `aws sso login`, stop and tell the user to refresh credentials manually.

## Project Memory

Use `docs/memory/` to capture non-obvious lessons:
- gotchas/footguns
- hidden config constraints
- workarounds and rationale

Do not store obvious code facts, temporary notes, or duplicate docs.

## Cross-Service Blast Radius Checks

Before changing APIs, message schemas, shared contracts, or inter-service integrations:
- Use semantic code search tooling if configured
- If unavailable, fall back to repository-native search (`grep`, project indexes, dependency maps)
- Do not assume blast radius; verify it

## Visual Verification for UI Changes

Any user-visible UI change must be visually verified before committing.

Minimum checks:
1. Capture a screenshot (qa-explorer or screenshot workflow)
2. Review result directly
3. Check key states (hover/active/disabled/loading/error/empty)
4. Check edge cases (long text, dense data, small viewports)

## Instruction Ownership

This root file defines universal guardrails only.

- Specialist implementation rules belong to implementation agents/templates
- Specialist review criteria belong to critic agents
- Project-specific behavior belongs in each project's `docs/CONVENTIONS.md`
