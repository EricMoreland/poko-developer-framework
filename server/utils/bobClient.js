/**
 * server/utils/bobClient.js — Shared Bob MCP call utility
 * ─────────────────────────────────────────────────────────────────────────────
 * Calls the Bob MCP stdio server and returns the parsed text response.
 * Used by both learningEngine.js and adviceEngine.js.
 *
 * Uses the @modelcontextprotocol/sdk Client + StdioClientTransport to spawn
 * a Bob MCP process and make a single tool call, then disconnect.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * Send a prompt to Bob via MCP and return the text response string.
 *
 * This function spawns a fresh Bob MCP connection per call so it is safe
 * to call from concurrent async contexts without shared state issues.
 *
 * @param {string} prompt  - The full prompt text to send to Bob
 * @returns {Promise<string>}  Bob's plain-text response
 */
export async function callBobMCP(prompt) {
  const transport = new StdioClientTransport({
    command: 'bob',
    args: ['mcp'],
  });

  const client = new Client(
    { name: 'poko-engine', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  try {
    const result = await client.callTool({
      name: 'chat',
      arguments: { message: prompt },
    });

    // Bob returns content as an array of content blocks; extract the first text block.
    const textBlock = result?.content?.find?.((c) => c.type === 'text');
    return textBlock?.text ?? JSON.stringify(result);
  } finally {
    await client.close();
  }
}
