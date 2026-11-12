// Minimal stand-in for Supabase's Kong gateway: path-prefix routing only.
import http from 'node:http';
const routes = [['/auth/v1', 9999], ['/rest/v1', 3001], ['/storage/v1', 5000]];
http.createServer((req, res) => {
  const hit = routes.find(([p]) => req.url.startsWith(p));
  if (!hit) { res.writeHead(404); return res.end(); }
  const [prefix, port] = hit;
  const headers = { ...req.headers, host: `localhost:${port}` };
  // Kong in Supabase turns `apikey` into Authorization when no bearer is present
  if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
  const up = http.request({ host: '127.0.0.1', port, method: req.method, path: req.url.slice(prefix.length) || '/', headers }, (r) => {
    const h = { ...r.headers, 'access-control-allow-origin': req.headers.origin ?? '*', 'access-control-allow-credentials': 'true' };
    res.writeHead(r.statusCode ?? 502, h);
    r.pipe(res);
  });
  up.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(up);
}).listen(54321, () => console.log('GATEWAY_READY'));
