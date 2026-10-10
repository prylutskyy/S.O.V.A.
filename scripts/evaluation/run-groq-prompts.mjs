import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// The credential exists only in process memory and the test child's environment.
// Never pass it as an argument, write it to disk or print it.
let key = process.env.GROQ_API_KEY;
if (!key) {
  if (!process.stdin.isTTY) throw new Error('Set GROQ_API_KEY or use an interactive terminal');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  console.log('Enter test API key (hidden input):');
  try {
    key = await new Promise(resolve => {
      let value = '';
      process.stdin.on('data', function receive(chunk) {
        value += chunk.toString();
        if (value.includes('\u0003')) process.exit(130);
        if (/[\r\n]/.test(value)) {
          process.stdin.off('data', receive);
          resolve(value.trim());
        }
      });
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}
if (!key) throw new Error('No test credential supplied');
mkdirSync(resolve('.cache/vitest'), { recursive: true });
const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run',
  'tests/integration/groq-prompts.integration.test.ts', '--pool=threads', '--maxWorkers=1'], {
  stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, GROQ_API_KEY: key, GROQ_INTEGRATION: '1', GROQ_PROMPT_COMPARE: '1',
    GROQ_CORPUS: process.env.GROQ_CORPUS || 'regressions',
    TEMP: resolve('.cache/vitest'), TMP: resolve('.cache/vitest') },
});
key = undefined;
child.on('exit', code => process.exitCode = code ?? 1);
child.on('error', () => { console.error('Unable to start Groq test runner'); process.exitCode = 1; });
