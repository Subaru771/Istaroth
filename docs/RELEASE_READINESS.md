# Istaroth release readiness

## Source and security
- [ ] Keep IPC requests restricted to the app's main renderer frame.
- [ ] Keep HoYoLAB session credentials in the isolated persistent Electron session; never store cookies in application settings or logs.
- [ ] Keep content security policy and HTTPS trusted-domain navigation restrictions.
- [ ] Run the source, startup, update and trust-boundary tests in GitHub Actions.
- [ ] Review CodeQL findings and the scheduled npm audit. Resolve security issues before a release.
- [x] Generate and commit `app/package-lock.json` from a Windows Node 22 runner; use `npm ci` for repeatable NSIS builds. Recheck the lockfile whenever dependencies change.

## Installer and user validation
- [ ] Test installation, upgrade from the existing Go installer, start-at-login, minimized-to-tray operation, and uninstall on a clean Windows test machine.
- [ ] Verify the NSIS candidate preserves data under the legacy `Teyvat Pulse` user profile and does not silently sign out existing users.
- [ ] Test one fresh official HoYoLAB sign-in and reconnect after session expiry.
- [ ] Test no-network behavior, last-successful-update labels, upstream API failures, and manual release checks.
- [ ] Do not upload the offline NSIS candidate as the primary download until these tests pass.

## Signing and GitHub release
- [ ] Apply for SignPath Foundation; approval is external and not guaranteed (see `CODE_SIGNING.md`).
- [ ] Until accepted, label EXEs unsigned. No automatic execution of unsigned downloaded releases.
- [ ] Sign the FINAL release EXE only with an approved trust chain and timestamp.
- [ ] Verify the Authenticode signature and publish SHA-256 calculated from that exact final EXE.
- [ ] Verify the published installer hash using:
```powershell
Get-FileHash .\Istaroth_Setup_v1.0.exe -Algorithm SHA256
```
- [ ] Attach a matching `.exe.sha256` file and write accurate release notes.
- [ ] Upload a 1280 x 640 social-preview image in GitHub Settings > General.
- [ ] Review GitHub Settings > Security > Code scanning and private vulnerability reporting.

**A SHA-256 file stored next to an unsigned EXE only detects accidental differences when the expected hash is trusted. It does not authenticate the publisher or prevent a malicious replacement of both files.**
