import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

const WS_PORT = Number(process.env.WS_PORT || 8787);
const CLIENT_PORT = Number(process.env.CLIENT_PORT || 8080);

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

const clientServer = http.createServer(async (request, response) => {
  try {
    const parsedUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    let requestPath = decodeURIComponent(parsedUrl.pathname || '/');
    if (requestPath === '/') requestPath = '/index.html';

    const fullPath = path.resolve(CLIENT_ROOT, `.${requestPath}`);
    if (!fullPath.startsWith(CLIENT_ROOT)) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }

    const fileData = await readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    response.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    response.end(fileData);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

const wss = new WebSocketServer({ port: WS_PORT });

const rooms = new Map(); // room -> Map<id, ws>
const roomHosts = new Map(); // room -> hostId

function getRoom(name) {
  if (!rooms.has(name)) rooms.set(name, new Map());
  return rooms.get(name);
}

function broadcast(room, payload, exceptId = null) {
  const serializedPayload = JSON.stringify(payload);
  for (const [socketId, socket] of room.entries()) {
    if (socketId === exceptId) continue;
    if (socket.readyState === 1) socket.send(serializedPayload);
  }
}

wss.on('connection', (socket) => {
  const id = randomUUID().slice(0, 8);
  let roomName = null;

  socket.send(JSON.stringify({ type: 'welcome', id }));

  socket.on('message', (rawMessage) => {
    let message;
    try { message = JSON.parse(String(rawMessage)); } catch { return; }

    if (message.type === 'host' || message.type === 'join') {
      const baseRoom = String(message.room || 'rift').trim().toLowerCase() || 'rift';

      if (message.type === 'host') {
        roomName = baseRoom;
        let room = getRoom(roomName);
        if (room.size > 0) {
          let n = 2;
          while (getRoom(`${baseRoom}-${n}`).size > 0) n++;
          roomName = `${baseRoom}-${n}`;
          room = getRoom(roomName);
          socket.send(JSON.stringify({ type: 'status', text: `Room in use. Hosting as ${roomName}` }));
        }
        room.set(id, socket);
        roomHosts.set(roomName, id);
        socket.send(JSON.stringify({ type: 'ready', room: roomName, role: 'host', text: `Hosting room ${roomName}` }));
        broadcast(room, { type: 'status', text: `${id} connected (${room.size} players)` }, id);
        return;
      }

      roomName = baseRoom;
      const room = rooms.get(roomName);
      if (!room || room.size === 0) {
        socket.send(JSON.stringify({ type: 'error', text: `Room ${roomName} not found` }));
        return;
      }
      room.set(id, socket);
      socket.send(JSON.stringify({ type: 'ready', room: roomName, role: 'join', text: `Joined room ${roomName}` }));
      broadcast(room, { type: 'status', text: `${id} connected (${room.size} players)` }, id);
      return;
    }

    if (!roomName) return;
    const room = rooms.get(roomName);
    if (!room) return;

    if (message.type === 'state') {
      broadcast(room, { type: 'state', from: id, state: message.state }, id);
      return;
    }

    if (message.type === 'shoot') {
      broadcast(room, { type: 'shoot', from: id, data: message.data }, id);
      return;
    }

    if (message.type === 'enemySnapshot') {
      if (roomHosts.get(roomName) === id) {
        broadcast(room, { type: 'enemySnapshot', data: message.data }, id);
      }
      return;
    }

    if (message.type === 'enemyHit') {
      const hostId = roomHosts.get(roomName);
      const hostSock = hostId ? room.get(hostId) : null;
      if (hostSock && hostSock.readyState === 1) {
        hostSock.send(JSON.stringify({ type: 'enemyHit', from: id, data: message.data }));
      }
      return;
    }

    if (message.type === 'missionFailed') {
      if (roomHosts.get(roomName) === id) {
        broadcast(room, { type: 'missionFailed', from: id, data: message.data }, id);
      }
    }
  });

  socket.on('close', () => {
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

clientServer.listen(CLIENT_PORT, () => {
  console.log(`Client HTTP server: http://localhost:${CLIENT_PORT}`);
});

wss.on('listening', () => {
  console.log(`WebSocket server: ws://localhost:${WS_PORT}`);
});
