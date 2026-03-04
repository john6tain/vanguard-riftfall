import { WebSocket } from 'ws';

const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:8787';
const ROOM = (process.env.ROOM || 'rift').trim().toLowerCase();
const MODE = (process.env.MODE || 'join').toLowerCase(); // join|host

let myId = null;
let hostState = { x: 0, z: 0, yaw: 0 };
let myState = { x: 2, z: 2, yaw: 0 };
let enemySnapshot = { enemies: [] };
let connected = false;

function dist2(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  ws.send(JSON.stringify({ type: MODE === 'host' ? 'host' : 'join', room: ROOM }));
});

ws.on('message', (raw) => {
  let msg;
  try { msg = JSON.parse(String(raw)); } catch { return; }

  if (msg.type === 'welcome') {
    myId = msg.id;
    return;
  }

  if (msg.type === 'ready') {
    connected = true;
    console.log(`[bot] connected as ${myId} role=${msg.role} room=${msg.room}`);
    return;
  }

  if (msg.type === 'error') {
    console.error(`[bot] server error: ${msg.text || 'unknown'}`);
    process.exit(1);
  }

  if (msg.type === 'status') {
    console.log(`[bot] ${msg.text}`);
    return;
  }

  if (msg.type === 'state' && msg.state) {
    // Track first non-self state as lead player state.
    hostState = {
      x: Number(msg.state.x) || 0,
      z: Number(msg.state.z) || 0,
      yaw: Number(msg.state.yaw) || 0,
    };
    return;
  }

  if (msg.type === 'enemySnapshot' && msg.data) {
    enemySnapshot = msg.data;
  }
});

ws.on('close', () => {
  connected = false;
  console.log('[bot] disconnected');
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('[bot] ws error:', err.message || err);
});

function send(type, payload) {
  if (!connected || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type, ...payload }));
}

let t = 0;
setInterval(() => {
  if (!connected) return;
  t += 0.05;

  // Companion follow behavior: stay near player, slight orbit.
  const desired = {
    x: hostState.x + Math.cos(t) * 2.8,
    z: hostState.z + Math.sin(t) * 2.8,
  };

  myState.x += (desired.x - myState.x) * 0.18;
  myState.z += (desired.z - myState.z) * 0.18;

  // Face nearest enemy if any, else face same direction as host.
  let target = null;
  if (Array.isArray(enemySnapshot.enemies) && enemySnapshot.enemies.length) {
    target = enemySnapshot.enemies.reduce((best, e) => {
      const d = dist2(myState, { x: e.x || 0, z: e.z || 0 });
      return !best || d < best.d ? { e, d } : best;
    }, null)?.e;
  }

  if (target) {
    const dx = (target.x || 0) - myState.x;
    const dz = (target.z || 0) - myState.z;
    myState.yaw = Math.atan2(-dx, -dz);

    // Request host-authoritative damage for nearest enemy at controlled rate.
    if (Math.random() < 0.25 && target.id) {
      send('enemyHit', { data: { id: target.id, dmg: 18 } });

      // Also broadcast a visual shot for other clients.
      const len = Math.hypot(dx, dz) || 1;
      send('shoot', {
        data: {
          x: myState.x,
          y: 1.5,
          z: myState.z,
          dx: dx / len,
          dy: 0,
          dz: dz / len,
        },
      });
    }
  } else {
    myState.yaw = hostState.yaw;
  }

  myState.x = clamp(myState.x, -145, 145);
  myState.z = clamp(myState.z, -145, 145);

  send('state', { state: myState });
}, 50);

console.log(`[bot] connecting to ${WS_URL} room=${ROOM} mode=${MODE}`);
