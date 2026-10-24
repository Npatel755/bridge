#!/usr/bin/env node
// Validates a connector manifest and fixture responses with the same rules the Bridge host applies.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const manifestPath = resolve(get('--manifest') ?? 'manifest.json');
const fixturesDir = resolve(get('--fixtures') ?? 'fixtures');
const sdk = await import(fileURLToPath(new URL('../dist/index.js', import.meta.url))).catch(async () =>
  import(fileURLToPath(new URL('../src/index.ts', import.meta.url))));
let failed = 0;
const manifest = sdk.validateManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
if (!manifest.ok) { failed++; console.log('✗ manifest:', manifest.errors.join('; ')); } else console.log(`✓ manifest ${manifest.value.id}@${manifest.value.version}`);
for (const f of readdirSync(fixturesDir).filter((f) => f.endsWith('.json'))) {
  const res = sdk.validateResponse(JSON.parse(readFileSync(join(fixturesDir, f), 'utf8')), manifest.value?.id ?? 'x', manifest.value?.limits.maxRecords ?? 100);
  if (!res.ok) { failed++; console.log(`✗ ${f}: ${res.error}`); continue; }
  console.log(`✓ ${f}: ${res.records.length} valid records, ${res.rejected.length} rejected`);
  for (const r of res.rejected) console.log(`    rejected #${r.index}: ${r.reason}`);
  const personal = res.records.filter((r) => r.kind === 'person' && (r.relationship === 'personal' || r.relationship === 'colleague'));
  if (personal.length) console.log(`    note: ${personal.length} record(s) claim personal/colleague relationships; the host downgrades these to suggested until the user confirms.`);
}
process.exit(failed ? 1 : 0);
