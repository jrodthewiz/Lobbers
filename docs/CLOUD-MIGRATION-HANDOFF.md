# Lobbers collaborator and cloud reconciliation handoff

## Status and provenance

GitHub is the intended source of truth for future reconciled changes: https://github.com/jrodthewiz/Lobbers.
Do not claim the latest cloud project has been imported until the file comparison below passes.

On 2026-11-13, GitHub main resolved to 824faa236f7d3b4d684ba598d3a2f71b16346697.
That commit records preserved candidate 274eba3f066d1bf0011386e0eba4a88706041dfc and tree a4b5ac6dbb09c736c37fa39ebeba6f7b67f2936d.
A separate connected-workspace check reported a matching local candidate tree. This is candidate-preservation evidence, not a fresh comparison with Sites source.

The coordinator retains the exact existing Site identity, saved-version source commit and archive provenance in the migration thread. Retrieve these through authorized Sites access; do not substitute a new Site or infer identifiers from a title.

## Smallest required next step

In an attached execution environment, open the EXISTING Site source through the installed Sites skill's source helper using the verified existing project ID. Retrieve supported source credentials using sites.create_source_repository_write_credential, without requesting publish_on_push. Keep tokens in memory/stdin only. Do not publish while reconciling.

Inspect the returned checkout path and run git status before any changes. Identify any worker using the same checkout and preserve dirty files and unpublished commits. Fetch GitHub main into a separate checkout; never reset or clean another worker's checkout. Record actual source HEAD, saved-version commit and GitHub main.

Generate a sorted relative-path, byte-size and SHA-256 inventory from the authoritative source. Preserve hidden project configuration; exclude only explicitly documented generated dependencies/build output, Git metadata and secrets/runtime data. Report every source-only, GitHub-only and differing path. Do not infer parity from titles, version numbers, archive file counts or different commit IDs. The GitHub candidate previously returned 404 for .openai/hosting.json; reconcile the actual cloud configuration rather than inventing it.

The current thread could not run even pwd: "No usable execution environment is available." It exposed no environment-listing or computer-attachment tool. GitHub authentication works. This is an execution/source-read limitation, not a GitHub login problem. No staged local files were inspected; do not assume they are absent.

## Collaborator setup and validation

Node requirement from package.json: >=20.9.0. A package-lock.json is tracked.

Run in a clean checkout after any documented asset reconstruction:

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run dev
```

For the static Sites frontend on a POSIX shell:

```sh
VITE_STATIC_FRONTEND=true VITE_SERVER_URL= npm run build
```

Build output is dist/client. On PowerShell, set the two environment variables using PowerShell syntax before running npm run build.
Browser checks use npm run playtest and an installed compatible browser; README documents LOBBERS_BROWSER_PATH.
Record exact commit, command exit statuses and failures. This handoff did not execute these commands.
The candidate commit records historical results of 142 tests across 14 files, typecheck and build passing; those results are not fresh clean-checkout verification.

## Assets and reconstruction

No asset chunks or reconstruction script were added in this handoff. The recorded saved archive is under 16 MB; that does not establish individual repository asset completeness.

If actual source requires large-asset chunking, use 8 MiB chunks (8388608 bytes), never over 16 MB. Track a manifest with each original relative path, size, SHA-256, ordered chunk paths and each chunk's size/SHA-256.
Provide a reconstruction command that validates chunks, streams them in order into a temporary output, verifies the final size/hash, and renames only after validation. Preserve existing files; fail on conflicting output instead of silently replacing it. Reject absolute paths and traversal outside the checkout.
Verify reconstruction in a new clone using only tracked files, then compare every reconstructed asset against the authoritative source manifest before installing/building.

## Reconcile and verify remote main

Make additive changes on an isolated branch based on freshly fetched main. Preserve original source and history. Review the manifest differences and incorporate newer unpublished changes deliberately. Never force-push.
Before landing, re-fetch main; if it moved, integrate and rerun affected verification. After landing, fetch main again, verify its exact SHA and source inventory, and repeat reconstruction/setup/build in a clean checkout.

## Future updates and the existing Site

After reconciliation, commit reviewed source, configuration and necessary asset manifests/chunks to GitHub first. Collaborators clone/pull GitHub, reconstruct if required, install with npm ci, test and build. Record the GitHub SHA used for each Site update.

The available Sites tools support obtaining repository credentials, saving a source version, deploying a saved version and checking deployment status. This does not establish a GitHub Actions publication API. Do not describe ChatGPT or Codex as a general HTTP API or invent an Actions deployment endpoint.

To update the existing Site, use the current installed Sites skill:
1. Refresh sites.get_site for the exact project ID and preserve its audience.
2. Open its source using the supported helper, inspect dirty/unpublished work and reconcile with the reviewed GitHub commit.
3. Preserve and validate .openai/hosting.json; static.directory must describe dist/client. Do not create a replacement Site.
4. Build and package from the exact source pushed to the Site repository, retaining helper-returned commit and archive provenance.
5. Save the matching source/archive with sites.save_site_version, then deploy that returned saved version using the appropriate audience-aware tool. Only use private deployment when owner-private access is freshly confirmed.
6. Inspect the returned deployment ID to terminal status and record Site version, Site source commit, GitHub source commit and URL.

Do not deploy during source reconciliation alone. Do not enable automatic publication, change privacy, add paid services, expose credentials, change runtime secrets or mutate live data as part of this handoff.

The static Site covers demolition and same-device duel. Colyseus rooms and peer signaling require separate compatible backend work; a successful frontend build does not verify multiplayer.
Browser saves belong to their original origin. Preserve original storage and save formats; do not clear or silently transfer live data.
