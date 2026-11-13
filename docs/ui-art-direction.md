# Backyard Battle Club

## Doodle Demolition

Quality-loop refinements: blueprint canvases preserve 880:520 proportions at every breakpoint, so edited geometry matches its preview and physics. Live mechanical stats sit before presets. Reinforced pieces carry quiet purple resistance bars; impact copy distinguishes damaged and broken supports. Duel pause freezes both lanes, and the result/rematch wording remains stable. Capture actual-input journeys and desktop/phone screenshots with `npm run review:demolition`; every run retains a report and trace for reproducible review.

Solo and local 1v1 are equal modes sharing generated puzzle chapters and a 100-point mechanical budget. Wins unlock and persist the next stage; bests remain per stage. Drawn hulls supply convex collision outlines, mass, and clearance, with a safe fallback for degenerate geometry. The machine readout exposes height, impact, reach, and cost so rebuilding is a practical decision. Reinforced supports and low roofs introduce explicit tradeoffs. The duel has two ink-bordered playgrounds, teal/coral identities, independent garages, simultaneous start, winner status, and clean rematches. Stack lanes on phones. Keep race controls usable after focus enters either playground, and pause preparation without consuming either timer.

The default game is now a real-time solo contraption demolition playground. Warm graph paper, dark ink silhouettes, cardboard buildings, red support beams, and starred targets make cause and effect legible. The playable world owns the screen; a compact challenge ticket, target count, time, fuel, and chunky hold controls surround it. Yellow signals a charged hammer and successful destruction. Keep instant retry available. No waiting turns or health inventory in this mode. Touch and keyboard have the same drive, hop, hammer, boost, and water actions. The garage pauses the challenge. Wheel placement and thruster height affect the physics; freehand hulls remain expressive skins over a bounded physical chassis. Charged poses and drawn bursts respond to actual hammer actions. The older artillery game remains available at ?mode=artillery.

Lobbers is a scrappy toy-tank duel with a serious grudge and unserious pilots. The opening screen is a club poster: enormous condensed lettering, warm paper, a hand-drawn battle illustration, and a single coral bot-match action. Teal and coral preserve blue/red team meanings.

Use dark ink outlines, offset print shadows, pill-shaped tickets, and yellow reward accents. Quiet these motifs during play. The arena owns the center; health stays at the top, weapons at the bottom, and turn instructions sit below the scoreboard. Movement and firing must be distinct, with a readable countdown. Celebrate verified damage and summarize actual match statistics.

Controls: keyboard and pointer on desktop; hold arrows, tap hop/dash, and touch-hold-release aiming on phones. Phone canvases fill the viewport rather than letterboxing a desktop aspect ratio; the follow camera uses a wider world view. Always retain focus outlines, adequate contrast, reduced motion, readable labels, and state across help overlays. Avoid fake telemetry and ornamental sprite frames around every control.

Arena atmospheres: Sunday Club, Golden Grudge, and Moon Mayhem are personal presentation choices, saved locally. Keep team colors consistent. A cheeky club blimp and celestial prints establish the sky; the collision surface stays readable. Actual shot traces fade after landing to help the next adjustment. Small paper fragments celebrate impacts; the winner receives a confetti burst. Honor tickets use actual match results, and the local club record counts completed matches once. The compact tactical map shows real terrain, tanks, supplies, and projectiles; omit it on narrow screens to protect the arena.

Contraption Garage is the engineering counterpart to the club poster: a graph-paper bench, ink silhouettes, bolt-on parts, and playful mechanical previews. Players draw filled hulls and ink details, drag wheels/cannons/thrusters/shield coils, and save a personal blueprint. Wheel spokes rotate by travel/radius; cannon shapes use rotated vectors; thruster exhaust and shield outlines react to battle state. Render the same primitives in the bench, battlefield and player portraits. Replicate bounded geometry through both room transports, and accept design replacement only before or after a round. Keep the existing battle hitbox and weapon/dash/armor rules so visual scale does not give an advantage. Use crisp solid silhouettes and small particle flecks to evoke an experimental browser sandbox without hiding turn-based controls.

The second vehicle silhouette is a charge pose. Beginning/end effect drawings are the player's custom impact burst. Pair strokes by order, resample them by arc length, and align closed contours across different start vertices and clockwise/counterclockwise drawing. Fade unmatched strokes. Cache paired samples rather than recalculating alignment every frame. Keep the four frame tabs explicit and the drawing canvas above presets on phones. Effects use a brief expansion and fade; reduced motion shows a stable final silhouette. Continue the warm paper, cheerful ink, and friendly physics identity.


## Light pass: confirmed artillery throws

The artillery promise is to read the wind, charge a toy-tank lob, and defeat a rival through readable outcomes. Keep turn clarity, responsive aiming, and trustworthy feedback as the three pillars: aim/charge/release in ten seconds, adjust from the last landing over a minute, and win or rematch over five minutes.

| Observed friction | Player consequence | Change | Acceptance evidence |
| --- | --- | --- | --- |
| Source and a focused app-boundary check showed release audio firing before authority acceptance. | A rejected or expired shot sounds successful. | Play the local release layers when the confirmed throw sequence advances, using the new projectile's ammo when available and a neutral cue if it has already landed. | The regression failed on baseline; confirmed/rejected input, repeated snapshots, rival cues, and fresh-connection checks pass. |

