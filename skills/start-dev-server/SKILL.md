---
name: start-dev-server
description: "Start the development server for a project and wait for it to be ready. Use when you need to run the dev server for building, testing, or verification. Triggers on: start dev server, start server, run dev, npm run dev, start development server."
---

# Start Development Server

> Load this skill when: you need to start a project's development server to run builds, tests, or verify changes.

## Overview

This skill starts the project's dev server(s) using configuration from `project.json` and `projects.json`, then waits for all services to be ready before returning.

**Why use this skill:** Saves tokens by handling server startup automatically instead of Builder figuring out the process each time.

## Input

When invoking this skill, provide:
- **projectPath**: Absolute path to the project root (e.g., `/Users/markmagnuson/code/my-project`)

## Steps

### Step 0: Check for Local Runtime Capability

Before doing anything else, check if this project can run locally:

```bash
# Check if devPort is null in projects.json
DEV_PORT=$(cat ~/.config/opencode/projects.json | jq -r '.projects[] | select(.path == "'"$projectPath"'") | .devPort')

if [ "$DEV_PORT" = "null" ]; then
  echo "⏭️  Skipping dev server: Project has no local runtime (devPort: null)"
  exit 0
fi
```

**If devPort is null:** This project cannot run locally (e.g., remote-only codebase, library, or cloud-native app without local dev). Skip all subsequent steps and return immediately.

### Step 1: Load Project Configuration

Read configuration from both sources:

```bash
# Get dev port from projects.json (fallback for single-port projects)
cat ~/.config/opencode/projects.json | jq '.projects[] | select(.path == "'"$projectPath"'") | {id, devPort}'

# Get dev command and server config from project.json
cat "$projectPath/docs/project.json" | jq '{commands: .commands, devServer: .devServer, environments: .environments}'
```

**Extract (priority order):**
1. **Multi-service (preferred):** `environments.development.services[]` — array of services with ports
2. **Single port fallback:** `devPort` from projects.json + `commands.dev`
3. **Single service fallback:** `devServer.port` + `commands.dev`

### Step 2: Determine Services to Start

**If `environments.development.services` exists:**
- Use each service's `port` and optionally `command`
- If `primaryService` is set, use that for default health check
- Otherwise use the first service

**If no services array, fallback:**
- Use `devPort` from projects.json (per-app default port)
- Use `commands.dev` as the command

### Step 3: Ensure Dependencies Are Installed (AUTOMATIC)

> ⚠️ **CRITICAL: Do NOT ask for permission.** If dependencies are missing, install them automatically.
> This step exists because different AI models handle missing dependencies inconsistently.
> The correct behavior is: detect → install → continue. No confirmation needed.

Before starting the server, verify dependencies are installed:

```bash
cd "$projectPath"

# Detect package manager (check lock files)
if [ -f "pnpm-lock.yaml" ]; then
  PKG_MGR="pnpm"
  INSTALL_CMD="pnpm install"
elif [ -f "yarn.lock" ]; then
  PKG_MGR="yarn"
  INSTALL_CMD="yarn install"
elif [ -f "bun.lockb" ]; then
  PKG_MGR="bun"
  INSTALL_CMD="bun install"
elif [ -f "package-lock.json" ] || [ -f "package.json" ]; then
  PKG_MGR="npm"
  INSTALL_CMD="npm install"
else
  PKG_MGR=""
fi

# Check if node_modules exists and has content
if [ -n "$PKG_MGR" ]; then
  if [ ! -d "node_modules" ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
    echo "Dependencies missing, running $INSTALL_CMD..."
    $INSTALL_CMD
    if [ $? -ne 0 ]; then
      echo "ERROR: $INSTALL_CMD failed"
      exit 1
    fi
    echo "Dependencies installed successfully"
  fi
fi
```

**Why automatic?** When a dev server fails with "command not found" (e.g., `next: command not found`), it means dependencies aren't installed. Asking the user adds friction and breaks autonomous workflows. Just install them.

**What this handles:**
- Fresh clones (no `node_modules/`)
- Corrupted `node_modules/` (empty directory)
- Switches between branches with different dependencies

### Step 4: Kill Existing Processes on Ports (Avoid Conflicts)

Before starting, check if ports are in use and kill existing processes:

```bash
# For each service port, check if in use and kill
for port in $ports; do
  PID=$(lsof -t -i:$port 2>/dev/null)
  if [ -n "$PID" ]; then
    echo "Port $port in use by PID $PID, killing..."
    kill -9 $PID 2>/dev/null
    sleep 1
  fi
done
```

**Note:** This prevents the "port in use" error you encountered.

### Step 5: Start the Dev Server(s)

```bash
cd "$projectPath"

# Create .tmp directory for PID files
mkdir -p "$projectPath/.tmp"

# Start each service in background
for service in $services; do
  # Set environment variables if configured
  if [ -n "$envVars" ]; then
    for key in "${!envVars[@]}"; do
      export $key="${envVars[$key]}"
    done
  fi
  
  # Start service in background
  eval "$serviceCommand" &
  SERVICE_PID=$!
  
  # Store PID (append for multiple services)
  echo "$service:$SERVICE_PID" >> "$projectPath/.tmp/dev-server.pids"
  echo "Started $service on port $servicePort (PID: $SERVICE_PID)"
done
```

**Note:** Use `.tmp/` subdirectory (create if needed) to store PID files. This directory is gitignored and safe for temp files.

### Step 6: Wait for Server Readiness

