---
name: session-monitor
description: "Monitor an active Helm session by tailing the debug log file. Provides real-time observability of session state, user actions, agent tool calls, errors, and token usage. Use when the user asks to monitor or watch a session. Triggers on: monitor session, watch session, check session, tail logs, session status, how's the session going."
---

# Session Monitor Skill

> Load this skill when: the user asks to monitor, watch, or check on an active Helm session. Provides real-time observability by tailing `[UI]` and `[COMMAND]` debug logs.

## Overview

Builder has no native way to observe what Helm is displaying during an active session. This skill enables Builder to tail the Helm debug log file in a polling loop, parse structured log lines from two categories — `[UI]` (agent/session state) and `[COMMAND]` (user actions) — and maintain a complete mental model of what's happening. Together these two streams provide near-total observability: what the user is doing and what the AI agent is doing in response.

### Two Log Streams

| Stream | Category | What it captures |
|--------|----------|-----------------|
| **Agent state** | `[UI]` | Messages, tool calls, tokens, errors, session busy/idle — the AI side |
| **User actions** | `[COMMAND]` | Navigation, task CRUD, PRD edits, panel toggles, model/agent picks — the human side |

Almost every user interaction in Helm goes through the command dispatch system and is automatically logged. The only notable exception is **search queries** (which bypass commands and call `SearchManager` directly).

---

## Log Event Reference

### `[UI]` Events — Agent & Session State

| Log Action | Description |
|-----------|-------------|
| `session.busy` | Session started processing |
| `session.idle` | Session finished processing (includes `totalMessages`) |
| `session.idle.global` | All sessions idle (includes `clearedSessions`) |
| `turn.completed` | A conversation turn finished (includes `durationMs`) |
| `message.new` | New message created (includes `role`, `msgId`) |
| `message.streaming.start` | First token of streaming response received |
| `message.finished` | Message complete (includes `finish` reason, `contentLen`) |
| `tool.started` | Tool call began (includes `tool` name, `callId`) |
| `tool.completed` | Tool call finished (includes `tool`, `callId`, `status`) |
| `activity.changed` | Status bar phrase changed (includes `phrase`) |
| `activity.cleared` | Status bar cleared |
| `error.received` | Session error displayed (includes `message`) |
| `error.tokenLimit` | Token limit hit, compaction triggered |
| `tokens.updated` | Token counts updated (includes `total`, `input`, `output`) |
| `thread.titleChanged` | Thread title changed (includes `title`) |
| `diff.loaded` | File diffs loaded (includes `fileCount`, `additions`, `deletions`) |
| `session-deleted-received` | Session was deleted by server or another client |

#### `[UI]` Log Format

```
[2026-04-11 14:32:15.123] [INFO] [UI] action details session=12345678 thread=a1b2c3d4
```

- **Timestamp:** `[YYYY-MM-DD HH:mm:ss.SSS]`
- **Level:** always `[INFO]`
- **Category:** always `[UI]`
- **Action:** dot-separated (e.g., `message.new`, `tool.started`)
- **Details:** key=value pairs, strings quoted (e.g., `role=assistant`, `phrase="reading file"`)
- **Session ID:** `session=XXXXXXXX` — opencode serve session ID, truncated to 8 chars
- **Thread ID:** `thread=XXXXXXXX` — first 8 chars of Helm thread UUID (optional, present when `activeThreadId` is set)

### `[COMMAND]` Events — User Actions

Every user action routed through Helm's command dispatch system produces a DISPATCH/RESULT pair.

#### Command Categories & Actions

