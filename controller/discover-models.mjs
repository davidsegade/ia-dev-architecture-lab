import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { parseAvailableModels } from './models.mjs';

export function discoverModels(binary, { timeout = 30000 } = {}) {
  const result = spawnSync(binary, ['models', 'opencode', '--refresh'], {
    encoding: 'utf8',
    timeout,
    maxBuffer: 1024 * 1024,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      LANG: 'en_US.UTF-8',
      DO_NOT_TRACK: '1'
    }
  });
  if (result.error?.code === 'ETIMEDOUT') throw new Error('OpenCode model discovery timed out');
  if (result.status !== 0) throw new Error(`OpenCode model discovery failed: ${result.stderr || result.error?.message || result.status}`);
  const models = parseAvailableModels(result.stdout);
  if (!models.length) throw new Error('OpenCode model discovery returned no provider models');
  return { models, encoded: Buffer.from(result.stdout, 'utf8').toString('base64') };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const binary = process.env.OPENCODE_BIN || 'opencode';
  const { models, encoded } = discoverModels(binary);
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT required');
  appendFileSync(process.env.GITHUB_OUTPUT, `models=${encoded}\n`);
  console.log(JSON.stringify({ discovered: models.length }));
}
