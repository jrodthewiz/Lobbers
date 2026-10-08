# Lobbers — Backyard Battle Club

A multiplayer artillery game with cute pilots, procedural terrain, eight weapons, and a drawing garage. Built with Phaser, Vite, TypeScript, and Colyseus.

## Play

Host a lobby and share its code, join an open backyard, or choose **Let's Lob** for a practice bot. Mark Ready to start. Each turn has movement, firing, and flight resolution. The last surviving side wins.

- Desktop: A/D or arrows move, Space hops, Shift dashes. Aim with the pointer, hold the left button for power, and release. Escape cancels charging.
- Weapons: 1–8 select; Q/E cycle. Extra weapons require supplies.
- Camera: wheel or +/- zoom; Z toggles overview; F enables free camera; 0 resets.
- Phone: hold arrow buttons to move, tap HOP/DASH, and touch-hold-release on the arena to fire. Map scouts the arena.

## Draw your ride and effects

Open **Draw Your Own Ride** from the menu. Draw filled hulls or freehand ink, place mechanical parts, drag their mounts, adjust size, and undo. Start from a buggy, crawler, or saucer. The live bench previews rotating wheels, vector aiming, exhaust, and shields.

The four drawing frames are Ride / Beginning, Charged / End, Burst / Beginning, and Burst / End. Copy a starting frame, change its silhouette, and watch it interpolate. Arc-length resampling supports drawings with different point counts; closed outlines align across different start corners and drawing directions. The chassis morphs with charge, and your drawn burst plays when a projectile lands. Test the effect in the garage before saving.

Save a blueprint to use it in battle. Designs persist locally and replicate to rivals through multiplayer. Custom rides retain the same collision hull and existing weapons, dash, and armor rules. Blueprint changes are accepted outside active rounds. Geometry and payload sizes are validated on both network paths.

Choose Sunday Club, Golden Grudge, or Moon Mayhem for your arena atmosphere. A tactical map, actual shot traces, impact particles, victory confetti, earned match honors, and a local club record support the duel. Sound has a saved mute preference.

## Run

```powershell
npm install
npm run dev
```

The development launcher prints its available ports, normally client `http://localhost:5183` and server `http://localhost:2577`.

## Validate

```powershell
npm test
npm run build
npm run playtest
```

For an installed Chromium, set `LOBBERS_BROWSER_PATH` before browser tests. Production builds to `dist/client`; the server serves it when `NODE_ENV=production`. Railway uses `railway.json` for build, start, and health checks.