```bash
# Wait for each service to be ready
for service in $services; do
  SERVICE_PORT=${servicePorts[$service]}
  HEALTH_PATH=${serviceHealthPaths[$service]:-}
  HEALTH_CHECK_URL="http://localhost:$SERVICE_PORT${HEALTH_PATH:-/}"
  
  START_TIME=$(date +%s)
  TIMEOUT_MS=${startupTimeout:-30000}
  ELAPSED=0
  
  while [ $ELAPSED -lt $TIMEOUT_MS ]; do
    # Check if server process is still running
    SERVICE_PID=$(grep "^$service:" "$projectPath/.tmp/dev-server.pids" | cut -d: -f2)
    if [ -n "$SERVICE_PID" ] && ! kill -0 $SERVICE_PID 2>/dev/null; then
      echo "ERROR: $service process terminated unexpectedly"
      exit 1
    fi
    
    # Try health check
    if curl -sf --max-time 2 "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
      echo "$service ready at http://localhost:$SERVICE_PORT"
      break
    fi
    
    sleep 1
    ELAPSED=$((($(date +%s) - START_TIME) * 1000))
  done
  
  if [ $ELAPSED -ge $TIMEOUT_MS ]; then
    echo "ERROR: $service failed to become ready within ${TIMEOUT_MS}ms"
    # Important: Kill the orphaned background process before exiting
    if [ -f "$projectPath/.tmp/dev-server.pids" ]; then
      while IFS=: read -r svc pid; do
        if [ -n "$pid" ]; then
          kill $pid 2>/dev/null
          echo "Killed orphaned $svc (PID: $pid)"
        fi
      done < "$projectPath/.tmp/dev-server.pids"
      rm "$projectPath/.tmp/dev-server.pids"
    fi
    exit 1
  fi
done
```

> ⚠️ **On timeout or failure, ALWAYS kill background processes.**
> The code above shows killing PIDs before exit. Without this, `node` processes remain orphaned and consume CPU indefinitely.
> **Check:** After failure, verify no orphaned processes with `lsof -i:$PORT`. **Stop** if processes remain.

### Step 7: Return Result

On success, output:
```
Dev servers ready:
- web: http://localhost:<port>
- api: http://localhost:<api-port>
```

On failure, output the error and exit with code 1.

## Cleanup (When Done)

When you're done using the dev server(s):

```bash
# Kill all server processes
if [ -f "$projectPath/.tmp/dev-server.pids" ]; then
  while IFS=: read -r service pid; do
    if [ -n "$pid" ]; then
      kill $pid 2>/dev/null
      echo "Killed $service (PID: $pid)"
    fi
  done < "$projectPath/.tmp/dev-server.pids"
  rm "$projectPath/.tmp/dev-server.pids"
fi
```

## Configuration Reference

### project.json fields (preferred - multi-service)

| Field | Type | Description |
|-------|------|-------------|
| `environments.development.services[]` | array | List of services (web, api, worker) |
| `environments.development.services[].name` | string | Service name (e.g., "web", "api") |
| `environments.development.services[].port` | integer | Port for this service |
| `environments.development.services[].command` | string | Optional: command to start (e.g., "npm run dev:api") |
| `environments.development.services[].healthCheck` | string | Optional: health check path |
| `environments.development.primaryService` | string | Primary service name |
| `environments.development.databaseUrl` | string | DB connection string |
| `devServer.startupTimeout` | integer | Max wait time in ms (default: 30000) |
| `devServer.env` | object | Env vars to set |

### project.json fields (fallback - single service)

| Field | Type | Description |
|-------|------|-------------|
| `commands.dev` | string | Command to start dev server |
| `devServer.port` | integer | Dev server port |
| `devServer.healthCheck` | string | Health check path |
| `devServer.startupTimeout` | integer | Max wait time in ms |
| `devServer.env` | object | Env vars to set |

### projects.json fields

| Field | Type | Description |
|-------|------|-------------|
| `projects[].devPort` | integer | Fallback dev port (single-app projects) |

## Example

### Input
- projectPath: `/Users/markmagnuson/code/my-app`

### Step 1: Load config
```json
{
  "id": "my-app",
  "devPort": 3001
}

{
  "environments": {
    "development": {
      "host": "local",
      "services": [
        {"name": "web", "port": 3001, "command": "npm run dev:web"},
        {"name": "api", "port": 4105, "command": "npm run dev:api", "healthCheck": "/api/health"}
      ],
      "primaryService": "web"
    }
  },
  "devServer": {
    "startupTimeout": 45000,
    "env": {"NODE_ENV": "development"}
  }
}
```

### Step 2: Determine services
```
services: web:3001, api:4105
primary: web
```

### Step 3: Ensure dependencies
```
Dependencies installed successfully (or already present)
```

### Step 4: Kill existing on ports 3001, 4105

### Step 5: Start servers
```
Started web on port 3001 (PID: 12345)
Started api on port 4105 (PID: 12346)
```

### Step 6: Wait for ready
```
web ready at http://localhost:3001
api ready at http://localhost:4105/api/health
```

### Output
```
Dev servers ready:
- web: http://localhost:3001
- api: http://localhost:4105
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| "command not found" (e.g., `next`, `vite`) | Dependencies not installed | Step 3 auto-installs; if still failing, check package.json |
| "npm install failed" | Network or package issues | Check npm registry access, clear cache with `npm cache clean --force` |
| "Port X in use" | Another process using the port | Kill existing process or change port in project.json |
| "commands.dev not found" | No dev command configured | Add `commands.dev` or `services[].command` to project.json |
| "Dev server failed to become ready" | Server didn't respond to health check within timeout | Cleanup kills orphaned processes automatically; check logs at `.tmp/dev-server.log` |
| "Process terminated unexpectedly" | Server crashed on startup | Check terminal output for errors |
| Orphaned node processes after failure | Old bug: cleanup wasn't called on timeout | Fixed: Step 6 now kills PIDs before exit on failure |