| Category | Command IDs | What the user is doing |
|----------|-------------|----------------------|
| **Navigation** | `nav.toTask`, `nav.toPRD`, `nav.toStory`, `nav.toSession` | Clicking items in sidebar |
| **Projects** | `project.select`, `project.selectByPosition`, `project.next`, `project.previous` | Switching projects |
| **Organizations** | `org.select` | Switching organizations |
| **Layout** | `layout.toggleNotes`, `layout.toggleAssistant`, `layout.toggleTasks`, `layout.toggleSession`, `layout.toggleDiff`, `layout.toggleProjectSettings`, `layout.zoomIn`, `layout.zoomOut`, `layout.zoomReset` | Opening/closing panels, zooming |
| **Tasks** | `task.create`, `task.openCreation`, `task.delete`, `task.saveTitle`, `task.saveDescription`, `task.changeStatus`, `task.assign` | Creating, editing, managing tasks |
| **PRDs/Specs** | `prd.create`, `prd.createFromDescription`, `prd.archive`, `prd.unarchive`, `prd.markReady`, `prd.changeStatus`, `prd.updateTitle` | Creating, editing, managing PRDs |
| **Sessions** | `session.start`, `session.switchTo` | Starting/switching Build sessions |
| **Threads** | `thread.markReadyForReview`, `thread.approvePlan`, `thread.startBuildSession` | Thread lifecycle actions |
| **Model/Agent** | `model.select`, `agent.select` | Picking AI model or agent |
| **Settings** | `settings.openSettings`, `settings.saveOrgName`, `settings.linkGitHub`, `projectSettings.*` | Changing app/project settings |
| **App** | `app.signOut` | Sign out |

#### `[COMMAND]` Log Format

**DISPATCH** (user initiated an action):
```
[2026-04-12 10:15:45.123] [DEBUG] [COMMAND] DISPATCH task.create category=tasks org=<uuid> project=<uuid> view=chat authenticated=true activeSession=true params={title:"Fix header bug"}
```

**RESULT** (action completed):
```
[2026-04-12 10:15:45.789] [DEBUG] [COMMAND] RESULT task.create result=success durationMs=666
[2026-04-12 10:16:01.245] [ERROR] [COMMAND] RESULT tab.close result=failure durationMs=11 error="Cannot close last tab"
```

**VALIDATION_FAILED** (action blocked):
```
[2026-04-12 10:16:10.500] [WARN] [COMMAND] VALIDATION_FAILED project.delete reason="Missing required context: currentRepoId"
```

**UNDO** (user undid an action):
```
[2026-04-12 10:16:20.100] [INFO] [COMMAND] UNDO tab.close title="Close Tab" result=success
```

#### Key Fields

| Field | Description |
|-------|-------------|
| `DISPATCH` / `RESULT` / `VALIDATION_FAILED` / `UNDO` | Action type |
| Command ID (e.g., `task.create`) | Which command — tells you exactly what the user did |
| `category=` | Command category (navigation, tasks, session, etc.) |
| `result=` | `success`, `failure`, `needsConfirmation`, `undoData` |
| `durationMs=` | How long the command took |
| `params={...}` | Command parameters (e.g., task title, model name) |
| `error="..."` | Error description on failure |
| `reason="..."` | Why validation failed |

### What's NOT Logged

| Action | Why | Workaround |
|--------|-----|-----------|
| **Search queries** | Bypasses command system, calls `SearchManager` directly | None — invisible to monitor |
| **Bulk task operations** | `TaskListViewModel` calls store directly for multi-select | Individual task commands still logged |
| **Scrolling** | Not a discrete action | N/A |
| **Copy/paste** | OS-level, not app command | N/A |

### Log File Location

```
~/Library/Application Support/Helm-DEV/logs/helm-debug-YYYY-MM-DD.log   (Debug builds)
~/Library/Application Support/Helm/logs/helm-debug-YYYY-MM-DD.log        (Release builds)
```

Path is deterministic given the date. One file per day. No size limit.

---

## Workflow

### Phase 1: Locate Log File

Find today's debug log, preferring Debug builds:

