import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAN_DEFAULT_PORT, LAN_PATHS, LAN_WS_TYPES } from '../src/services/syncAdapter/lanProtocol.js';
import { createLanStore, defaultLanDataDir } from './store.js';
import { upgradeWebSocket } from './wsLite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');

function json(res, code, body) {
  const payload = JSON.stringify(body ?? {});
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    Connection: 'close',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, X-Board-Token, X-Tablet-Password',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  });
  res.end(payload);
}

function corsPreflight(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, X-Board-Token, X-Tablet-Password',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Max-Age': '86400',
  });
  res.end();
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}

function adminTokenFrom(req, body) {
  const header = req.headers['x-admin-token'] || req.headers.authorization || '';
  const bearer = String(header).replace(/^Bearer\s+/i, '').trim();
  if (bearer) return bearer;
  return String(body?.adminToken ?? '').trim();
}

function tabletOptsFrom(req, body) {
  return {
    boardToken: String(req.headers['x-board-token'] ?? body?.boardToken ?? body?.token ?? '').trim(),
    tabletPassword: String(req.headers['x-tablet-password'] ?? body?.tabletPassword ?? '').trim().slice(0, 5),
    board: body?.board ?? '',
    token: String(body?.token ?? '').trim(),
    status: body?.status,
  };
}

export function listLanAddresses() {
  const out = [];
  const nets = networkInterfaces();
  for (const rows of Object.values(nets)) {
    for (const row of rows || []) {
      if (!row || row.internal) continue;
      if (row.family !== 'IPv4' && row.family !== 4) continue;
      if (row.address) out.push(row.address);
    }
  }
  return out;
}

function injectLanMeta(html, port) {
  const snippet = `<script>window.__SDC_LAN_RELAY__={sameOrigin:true,port:${Number(port) || LAN_DEFAULT_PORT}};</script>`;
  if (html.includes('__SDC_LAN_RELAY__')) return html;
  if (html.includes('<head>')) return html.replace('<head>', `<head>${snippet}`);
  return snippet + html;
}

/**
 * @param {{ port?: number, host?: string, dataDir?: string, uiProxyTarget?: string|null, distDir?: string }} [opts]
 */
