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
Run client and WebSocket server on separate ports.

### 1) Start multiplayer server (WebSocket)
```bash
cd vanguard-riftfall/server
npm install
npm run start
```
Server listens on:
`ws://localhost:8787`

### 2) Start game client (HTTP)
```bash
cd vanguard-riftfall
python3 -m http.server 8080
```
Client runs on:
`http://localhost:8080`

### 3) In-game setup
On the start panel:
- Enter room code
- Click **Host** on one player
- Click **Join** on the other player using the same room code

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
- `index.html` — page shell, HUD, multiplayer start UI
- `src/main.js` — game bootstrap + multiplayer UI wiring
- `src/core/Game.js` — main game loop + sync hooks
- `src/net/NetClient.js` — WebSocket client transport
- `server/server.mjs` — multiplayer room WebSocket server
- `server/package.json` — server deps/scripts
- `robots.txt`, `sitemap.xml` — SEO/static metadata

## Deployment
Deploy as a static site (Cloudflare Pages/Workers static assets, Netlify, Vercel static, GitHub Pages, etc.).
