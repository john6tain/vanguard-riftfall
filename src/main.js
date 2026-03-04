import { Game } from './core/Game.js';
import { NetClient } from './net/NetClient.js';

function wsDefaultUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname}:8787`;
}

async function boot() {
  const game = new Game(null);

  const roomInput = document.getElementById('roomInput');
  const hostBtn = document.getElementById('hostBtn');
  const joinBtn = document.getElementById('joinBtn');
  const soloBtn = document.getElementById('soloBtn');
  const mpStatus = document.getElementById('mpStatus');

  let net = null;

  const setStatus = (t) => {
    if (mpStatus) mpStatus.textContent = t;
  };

  const connect = async (mode) => {
    const room = (roomInput?.value || 'rift').trim().toLowerCase() || 'rift';
    setStatus(`Connecting (${mode})...`);

    try {
      net = new NetClient();
      net.onStatus = (t) => setStatus(t);
      await net.connect({ url: wsDefaultUrl(), room, mode });
      game.setNetClient(net);
      setStatus(`${mode === 'host' ? 'Host' : 'Joined'}: ${net.room}`);
    } catch (e) {
      setStatus(`Multiplayer error: ${e?.message || e}`);
      net = null;
      game.setNetClient(null);
    }
  };

  hostBtn?.addEventListener('click', () => void connect('host'));
  joinBtn?.addEventListener('click', () => void connect('join'));
  soloBtn?.addEventListener('click', () => {
    net = null;
    game.net = null;
    setStatus('Mode: Solo');
  });

  game.update();
}

boot();
