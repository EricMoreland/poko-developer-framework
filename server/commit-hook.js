import fs from 'fs';
import { execSync } from 'child_process';

// Husky passes the commit message file path as the first argument
const commitMsgFile = process.argv[2];

async function scanCommit() {
  try {
    const commitMsg = fs.readFileSync(commitMsgFile, 'utf-8');
    const filesChanged = parseInt(execSync('git diff --cached --name-only | wc -l').toString().trim(), 10) || 1;

    const response = await fetch('http://localhost:3001/api/guardian/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskDescription: commitMsg, filesChanged, isCompromised: true })
    });

    if (!response.ok) return;

    const result = await response.json();

    if (result.flagForTraceability) {
      const flagMetadata = `\n\n⚠️ [PO-KO-FLAG: ${result.classification} COGNITIVE LOAD]\nContext: Active Support State\nGuidance: ${result.routingAction}`;
      fs.appendFileSync(commitMsgFile, flagMetadata);
      console.warn('\n🛡️ Po-Ko Code Guardian: Fatigue-Risk Flag automatically appended to your commit message.\n');
    }
  } catch (err) {
    // Fails silently if the server isn't running
  }
}

scanCommit();