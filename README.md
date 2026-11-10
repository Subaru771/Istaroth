<div align="center">

# Istaroth

**Your Companion Throughout Time!**

A free, open-source, unofficial Genshin Impact desktop companion for Windows.

![Version](https://img.shields.io/badge/version-v1.0.1-8168d9) ![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4) [![MIT License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[**Download v1.0.1**](https://github.com/Subaru771/Istaroth/releases/tag/v1.0.1) · [Privacy](PRIVACY.md) · [Security](SECURITY.md) · [Report an issue](../../issues)

</div>

## Appearance and your wallpapers (current source)

Istaroth v1.1.3 keeps **nine color-only regional themes**. Built-in landscape artwork is removed from theme selection and the widget.

**Your own photo wallpapers are supported again**, with separate image upload, preview, removal, darkness, blur, zoom and position controls for the **Main Widget**, **Resin Card**, and **Mini Widget**. Find them in **Settings → Main wallpaper** (including Resin Card) or **Settings → Mini wallpaper**.

If you previously uploaded an image, the application restores its saved file from your existing profile. Themes without a personal wallpaper remain colors-only; no default pictures are bundled.

The original v1.0.1 downloadable release predates these changes. Later preview releases are listed on the [Releases page](https://github.com/Subaru771/Istaroth/releases).

## Features

- **Live Resin tracking** using your own HoYoLAB session, with recovery estimates and reminders.
- **Main and Mini widgets** with tray controls, always-on-top mode and Windows startup.
- **Nine regional color themes**, personal wallpapers for Main/Resin/Mini, customizable accents, layouts and typography.
- **Daily information** including commissions, expeditions, Realm currency and other available HoYoLAB panels.
- **Local history and alerts** with configurable quiet hours.
- **Optional Telegram friend alerts** with private opt-in links, per-friend 160/180/190/200 thresholds, encrypted bot-token storage, and unsubscribe. Use local mode with the PC running ([guide](docs/FRIEND_ALERTS.md)), or a **private Cloudflare Worker** for notifications with the PC completely off ([cloud setup](docs/CLOUD_RESIN.md)).

## Updating to the color-only build

The current source is **Istaroth v1.1.3**, with seven Settings tabs, no built-in illustrated themes, and optional user-provided wallpapers. The downloadable v1.0.1 release has the old appearance.

If the old illustrated Settings page still opens after installing an updated preview, the older Istaroth process or its shortcut may be taking over. Electron's single-instance protection uses the same profile for all releases. The **v1.1.3 installer closes running older copies and replaces the desktop shortcut** with a link to the new build; it does not erase your HoYoLAB account or saved settings.

After upgrading, check that Settings says **ISTAROTH · v1.1.3 · PREFERENCES**. If a taskbar-pinned icon still opens an older copy, unpin that outdated taskbar icon and pin Istaroth again from the new desktop shortcut. The previous v1.0.1 portable ZIP and installer are not silently uninstalled.

## Install

**v1.0.1:** Choose the standard **offline NSIS installer** or the **portable ZIP**. Both include Electron and do not download a runtime during installation. The original [v1.0 Go installer](https://github.com/Subaru771/Istaroth/releases/tag/1.0) is preserved for older installations. See [Windows distribution and migration guidance](docs/WINDOWS_DISTRIBUTION.md).

1. On **Windows 10/11 x64**, download the [v1.0.1 offline installer](https://github.com/Subaru771/Istaroth/releases/download/v1.0.1/Istaroth-v1.0.1-Setup-Windows-x64-UNSIGNED.exe), or the [portable ZIP](https://github.com/Subaru771/Istaroth/releases/download/v1.0.1/Istaroth-v1.0.1-Portable-Windows-x64-UNSIGNED.zip).
2. Quit any running Istaroth tray instance. For Setup, run the EXE; for portable, extract the entire ZIP and run `Istaroth.exe`.
3. Open **Settings → Account** and sign in through the official HoYoLAB page.

**Note:** Both v1.0.1 packages are **unsigned** and may show a Microsoft SmartScreen reputation warning. Do not bypass antivirus malware detections. Istaroth is independent of HoYoverse/Cognosphere and uses unofficial HoYoLAB endpoints, which may change.

## Verify the download

Each v1.0.1 download has a same-named `.sha256` file attached to the [release](https://github.com/Subaru771/Istaroth/releases/tag/v1.0.1), generated after the package is built.

To verify either file in Windows Command Prompt:

```cmd
certutil -hashfile Istaroth-v1.0.1-Setup-Windows-x64-UNSIGNED.exe SHA256
certutil -hashfile Istaroth-v1.0.1-Portable-Windows-x64-UNSIGNED.zip SHA256
```

Compare the output to the corresponding `.sha256` download. Matching hashes confirm identical bytes, **not** publisher identity or malware safety. See the [Code signing policy](CODE_SIGNING.md).

## Source and contributions

- **Electron app:** `app/`
- **Offline NSIS installer and portable ZIP:** built from `app/` with electron-builder ([QA and compatibility](docs/WINDOWS_DISTRIBUTION.md))
- **Legacy Go installer source:** `installer/` (preserved for v1.0 compatibility)
- **Build scripts:** `scripts/`
- **Automated checks:** [GitHub Actions](../../actions)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Changes:** [CHANGELOG.md](CHANGELOG.md)

To run from source, install Node.js and run `npm ci` then `npm start` from `app/`. To build the standalone Windows packages, run `npm run build:win` on Windows x64 after `npm ci`. See [distribution instructions](docs/WINDOWS_DISTRIBUTION.md).

Istaroth stores sign-in state and settings locally, preserving the legacy `Teyvat Pulse` profile for existing installations. Read [PRIVACY.md](PRIVACY.md) before connecting an account.

## License

Code is [MIT licensed](LICENSE). Genshin Impact trademarks and related intellectual property belong to their respective owners. Artwork and third-party assets are not automatically covered by the code license.
