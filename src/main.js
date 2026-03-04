import { Game } from './game/core/Game.js';
import { NetClient } from './network/NetClient.js';

function wsDefaultUrl() {
  const socketProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${socketProtocol}://${location.hostname}:8787`;
}

async function boot() {
  const game = new Game(null);

  const roomInput = document.getElementById('roomInput');
  const hostBtn = document.getElementById('hostBtn');
  const joinBtn = document.getElementById('joinBtn');
  const soloBtn = document.getElementById('soloBtn');
  const mpStatus = document.getElementById('mpStatus');

  let activeNetClient = null;

  const setStatus = (statusText) => {
    if (mpStatus) mpStatus.textContent = statusText;
  };

  const sendAliveState = (isAlive) => {
    if (!activeNetClient?.connected) return;
    activeNetClient.sendState({
      x: game.camera.position.x,
      z: game.camera.position.z,
      yaw: game.input.yaw,
      alive: !!isAlive,
    });
  };

  const connect = async (mode) => {
    const room = (roomInput?.value || 'rift').trim().toLowerCase() || 'rift';
    setStatus(`Connecting (${mode})...`);

    try {
      activeNetClient = new NetClient();
      activeNetClient.onStatus = (statusText) => setStatus(statusText);
      await activeNetClient.connect({ url: wsDefaultUrl(), room, mode });
      game.setNetClient(activeNetClient);
      setStatus(`${mode === 'host' ? 'Host' : 'Joined'}: ${activeNetClient.room}`);
    } catch (error) {
      setStatus(`Multiplayer error: ${error?.message || error}`);
      activeNetClient = null;
      game.setNetClient(null);
    }
  };

  hostBtn?.addEventListener('click', () => void connect('host'));
  joinBtn?.addEventListener('click', () => void connect('join'));
  soloBtn?.addEventListener('click', () => {
    activeNetClient = null;
    game.setNetClient(null);
    setStatus('Mode: Solo');
  });

  game.update();

  // Broadcast death/alive state for multiplayer target filtering.
  setInterval(() => {
    sendAliveState(!game.gameOver);
  }, 200);
}

boot();
