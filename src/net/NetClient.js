export class NetClient {
  constructor() {
    this.ws = null;
    this.id = null;
    this.room = null;
    this.connected = false;
    this.isHost = false;
    this.onRemoteState = null;
    this.onRemoteShoot = null;
    this.onEnemySnapshot = null;
    this.onEnemyHit = null;
    this.onMissionFailed = null;
    this.onStatus = null;
  }

  connect({ url, room, mode }) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      this.room = room;
      let settled = false;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: mode === 'host' ? 'host' : 'join', room }));
      };

      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }

        if (msg.type === 'welcome') {
          this.id = msg.id;
          return;
        }

        if (msg.type === 'ready') {
          this.connected = true;
          this.isHost = msg.role === 'host';
          this.room = msg.room || this.room;
          this.onStatus?.(`${msg.text || 'Connected'} (${this.room})`);
          if (!settled) {
            settled = true;
            resolve(msg);
          }
          return;
        }

        if (msg.type === 'error') {
          if (!settled) {
            settled = true;
            reject(new Error(msg.text || 'Connection rejected'));
          }
          this.onStatus?.(msg.text || 'Connection error');
          try { ws.close(); } catch {}
          return;
        }

        if (msg.type === 'status') {
          this.onStatus?.(msg.text || 'Connected');
          return;
        }
        if (msg.type === 'state' && msg.from && msg.state) {
          this.onRemoteState?.(msg.from, msg.state);
          return;
        }
        if (msg.type === 'shoot' && msg.from && msg.data) {
          this.onRemoteShoot?.(msg.from, msg.data);
          return;
        }
        if (msg.type === 'enemySnapshot' && msg.data) {
          this.onEnemySnapshot?.(msg.data);
          return;
        }
        if (msg.type === 'enemyHit' && msg.data) {
          this.onEnemyHit?.(msg.from, msg.data);
          return;
        }
        if (msg.type === 'missionFailed') {
          this.onMissionFailed?.(msg);
        }
      };

      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket connection failed'));
        }
      };
      ws.onclose = () => {
        this.connected = false;
        this.onStatus?.('Disconnected');
      };
    });
  }

  sendState(state) {
    if (!this.connected || !this.ws) return;
    this.ws.send(JSON.stringify({ type: 'state', state }));
  }

  sendShoot(data) {
    if (!this.connected || !this.ws) return;
    this.ws.send(JSON.stringify({ type: 'shoot', data }));
  }

  sendEnemySnapshot(data) {
    if (!this.connected || !this.ws) return;
    this.ws.send(JSON.stringify({ type: 'enemySnapshot', data }));
  }

  sendEnemyHit(data) {
    if (!this.connected || !this.ws) return;
    this.ws.send(JSON.stringify({ type: 'enemyHit', data }));
  }

  sendMissionFailed(data = {}) {
    if (!this.connected || !this.ws) return;
    this.ws.send(JSON.stringify({ type: 'missionFailed', data }));
  }
}
