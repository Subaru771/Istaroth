<div align="center">

# Istaroth

**Your Companion Throughout Time!**

A free, open-source, unofficial Genshin Impact desktop companion for Windows.

![Version](https://img.shields.io/badge/version-v1.0-8168d9) ![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4) [![MIT License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[**Download v1.0**](https://github.com/Subaru771/Istaroth/releases/tag/1.0) · [Privacy](PRIVACY.md) · [Security](SECURITY.md) · [Report an issue](../../issues)

</div>

## Preview

![Animated Istaroth feature tour: Resin tracking, Mini Widget, themes, and wallpaper customization](docs/images/istaroth-feature-tour.gif)

*Illustrative feature tour using sample data; not a live HoYoLAB account recording.*

[Real Windows screenshot](docs/images/windows-settings.png) · [Nine-theme gallery](docs/images/style-gallery.png)

## Features

- **Live Resin tracking** using your own HoYoLAB session, with recovery estimates and reminders.
- **Main and Mini widgets** with tray controls, always-on-top mode and Windows startup.
- **Nine themes**, custom appearance and separate wallpapers for the Main Widget, Resin Card and Mini Widget.
- **Daily information** including commissions, expeditions, Realm currency and other available HoYoLAB panels.
- **Local history and alerts** with configurable quiet hours.

## Install

1. Download [`Istaroth_Setup_v1.0.exe`](https://github.com/Subaru771/Istaroth/releases/download/1.0/Istaroth_Setup_v1.0.exe) for **Windows 10/11 x64**.
2. Quit any existing Istaroth tray instance and run Setup. On first installation it downloads the official Electron runtime and checks its pinned SHA-256.
3. Open **Settings → Account** and sign in on the official HoYoLAB page.

**Note:** The v1.0 installer is **unsigned** and may show a Microsoft SmartScreen reputation warning. Do not bypass antivirus malware detections. Istaroth is independent of HoYoverse/Cognosphere and uses unofficial HoYoLAB endpoints, which may change.

## Verify the download

The published v1.0 installer has this SHA-256:

```text
d0cbf9b6185cc7749dca099ecbaf8c16d32fca7c2976475f0b65b505929428e7
```

Run in Windows Command Prompt next to the downloaded EXE:

```cmd
certutil -hashfile Istaroth_Setup_v1.0.exe SHA256
```

Compare the result with the hash above or [the checksum attached to the GitHub release](https://github.com/Subaru771/Istaroth/releases/download/1.0/Istaroth_Setup_v1.0.exe.sha256). A matching hash confirms identical bytes, **not** publisher identity or malware safety. See [code signing](CODE_SIGNING.md).

## Source and contributions

- **Electron app:** `app/`
- **Graphical Windows installer:** `installer/`
- **Build scripts:** `scripts/`
- **Automated checks:** [GitHub Actions](../../actions)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Changes:** [CHANGELOG.md](CHANGELOG.md)

To run from source, install Node.js and run `npm install` then `npm start` from `app/`. To build the installer, see [installer/BUILDING.md](installer/BUILDING.md).

Istaroth stores sign-in state and settings locally, preserving the legacy `Teyvat Pulse` profile for existing installations. Read [PRIVACY.md](PRIVACY.md) before connecting an account.

## License

Code is [MIT licensed](LICENSE). Genshin Impact trademarks and related intellectual property belong to their respective owners. Artwork and third-party assets are not automatically covered by the code license.
