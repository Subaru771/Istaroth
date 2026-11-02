# Istaroth source security review — 2026-11-02

**Scope:** repository source review of `app/main.js`, `app/preload.js`, `app/hoyolab-sync.js`, `app/update-service.js`, `app/index.html`, `installer/main.go`, and related tests and CI.

**Important limitations:** This is an internal source-code review and regression test setup, **not** an independent audit, penetration test, proof of software safety, or end-to-end verification of a released Windows binary. The HoYoLAB integration uses unofficial endpoints and is not affiliated with HoYoverse.

## Trust boundaries and protections

| Threat | Current protection / change | Caveat |
| --- | --- | --- |
| Untrusted web content gaining Node APIs | Electron `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`; preload exposes a narrow bridge | Still requires regression tests after Electron upgrades |
| Main application navigation to untrusted local files | The renderer now allows only its own `index.html` navigation target, not any `file://` URL | Actual Windows UI navigation must be exercised |
| Untrusted IPC senders | All existing `ipcMain.handle` calls now require the main window's main frame | Keep this wrapper for all future privileged handlers |
| HoYoLAB credentials sent to attacker host | Selected cookies remain in the isolated persisted Chromium partition. Read-only JSON requests accept HTTPS and an exact hostname allowlist; browser sign-in redirects are restricted to official domains | Authentication remains sensitive; never collect cookies for support |
| Public issue credential leakage | Bug/feature forms warn contributors not to publish cookies, tokens, or unredacted logs | Project maintainers must moderate accidental leaks quickly |
| Script injection in local UI | Restrictive Content Security Policy blocks external scripts, objects and network fetches from the renderer | Current style CSP allows inline CSS for application appearance |
| Runtime archive substitution | Legacy Go installer verifies the downloaded Electron zip against a pinned SHA-256, limits archive size, and rejects traversal/symlink entries | A signed, self-contained NSIS installer would reduce install-time downloads but needs Windows QA |
| Update supply-chain hijacking | GitHub release discovery is pinned to the publisher repository. Unsigned installers are never auto-downloaded and executed by Istaroth | SHA-256 posted alongside unsigned assets is **not** publisher authentication; signing approval remains external |
| HoYoLAB endpoint changes | Incompatible API responses are surfaced. The app preserves last good readings with stale/estimated labels | Estimates are not authenticated live readings |
| Dependency vulnerabilities | Dependabot, advisory weekly npm audit, and CodeQL static checks have been configured, with a committed npm lockfile | CI surfaced 15 moderate `minimatch`-chain advisories in build tooling; requires reviewed resolution |

## Checks

- `npm run check`
- `npm run test:startup`
- `npm run test:v22`
- `npm run test:security`
- `node test_update_service.js` in `app/`
- Windows Go installer and offline NSIS candidate builds in GitHub Actions
- CodeQL analysis for JavaScript and Go
- Weekly advisory `npm audit`

## Not verified yet

- Independent assessment or dynamic penetration testing
- Clean Windows install, upgrade, uninstall, startup and HoYoLAB sign-in
- Code-signing certificate, SmartScreen reputation, and approved automatic binary updater
- Signature or checksum of the exact published v1.0 asset (must be checked from its bytes)
- Closure of all transitive npm dependency advisories

Never publish a real user's session data to prove a test passes. Preserve the original `Teyvat Pulse` local profile for backwards compatibility.
