#!/usr/bin/env node
/**
 * PostToolUse Hook: Accumulate edited JS/TS/Python file paths for batch processing.
 *
 * Records each edited file path to a session-scoped temp file.
 * stop-format-typecheck.js reads this list at Stop time, eliminating per-edit latency.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_STDIN = 1024 * 1024;

// Lives in the project's gitignored .claude/logs/, not a shared os.tmpdir() with a
// predictable name another local user could pre-create (SECURITY-AUDIT-2026-10-29 #5).
function getAccumFile() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const raw = process.env.CLAUDE_SESSION_ID ||
    crypto.createHash('sha1').update(projectDir).digest('hex').slice(0, 12);
  const sessionId = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return path.join(projectDir, '.claude', 'logs', `caw-edited-${sessionId}.txt`);
}

const SUPPORTED_EXT = /\.(ts|tsx|js|jsx|py)$/;

function appendPath(filePath) {
  if (filePath && SUPPORTED_EXT.test(filePath)) {
    const accumFile = getAccumFile();
    fs.mkdirSync(path.dirname(accumFile), { recursive: true });
    fs.appendFileSync(accumFile, filePath + '\n', 'utf8');
  }
}

function run(rawInput) {
  try {
    const input = JSON.parse(rawInput);
    appendPath(input.tool_input?.file_path);
    const edits = input.tool_input?.edits;
    if (Array.isArray(edits)) {
      for (const edit of edits) appendPath(edit?.file_path);
    }
  } catch { /* invalid input — pass through */ }
  return rawInput;
}

if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length); });
  process.stdin.on('end', () => { process.stdout.write(run(data)); process.exit(0); });
}

module.exports = { run };
