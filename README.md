<div align="center">

# Istaroth

**Your Companion Throughout Time!**

A free, open-source, unofficial Genshin Impact desktop companion for Windows.

![Version](https://img.shields.io/badge/version-v1.0.1-8168d9) ![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4) [![MIT License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[**Download v1.0.1**](https://github.com/Subaru771/Istaroth/releases/tag/v1.0.1) · [Privacy](PRIVACY.md) · [Security](SECURITY.md) · [Report an issue](../../issues)

</div>

## Preview

**v1.0.2 candidate:** All illustrative and uploaded wallpapers have been removed from the in-app UI. The nine themes now use colors and gradients only. Updated screenshots will be added after Windows QA; older preview images represent v1.0.1, not this candidate.

## Features

- **Live Resin tracking** using your own HoYoLAB session, with recovery estimates and reminders.
- **Main and Mini widgets** with tray controls, always-on-top mode and Windows startup.
- **Nine color-only themes**, customizable typography, colors and layout; no illustrations or uploaded wallpaper images in the v1.0.2 candidate.
- **Daily information** including commissions, expeditions, Realm currency and other available HoYoLAB panels.
- **Local history and alerts** with configurable quiet hours.

> **In development:** The image-free v1.0.2 candidate is not published yet. The public v1.0.1 installer still contains its original wallpaper feature.

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
