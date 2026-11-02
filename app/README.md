# Istaroth v2.4.3 — Celestial Atelier Windows Companion

**Unofficial HoYoLAB companion. Not affiliated with HoYoverse.**

## Install/update on Windows 10/11 (x64)
1. Quit the currently running Istaroth copy (including the tray icon).
2. Open `Istaroth_Setup_v2.4.3_Celestial_Atelier.exe` (in the download ZIP if `.exe` files are blocked).
3. The GUI installer upgrades an existing installation in place and preserves settings, local wallpaper, private HoYoLAB session and local resin history.
4. Start the application from the Desktop or Start Menu. **No CMD window or Node.js is required.**
5. First installation needs internet to download the official Electron desktop runtime (~150 MB). The installer is unsigned, so Windows may show an unknown-publisher warning.

## New in v2.4.3
- A new hourglass-in-orbit logo on the title bar, app icon, and installer.
- Settings enlarged to 1060 × 970 where desktop space allows, with graceful scrolling for smaller displays.
- Illustrated two-column palette cards for nine retained Istaroth and region themes.
- Four working settings tabs and full preservation of custom wallpapers, fonts, colors, saved profiles, login and history.

## Earlier features
- **Live connection diagnostics:** Settings > Account > Test live HoYoLAB connection. A PASS is only shown after a real Real-Time Notes response for the selected account.
- **Isolated session:** official HoYoLAB browser login uses a dedicated persistent Electron browser partition. Account cookies are never exposed to the renderer or written to settings JSON. Windows DPAPI-backed `safeStorage` availability and an encrypt/decrypt probe are shown in Settings > Account. Disconnect clears this session.
- **Smart notifications:** resin threshold 80/120/160/180/200, optional overnight quiet hours, deduped across restarts. Alerts are based on recent authenticated readings; old cached data does not fire new alerts.
- **Floating borderless resin mini:** Settings > Layout > Mini Mode and Floating Borderless Mini. 360 × 248; drag the header, use Daily for a popover, or use Full journal to return.
- **Dynamic tray resin indicator:** rendered locally without online assets; shows the latest estimated amount, stale status, and a context menu for refreshing/hiding.
- **Reconnect:** refresh when Windows resumes, when internet connectivity returns, and according to the regular interval with exponential backoff after failures.
- **History:** seventh journal tab with last 7 days' observed readings. History is local, per UID, capped at 2500 points / 90 days. These are *samples*, not a complete accounting of resin spent or time capped.
- **Daily overview:** one click from Mini Mode shows commissions, expeditions, Realm Currency and weekly discounts from the last HoYoLAB reading.
- **Verified update release checks:** Settings > Updates. Configure a trusted `GitHubOwner/Repo`. The program checks for newer releases, optionally downloads a `.exe` after checking a same-named `.sha256` release asset, and lets you explicitly apply the download. **No repository is preconfigured, so updates cannot function until you publish releases and configure the trusted source.** It never silently runs downloaded programs.

## What is deliberately absent
No manual resin editing, no direct game launch button or any code that starts Genshin Impact, no Roster or Diary tabs, and no command-prompt launcher.

## Status and limitations
The HoYoLAB data parser and signed-in request workflow remain read-only. HoYoLAB's unofficial endpoints can change or block access. We **cannot truthfully claim live authentication is verified** without signing into an actual account. Use the built-in live connection diagnostic after installation. Browser-based controls, simulated desktop actions, parsing, icons, local history, and release validation were tested; actual Windows installer execution, wake/sleep events, DPAPI behavior, native notifications, and tray APIs have not been tested on a Windows computer here.

The installer is a Windows GUI executable written in Go. It downloads the Electron runtime from GitHub on first installation. App files are included inside the installer; no user-side build or Node installation is required.

## Release packaging for future automatic checks
Publish a Windows executable named e.g. `Istaroth_Setup_v2.3.exe` and a second asset with the **exact name plus `.sha256`**, containing its SHA-256 digest (64 hex chars). Tag the release `v2.3.0` and set the trusted repository under Settings > Updates. A release without matching metadata cannot be installed. GitHub HTTPS and the release publisher remain part of the trust boundary: digest alone is not code signing.