```bash
# Determine app variant (Debug vs Release)
LOG_DIR="$HOME/Library/Application Support/Helm-DEV/logs"
if [ ! -d "$LOG_DIR" ]; then
  LOG_DIR="$HOME/Library/Application Support/Helm/logs"
fi

LOG_FILE="$LOG_DIR/helm-debug-$(date +%Y-%m-%d).log"

# Verify file exists and is being written to
if [ ! -f "$LOG_FILE" ]; then
  echo "ERROR: No log file found for today. Is Helm running?"
  exit 1
fi

echo "Log file: $LOG_FILE"
```

If no log file exists, inform the user and stop — Helm may not be running.

### Phase 2: Establish Baseline

Read the current end of the log file so we only process new events:

```bash
BASELINE=$(wc -l < "$LOG_FILE" | tr -d ' ')
echo "Baseline: $BASELINE lines. Monitoring from here."
```

### Phase 3: Polling Loop

Run in **60-second chunks** to stay within the bash tool's 2-minute timeout. Each chunk:

1. Reads new log lines since last check
2. Filters for `[UI]` and `[COMMAND]` lines (both streams)
3. Parses and accumulates state
4. Sleeps 10 seconds
5. Repeats 6 times (= 60 seconds)
6. Returns to the user with a status summary
7. Checks if user said "stop" — if not, starts another chunk

```bash
# Single polling cycle — set timeout: 75000 (75s headroom)
LAST_LINE=$BASELINE
for i in $(seq 1 6); do
  CURRENT_LINES=$(wc -l < "$LOG_FILE" | tr -d ' ')
  if [ "$CURRENT_LINES" -gt "$LAST_LINE" ]; then
    # Read only new lines, filter for [UI] and [COMMAND] categories
    NEW_LINES=$(sed -n "$((LAST_LINE + 1)),${CURRENT_LINES}p" "$LOG_FILE" | grep -E '\[UI\]|\[COMMAND\]')
    if [ -n "$NEW_LINES" ]; then
      echo "$NEW_LINES"
    fi
    LAST_LINE=$CURRENT_LINES
  fi
  sleep 10
done
echo "LAST_LINE=$LAST_LINE"
```

**Important:** Use `timeout: 75000` on the bash tool call to give 15s headroom beyond the 60s polling cycle.

After each cycle, parse the output and update the state model (see below), then present the status dashboard.

### Phase 4: Status Dashboard

After each 60-second chunk, present a compact summary covering both streams:

```
═══════════════════════════════════════
  SESSION MONITOR — 14:32:15
═══════════════════════════════════════
  State:     🟢 Streaming
  Activity:  📖 reading file
  Messages:  12 total (1 streaming)
  Tools:     Write ✅ | Bash ⏳ running
  Tokens:    45,231 / 128,000 (35%)
  Errors:    None
  Duration:  2m 34s this turn
───────────────────────────────────────
  User:      Navigated to "Fix header" task
             Changed model to claude-sonnet-4
             Opened diff panel
  Commands:  8 dispatched (8 ✅, 0 ❌)
═══════════════════════════════════════
  [checking again in 60s — say "stop" to end]
```

State indicators:
- 🟢 **Streaming** — actively generating response
- 🔵 **Busy** — session busy but not streaming (e.g., tool executing)
- ⚪ **Idle** — session not processing
- 🔴 **Error** — error detected

The **User** section shows the last 3 user actions from `[COMMAND]` events, translated to human-readable descriptions. Use this mapping for common commands:

| Command ID | Human-readable |
|------------|---------------|
| `nav.toTask` | Navigated to task "{title from params}" |
| `nav.toPRD` | Opened PRD "{title}" |
| `task.create` | Created task "{title}" |
| `task.delete` | Deleted task |
| `task.changeStatus` | Changed task status to {status} |
| `prd.create` | Started new spec |
| `prd.createFromDescription` | Created spec from description |
| `model.select` | Changed model to {modelId} |
| `agent.select` | Changed agent to {agentId} |
| `layout.toggle*` | Opened/closed {panel} panel |
| `session.start` | Started Build session |
| `session.switchTo` | Switched to session |
| `project.select` | Switched to project |

