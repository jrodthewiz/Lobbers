# Lobbers: GitHub and Sites synchronization

Read README.md for the static frontend build and current multiplayer limits. Preserve the accepted local-source reconciliation in main and the backup branch; do not replace main with an older cloud snapshot. Build static frontend into dist/client with the documented VITE_STATIC_FRONTEND and VITE_SERVER_URL settings. Doodle Demolition and same-device 1v1 can be frontend-only; online artillery requires a verified compatible room/signaling backend. Do not invent a same-origin backend or treat a configured URL as proof it works. Keep the canonical browser origin/save keys; moving hosts does not transfer local saves. This guide does not deploy a Site or backend.

## Controlled GitHub-to-Sites release

A GitHub push does not automatically deploy ChatGPT Sites. No direct GitHub Actions-to-Sites deployment endpoint or ChatGPT conversation-as-API integration is configured by this guide.

1. Select and record an exact reviewed GitHub commit. Preserve dirty working trees, unpublished candidates and baseline history; never force-push or replace newer work. Materialize any Git LFS/chunked assets and verify their hashes before building.
2. Identify the intended existing Site by its title/URL. In an authorized ChatGPT Work/Codex session with Sites tools, retrieve its current source, project identity, audience and bindings. Use the installed Sites skill and source helper to open that existing source repository. GitHub and Sites source repositories may be different.
3. Compare the GitHub revision with current Site source. Reconcile intended application files only; preserve unrelated Hub apps, Site identity, authentication, runtime settings, D1/R2 bindings and all live data. Historical nested hosting files are not authority to replace a Site.
4. Run the repository's documented setup, asset verification, tests and build for the selected release layout. Then build/package in the existing Site checkout using the installed Sites workflow. Keep credentials in the supported session-only credential flow, never Git, logs or command-line arguments.
5. The Sites source helper commits/pushes the exact tested Site source and returns its source commit and matching archive. Use that returned commit and archive for native version save, not the GitHub SHA unless they are actually identical. Record both SHAs and their mapping.
6. Only when publication is authorized, use the native save/deploy tool for the existing audience. Preserve saved version IDs when resuming; verify terminal deployment success and the actual game route. Report failed/unrun browser, device and multiplayer checks separately from build success.
7. Record GitHub SHA, Site-source SHA, saved version, deployment URL and validation results in the release receipt. Mirror any accepted Site-only changes back to GitHub in a reviewed normal commit; there is no automatic two-way synchronization.

Source backups do not include production databases, uploaded recordings, browser-local saves or secrets. Do not clear or migrate those to make a source update pass. A Site MCP endpoint can expose specific app operations; it is not a source-sync/deployment API.

## Requesting the next update

Ask an authorized Work/Codex session: “Update the existing matching Site from this repository at commit <sha>, reconcile newer Site changes, preserve identity/audience/storage, run its release checks, and report the exact source/version mapping. Publish only within the requested release scope.” Repository access alone does not grant access to the Sites owner account.
