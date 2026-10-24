// Copies pure packages into supabase/functions/_shared so Deno functions can import them without a bundler.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shared = join(root, 'supabase/functions/_shared');
for (const d of ['core', 'plugin-sdk', 'connectors']) rmSync(join(shared, d), { recursive: true, force: true });
cpSync(join(root, 'packages/core/src'), join(shared, 'core'), { recursive: true });
cpSync(join(root, 'packages/plugin-sdk/src'), join(shared, 'plugin-sdk'), { recursive: true });
mkdirSync(join(shared, 'connectors'), { recursive: true });
const li = readFileSync(join(root, 'plugins/linkedin-export/src/index.ts'), 'utf8')
  .replace("'../../../packages/core/src/index.ts'", "'../core/index.ts'")
  .replace("'../../../packages/plugin-sdk/src/index.ts'", "'../plugin-sdk/index.ts'");
writeFileSync(join(shared, 'connectors/linkedin-export.ts'), li);
console.log('synced _shared (generated; do not edit)');