### Phase 5: Anomaly Detection

Flag these conditions proactively:

| Condition | Detection | Alert |
|-----------|-----------|-------|
| **Stall** | No `[UI]` events for >30s during busy state | `⚠️ Possible stall — no events for 30s+` |
| **Error** | `error.received` or `error.tokenLimit` | `🔴 Error: {message}` |
| **Token warning** | `tokens.updated` with total > 75% of context window | `⚠️ Token usage at {N}%` |
| **Token critical** | `tokens.updated` with total > 90% of context window | `🔴 Token usage at {N}% — compaction imminent` |
| **Rapid tool failures** | 3+ `tool.completed` with `status=error` in 60s | `⚠️ Multiple tool failures` |
| **Disconnect** | SSE `disconnect` without `connected` within 10s | `🔴 SSE disconnected` |
| **Long turn** | `session.busy` without `session.idle` for >5min | `⚠️ Turn running for {N}min` |

### Phase 6: Stop Condition

When the user says "stop", "pause", "enough", or similar:

1. Stop the polling loop
2. Show a final summary of the session since monitoring started:

```
═══════════════════════════════════════
  SESSION MONITOR — FINAL SUMMARY
═══════════════════════════════════════
  Monitored:    5m 30s (5 cycles)
  Messages:     18 total
  Tool calls:   12 (11 ✅, 1 ❌)
  Tokens:       67,421 / 128,000 (53%)
  Errors:       1 (tool failure at 14:34:02)
  Turns:        3 completed
───────────────────────────────────────
  User actions: 24 commands dispatched
  Navigation:   8 (nav.toTask ×3, nav.toPRD ×2, ...)
  Task mgmt:    4 (task.create ×1, task.changeStatus ×3)
  Layout:       6 (toggleDiff ×2, toggleNotes ×2, ...)
  Other:        6
  Failures:     1 (tab.close — "Cannot close last tab")
═══════════════════════════════════════
```

---

## State Model

Builder maintains this mental model across polling cycles in conversation context.

### Single-Thread Model (default)

When monitoring a single Build tab:

```
# Agent state (from [UI] events)
sessionState:        busy | idle
currentActivity:     string | null          # from activity.changed
messageCount:        number                 # incremented on message.new
streamingMessageId:  string | null          # set on message.streaming.start, cleared on message.finished
activeToolCalls:     [{ tool, callId, startedAt }]  # added on tool.started, removed on tool.completed
tokenUsage:          { total, input, output }       # from tokens.updated
errors:              [{ timestamp, message }]       # from error.received / error.tokenLimit
turnStartedAt:       timestamp | null       # set on session.busy, cleared on session.idle
toolCallsTotal:      number                 # cumulative tool calls
toolCallsSucceeded:  number                 # cumulative successful tool calls
toolCallsFailed:     number                 # cumulative failed tool calls
turnsCompleted:      number                 # cumulative turns completed

# User actions (from [COMMAND] events)
recentUserActions:   [{ timestamp, commandId, params, result }]  # last 10 actions (ring buffer)
commandsDispatched:  number                 # cumulative commands dispatched
commandsSucceeded:   number                 # cumulative successful commands
commandsFailed:      number                 # cumulative failed commands
commandsByCategory:  { [category]: number } # count per category (navigation, tasks, layout, etc.)

# Shared
lastEventAt:         timestamp              # timestamp of last event seen (either stream)
lastLine:            number                 # line number of last read line (carry across cycles)
monitorStartedAt:    timestamp              # when monitoring began
cycleCount:          number                 # number of completed polling cycles
```

### Multi-Thread Model

When monitoring multiple concurrent Build tabs, promote per-thread state into a `threads` dictionary keyed by thread title. Track which thread is "active" based on the most recent `thread.titleChanged` event:

