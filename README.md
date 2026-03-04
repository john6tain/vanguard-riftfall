# Vanguard: Riftfall

Free browser-based FPS wave shooter built with Three.js.

## Features
- Fast arena combat with wave progression
- Desktop + mobile controls
- HUD for HP, shield, ammo, kills, score, and streak
- Multiplayer MVP (host/join room)
- Host-authoritative enemy sync (shared enemy state across players)
- Lightweight static-site structure (easy to deploy)

## Run locally
Because the app uses ES modules, serve it from a local web server:

```bash
cd vanguard-riftfall

# Option 1 (Python)
python3 -m http.server 8080

# Option 2 (Node, no install)
npx serve -l 8080 .

# Option 3 (Node, classic)
npx http-server -p 8080 .
```

Then open:
`http://localhost:8080`

## Multiplayer MVP run
The server process exposes two ports:
- Client HTTP: `http://localhost:8080`
- WebSocket: `ws://localhost:8787`

### 1) Start server (client + WebSocket)
```bash
cd vanguard-riftfall/server
npm install
npm run start
```
Defaults:
- Client: `http://localhost:8080`
- WS: `ws://localhost:8787`

Optional custom ports:
```bash
CLIENT_PORT=8081 WS_PORT=8788 npm run start
```

### 2) In-game setup
On the start panel:
- Enter room code
- Click Host on one player
- Click Join on the other player using the same room code

Notes:
- If host room name is already used, server auto-renames (`room-2`, `room-3`, ...).
- If host dies, mission fails for all players in that room.

## Controls
### Desktop
- `WASD` move
- Mouse look
- Click to fire
- `R` reload
- `Shift` sprint

### Mobile
- Left stick: move
- Right stick: look
- `FIRE` button: shoot
- `R` button: reload

## Project structure
- `index.html` - page shell, HUD, multiplayer start UI
- `src/main.js` - game bootstrap + multiplayer UI wiring
- `src/game/core/Game.js` - main game loop + sync hooks
- `src/game/core/WorldBuilder.js` - scene, arena, extract objective, camera, renderer bootstrap
- `src/game/core/*Controller.js` - OOP controllers for UI, motion, combat, network ticks, objectives, and player state
- `src/game/entities/*` - player + enemy domain logic
- `src/game/entities/EnemyFactory.js` - enemy creation and spawn configuration
- `src/game/entities/EnemyAiSystem.js` - enemy movement, animation, melee, and shoot logic
- `src/game/entities/EnemyProjectileSystem.js` - enemy projectile travel, collisions, and cleanup
- `src/game/systems/*` - input, collision, wave, and ads systems
- `src/network/NetClient.js` - WebSocket client transport
- `src/shared/math.js` - common math helpers
- `server/server.mjs` - multiplayer room WebSocket server
- `server/package.json` - server deps/scripts
- `robots.txt`, `sitemap.xml` - SEO/static metadata

## Deployment
Deploy as a static site (Cloudflare Pages/Workers static assets, Netlify, Vercel static, GitHub Pages, etc.).
