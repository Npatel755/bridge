// Serves the static web export (apps/mobile/dist) with an index.html fallback. Usage: npm run web:serve [port]
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = new URL('../apps/mobile/dist', import.meta.url).pathname;
const port = Number(process.argv[2] ?? process.env.PORT ?? 8081);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.map': 'application/json' };
createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(root, url));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    const html = existsSync(file + '.html') ? file + '.html' : existsSync(join(file, 'index.html')) ? join(file, 'index.html') : join(root, 'index.html');
    file = html;
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Bridge web preview on http://localhost:${port}`));
