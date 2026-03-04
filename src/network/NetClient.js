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
      const socket = new WebSocket(url);
      this.ws = socket;
      this.room = room;
      let isSettled = false;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: mode === 'host' ? 'host' : 'join', room }));
      };

      socket.onmessage = (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }

        if (message.type === 'welcome') {
          this.id = message.id;
          return;
        }

        if (message.type === 'ready') {
          this.connected = true;
          this.isHost = message.role === 'host';
          this.room = message.room || this.room;
          this.onStatus?.(`${message.text || 'Connected'} (${this.room})`);
          if (!isSettled) {
            isSettled = true;
            resolve(message);
          }
          return;
        }

        if (message.type === 'error') {
          if (!isSettled) {
            isSettled = true;
            reject(new Error(message.text || 'Connection rejected'));
          }
          this.onStatus?.(message.text || 'Connection error');
          try { socket.close(); } catch {}
          return;
        }

        if (message.type === 'status') {
          this.onStatus?.(message.text || 'Connected');
          return;
        }
        if (message.type === 'state' && message.from && message.state) {
          this.onRemoteState?.(message.from, message.state);
          return;
        }
        if (message.type === 'shoot' && message.from && message.data) {
          this.onRemoteShoot?.(message.from, message.data);
          return;
        }
        if (message.type === 'enemySnapshot' && message.data) {
          this.onEnemySnapshot?.(message.data);
          return;
        }
        if (message.type === 'enemyHit' && message.data) {
          this.onEnemyHit?.(message.from, message.data);
          return;
        }
        if (message.type === 'missionFailed') {
          this.onMissionFailed?.(message);
        }
      };

      socket.onerror = () => {
        if (!isSettled) {
          isSettled = true;
          reject(new Error('WebSocket connection failed'));
        }
      };
      socket.onclose = () => {
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
