# Lobbers — Doodle Demolition

Draw a ridiculous machine. Bring down a paper city.

The default game is a real-time physics challenge ladder: drive a handmade vehicle, unfold a charged hammer, break supports, and topple starred targets. Wins unlock the next challenge and save progress locally. Generated chapters revisit three puzzle families with taller towers, reinforced supports, and low-clearance arches. Complete the targets before the clock expires; results save your best damage score for each challenge.

## Side-by-side 1v1

Choose **Side-by-side 1v1** or open `/?mode=duel`. Two players on the same device build independent machines, then start simultaneously on identical puzzles. The first to topple all targets wins; a timeout compares target counts. Both machines share a 100-point mechanical allowance; overbuilding reduces impact. Drawing is available before each race, and rematches reset both playgrounds.

- Teal: A/D drive, Space hop, J hammer, Shift boost, W water.
- Coral: left/right arrows drive, up arrow hops, Enter hammer, down arrow boosts, slash sprays water.
- Touch: each player uses the controls in their own playground. Phones stack the two views.

This demolition duel is local multiplayer; it does not connect remote devices.

## Controls

- A/D or arrows: drive. Space: hop when grounded.
- Hold J, then release: charge and swing the folding hammer.
- Hold Shift: boost. W: spray water. Both use regenerating fuel.
- R or Retry: immediately restart. Choose a challenge from the top selector.
- Phone: hold drive, boost, and hammer buttons; tap Hop and Water.

## Draw your machine

Open **Draw your machine** to pause the challenge. The filled hull becomes a convex physical outline, affecting mass and clearance. Larger hulls hit harder; lower ones fit underneath arches. Ink details are decorative. Wheel mounts and sizes affect balance and traction; thruster height affects torque; cannon mounts become hammer anchors and their size affects reach. A degenerate hull gets a safe fallback. Shield coils are decorative. The game shows hull dimensions, impact, reach, and build cost; oversized loadouts remain playable with reduced impact.

Draw a Charged / End silhouette to morph your body during windup. Burst / Beginning and Burst / End drawings become your hammer impact animation. Arc-length interpolation supports different point counts and aligns closed contours. Save to rebuild and immediately test the machine. Blueprints persist locally.

The earlier networked artillery game and its room/peer transports remain accessible at `/?mode=artillery`; its match rules and blueprint replication are unchanged.

## Run and verify

```powershell
npm install
npm run dev
npm test
npm run build
npm run playtest
```

The development launcher normally starts client `http://localhost:5183` and server `http://localhost:2577`. Set `LOBBERS_BROWSER_PATH` to an installed Chromium executable for browser tests. Production builds to `dist/client`; the server serves it in production. Railway uses the existing `railway.json` build, start, and health checks.
