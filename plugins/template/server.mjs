import { createServer } from 'node:http';
// Implement: POST { op: 'health'|'preview'|'import'|'sync', context, fileText? } -> { ok, records, cursor?, warnings? }
// Records follow packages/plugin-sdk/src/protocol.ts. Use context.credential for the user's token; never store it.
createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const r = JSON.parse(body || '{}');
    res.setHeader('content-type', 'application/json');
    if (r.op === 'health') return res.end(JSON.stringify({ ok: true, records: [] }));
    res.end(JSON.stringify({ ok: true, records: [
      { kind: 'person', providerId: 'p1', name: 'Example Person', relationship: 'mutual_connection', direction: 'mutual', confidence: 0.6,
        provenance: { name: { source: 'my-connector:profile', retrievedAt: new Date().toISOString() } } },
    ], warnings: ['Template connector: replace with real data.'] }));
  });
}).listen(Number(process.env.PORT || 8788));
