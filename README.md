# Vanguard: Riftfall

Free browser-based FPS wave shooter built with Three.js.

## Features
- Fast arena combat with wave progression
- Desktop + mobile controls
- HUD for HP, shield, ammo, kills, score, and streak
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
- `index.html` — page shell, HUD, styles, import map
- `src/main.js` — game bootstrap and runtime logic
- `robots.txt`, `sitemap.xml` — SEO/static metadata

## Deployment
Deploy as a static site (Cloudflare Pages/Workers static assets, Netlify, Vercel static, GitHub Pages, etc.).
