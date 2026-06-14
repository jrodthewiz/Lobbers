# Lobbers

Lobbers is a small two-player multiplayer artillery game built with Phaser, Vite, TypeScript, and Colyseus.

The MVP is intentionally primitive-only: tanks, worm pilots, flags, cages, distance marks, projectiles, and effects are drawn with circles, boxes, lines, and arcs. Sprites and authored image assets are deferred.

## Run

```powershell
npm install
npm run dev
```

Client: `http://localhost:5173`

Server: `http://localhost:2567`

## Validate

```powershell
npm run test
npm run build
```

## MVP Scope

- Host a lobby, share a lobby code, browse waiting lobbies, and join a lobby.
- Two players only: Blue left and Red right.
- Click-hold to charge, aim with the pointer, release to lob.
- Server-owned projectile physics, damage, round state, throw distance, and rematch state.
- Ammo types: `javelin`, `shotput`, and `splitter`.

Out of scope for the first milestone: sprites, terrain destruction, bots, matchmaking queues, accounts, persistence, audio, inventory, and ranked systems.