export function startLanRelay(opts = {}) {
  const port = Number(opts.port) || LAN_DEFAULT_PORT;
  const host = opts.host || '0.0.0.0';
  const store = createLanStore(opts.dataDir || defaultLanDataDir());
  const distDir = opts.distDir || path.join(APP_ROOT, 'dist');
  const uiProxyTarget = opts.uiProxyTarget || process.env.SDC_LAN_UI_PROXY || '';
  /** @type {Map<string, Set<any>>} */
  const socketsByPin = new Map();

  function socketsFor(pin) {
    const id = String(pin ?? '').trim();
    if (!socketsByPin.has(id)) socketsByPin.set(id, new Set());
    return socketsByPin.get(id);
  }

  function broadcast(pin, payload) {
    const msg = JSON.stringify(payload);
    for (const ws of socketsFor(pin)) {
      try {
        ws.send(msg);
      } catch {
        /* ignore */
      }
    }
  }

  function broadcastSnapshot(pin) {
    const data = store.publicSnapshot(pin);
    broadcast(pin, { type: data ? LAN_WS_TYPES.snapshot : LAN_WS_TYPES.deleted, pin, data });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      if (req.method === 'OPTIONS') {
        corsPreflight(res);
        return;
      }

      if (url.pathname === LAN_PATHS.health) {
        json(res, 200, {
          ok: true,
          mode: 'lan',
          port: boundPort(),
          addresses: listLanAddresses(),
          connectedTablets: store.connectedTabletCount(),
          pins: store.listPins(),
        });
        return;
      }

      const tourneyMatch = url.pathname.match(/^\/api\/lan\/tournament\/(\d{4})(?:\/(.*))?$/);
      if (tourneyMatch) {
        const pin = tourneyMatch[1];
        const rest = tourneyMatch[2] || '';
        await handleTournament(req, res, pin, rest, url);
        return;
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        const served = await serveUi(req, res, url);
        if (served) return;
      }

      json(res, 404, { ok: false, error: 'not_found' });
    } catch (err) {
      const code = Number(err?.code) || 500;
      json(res, code >= 400 && code < 600 ? code : 500, { ok: false, error: err?.message || 'error' });
    }
  });
  server.keepAliveTimeout = 1;
  server.headersTimeout = 2_000;

  async function handleTournament(req, res, pin, rest, url) {
    if (rest === '' && req.method === 'GET') {
      await store.ready;
      const snap = store.publicSnapshot(pin);
      if (!snap) {
        json(res, 404, { ok: false, error: 'not_found' });
        return;
      }
      json(res, 200, { ok: true, data: snap });
      return;
    }
    if (rest === '' && req.method === 'PUT') {
      const body = await readBody(req);
      const token = adminTokenFrom(req, body);
      const data = await store.put(pin, body, token);
      broadcastSnapshot(pin);
      json(res, 200, { ok: true, data, adminToken: store.get(pin)?.adminToken || token });
      return;
    }
    if (rest === '' && req.method === 'DELETE') {
      const body = await readBody(req);
      const token = adminTokenFrom(req, body);
      const deleted = await store.remove(pin, token);
      broadcast(pin, { type: LAN_WS_TYPES.deleted, pin, data: null });
      json(res, 200, { ok: true, deleted });
      return;
    }
    if (rest === 'verify' && req.method === 'POST') {
      await store.ready;
      json(res, 200, { ok: !!store.get(pin) });
      return;
    }
    if (rest === 'secrets' && req.method === 'GET') {
      await store.ready;
      const rec = store.get(pin);
      const token = adminTokenFrom(req, {});
      if (!rec) {
        json(res, 404, { ok: false, error: 'not_found' });
        return;
      }
      if (rec.adminToken && rec.adminToken !== token) {
        json(res, 403, { ok: false, error: 'forbidden' });
        return;
      }
      json(res, 200, { ok: true, data: store.secrets(pin) });
      return;
    }
    if (rest === 'tablet/verify' && req.method === 'POST') {
      const body = await readBody(req);
      await store.ready;
      const rec = store.get(pin);
      if (!rec) {
        json(res, 200, { ok: false, reason: 'not_found' });
        return;
      }
      json(res, 200, store.authorizeTablet(rec, tabletOptsFrom(req, body)));
      return;
    }
    if (rest === 'presence' && (req.method === 'POST' || req.method === 'PUT')) {
      const body = await readBody(req);
      const opts = tabletOptsFrom(req, body);
      await store.setPresence(pin, body.board ?? url.searchParams.get('board'), opts);
      broadcastSnapshot(pin);
      json(res, 200, { ok: true });
      return;
    }
    if (rest === 'match' && req.method === 'POST') {
      const body = await readBody(req);
      await store.applyTabletMatch(
        pin,
        body.matchType,
        body.matchId,
        body.matchUpdates,
        tabletOptsFrom(req, body)
      );
      broadcastSnapshot(pin);
      json(res, 200, { ok: true });
      return;
    }
    if (rest === 'archive' && req.method === 'POST') {
      const body = await readBody(req);
      await store.remove(pin, adminTokenFrom(req, body));
      broadcast(pin, { type: LAN_WS_TYPES.deleted, pin, data: null });
      json(res, 200, { ok: true });
      return;
    }
    json(res, 404, { ok: false, error: 'not_found' });
  }

  async function serveUi(req, res, url) {
    if (uiProxyTarget) {
      try {
        const target = new URL(url.pathname + url.search, uiProxyTarget);
        const proxied = await fetch(target, {
          method: req.method,
          headers: { accept: req.headers.accept || '*/*' },
        });
        const buf = Buffer.from(await proxied.arrayBuffer());
        const ctype = proxied.headers.get('content-type') || 'application/octet-stream';
        let body = buf;
        if (ctype.includes('text/html')) {
          body = Buffer.from(injectLanMeta(buf.toString('utf8'), boundPort()), 'utf8');
        }
        res.writeHead(proxied.status, {
          'Content-Type': ctype,
          'Content-Length': body.length,
          'Access-Control-Allow-Origin': '*',
        });
        if (req.method !== 'HEAD') res.write(body);
        res.end();
        return true;
      } catch (err) {
        console.warn('LAN UI proxy failed:', err?.message || err);
      }
    }

    const distIndex = path.join(distDir, 'index.html');
    if (!existsSync(distIndex)) {
      if (url.pathname === '/' || url.pathname.startsWith('/tv/') || url.pathname.startsWith('/tablet')) {
        const html = injectLanMeta(
          `<!doctype html><html><head><meta charset="utf-8"><title>SDC LAN</title></head><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem"><h1>Simple Dart Counter — LAN relay</h1><p>API běží. Pro UI spusťte <code>npm run dev</code> nebo <code>npm run build</code>.</p></body></html>`,
          boundPort()
        );
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return true;
      }
      return false;
    }

    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel.startsWith('/tv/') || rel === '/tablet' || !path.extname(rel)) {
      rel = '/index.html';
    }
    const filePath = path.normalize(path.join(distDir, rel));
    if (!filePath.startsWith(distDir)) return false;
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      rel = '/index.html';
    }
    const finalPath = rel === '/index.html' ? distIndex : path.normalize(path.join(distDir, rel));
    const ext = path.extname(finalPath);
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.webmanifest': 'application/manifest+json',
    };
    if (ext === '.html') {
      const { readFile } = await import('node:fs/promises');
      const html = injectLanMeta(await readFile(finalPath, 'utf8'), boundPort());
      res.writeHead(200, { 'Content-Type': types['.html'] });
      res.end(html);
      return true;
    }
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    createReadStream(finalPath).pipe(res);
    return true;
  }

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    if (url.pathname !== LAN_PATHS.ws && url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const pin = String(url.searchParams.get('pin') ?? '').trim();
    if (!/^\d{4}$/.test(pin)) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const ws = upgradeWebSocket(req, socket, head);
    if (!ws) return;
    const bucket = socketsFor(pin);
    bucket.add(ws);
    const pushInitial = () => {
      const snap = store.publicSnapshot(pin);
      ws.send(
        JSON.stringify({
          type: snap ? LAN_WS_TYPES.snapshot : LAN_WS_TYPES.waiting,
          pin,
          data: snap,
        })
      );
    };
    store.ready.then(pushInitial, pushInitial);
    ws.on('message', (text) => {
      try {
        const msg = JSON.parse(text);
        if (msg?.type === LAN_WS_TYPES.ping) ws.send(JSON.stringify({ type: LAN_WS_TYPES.pong }));
      } catch {
        /* ignore */
      }
    });
    ws.on('close', () => bucket.delete(ws));
  });

  let actualPort = port;
  function boundPort() {
    return actualPort;
  }

  const listening = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        port: actualPort,
        host,
        addresses: listLanAddresses(),
      });
    });
  });

  return {
    server,
    store,
    listening,
    close() {
      for (const set of socketsByPin.values()) {
        for (const ws of set) {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        }
      }
      socketsByPin.clear();
      return new Promise((resolve) => {
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
        server.close(() => resolve());
      });
    },
    broadcastSnapshot,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const relay = startLanRelay({
    port: Number(process.env.SDC_LAN_PORT) || LAN_DEFAULT_PORT,
  });
  relay.listening.then((info) => {
    const urls = ['127.0.0.1', ...info.addresses].map((ip) => `http://${ip}:${info.port}`);
    console.log(`SDC LAN relay listening on ${urls.join(', ')}`);
  });
}
