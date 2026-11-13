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

In artillery mode, Host Lobby, Practice Bot, and Join By Code return to the menu with retry guidance if a connection has not completed within 15 seconds. Cancel connection returns immediately. You can start another attempt; a late result from an expired attempt cannot replace the newer match. Peer invitations retain their existing timing.

## Run and verify

```powershell
npm install
npm run dev
npm test
npm run build
npm run playtest
npm run review:demolition
```

The development launcher normally starts client `http://localhost:5183` and server `http://localhost:2577`. Set `LOBBERS_BROWSER_PATH` to an installed Chromium executable for browser tests. Production builds to `dist/client`; the server serves it in production. Railway is deprecated. The existing `railway.json` is retained as legacy server configuration; the static frontend migration is documented below.


## Static frontend migration to ChatGPT Sites

The frontend can be built independently of the Node/Colyseus server:

```sh
VITE_STATIC_FRONTEND=true VITE_SERVER_URL= npm run build
```

Serve `dist/client` as a static Site. Doodle Demolition and same-device side-by-side 1v1 remain frontend modes. With no explicit valid HTTP(S) room-server origin, `?mode=artillery` shows a backend-required notice instead of attempting nonexistent same-origin Sites API/room endpoints. Normal non-static builds retain their existing behavior. A configured `VITE_SERVER_URL` only enables the existing client attempt; it does not verify backend reachability, compatible Colyseus/CORS, or peer invitation/signaling. The persistent Node room server and signaling service are separate migration work; Railway is deprecated, and no replacement backend is silently assumed.

Save keys/formats are unchanged. Browser storage belongs to the page origin: a new private Sites origin cannot automatically read saves from the previous game origin. Keep the old origin's data; do not clear browser storage. This frontend migration performs no automatic save copy, import, merge, or deletion. A future approved same-origin/domain cutover or user-controlled transfer must be planned separately.

The repeatable demolition review uses fresh browser storage and actual inputs. It checks drawing proportions, garage pause and live stats, simultaneous race pause/resume, Shift chords, both player controls, victory and rematch. Each run saves desktop/phone screenshots, a pass/fail JSON report, and a Playwright trace under `artifacts/demolition-review/`. Set `LOBBERS_REVIEW_URL` to test another local preview, or `LOBBERS_REVIEW_OUTPUT` to select the evidence directory. Run the local server before this review.

Races can be paused and resumed for both players from the duel header. Interrupted pointer holds cancel instead of swinging the hammer. Reinforced pieces show remaining resistance, and the garage reports hull size, impact, reach, and build budget while editing.
