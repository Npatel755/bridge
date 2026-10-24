// Minimal connector service. Speaks the Bridge connector JSON protocol over HTTP. No Bridge credentials ever reach it.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, 'fixtures/people.json'), 'utf8'));
const port = Number(process.env.PORT || 8787);
createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ ok: false, error: 'POST only' })); }
    let r; try { r = JSON.parse(body); } catch { res.statusCode = 400; return res.end(JSON.stringify({ ok: false, error: 'bad json' })); }
    if (r.op === 'health') return res.end(JSON.stringify({ ok: true, records: [] }));
    if (r.op === 'preview' || r.op === 'import' || r.op === 'sync')
      return res.end(JSON.stringify({ ...fixture, cursor: { page: 1, subject: r.context?.subjectId } }));
    res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: `unknown op ${r.op}` }));
  });
}).listen(port, () => console.log(`community-example connector on :${port}`));
