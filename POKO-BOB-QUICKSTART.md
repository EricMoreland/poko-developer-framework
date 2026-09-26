# Po-Ko MCP — Quick Start Guide for IBM Bob IDE

Get your daily developer capacity score, health advice, and biometric logging — all by chatting with Bob.

---

## 1. Connect the MCP (one-time setup)

Open your Bob workspace MCP settings and add:

```json
{
  "mcpServers": {
    "poko-developer-framework": {
      "command": "node",
      "args": ["C:/Users/YourName/Desktop/poko-developer-framework/server/mcp.js"],
      "env": {}
    }
  }
}
```

> **Tip:** Replace the path with the absolute path to `server/mcp.js` on your machine.  
> The server starts automatically when Bob loads — no manual process needed.

---

## 2. The Four Things You Can Ask Bob

### Check your readiness right now
> *"What is my Po-Ko status today?"*  
> *"Am I ready for a complex task?"*

Bob returns your **Po-Ko score (1–10)**, risk level, biometrics snapshot, sick day flag, and any pattern warnings.

---

### Log today's wearable data from the chat window
> *"Log my metrics: sleep score 82, HRV 76, 7-day average 74, stress 28, bedtime 22.5, wake 7.0"*

Bob writes the entry directly to the local database and returns your updated Po-Ko score. Use this if you forgot to log via the dashboard.

---

### Report lifestyle context (external factors)
> *"I had alcohol last night and missed breakfast — submit my survey for today."*  
> *"I'm emotionally drained and have a big deadline. Log that."*

Bob fuses your self-reported factors into the day's score and shows you what changed.

**Valid factors you can mention:** alcohol last night · exposed to a sick person · poor diet · high workload deadline · missed a meal · emotionally drained · severe allergies · high caffeine · travel / jet lag · physically overexerted · medication side effects.

---

### Get time-specific health advice
> *"Give me my morning advice."*  
> *"What should I do about my health right now? It's lunch."*  
> *"Get my afternoon check-in."*

Advice is grounded in your actual biometric values for the day — not generic tips.

---

## 3. Sick Days

Sick days are tracked separately and show as red markers on the dashboard chart.  
Log them via the **"Sick Day"** button in the web dashboard (`http://localhost:5173`).

---

## 4. Your data never leaves your machine

The MCP server runs entirely locally via `stdio` transport. No biometric data is sent to any external service — not even to IBM Bob's cloud. Bob reads tool outputs only.

---

*That's it. Four prompts. All local. Start with: **"What is my Po-Ko status today?"***
