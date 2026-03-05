# Configure Architecture-Aware Verification & Auth Acquisition

This update ensures every project has proper authentication acquisition configured and desktop/Electron apps have correct `webContent` settings for automated verification.

## What to do

This is an **interactive update**. Builder reviews each project's current setup, asks targeted questions, and writes configuration. This is NOT informational — Builder must actively configure every project.

### Step 1: Review current authentication config

Read `docs/project.json` → `authentication`:

- If `authentication` is missing entirely → Run `setup-auth` skill (Step 2)
- If `authentication` exists but `acquisition` is missing → Go to Step 3
- If `authentication.acquisition` exists → Validate it (Step 4)

### Step 2: Run setup-auth if no auth config exists

Load the `setup-auth` skill and run the full wizard, including the new CLI auth and acquisition steps (Steps 6b and 6c in the wizard).

After wizard completes, continue to Step 4.

### Step 3: Configure acquisition (interactive)

If `authentication` exists but `acquisition` is missing, ask the user:

```
═══════════════════════════════════════════════════════════════════════
                AUTH ACQUISITION CONFIGURATION
═══════════════════════════════════════════════════════════════════════

Your project has authentication configured, but agents don't know how
to get an authenticated session when automated methods fail.

1. Does this project have a CLI command for getting test auth tokens?

   A. Yes — I have a CLI/script that outputs tokens
   B. No — use standard auth flow only

> _
═══════════════════════════════════════════════════════════════════════
```

**If A (CLI available):**

```
Configure the CLI auth command:

  Command: ____________
  (e.g., pnpm cli auth:test-token --email $TEST_EMAIL)

  Output format?
    1. JSON   2. Plain text   3. KEY=VALUE

  Token field path (for JSON): ____________
  Where does the app store the session?
    1. Cookies   2. localStorage   3. Both
```

Write `authentication.headless` with `method: "cli"` and the collected values.

**Then, regardless of A or B, ask:**

```
═══════════════════════════════════════════════════════════════════════
                AUTH ACQUISITION STEPS
═══════════════════════════════════════════════════════════════════════

Describe step-by-step how an agent should get an authenticated session:

  Summary: ____________
  Steps (one per line):
    1. ____________
    2. ____________
    3. ____________

  Fall back to UI login if this fails? (Y/n)
  Notes/gotchas: ____________
═══════════════════════════════════════════════════════════════════════
```

Write `authentication.acquisition` with collected values.

### Step 4: Validate acquisition config

Run:

```bash
jq '.authentication.acquisition' docs/project.json
```

Verify:
- `description` is a non-empty string
- `steps` is a non-empty array
- `fallbackToUI` is set

### Step 5: Review apps[] for desktop projects

Read `docs/project.json` → `apps[]`:

- If no `apps[]` or all apps are `type: "web"` → Skip to Step 7
- If any app has `type: "desktop"` → Continue to Step 6

### Step 6: Configure webContent for desktop apps (interactive)

For each desktop app missing `webContent`:

```
═══════════════════════════════════════════════════════════════════════
                APP ARCHITECTURE: {app.name}
═══════════════════════════════════════════════════════════════════════

Your desktop app "{app.name}" (framework: {app.framework}) needs
webContent configuration so Builder knows how to verify changes.

During development, does this app:

  A. Load bundled files from disk (code changes need a full rebuild)
  B. Connect to a dev server (like Vite) with HMR (code changes appear
     instantly, but the Electron shell still needs to be running)
  C. Hybrid — some content is bundled, some comes from a dev server

> _
═══════════════════════════════════════════════════════════════════════
```

| Answer | webContent value | Verification behavior |
|--------|------------------|----------------------|
| A | `"bundled"` | Rebuild → relaunch Electron → Playwright-Electron verify |
| B | `"remote"` | Ensure Electron running → Playwright-Electron verify (no rebuild) |
| C | `"hybrid"` | Rebuild → relaunch Electron → Playwright-Electron verify |

Write `apps[].webContent` for each desktop app.

**Then ask:**

```
Does this project need custom verification steps beyond what
auto-inference provides?

  A. No — auto-inference is fine (recommended)
  B. Yes — I need custom steps

> _
```

If B, collect `postChangeWorkflow` steps and write to `project.json`.

### Step 7: Report what was configured

```
═══════════════════════════════════════════════════════════════════════
            VERIFICATION CONFIGURATION COMPLETE
═══════════════════════════════════════════════════════════════════════

Configured:
  ✅ authentication.acquisition — agent-readable auth steps
  ✅ authentication.headless.method: "cli" — CLI token generation
  ✅ apps[0].webContent: "remote" — desktop verification strategy

Verification pipeline for this project:
  typecheck → lint → unit tests → [ensure Electron running] →
  Playwright-Electron verification

═══════════════════════════════════════════════════════════════════════
```

## Files affected

- `docs/project.json`

## Why

Builder needs to verify code changes actually work in the running application before committing. This requires:

1. **Auth acquisition** — Playwright can't verify authenticated UI without logging in. Every project needs documented auth steps, whether automated (CLI) or manual (agent-readable steps).

2. **App architecture awareness** — Desktop/Electron apps require different verification than web apps. `webContent` tells Builder whether to rebuild+relaunch (bundled) or just ensure the Electron process is running (remote/HMR).

Without this configuration, Builder either skips verification entirely or attempts browser-based verification on Electron-only apps (which doesn't work).

## Verification

```bash
# Auth acquisition configured
jq '.authentication.acquisition.steps | length' docs/project.json
# Expected: > 0

# For desktop apps: webContent configured
jq '.apps[] | select(.type == "desktop") | .webContent' docs/project.json
# Expected: "bundled", "remote", or "hybrid" for each desktop app

# Optional: CLI headless method
jq '.authentication.headless.method' docs/project.json
# Expected: "cli" (if project has CLI auth), or existing method
```
