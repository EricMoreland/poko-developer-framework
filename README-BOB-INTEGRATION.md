# Po-Ko Framework — IBM Bob MCP Integration

This document covers how to register the Po-Ko MCP server with IBM Bob IDE, what each tool does, and example usage prompts.

---

## Prerequisites

- Node.js 18+ installed
- Po-Ko framework dependencies installed (`npm run install:all` from repo root)
- The Po-Ko Express server running (`npm run server` or `npm run dev`)

---

## Registration

### Option A — Workspace MCP config (recommended)

Copy the contents of `bob-mcp-config.json` into your Bob workspace MCP configuration file (`.bob/mcp.json` or the workspace MCP panel):

```json
{
  "mcpServers": {
    "poko-developer-framework": {
      "command": "node",
      "args": ["${workspaceFolder}/server/mcp.js"],
      "env": {}
    }
  }
}
```

Replace `${workspaceFolder}` with the absolute path to the repo root if your Bob version does not support the variable (e.g. `C:/Users/yourname/Desktop/poko-developer-framework/server/mcp.js`).

### Option B — `npm run dev` (starts everything together)

Running `npm run dev` from the repo root starts the Express server, the MCP stdio server, and the Vite client concurrently via `concurrently`.

---

## Available Tools

### `get_poko_status`

Returns today's full Po-Ko health snapshot directly in the IDE.

**No required parameters.**

**Returns:**
- Po-Ko score (1–10) and risk level (LOW / GUARDED / ELEVATED / HIGH / CRITICAL)
- Sick day flag
- Whether today's survey has been answered
- Active external factors and their total score penalty
- Biometric summary: HRV, baseline, Sleep Score, Body Battery, Avg Stress
- Sickness prediction alert (if 72-Hour Rebound Rule fired)
- Learning engine pattern warnings (if any confirmed patterns match today's metrics)

**Example prompts:**
- *"What is my Po-Ko status today?"*
- *"Am I cognitively ready for a complex refactor right now?"*
- *"Show me my current health and recovery numbers."*

---

### `submit_survey`

Submits daily external factor answers. Updates the Po-Ko score in real time.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `date` | `string` | ISO date string (e.g. `"2026-09-24"`). Use today's date. |
| `factors` | `object` | Boolean map of external factors (see table below). |

**Valid factor IDs:**

| Factor ID | What it captures |
|-----------|-----------------|
| `exposedToSickPerson` | Close contact with someone who is sick |
| `severeAllergiesToday` | Allergies significantly flaring up |
| `highWorkloadDeadline` | High-pressure deadline or urgent deliverable |
| `poorDietToday` | Notably poor diet yesterday |
| `alcoholLastNight` | Alcohol consumption last night |
| `highCaffeineToday` | Significantly more caffeine than usual |
| `missedMealToday` | Skipped a meal today or yesterday |
| `emotionallyDrained` | Feeling emotionally drained or overwhelmed |
| `travelOrJetLag` | Currently travelling or experiencing jet lag |
| `physicallyOverexerted` | Intense or unusually long workout yesterday |
| `medicationSideEffects` | Medication side effects today |

**Example prompts:**
- *"I had alcohol last night and I'm feeling emotionally drained — submit my survey for today."*
- *"Log that I have a high workload deadline and missed breakfast."*
- *"Submit today's survey: I was exposed to a sick person and have a deadline."*

---

### `get_advice`

Returns specific, metric-grounded health advice for the current time of day.

**Parameters:**

| Parameter | Type | Options |
|-----------|------|---------|
| `slot` | `string` (enum) | `"morning"` \| `"midday"` \| `"afternoon"` |

Returns stored advice if already generated for today's slot, or generates new advice on demand using the current biometric values.

**Example prompts:**
- *"Give me my morning health advice."*
- *"What should I do about my health right now? It's lunchtime."*
- *"Get my afternoon health check-in advice."*
- *"Should I do deep work this morning based on my metrics?"*

---

### `log_daily_metrics`

Logs daily wearable telemetry metrics directly into SQLite from the AI prompt window.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `date` | `string` (optional) | ISO date string (e.g. `"2026-09-26"`). Defaults to today. |
| `sleepScore` | `number` | Sleep score (0–100). |
| `overnightHrv` | `number` | Overnight HRV in ms. |
| `avgHrv7d` | `number` | 7-day rolling average HRV in ms. |
| `avgStress` | `number` | Average daily stress level (0–100). |
| `bedtimeDecimal` | `number` | Bedtime in 24h decimal (e.g. `22.5`). |
| `wakeTimeDecimal` | `number` | Wake time in 24h decimal (e.g. `7.0`). |
| `sleepDurationMinutes`| `number` (optional)| Total sleep minutes. |

**Example prompts:**
- *"Log my daily metrics for today: sleep score 85, HRV 78, 7-day average 80, stress 22, bedtime 22.5, wake time 7.0."*
- *"Record today's wearable data: HRV 65, baseline 80, sleep 62, stress 45, bedtime 23.0, wake time 6.5."*

---

## How advice and scores update

- **Score** is recalculated live on every `get_poko_status` call using the current SQLite telemetry and survey data.
- **Advice** is generated at 08:00, 12:30, and 16:00 daily by the server's node-cron scheduler. Calling `get_advice` at any time will return today's stored advice for that slot, or generate it on demand if not yet available.
- **Learning engine patterns** auto-update after each `POST /api/learning/run` call (triggerable from the dashboard). Matched patterns appear in `get_poko_status` output automatically.

---

## Web dashboard

The Po-Ko web dashboard continues to work independently at `http://localhost:3000` (Vite dev server). The MCP server and Express API share the same SQLite database, so any data entered via the dashboard is immediately visible via MCP tools and vice versa.

For the IBM Bob hackathon setup, public deployment notes, and three-minute demo script, see [DEMO-SUBMISSION-GUIDE.md](DEMO-SUBMISSION-GUIDE.md).

## Code Guardian commit flags

IBM Bob's Source Control commit action uses the repository's Git hooks. The `commit-msg` hook calls the local Guardian API and appends these trailers whenever today's Po-Ko score is in the active high-risk state. The cognitive-load classification is recorded for context, but a small commit is still flagged when the developer's health state is high risk:

```text
Po-Ko-Flag: ACTIVE SUPPORT STATE
Po-Ko-Context: Active Support State
Po-Ko-Score: 8.0/10 (HIGH)
Po-Ko-Cognitive-Load: MEDIUM
Po-Ko-Guidance: ...
```

Manual setup from the repository root:

```powershell
npm install
npm run install:server
node server/index.js
```

Fresh installations start with an empty local database. The legacy JSON demo migration is disabled by default. To use a private demo dataset on the demo machine only, set `POKO_SEED_DEMO_DATA=true` before starting the server.

Leave the server running and verify that `.husky/commit-msg` contains:

```text
node server/commit-hook.js "$1"
```

After that, commit normally from Bob's Source Control view. The hook is fail-open: if the local API is unavailable, the commit proceeds without a Po-Ko trailer. The hook can be pointed at another local API URL with `POKO_GUARDIAN_URL`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| MCP server fails to start | Node.js or path issue | Verify `node server/mcp.js` runs without error from repo root |
| `get_poko_status` returns "No telemetry data" | No data in SQLite yet | Log at least one day via the dashboard "Log Today" button |
| Advice not generating | Bob MCP unavailable | Falls back to static advice bank automatically |
| Score doesn't update after survey | Date mismatch | Ensure the `date` parameter matches the most recent telemetry entry's date |