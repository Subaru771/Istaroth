# Changelog

## v1.0.2 — Security-hardening release candidate (not yet public)

- Strengthened Electron IPC sender-frame validation and local navigation boundaries.
- Reduced which HoYoLAB session cookies are sent to official read-only API endpoints.
- Added security regression tests for URL policy, IPC, CSP, and cookie forwarding.
- Preserved the existing v1.0.1 visual themes, Main and Mini widgets, and local user profile path.
- Updated privacy documentation and release QA.

**Status:** Windows binary QA and live HoYoLAB sign-in/synchronization still require testing before the public v1.0.2 release.

## v1.0.1 — Offline Windows packaging

- Replaced the runtime-downloading Go setup with a conventional Electron-bundled NSIS installer.
- Added a fully extractable Windows x64 portable ZIP.
- Built both from locked dependencies and published an individual SHA-256 checksum for each.
- Kept HoYoLAB account and wallpaper data under the legacy `Teyvat Pulse` user profile for compatibility.
- Verified Main/Mini widgets, HoYoLAB connectivity, NSIS install, uninstall and reinstall on a Windows PC.

Both v1.0.1 packages are **unsigned**, and a matching checksum does not constitute code signing.

## v1.0 — Initial public release

- Original Resin monitoring and recovery estimates via HoYoLAB.
- Main and compact Mini widgets, system tray, startup support and reminders.
- Nine themes, appearance presets and independent wallpaper controls.
- Local resin history, alerts, quiet hours and available HoYoLAB information panels.
- Windows graphical installer and first-run Electron runtime verification.

The **v1.0 installer is unsigned** and integration uses unofficial HoYoLAB endpoints. The installer and its published checksum are described in the [README](README.md).

Older internal development identifiers were not public release versions.
