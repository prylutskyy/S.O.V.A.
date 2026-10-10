import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const command = process.argv[2];
if (!['prepare', 'train', 'evaluate', 'compare', 'pilot'].includes(command)) throw new Error('Expected prepare, train, evaluate, compare, or pilot');
mkdirSync('.cache/local-classifier', { recursive: true });
const outfile = resolve(`.cache/local-classifier/${command}.mjs`);
if (command === 'compare') await build({ entryPoints: ['scripts/local-classifier/size-worker.ts'], outfile: resolve('.cache/local-classifier/size-worker.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node22' });
if (command === 'pilot') await build({ entryPoints: ['scripts/local-classifier/pilot-worker.ts'], outfile: resolve('.cache/local-classifier/pilot-worker.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node22' });
await build({ entryPoints: [`scripts/local-classifier/${command}.ts`], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22' });
await import(pathToFileURL(outfile).href);
