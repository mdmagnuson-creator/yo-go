---
name: session-monitor
description: "Monitor an active Helm session by tailing the debug log file. Provides real-time observability of session state, messages, tool calls, errors, and token usage. Use when the user asks to monitor or watch a session. Triggers on: monitor session, watch session, check session, tail logs, session status, how's the session going."
---

# Session Monitor Skill

> Load this skill when: the user asks to monitor, watch, or check on an active Helm session. Provides real-time observability by tailing the `[UI]` debug log.

## Overview

Builder has no native way to observe what Helm is displaying during an active session. This skill enables Builder to tail the Helm debug log file in a polling loop, parse structured `[UI]` log lines, and maintain a mental model of session state — surfacing errors, stalls, token warnings, and progress in real time.

## Prerequisite: `[UI]` Logs in Helm

Helm ADE macOS emits `[UI]` category logs via `DebugLogger.logUI()`. These are written to daily log files with 7-day retention.

### Log Actions

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

### Log Format

```
[2026-04-11 14:32:15.123] [INFO] [UI] action details session=12345678
```

- **Timestamp:** `[YYYY-MM-DD HH:mm:ss.SSS]`
- **Level:** always `[INFO]`
- **Category:** always `[UI]`
- **Action:** dot-separated (e.g., `message.new`, `tool.started`)
- **Details:** key=value pairs, strings quoted (e.g., `role=assistant`, `phrase="reading file"`)
- **Session ID:** truncated to 8 chars, always last field

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
2. Filters for `[UI]` lines
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
    # Read only new lines, filter for [UI] category
    NEW_LINES=$(sed -n "$((LAST_LINE + 1)),${CURRENT_LINES}p" "$LOG_FILE" | grep '\[UI\]')
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

After each 60-second chunk, present a compact summary:

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
═══════════════════════════════════════
  [checking again in 60s — say "stop" to end]
```

State indicators:
- 🟢 **Streaming** — actively generating response
- 🔵 **Busy** — session busy but not streaming (e.g., tool executing)
- ⚪ **Idle** — session not processing
- 🔴 **Error** — error detected

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
  Monitored:   5m 30s (5 cycles)
  Messages:    18 total
  Tool calls:  12 (11 ✅, 1 ❌)
  Tokens:      67,421 / 128,000 (53%)
  Errors:      1 (tool failure at 14:34:02)
  Turns:       3 completed
═══════════════════════════════════════
```

---

## State Model

Builder maintains this mental model across polling cycles in conversation context.

### Single-Thread Model (default)

When monitoring a single Build tab:

```
sessionState:        busy | idle
currentActivity:     string | null          # from activity.changed
messageCount:        number                 # incremented on message.new
streamingMessageId:  string | null          # set on message.streaming.start, cleared on message.finished
activeToolCalls:     [{ tool, callId, startedAt }]  # added on tool.started, removed on tool.completed
tokenUsage:          { total, input, output }       # from tokens.updated
errors:              [{ timestamp, message }]       # from error.received / error.tokenLimit
turnStartedAt:       timestamp | null       # set on session.busy, cleared on session.idle
lastEventAt:         timestamp              # timestamp of last [UI] event seen
lastLine:            number                 # line number of last read line (carry across cycles)
monitorStartedAt:    timestamp              # when monitoring began
cycleCount:          number                 # number of completed polling cycles
toolCallsTotal:      number                 # cumulative tool calls
toolCallsSucceeded:  number                 # cumulative successful tool calls
toolCallsFailed:     number                 # cumulative failed tool calls
turnsCompleted:      number                 # cumulative turns completed
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
lastLine:            number                 # shared — line number of last read line
monitorStartedAt:    timestamp              # shared — when monitoring began
cycleCount:          number                 # shared — number of completed polling cycles
lastEventAt:         timestamp              # shared — timestamp of last [UI] event seen
```

**Thread attribution rule:** When a `thread.titleChanged` event arrives, set `activeThread` to the new title and create its entry in `threads` if absent. Route all subsequent events to `threads[activeThread]` until the next `thread.titleChanged`.

**State update rules:**

| Log Action | State Update |
|-----------|-------------|
| `session.busy` | `sessionState = busy`, `turnStartedAt = timestamp` |
| `session.idle` | `sessionState = idle`, `turnStartedAt = null`, `turnsCompleted++` |
| `message.new` | `messageCount++` |
| `message.streaming.start` | `streamingMessageId = msgId` |
| `message.finished` | `streamingMessageId = null` |
| `tool.started` | Add to `activeToolCalls` |
| `tool.completed` | Remove from `activeToolCalls`, `toolCallsTotal++`, increment success/fail count |
| `activity.changed` | `currentActivity = phrase` |
| `activity.cleared` | `currentActivity = null` |
| `error.received` | Append to `errors` |
| `error.tokenLimit` | Append to `errors` with "Token limit reached" |
| `tokens.updated` | `tokenUsage = { total, input, output }` |

All events update `lastEventAt` to the log line timestamp.

---

## Parsing Guide

