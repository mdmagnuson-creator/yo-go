---
name: start-dev-server
description: "Start the development server for a project and wait for it to be ready. Use when you need to run the dev server for building, testing, or verification. Triggers on: start dev server, start server, run dev, npm run dev, start development server."
---

# Start Development Server

> Load this skill when: you need to start a project's development server to run builds, tests, or verify changes.

## Overview

This skill starts the project's dev server using configuration from `project.json` and `projects.json`, then waits for the server to be ready before returning.

**Why use this skill:** Saves tokens by handling server startup automatically instead of Builder figuring out the process each time.

## Input

When invoking this skill, provide:
- **projectPath**: Absolute path to the project root (e.g., `/Users/markmagnuson/code/my-project`)

## Steps

### Step 1: Load Project Configuration

Read both configuration sources:

```bash
# Get dev port from projects.json
cat ~/.config/opencode/projects.json | jq '.projects[] | select(.path == "'"$projectPath"'") | {id, devPort}'

# Get dev command and server config from project.json
cat "$projectPath/docs/project.json" | jq '{commands: .commands, devServer: .devServer}'
```

**Extract:**
- `devPort` — from projects.json
- `commands.dev` — the dev command (e.g., "npm run dev")
- `devServer.healthCheck` — health check path (e.g., "/api/health")
- `devServer.startupTimeout` — timeout in ms (default 30000)
- `devServer.env` — environment variables to set

### Step 2: Build the Health Check URL

```bash
HEALTH_CHECK_URL="http://localhost:$devPort${healthCheckPath}"
```

- If `healthCheckPath` is empty or missing, use `/` as default
- Ensure path starts with `/`

### Step 3: Start the Dev Server

```bash
cd "$projectPath"

# Set environment variables if configured
EOF_ENV=$(cat << 'ENVEOF'
$(for key in "${!envVars[@]}"; do echo "export $key=\"${envVars[$key]}\""; done)
ENVEOF
)

# Start server in background, capturing PID
eval "$EOF_ENV $devCommand" &
DEV_SERVER_PID=$!

# Store PID for later cleanup
echo $DEV_SERVER_PID > "$projectPath/.tmp/dev-server.pid"
```

**Note:** Use `.tmp/` subdirectory (create if needed) to store the PID file. This directory is gitignored and safe for temp files.

### Step 4: Wait for Server Readiness

```bash
START_TIME=$(date +%s)
TIMEOUT_MS=${startupTimeout:-30000}
ELAPSED=0

while [ $ELAPSED -lt $TIMEOUT_MS ]; do
  # Check if server process is still running
  if ! kill -0 $DEV_SERVER_PID 2>/dev/null; then
    echo "ERROR: Dev server process terminated unexpectedly"
    exit 1
  fi
  
  # Try health check
  if curl -sf --max-time 2 "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
    echo "Dev server ready at http://localhost:$devPort"
    exit 0
  fi
  
  sleep 1
  ELAPSED=$((($(date +%s) - START_TIME) * 1000))
done

echo "ERROR: Dev server failed to become ready within ${TIMEOUT_MS}ms"
kill $DEV_SERVER_PID 2>/dev/null
exit 1
```

### Step 5: Return Result

On success, output:
```
Dev server running at http://localhost:<port>
PID: <pid>
```

On failure, output the error and exit with code 1.

## Cleanup (When Done)

When you're done using the dev server:

```bash
# Kill the server process
if [ -f "$projectPath/.tmp/dev-server.pid" ]; then
  PID=$(cat "$projectPath/.tmp/dev-server.pid")
  kill $PID 2>/dev/null
  rm "$projectPath/.tmp/dev-server.pid"
fi
```

## Configuration Reference

### project.json fields

| Field | Type | Description |
|-------|------|-------------|
| `commands.dev` | string | Command to start dev server (e.g., "npm run dev") |
| `devServer.healthCheck` | string | URL path to check readiness (e.g., "/api/health") |
| `devServer.startupTimeout` | integer | Max wait time in ms (default: 30000) |
| `devServer.env` | object | Env vars to set (e.g., `{"DISABLE_RATE_LIMIT": "true"}`) |

### projects.json fields

| Field | Type | Description |
|-------|------|-------------|
| `projects[].devPort` | integer | Development server port |

## Example

### Input
- projectPath: `/Users/markmagnuson/code/my-app`

### Step 1: Load config
```bash
# From projects.json
{"id": "my-app", "devPort": 3001}

# From project.json
{
  "commands": {"dev": "npm run dev"},
  "devServer": {
    "healthCheck": "/api/health",
    "startupTimeout": 45000,
    "env": {"NODE_ENV": "development", "DEBUG": "true"}
  }
}
```

### Step 2: Build URL
```
HEALTH_CHECK_URL=http://localhost:3001/api/health
```

### Step 3: Start server
```bash
export NODE_ENV=development
export DEBUG=true
npm run dev &
DEV_SERVER_PID=$!
```

### Step 4: Wait for ready
```
# curl http://localhost:3001/api/health succeeds
Dev server ready at http://localhost:3001
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| "commands.dev not found" | project.json missing dev command | Check project.json has `commands.dev` configured |
| "devPort not found" | Project not in projects.json | Project must be registered via @planner |
| "Dev server failed to become ready" | Server didn't respond to health check | Check `devServer.healthCheck` is correct |
| "Process terminated unexpectedly" | Server crashed on startup | Check terminal output for errors |
