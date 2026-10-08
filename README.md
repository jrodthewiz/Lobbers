# Lobbers — Doodle Demolition

Draw a ridiculous machine. Bring down a paper city.

The default game is a real-time solo physics playground: drive a handmade vehicle, unfold a charged hammer, break supports, and topple starred cardboard targets. Three authored challenges, a burstable water tank, water spray, boost, and instant retry reward invention and chain reactions. Complete the targets before the 60-second clock expires. Results show damage points and a locally saved personal best.

## Controls

- A/D or arrows: drive. Space: hop when grounded.
- Hold J, then release: charge and swing the folding hammer.
- Hold Shift: boost. W: spray water. Both use regenerating fuel.
- R or Retry: immediately restart. Choose a challenge from the top selector.
- Phone: hold drive, boost, and hammer buttons; tap Hop and Water.

## Draw your machine

Open **Draw your machine** to pause the challenge. Draw hulls and ink, drag mechanical parts, resize them, or start from a preset. Wheel mounts and sizes affect balance and traction; thruster height affects torque; cannon mounts become folding hammer anchors and their size affects reach. Hull artwork decorates a bounded physical chassis. Shield coils are decorative in demolition.

Draw a Charged / End silhouette to morph your body during windup. Burst / Beginning and Burst / End drawings become your hammer impact animation. Arc-length interpolation supports different point counts and aligns closed contours. Save to rebuild and immediately test the machine. Blueprints persist locally.

This first demolition release is solo. The earlier multiplayer artillery game and its room/peer transports remain accessible at `/?mode=artillery`; its match rules and blueprint replication are unchanged.

## Run and verify

```powershell
npm install
npm run dev
npm test
npm run build
npm run playtest
```

The development launcher normally starts client `http://localhost:5183` and server `http://localhost:2577`. Set `LOBBERS_BROWSER_PATH` to an installed Chromium executable for browser tests. Production builds to `dist/client`; the server serves it in production. Railway uses the existing `railway.json` build, start, and health checks.
