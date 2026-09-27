# Po-Ko Developer Capacity Guardian

Po-Ko is a local-first developer capacity framework that connects recovery signals to software decisions.

It combines wearable metrics and short self-reported context into an explainable Po-Ko score. IBM Bob can read the current state, submit context, provide metric-grounded advice, and connect high-risk developer states to Git commit traceability.

## The Workflow

```text
Wearable metrics
      ->
Explainable Po-Ko score
      ->
IBM Bob MCP advice
      ->
Git Guardian commit context
```

Po-Ko is designed around a simple idea: developers should not be expected to operate like machines. When recovery signals indicate that support may be needed, the workflow can encourage better pacing, review, and follow-up without blocking the developer.

## Features

- Explainable 1-10 Po-Ko score with risk levels.
- HRV, sleep, stress, sensor-gap, trend, and external-factor scoring.
- Short context survey for information wearable data cannot capture.
- Metric-grounded advice with a static fallback for offline use.
- Learning engine for patterns before logged sick days.
- React/Vite dashboard with score breakdown and recovery trends.
- IBM Bob MCP tools for status, advice, surveys, and daily metrics.
- Windows-safe Git `commit-msg` Guardian integration.
- Local SQLite storage with no cloud account required.

## Requirements

- Node.js 18 or newer
- Git
- IBM Bob, if using the MCP integration

## Quick Start

From the repository root:

```powershell
npm install
npm run install:server
npm run install:client
```

Start the application in three terminals:

```powershell
npm run server
```

```powershell
npm run mcp
```

```powershell
npm run client
```

Open the dashboard at:

```text
http://localhost:3000
```

The Express API runs at `http://localhost:3001`.

A fresh installation starts with an empty local database. Use **Log Today** in the dashboard to enter your own metrics. Private demo seed data is disabled by default.

## IBM Bob Setup

Register `server/mcp.js` in IBM Bob's MCP settings. For example:

```json
{
  "mcpServers": {
    "poko-developer-framework": {
      "command": "node",
      "args": [
        "C:/absolute/path/to/poko-developer-framework/server/mcp.js"
      ],
      "env": {}
    }
  }
}
```

Restart IBM Bob, then try:

```text
What is my Po-Ko status today?
```

Available MCP tools include:

- `get_poko_status`
- `submit_survey`
- `get_advice`
- `log_daily_metrics`

Detailed MCP instructions are in [README-BOB-INTEGRATION.md](README-BOB-INTEGRATION.md).

## Git Guardian

After installation, Husky activates the tracked `.husky/commit-msg` hook. When today's Po-Ko state is high risk, the hook can append support context to a commit, including:

```text
Po-Ko-Flag: ACTIVE SUPPORT STATE
Po-Ko-Score: 9/10 (HIGH)
Po-Ko-Cognitive-Load: HEAVY
```

The hook is fail-open: if the local API is unavailable, the commit proceeds without a Po-Ko trailer.

## Netlify

The `netlify.toml` file configures Netlify to build and publish the React client. Netlify hosts the dashboard shell only.

The Express API, SQLite database, IBM Bob MCP server, and Git hook remain local unless they are separately deployed and connected. Therefore the fully interactive workflow is demonstrated locally, while Netlify provides a public visual URL for the client.

## Documentation

- [DEMO-SUBMISSION-GUIDE.md](DEMO-SUBMISSION-GUIDE.md) - judge setup and complete integration walkthrough.
- [VIDEO-DEMO-RUNBOOK.md](VIDEO-DEMO-RUNBOOK.md) - concise recording script.
- [README-BOB-INTEGRATION.md](README-BOB-INTEGRATION.md) - IBM Bob MCP tools and prompts.
- [DATA_SOURCES.md](DATA_SOURCES.md) - data and scoring context.

## Privacy

Personal SQLite databases, telemetry exports, learning insights, and sick-day records are ignored by Git. Do not commit personal health data, tokens, or local configuration files.

## License

This project currently uses the repository's existing license metadata.