```
activeThread:        string | null          # title from most recent thread.titleChanged
threads: {
  [threadTitle]: {
    state:             busy | idle
    currentActivity:   string | null
    messageCount:      number
    streamingMessageId: string | null
    activeToolCalls:   [{ tool, callId, startedAt }]
    tokenUsage:        { total, input, output }
    errors:            [{ timestamp, message }]
    turnStartedAt:     timestamp | null
    turnsCompleted:    number
    toolCallsTotal:    number
    toolCallsSucceeded: number
    toolCallsFailed:   number
    lastEventAt:       timestamp
  }
}

# User actions are global (not per-thread — user is one person)
recentUserActions:   [{ timestamp, commandId, params, result }]
commandsDispatched:  number
commandsSucceeded:   number
commandsFailed:      number
commandsByCategory:  { [category]: number }

# Shared
lastLine:            number
monitorStartedAt:    timestamp
cycleCount:          number
lastEventAt:         timestamp
```

**Thread attribution rule:** When a `thread.titleChanged` event arrives, set `activeThread` to the new title and create its entry in `threads` if absent. Route all subsequent `[UI]` events to `threads[activeThread]` until the next `thread.titleChanged`. `[COMMAND]` events are always global — they represent the user, not a specific thread.

**State update rules:**

| Source | Log Action | State Update |
|--------|-----------|-------------|
| `[UI]` | `session.busy` | `sessionState = busy`, `turnStartedAt = timestamp` |
| `[UI]` | `session.idle` | `sessionState = idle`, `turnStartedAt = null`, `turnsCompleted++` |
| `[UI]` | `message.new` | `messageCount++` |
| `[UI]` | `message.streaming.start` | `streamingMessageId = msgId` |
| `[UI]` | `message.finished` | `streamingMessageId = null` |
| `[UI]` | `tool.started` | Add to `activeToolCalls` |
| `[UI]` | `tool.completed` | Remove from `activeToolCalls`, `toolCallsTotal++`, increment success/fail count |
| `[UI]` | `activity.changed` | `currentActivity = phrase` |
| `[UI]` | `activity.cleared` | `currentActivity = null` |
| `[UI]` | `error.received` | Append to `errors` |
| `[UI]` | `error.tokenLimit` | Append to `errors` with "Token limit reached" |
| `[UI]` | `tokens.updated` | `tokenUsage = { total, input, output }` |
| `[COMMAND]` | `DISPATCH *` | `commandsDispatched++`, push to `recentUserActions`, increment `commandsByCategory[category]` |
| `[COMMAND]` | `RESULT * result=success` | `commandsSucceeded++`, update matching action in `recentUserActions` |
| `[COMMAND]` | `RESULT * result=failure` | `commandsFailed++`, update matching action, flag in dashboard |
| `[COMMAND]` | `VALIDATION_FAILED *` | `commandsFailed++`, note the reason |
| `[COMMAND]` | `UNDO *` | Note in `recentUserActions` as undo |

All events update `lastEventAt` to the log line timestamp.

---

## Parsing Guide

### Identifying the Stream

Every relevant log line contains either `[UI]` or `[COMMAND]`. Distinguish them first:

```
if line contains "[UI]"     → parse as UI event (agent state)
if line contains "[COMMAND]" → parse as command event (user action)
```

### Parsing `[UI]` Lines

Each `[UI]` line follows this structure:

```
[TIMESTAMP] [LEVEL] [UI] ACTION key1=value1 key2="quoted value" session=SESSIONID thread=THREADID
```

To parse:
1. **Timestamp:** Extract from first `[...]` bracket
2. **Action:** First token after `[UI]` — e.g., `tool.started`, `message.new`
3. **Key-value pairs:** Everything between action and `session=` — split on spaces, handle quoted values
4. **Session ID:** `session=XXXXXXXX` field
5. **Thread ID:** `thread=XXXXXXXX` field (optional — present when MessageStore has activeThreadId)

