# Add Electron Execution Path to test-e2e-flow Skill

When a project has `architecture.deployment: "electron-only"` or `apps.*.framework: "electron"` with `apps.*.testing.framework: "playwright-electron"`, the E2E test execution flow must use the Electron-specific Playwright config and launch pattern instead of the browser-oriented default.

## What to do

Update `~/.config/opencode/skills/test-e2e-flow/SKILL.md` to add an Electron execution branch.

### 1. Add a new section after "## Running E2E Tests" → "### Step 0: Detect Execution Mode"

Insert this before the existing "Step 1: Resolve Test Base URL":

```markdown
### Step 0: Detect Execution Mode (MANDATORY)

Before running any E2E tests, determine if this project uses Electron or browser-based testing:

\`\`\`bash
# Check for Electron-only architecture
DEPLOYMENT=$(jq -r '.architecture.deployment // empty' docs/project.json)
ELECTRON_APP=$(jq -r '.apps | to_entries[] | select(.value.framework == "electron") | .key' docs/project.json 2>/dev/null)
ELECTRON_TESTING=$(jq -r '.apps | to_entries[] | select(.value.testing.framework == "playwright-electron") | .value.testing' docs/project.json 2>/dev/null)

if [ "$DEPLOYMENT" = "electron-only" ] || [ -n "$ELECTRON_APP" ]; then
  echo "ELECTRON_MODE=true"
  # Extract Electron-specific config
  TEST_DIR=$(jq -r '.apps | to_entries[] | select(.value.framework == "electron") | .value.testing.testDir // "e2e/desktop"' docs/project.json)
  EXEC_PATH=$(jq -r '.apps | to_entries[] | select(.value.framework == "electron") | .value.testing.executablePath.macos // empty' docs/project.json)
  
  # Look for Electron Playwright config
  ELECTRON_CONFIG=""
  for cfg in playwright.electron.config.ts e2e/playwright.electron.config.ts e2e/desktop/playwright.config.ts; do
    if [ -f "$cfg" ]; then
      ELECTRON_CONFIG="$cfg"
      break
    fi
  done
else
  echo "ELECTRON_MODE=false"
fi
\`\`\`

**If ELECTRON_MODE=true:**
- Skip Steps 1 and 2 (no base URL or dev server needed — Electron launches the app directly)
- Jump to **Step 3E: Run Electron Tests** (below)
- Load the `e2e-electron` skill for test writing patterns

**If ELECTRON_MODE=false:**
- Continue with existing Steps 1, 2, 3 (browser flow)
```

### 2. Add a new "Step 3E: Run Electron Tests" section after the existing Step 3

Insert this after the existing "### Step 3: Run Tests":

```markdown
### Step 3E: Run Electron Tests (Electron Mode Only)

> This step replaces Steps 1-3 when ELECTRON_MODE=true.

\`\`\`bash
# Use Electron config if found, otherwise default
if [ -n "$ELECTRON_CONFIG" ]; then
  npx playwright test --config="$ELECTRON_CONFIG" --reporter=list [list of test files]
else
  # Fallback: run from Electron test directory
  npx playwright test --reporter=list "$TEST_DIR"/**/*.spec.ts
fi
\`\`\`

**Key differences from browser mode:**
- No `TEST_BASE_URL` needed — Electron app launches directly via `_electron.launch()`
- No dev server check — the Electron app IS the server
- Workers must be 1 (`--workers=1`) — Electron tests cannot parallelize
- Timeout should be 60s+ (Electron apps take longer to start)
- Global setup should kill zombie Electron processes (see `e2e-electron` skill)

**If executablePath is configured in project.json:**
\`\`\`bash
# Pass to tests via environment variable
export ELECTRON_EXECUTABLE_PATH="$EXEC_PATH"
npx playwright test --config="$ELECTRON_CONFIG" --workers=1 --reporter=list
\`\`\`
```

### 3. Update the "Playwright Config: No webServer" section

Add a note at the top:

```markdown
> ⚠️ **Electron projects:** Do NOT use the browser config below. Electron tests use `_electron.launch()` 
> instead of `baseURL`. See the `e2e-electron` skill for the correct Playwright config pattern.
```

### 4. Update the Deferred E2E Test Flow

In "Step 0: Check for Local Runtime", add Electron awareness:

```markdown
# Electron apps don't need devPort — they launch directly
DEPLOYMENT=$(jq -r '.architecture.deployment // empty' docs/project.json)
if [ "$DEPLOYMENT" = "electron-only" ]; then
  echo "✅ Electron-only project — no devPort needed for E2E"
else
  DEV_PORT=$(jq -r '.projects[] | select(.path == "'"$(pwd)"'") | .devPort' ~/.config/opencode/projects.json)
  if [ "$DEV_PORT" = "null" ]; then
    echo "⏭️  Cannot run E2E tests: Project has no local runtime (devPort: null)"
  fi
fi
```

## Files affected

- `~/.config/opencode/skills/test-e2e-flow/SKILL.md`

## Why

The `test-e2e-flow` skill currently has **zero awareness of Electron testing**:
- It always resolves a `TEST_BASE_URL` (Electron doesn't use one)
- It always checks for a dev server (Electron launches the app directly)
- It runs `npx playwright test` without specifying a config file (picks up browser config)
- It never reads `architecture.deployment` or `apps.*.testing.framework`

This causes Builder agents to run E2E tests in Chromium browser mode for Electron-only projects, which was the root cause of a recent failed Builder session on the Helm ADE project.

The `e2e-electron` skill exists with correct Electron patterns, and `skill-mapping.json` correctly maps Electron projects to it. But the **execution** skill (`test-e2e-flow`) never routes to the Electron path — it's the missing bridge between detection and execution.

## Verification

After applying this update, verify:

1. The skill file contains "Step 0: Detect Execution Mode" before the existing Step 1
2. The skill file contains "Step 3E: Run Electron Tests"
3. `grep -c "electron" ~/.config/opencode/skills/test-e2e-flow/SKILL.md` returns > 10 (currently 0)
4. `grep "architecture.deployment" ~/.config/opencode/skills/test-e2e-flow/SKILL.md` returns at least 2 matches