### Extracting Fields from Log Lines

Each `[UI]` line follows this structure:

```
[TIMESTAMP] [LEVEL] [UI] ACTION key1=value1 key2="quoted value" session=SESSIONID
```

To parse:
1. **Timestamp:** Extract from first `[...]` bracket
2. **Action:** First token after `[UI]` — e.g., `tool.started`, `message.new`
3. **Key-value pairs:** Everything between action and `session=` — split on spaces, handle quoted values
4. **Session ID:** Last `session=XXXXXXXX` field

> ⚠️ **`session=` identifies the opencode serve session, NOT the Helm thread/tab.**
> Multiple Build threads sharing the same opencode serve process (same port, same SSE stream) will emit events with the same `session=` value. See [Multi-Thread Monitoring](#multi-thread-monitoring) for disambiguation strategies.

Example lines and their parsed meaning:

```
[2026-04-11 14:32:15.123] [INFO] [UI] tool.started tool=Write callId=abc123 session=12345678
→ Action: tool.started, tool: Write, callId: abc123, session: 12345678

[2026-04-11 14:32:16.456] [INFO] [UI] activity.changed phrase="writing to file" session=12345678
→ Action: activity.changed, phrase: "writing to file", session: 12345678

[2026-04-11 14:32:17.789] [INFO] [UI] tokens.updated total=45231 input=38000 output=7231 session=12345678
→ Action: tokens.updated, total: 45231, input: 38000, output: 7231
```

---

## Multi-Thread Monitoring

When multiple Build tabs are active in Helm, they may share a single opencode serve process. All threads on that process emit `[UI]` events with the **same `session=` value**, so events from different threads are interleaved and indistinguishable by session ID alone.

### The Problem

```
[14:32:15.100] [INFO] [UI] tool.started tool=Write callId=abc session=12345678    ← Thread A
[14:32:15.200] [INFO] [UI] message.new role=assistant msgId=xyz session=12345678   ← Thread B
[14:32:15.300] [INFO] [UI] tool.completed tool=Write callId=abc session=12345678   ← Thread A
```

Without a thread identifier, there's no reliable way to attribute events to specific threads.

### Disambiguation Strategies

**1. `thread.titleChanged` as context switch marker (best available)**

When Helm switches focus between threads, it emits `thread.titleChanged`. Use this as a heuristic to track which thread is "active":

```
[14:32:10.000] [INFO] [UI] thread.titleChanged title="Fix login bug" session=12345678
← subsequent events likely belong to "Fix login bug" thread
[14:33:45.000] [INFO] [UI] thread.titleChanged title="Add dark mode" session=12345678
← context switch — subsequent events now belong to "Add dark mode" thread
```

**Limitations:** This is imprecise. Events from both threads can arrive in the same batch between `thread.titleChanged` markers, especially when both threads are actively processing.

**2. `msgId` continuity (supplementary)**

Messages within a single turn share temporal locality. When `message.new` produces a `msgId`, subsequent `tool.started` and `tool.completed` events belong to that message's turn until the next `message.new` or `message.finished`. This helps within a turn but doesn't solve cross-turn attribution.

**3. Single-thread filtering (simplest)**

If the user only cares about one thread, ask which thread title to watch and discard events that arrive between `thread.titleChanged` markers for other threads. This is lossy but clean.

### Recommendations

| Scenario | Strategy |
|----------|----------|
| Single Build tab active | No disambiguation needed — all events belong to one thread |
| Two tabs, user watching one | Single-thread filtering by title |
| Two tabs, watching both | Use multi-thread state model with `thread.titleChanged` heuristic |
| Need precise attribution | Wait for `threadId=` field (see Future Enhancements) |

---

## Context Window Considerations

- Each polling cycle reads only NEW log lines (not the full file)
- `[UI]` lines are typically 100-200 chars each
- A busy session produces ~5-15 UI events per 10-second interval
- 60 seconds of events ≈ 30-90 lines ≈ 5-15KB ≈ 1-4K tokens
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
- Check that the version of Helm has `[UI]` logging implemented
- Try reading the last 20 lines of the log file to verify format

### Events from wrong session

- The `session=XXXXXXXX` field identifies the **opencode serve session**, not the Helm thread/tab
- Multiple Build threads sharing the same opencode serve process will have the same session ID
- If events appear interleaved from multiple threads, see [Multi-Thread Monitoring](#multi-thread-monitoring) for disambiguation
- If multiple opencode serve processes are running (different ports), filter by the session ID the user cares about
- Ask the user which thread to monitor if ambiguous

---

## Future Enhancements

1. **Log-based replay** — Replay the session from logs to diagnose issues after the fact
2. **Cross-session monitoring** — Monitor multiple concurrent sessions
3. **Alerting thresholds** — Configurable thresholds for stall, token, and error alerts in project.json
4. **SSE infrastructure correlation** — Combine `[UI]` logs with `[SSE]` logs for full-stack observability
5. **Diff summary on idle** — When session goes idle, automatically fetch and summarize file diffs
