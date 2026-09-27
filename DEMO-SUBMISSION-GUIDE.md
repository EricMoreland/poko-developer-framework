# Po-Ko Developer Capacity Guardian

## Judge Quickstart

Po-Ko connects developer recovery context to the software workflow. It provides an explainable readiness score, exposes that score through IBM Bob using MCP, and adds traceability metadata to high-risk Git commits.

This guide takes you from a fresh clone to the working dashboard, IBM Bob integration, and commit-flag demonstration.

## What You Need

- Windows, macOS, or Linux
- Node.js 18 or newer
- Git
- IBM Bob 2.0 with MCP configuration access

The application runs locally. It uses SQLite and does not require a cloud database or account.

## 1. Clone And Install

Open a terminal and run:

```powershell
git clone <repository-url>
cd poko-developer-framework
npm install
npm run install:server
npm run install:client
```

The root `npm install` automatically runs the Husky `prepare` script. This activates the tracked `.husky/commit-msg` hook, which is responsible for the commit flag. No separate hook installer is required.

If your npm configuration has disabled lifecycle scripts, activate the hook manually:

```powershell
npm run prepare
```

## 2. Start The Application

Open three terminal windows in the repository root.

**Terminal 1: Express API**

```powershell
npm run server
```

You should see the API listening on port `3001`.

**Terminal 2: MCP server**

```powershell
npm run mcp
```

The MCP process communicates through standard input/output. Keep this terminal open.

**Terminal 3: Web dashboard**

```powershell
npm run client
```

Open:

```text
http://localhost:3000
```

## 3. Understand The Fresh Database

A fresh clone starts with an empty local SQLite database. It does not receive the developer's private telemetry.

The dashboard will initially show no score until you log data. Use **Log Today** and enter sample values such as:

```text
Date: today's date
Sleep Score: 45
Overnight HRV: 55
7-Day Avg HRV: 80
Avg Daily Stress: 75
Bedtime: 23
Wake Time: 6
```

These values intentionally create a visible elevated-risk state for demonstration. The exact score depends on the scoring rules and any existing local survey data.

After submitting, refresh the dashboard if necessary.

## 4. Explore The Web Dashboard

The dashboard demonstrates the explainability layer:

1. **Po-Ko score and risk level** show the current readiness state.
2. **Metric cards** show HRV, sleep, time in bed, and stress.
3. **Info buttons** explain what each metric means.
4. **Explain score** shows how HRV, sleep, stress, and sensor gaps contribute.
5. **Micro-survey** captures context that wearable data cannot explain by itself.
6. **Trend chart** shows recovery over time and marks sick days when present.

The important product idea is that the score is inspectable rather than a mysterious health label.

## 5. Connect IBM Bob MCP

In IBM Bob's MCP settings, register the repository's MCP server. Use an absolute path for your machine:

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

On macOS or Linux, use a path such as:

```text
/Users/yourname/poko-developer-framework/server/mcp.js
```

Restart IBM Bob after saving the configuration.

## 6. Test MCP In IBM Bob

Use this prompt first:

```text
What is my Po-Ko status today?
```

The response should include the current score, risk level, biometrics, survey status, external factors, and any learning or trend warnings.

Then try:

```text
Give me advice before I start a complex refactor.
```

This demonstrates the contextual advice tool. Advice is based on the telemetry currently stored in the local database.

You can also test the survey workflow:

```text
I have a high workload deadline today and feel emotionally drained. Submit today's survey.
```

This demonstrates that Bob can write context back into the same local Po-Ko system.

## 7. Demonstrate The Commit Flag

Keep the Express API running. The commit hook calls it at:

```text
http://localhost:3001/api/guardian/classify
```

In the repository, make a harmless change, such as adding a sentence to a local scratch file. Then use IBM Bob Source Control to:

1. Stage the change.
2. Enter this commit message:

```text
Refactor authentication flow
```

3. Commit the change.

When the current Po-Ko state is high risk, the `commit-msg` hook appends metadata similar to:

```text
Po-Ko-Flag: ACTIVE SUPPORT STATE
Po-Ko-Context: Active Support State
Po-Ko-Score: 9/10 (HIGH)
Po-Ko-Cognitive-Load: MEDIUM
Po-Ko-Guidance: Request secondary review and consider an elevated post-merge audit.
```

To inspect the resulting commit, run:

```powershell
git log -1 --format=%B
```

The hook is fail-open. If the local Express API is unavailable, the commit is allowed to proceed without a flag.

## 8. What IBM Bob Is Demonstrating

IBM Bob is used as an active development partner, not only as a chat interface:

- It understands the repository and helps operate the Po-Ko workflow.
- It calls the local MCP tools to retrieve status and advice.
- It submits developer context through MCP.
- Its Source Control workflow triggers the Git commit hook.
- The resulting commit preserves health-state context for code review.

The complete workflow is:

```text
Wearable metrics
      -> Po-Ko scoring engine
      -> IBM Bob MCP tools
      -> Developer decision
      -> Git commit hook
      -> Review traceability
```

## Troubleshooting

### Dashboard does not load

Confirm that the client terminal is running and open:

```text
http://localhost:3000
```

### Dashboard shows no score

Use **Log Today** to enter one telemetry record. A fresh clone intentionally starts empty.

### IBM Bob cannot find the MCP server

Check that the MCP configuration uses an absolute path to `server/mcp.js`, then restart Bob.

### Commit is not flagged

Confirm all of the following:

1. `npm install` or `npm run prepare` was run.
2. `.husky/commit-msg` exists.
3. The Express API is running on port `3001`.
4. Telemetry exists for the current date.
5. The calculated risk is `HIGH` or `CRITICAL`, or the score is at least `8`.

### The API port is already in use

Stop the other process using port `3001`, or start the API on another port and set the hook URL accordingly:

```powershell
$env:PORT = "3002"
$env:POKO_GUARDIAN_URL = "http://localhost:3002/api/guardian/classify"
npm run server
```

## Public Demo URL

The React dashboard can be deployed to Netlify using the repository's `netlify.toml` configuration:

- Base directory: `client`
- Build command: `npm run build`
- Publish directory: `dist`

Netlify is the public **Demo Application Platform**, and its generated URL is the **Application URL** for the submission. The GitHub URL belongs in **Public Code Repository**.

The fully interactive SQLite, Express, MCP, and Git-hook workflow runs locally. Netlify hosts the dashboard shell unless the Express API is deployed separately and the frontend is configured with a public API URL.