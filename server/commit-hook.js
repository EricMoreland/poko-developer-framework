import fs from 'fs';
import { execFileSync } from 'child_process';

const commitMsgFile = process.argv[2];
const GUARDIAN_URL =
  process.env.POKO_GUARDIAN_URL ||
  'http://localhost:3001/api/guardian/classify';

function getStagedFileCount() {
  const output = execFileSync(
    'git',
    ['diff', '--cached', '--name-only'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }
  );

  return output.split(/\r?\n/).filter(Boolean).length;
}

function appendFlag({ score, riskLevel, classification, guidance }) {
  return [
    'Po-Ko-Flag: ACTIVE SUPPORT STATE',
    'Po-Ko-Context: Active Support State',
    `Po-Ko-Score: ${score}/10 (${riskLevel})`,
    `Po-Ko-Cognitive-Load: ${classification}`,
    `Po-Ko-Guidance: ${guidance.replace(/\s+/g, ' ').trim()}`,
  ].join('\n');
}

async function scanCommit() {
  if (!commitMsgFile) return;

  try {
    const originalMessage = fs.readFileSync(commitMsgFile, 'utf8');
    const filesChanged = getStagedFileCount();

    const response = await fetch(GUARDIAN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskDescription: originalMessage,
        filesChanged,
      }),
    });

    if (!response.ok) return;

    const result = await response.json();

    if (
      !result.isCompromised ||
      originalMessage.includes('Po-Ko-Flag:')
    ) {
      return;
    }

    const flag = appendFlag({
      score: result.pokoScore ?? 'unknown',
      riskLevel: result.pokoRiskLevel ?? 'unknown',
      classification: result.classification ?? 'UNKNOWN',
      guidance:
        result.routingAction ||
        'Request secondary review and consider an elevated post-merge audit.',
    });

    const separator = originalMessage.endsWith('\n') ? '\n' : '\n\n';

    fs.writeFileSync(
      commitMsgFile,
      `${originalMessage}${separator}${flag}\n`,
      'utf8'
    );

    console.warn(
      'Po-Ko Code Guardian: high cognitive-load flag appended to commit message.'
    );
  } catch (err) {
    console.warn(
      `Po-Ko Code Guardian: scan skipped (${err.message}).`
    );
  }
}

scanCommit();