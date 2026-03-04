export class InputManager {
  constructor(player, lockElement) {
    this.player = player;
    this.lockElement = lockElement;
    this.keys = {};
    this.mouseDown = false;
    this.yaw = 0;
    this.pitch = 0;
    this.locked = false;

    this.mobileMove = { x: 0, y: 0 };
    this.mobileLook = { x: 0, y: 0 };

    const ua = navigator.userAgent || '';
    const mobileUA = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua);
    const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const smallScreen = Math.min(window.innerWidth, window.innerHeight) <= 1024;
    this.isMobileTouch = !!(mobileUA || (coarsePointer && smallScreen));
    if (this.isMobileTouch) document.body.classList.add('mobile');

    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (k === 'r') this.player.reloadInstant();
      if (k === ' ' || e.code === 'Space') this.player.jump();
    });
    addEventListener('keyup', (e) => (this.keys[e.key.toLowerCase()] = false));
    addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    addEventListener('mouseup', () => (this.mouseDown = false));

    document.addEventListener('mousemove', (e) => {
      if (!this.locked || this.isMobileTouch) return;
      this.yaw -= e.movementX * 0.0018;
      this.pitch -= e.movementY * 0.0016;
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
    });

    document.addEventListener('pointerlockchange', () => {
      if (this.isMobileTouch) return;
      this.locked = document.pointerLockElement === this.lockElement;
    });

    this.setupMobileControls();
  }

  setupMobileControls() {
    if (!this.isMobileTouch) return;

    const moveStick = document.getElementById('moveStick');
    const lookStick = document.getElementById('lookStick');
    const moveKnob = document.getElementById('moveKnob');
    const lookKnob = document.getElementById('lookKnob');
    const fireBtn = document.getElementById('fireBtn');
    const reloadBtn = document.getElementById('reloadBtn');

    if (!(moveStick && lookStick && moveKnob && lookKnob && fireBtn && reloadBtn)) return;

    const touchRoles = new Map();
    const inside = (el, x, y) => {
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    const setStick = (knob, out, touch, el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const radius = 48;
      let dx = touch.clientX - cx;
      let dy = touch.clientY - cy;
      const d = Math.hypot(dx, dy) || 1;
      if (d > radius) {
        dx = (dx / d) * radius;
        dy = (dy / d) * radius;
      }
      out.x = dx / radius;
      out.y = dy / radius;
      knob.style.left = `${46 + dx}px`;
      knob.style.top = `${46 + dy}px`;
    };
    const resetStick = (knob, out) => {
      out.x = 0;
      out.y = 0;
      knob.style.left = '46px';
      knob.style.top = '46px';
    };

    document.addEventListener('touchstart', (e) => {
      if (!this.isMobileTouch) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        let role = null;
        if (inside(moveStick, t.clientX, t.clientY)) role = 'move';
        else if (inside(lookStick, t.clientX, t.clientY)) role = 'look';
        else if (inside(fireBtn, t.clientX, t.clientY)) role = 'fire';
        else if (inside(reloadBtn, t.clientX, t.clientY)) role = 'reload';
        if (!role) continue;
        let busy = false;
        for (const r of touchRoles.values()) if (r === role) busy = true;
        if (busy) continue;
        touchRoles.set(t.identifier, role);
        if (role === 'move') setStick(moveKnob, this.mobileMove, t, moveStick);
        if (role === 'look') setStick(lookKnob, this.mobileLook, t, lookStick);
        if (role === 'fire') this.mouseDown = true;
        if (role === 'reload') this.player.reloadInstant();
      }
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
      if (!this.isMobileTouch) return;
      e.preventDefault();
      for (const t of e.touches) {
        const role = touchRoles.get(t.identifier);
        if (role === 'move') setStick(moveKnob, this.mobileMove, t, moveStick);
        if (role === 'look') setStick(lookKnob, this.mobileLook, t, lookStick);
      }
    }, { passive: false });

    const endHandler = (e) => {
      for (const t of e.changedTouches) {
        const role = touchRoles.get(t.identifier);
        if (!role) continue;
        if (role === 'move') resetStick(moveKnob, this.mobileMove);
        if (role === 'look') resetStick(lookKnob, this.mobileLook);
        if (role === 'fire') this.mouseDown = false;
        touchRoles.delete(t.identifier);
      }
    };
    document.addEventListener('touchend', endHandler, { passive: true });
    document.addEventListener('touchcancel', endHandler, { passive: true });
  }
}