Budget: reuse existing audio, snapshots, sequence maps, and bounded projectile lists; add no assets or timers. Preserve Colyseus, both transports, launch/cancel behavior, saves, and demolition modes. Source review found generation guards and neutral-input cleanup on leave; server-side player removal means a fresh launch rather than resumable reconnect. The published Lobbers domain returned Railway Not Found during this pass. Gameplay and listening validation remain unverified because preview network access and local file policy blocked both browser paths. A self-contained review preview is supplied separately; it is not a deployment or a successful multiplayer playtest.


## Incremental pass: stable artillery HUD values

| Observed friction | Player consequence | Change | Acceptance evidence |
| --- | --- | --- | --- |
| Artillery HUD setters assigned identical label text and integer bar widths on every repaint. | Even a stable status label had its text replaced repeatedly. | Compare current node values before writing; retain fresh node lookup and existing bar clamping. | A pinned 60-sample mixed trace of actual setters reduced instrumented property assignments from 540 to 27 with identical final values; focused tests cover transitions, missing/replaced nodes, and invalid CSS handling. |

This is an operation-count result from DOM-like instrumentation, not a browser timing or frame-rate claim. Fractional CSS width serialization, assistive-technology behavior, and rendered gameplay remain unverified. No caches, timers, dependencies, saved-data formats, networking, or layout changes are introduced. The previous confirmed-throw audio patch remains in place. Visual handoff still requires an environment allowed to reach the local server; the previous organization-policy file block must not be bypassed.


## Technical quality pass: launch recovery

| Demonstrated problem | Player consequence | Technical change | Acceptance evidence |
| --- | --- | --- | --- |
| Pending Colyseus create/join promises had no app deadline; baseline failed all three deadline-path cases. | Host, Practice, or Join could leave launch controls disabled indefinitely. | Bound the app attempt to 15 seconds, keep Cancel immediate, and dispose late rooms without replacing a retry. | Eleven focused app-boundary cases pass for deadline wiring, cancellation, retry/stale outcomes, timer/listener cleanup, stale lobby responses, and preserved peer windows. A real Colyseus SDK check also verified host/join, actor removal, and fresh bot launch. |

This change preserves Juan's game design, creative direction, inputs, progression, saves, and match rules. The SDK request itself may remain in flight; only app waiting is canceled, with best-effort disposal of a later room. No performance or rendered-gameplay claim is made. Existing browser access restrictions remain a visual-verification limit, not a reason to alter the game or bypass policy.


## Rendering quality pass: material cues and target status

Keep the existing graph-paper/cardboard world, palette, lettering, star/checkmark meaning, authored machines, and gameplay. The render-only pass adds two subtle paper-edge fills per piece, short hatching on existing red supports, three grain lines on planks, and a surface line/two glints in water tanks. Broad brick windows and labels remain. Target badges move into a final upright overlay above the rotated rectangle bounds; their radius remains 15 CSS pixels and font 17 CSS pixels across world scales, with the existing device-pixel-ratio transform retained. Only awarded `hit` state produces a checkmark.

| Source-defined baseline | Change | Acceptance evidence and limits |
| --- | --- | --- |
| Target badges inherited body rotation and world scaling. At scales .4/.65 their nominal diameters were 12/19.5 CSS pixels. | Upright 30 CSS-pixel badges above the rotated body outline. | Geometry/state/context checks cover wide/tall rotations, scales .4/.65/1, DPR 1/2, and interrupted drawing; these are not rasterized appearance checks. |
| Material faces used flat fill/outline, windows, or one tank fill. | Bounded paper edges, support/plank hatching, and water highlights in the same palette. | Fixed draw-call budgets and unchanged input-state checks pass; frame time is unmeasured. No assets, culling, timers, caches, physics, input, progression, or save formats are added or changed. |

True before/after gameplay images remain unavailable: the local production server answered health 200, while CUA refused its HTTP loopback URL. The older organization-policy file block was not retried or bypassed. Actual composition, badge overlap, glyph contrast, touch/controller operation, and performance still need a reachable authorized preview. Retain exact baseline source/runtime hashes with the candidate; never label the source-derived comparison as visual acceptance. Additional regression budget: no new external assets and at most 8 KiB additional raw JavaScript in the runtime archive; report measured payload size rather than inferring FPS.


## Local UI candidate: Hammer charge cue

Observed baseline: the retained private frontend v1 provider capture shows the original idle Hammer control and world layout; it does not show an active charge. Source-inferred friction: the existing 80×8 world bar and 76×4 fill shrink to 32×3.2 and 30.4×1.6 CSS pixels at the minimum .4 duel scale, while the existing action button had no charge readout.

Keep the world bar and original rules. The candidate updates only the existing Hammer button from actual `charging`/`charge`: original idle caption, a short release/percent caption while charging, and an in-button teal/gold fill. Accessible instructions stay fixed; the fill is decorative, with no live region, separate charge timer, new control or playfield overlay. Existing cancel/strike semantics, palette, input bindings and save formats remain. Reset, release, pause/interruption, completion and duel stop clear through production paths.

This is source/test acceptance only. No candidate browser, occupied preview slot or shared deployment was touched. The original min-width rules remain, so caption width/strip stability at 0/99/100%, gradient contrast and real pointer capture still require the parent's serialized laptop/browser validation. Shorter character count is not a rendered-fit measurement. Online signaling and artillery remain separate/unavailable in the static preview. Do not infer visual quality or frame-rate improvement from these tests.
