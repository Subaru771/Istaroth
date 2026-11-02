# Security and trust review (Istaroth 1.0)

**Scope:** Source inspection only, *not* a full security audit or penetration test. This page records security-relevant design decisions, remaining risks and testing gaps. No account cookies, credentials or identifying user data should be posted to public issues.

## How HoYoLAB sign-in works

1. The app opens `https://www.hoyolab.com/` in an Electron `BrowserWindow` with `nodeIntegration: false`, `contextIsolation: true` and `sandbox: true`.
2. It persists that session under partition `persist:teyvatpulse-hoyolab`; profile data remains in the legacy `%APPDATA%\\Teyvat Pulse` folder for upgrades.
3. The native main process obtains *selected authentication cookie values* from the session. The source implements an explicit API host allowlist and HTTPS for authenticated calls.
4. A sign-out action clears storage and cache for the dedicated HoYoLAB partition. There is no developer-run login, analytics or telemetry server.

**Important distinction:** HoYoLAB cookies *are* accessible to the desktop application's main process. An authenticated desktop helper must be treated as a trusted application. “Official login page” alone does not guarantee the app is secure.

## Findings and limitations

| Area | Observed control | Remaining issue / action |
|---|---|---|
| Sign-in window | Dedicated Electron partition, sandbox, context isolation, restricted navigation and popups | Independently test OAuth/SSO redirects, cookie isolation and sign-out on Windows |
| Authenticated requests | HTTPS plus host allowlist in `app/hoyolab-sync.js` | Review *all* network destinations, all redirects, and dependency attack surface before claiming formal audit |
| Installer integrity | Custom Go installer hashes the downloaded Electron runtime | Initial installer is **unsigned**; timestamped trusted signing would improve publisher verification |
| Build reproducibility | Source and CI are public | Verify build asset parity, pin dependency lockfiles and independently reproduce the release binary |
| Auto-update | Current app uses release asset/checksum matching | Checksums hosted alongside binaries are **not a substitute for an authenticated publisher signature**; do not auto-install untrusted executables |
| User data | Local Chromium profile, migration preserves old folder | Document manual removal on uninstall and verify that old login/session data are not exposed by other programs |
| Third-party service | Unofficial HoYoLAB APIs | Endpoints and terms may change; users should expect occasional loss of functionality |
| Bundled artwork | AI-assisted art; descriptive third-party names | Review similarity, licensing and trademark positioning before commercial use |

## Validation checklist

- [x] Source reviewed for login window partition and network host allowlist
- [x] Unsigned executable status disclosed
- [x] Published release checksum recorded in repository
- [ ] Clean Windows 10 x64 install and uninstall
- [ ] Clean Windows 11 x64 install and uninstall
- [ ] End-to-end real HoYoLAB login, refresh and logout tested without leaking session data
- [ ] Antivirus reputation measurements (with review of any detections)
- [ ] Independently audited dependencies and Electron security configuration
- [ ] Reproducible build matching public installer
- [ ] Trusted publisher signature (if funding or an OSS grant becomes available)

Report issues privately where sensitive data is involved; see [SECURITY.md](../SECURITY.md). Never bypass a real malware detection merely because a project is open source.
