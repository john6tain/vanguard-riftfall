import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8787);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_ROOT = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    let reqPath = decodeURIComponent(url.pathname || '/');

    if (reqPath === '/') reqPath = '/index.html';

    const fullPath = path.resolve(CLIENT_ROOT, `.${reqPath}`);
    if (!fullPath.startsWith(CLIENT_ROOT)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const data = await readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

const wss = new WebSocketServer({ server });

const rooms = new Map(); // room -> Map<id, ws>
const roomHosts = new Map(); // room -> hostId

function getRoom(name) {
  if (!rooms.has(name)) rooms.set(name, new Map());
  return rooms.get(name);
}

function broadcast(room, payload, exceptId = null) {
  const data = JSON.stringify(payload);
  for (const [id, sock] of room.entries()) {
    if (id === exceptId) continue;
    if (sock.readyState === 1) sock.send(data);
  }
}

wss.on('connection', (ws) => {
  const id = randomUUID().slice(0, 8);
  let roomName = null;

  ws.send(JSON.stringify({ type: 'welcome', id }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }

    if (msg.type === 'host' || msg.type === 'join') {
      const baseRoom = String(msg.room || 'rift').trim().toLowerCase() || 'rift';

      if (msg.type === 'host') {
        roomName = baseRoom;
        let room = getRoom(roomName);
        if (room.size > 0) {
          let n = 2;
          while (getRoom(`${baseRoom}-${n}`).size > 0) n++;
          roomName = `${baseRoom}-${n}`;
          room = getRoom(roomName);
          ws.send(JSON.stringify({ type: 'status', text: `Room in use. Hosting as ${roomName}` }));
        }
        room.set(id, ws);
        roomHosts.set(roomName, id);
        ws.send(JSON.stringify({ type: 'ready', room: roomName, role: 'host', text: `Hosting room ${roomName}` }));
        broadcast(room, { type: 'status', text: `${id} connected (${room.size} players)` }, id);
        return;
      }

      roomName = baseRoom;
      const room = rooms.get(roomName);
      if (!room || room.size === 0) {
        ws.send(JSON.stringify({ type: 'error', text: `Room ${roomName} not found` }));
        return;
      }
      room.set(id, ws);
      ws.send(JSON.stringify({ type: 'ready', room: roomName, role: 'join', text: `Joined room ${roomName}` }));
      broadcast(room, { type: 'status', text: `${id} connected (${room.size} players)` }, id);
      return;
    }

    if (!roomName) return;
    const room = rooms.get(roomName);
    if (!room) return;

    if (msg.type === 'state') {
      broadcast(room, { type: 'state', from: id, state: msg.state }, id);
      return;
    }

    if (msg.type === 'shoot') {
      broadcast(room, { type: 'shoot', from: id, data: msg.data }, id);
      return;
    }

    if (msg.type === 'enemySnapshot') {
      if (roomHosts.get(roomName) === id) {
        broadcast(room, { type: 'enemySnapshot', data: msg.data }, id);
      }
      return;
    }

    if (msg.type === 'enemyHit') {
      const hostId = roomHosts.get(roomName);
      const hostSock = hostId ? room.get(hostId) : null;
      if (hostSock && hostSock.readyState === 1) {
        hostSock.send(JSON.stringify({ type: 'enemyHit', from: id, data: msg.data }));
      }
      return;
    }

    if (msg.type === 'missionFailed') {
      if (roomHosts.get(roomName) === id) {
        broadcast(room, { type: 'missionFailed', from: id, data: msg.data }, id);
      }
    }
  });

  ws.on('close', () => {
    if (!roomName) return;
    const room = rooms.get(roomName);
    if (!room) return;
    room.delete(id);
    if (roomHosts.get(roomName) === id) roomHosts.delete(roomName);
    broadcast(room, { type: 'status', text: `${id} left (${room.size} players)` });
    if (room.size === 0) {
      rooms.delete(roomName);
      roomHosts.delete(roomName);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Riftfall server running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});