> ⚠️ **`session=` identifies the opencode serve session, NOT the Helm thread/tab.**
> Multiple Build threads sharing the same opencode serve process (same port, same SSE stream) will emit events with the same `session=` value. Use `thread=` for disambiguation when available. See [Multi-Thread Monitoring](#multi-thread-monitoring) for strategies when `thread=` is absent.

Example lines and their parsed meaning:

```
[2026-04-11 14:32:15.123] [INFO] [UI] tool.started tool=Write callId=abc123 session=12345678 thread=a1b2c3d4
→ Action: tool.started, tool: Write, callId: abc123, session: 12345678, thread: a1b2c3d4

[2026-04-11 14:32:16.456] [INFO] [UI] activity.changed phrase="writing to file" session=12345678 thread=a1b2c3d4
→ Action: activity.changed, phrase: "writing to file", session: 12345678

[2026-04-11 14:32:17.789] [INFO] [UI] tokens.updated total=45231 input=38000 output=7231 session=12345678
→ Action: tokens.updated, total: 45231, input: 38000, output: 7231
```

### Parsing `[COMMAND]` Lines

Each `[COMMAND]` line has an action type as the first token:

```
[TIMESTAMP] [LEVEL] [COMMAND] ACTION_TYPE commandId key1=value1 params={...}
```

**Action types and their parsing:**

| Action Type | Fields | Example |
|-------------|--------|---------|
| `DISPATCH` | commandId, category, org, project, session, view, tab, authenticated, activeSession, params | `DISPATCH task.create category=tasks params={title:"Fix bug"}` |
| `RESULT` | commandId, result, durationMs, error (if failed) | `RESULT task.create result=success durationMs=42` |
| `VALIDATION_FAILED` | commandId, reason | `VALIDATION_FAILED project.delete reason="Missing required context"` |
| `UNDO` | commandId, title, result | `UNDO tab.close title="Close Tab" result=success` |
| `COMMAND_NOT_FOUND` | commandId | `COMMAND_NOT_FOUND foo.bar id=foo.bar` |

To parse:
1. **Timestamp:** Extract from first `[...]` bracket
2. **Action type:** First token after `[COMMAND]` — `DISPATCH`, `RESULT`, `VALIDATION_FAILED`, `UNDO`
3. **Command ID:** Second token — e.g., `task.create`, `nav.toTask`
4. **Key-value pairs:** Remaining tokens — same key=value format, with `params={...}` containing nested data

---

## Multi-Thread Monitoring

When multiple Build tabs are active in Helm, they may share a single opencode serve process. All threads on that process emit `[UI]` events with the **same `session=` value**, so events from different threads are interleaved.

### Primary: `thread=` Field (TSK-008)

As of TSK-008, `[UI]` log lines from MessageStore include a `thread=XXXXXXXX` field (first 8 chars of the Helm thread UUID). This is the most reliable way to attribute events to specific threads:

```
[14:32:15.100] [INFO] [UI] tool.started tool=Write callId=abc session=12345678 thread=a1b2c3d4
[14:32:15.200] [INFO] [UI] message.new role=assistant msgId=xyz session=12345678 thread=e5f6g7h8
```

When `thread=` is present, use it directly for thread attribution. No heuristics needed.

### Fallback: `thread.titleChanged` Heuristic

If `thread=` is absent (older Helm versions, or events from DiffStore/SessionStore which don't have threadId):

When Helm switches focus between threads, it emits `thread.titleChanged`. Use this as a heuristic:

```
[14:32:10.000] [INFO] [UI] thread.titleChanged title="Fix login bug" session=12345678
← subsequent events likely belong to "Fix login bug" thread
```

**Limitations:** Imprecise when both threads are actively processing — events can interleave between markers.

### `[COMMAND]` Events and Threads

`[COMMAND]` events include a `tab=<uuid>` field in DISPATCH lines, which identifies the active tab. This can be correlated with thread IDs if needed, but for monitoring purposes commands are best treated as **global user actions** — the user is one person regardless of which thread is focused.

### Recommendations

| Scenario | Strategy |
|----------|----------|
| Single Build tab active | No disambiguation needed — all events belong to one thread |
| Two tabs, `thread=` present | Use `thread=` field directly |
| Two tabs, no `thread=` field | Fall back to `thread.titleChanged` heuristic |
| User watching one specific tab | Filter by `thread=` value |

---

## Context Window Considerations

- Each polling cycle reads only NEW log lines (not the full file)
- `[UI]` lines are typically 100-200 chars each
- `[COMMAND]` DISPATCH lines are typically 200-400 chars (include context fields and params)
- `[COMMAND]` RESULT lines are typically 80-120 chars
- A busy session produces ~5-15 `[UI]` events per 10-second interval
- User actions add ~2-10 `[COMMAND]` events per 60-second cycle (humans are slower than agents)
- 60 seconds of both streams ≈ 40-120 lines ≈ 8-20KB ≈ 2-5K tokens
- This is sustainable for extended monitoring without hitting context limits

---

## Integration with Builder

This skill is used by **Builder directly**, not by sub-agents. Builder loads it when the user asks to monitor a session. The monitoring is interruptible — the user can ask questions or give other instructions between polling cycles.

### Typical Flow

```
User: "I'm going to start a Build session, monitor it for me"
Builder: [loads session-monitor skill]
Builder: "Monitoring. I'll check every 10s and report every 60s. Say 'stop' to end."
Builder: [runs 60s polling chunk with timeout: 75000]
Builder: [parses output, updates state model]
Builder: [shows status dashboard]
Builder: [no "stop" from user → runs another chunk]
...
User: "stop"
Builder: [shows final summary]
```

### Between Cycles

Between polling cycles, Builder can:
- Answer user questions about the session
- Respond to anomaly alerts
- Accept instructions to continue or stop monitoring
- Provide context about what the monitored session is doing

---

## Troubleshooting

### "No log file found for today"

- Verify Helm is running
- Check both Debug (`Helm-DEV`) and Release (`Helm`) directories
- Log files are created on first event each day — a freshly launched Helm may not have logged yet

### No `[UI]` events appearing

- Confirm the session is active in Helm (not just the app open)
- Check that the version of Helm has `[UI]` logging implemented (TSK-001/002, commit e7af87a)
- Try reading the last 20 lines of the log file to verify format
- `[COMMAND]` events should still appear even if no Build session is active — if the user is clicking around in Helm, those should be logged

### No `[COMMAND]` events appearing

- Commands are only logged after `CommandLogSubscriber` initializes (logged as `[COMMAND] INIT`)
- If the app just launched, look for the INIT line to confirm the subscriber is active
- Search queries bypass the command system — they won't appear

### Events from wrong session

- The `session=XXXXXXXX` field identifies the **opencode serve session**, not the Helm thread/tab
- Multiple Build threads sharing the same opencode serve process will have the same session ID
- If events appear interleaved from multiple threads, see [Multi-Thread Monitoring](#multi-thread-monitoring) for disambiguation
- If multiple opencode serve processes are running (different ports), filter by the session ID the user cares about
- Ask the user which thread to monitor if ambiguous

---

## Future Enhancements

1. **Log-based replay** — Replay the session from logs to diagnose issues after the fact
2. **Cross-session monitoring** — Monitor multiple concurrent sessions with per-thread dashboards
3. **Alerting thresholds** — Configurable thresholds for stall, token, and error alerts in project.json
4. **SSE infrastructure correlation** — Combine `[UI]` + `[COMMAND]` + `[SSE]` logs for full-stack observability
5. **Diff summary on idle** — When session goes idle, automatically fetch and summarize file diffs
6. **Search logging** — Add `[COMMAND]` logging for search queries (currently the only gap)
7. **User behavior analytics** — Aggregate command frequency data across sessions for UX insights
8. **Smart summarization** — Instead of listing all commands, summarize user intent: "User created 3 tasks, navigated between them, then started a Build session on the first one"
