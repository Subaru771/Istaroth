<div align="center">

# Istaroth

**Your Companion Throughout Time!**

A free, open-source, unofficial Genshin Impact desktop companion for Windows.
See your Original Resin, daily commissions, Realm currency and more, right on your desktop.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platform: Windows 10/11 x64](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078D4)
![Version: 1.0](https://img.shields.io/badge/release-v1.0-informational)

[Download](../../releases) · [Changelog](CHANGELOG.md) · [Privacy](PRIVACY.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

</div>

> [!NOTE]
> **v1.0 notes:** The installer is unsigned and has not had an independent security audit. HoYoLAB integration relies on unofficial endpoints and may change. Istaroth is not affiliated with or endorsed by HoYoverse or Cognosphere.

## Preview

![Istaroth's nine illustrated regional styles](docs/images/style-gallery.png)

![Istaroth Windows and widget settings](docs/images/windows-settings.png)

## Features

**Resin and daily info**
- Automatically retrieves Original Resin and available HoYoLAB account information
- Floating Mini Resin Widget, tray resin indicator and recovery timers
- Resin alerts, quiet hours, local history and a daily overview
- Account, exploration, combat and TCG information where available

**Appearance**
- Nine color themes with illustrated regional styles: Istaroth, Mondstadt, Liyue, Inazuma, Sumeru, Fontaine, Natlan, Nod-Krai and Snezhnaya
- Custom typography, accent colors, layouts and saved appearance profiles
- **Wallpaper Studio**: separate wallpaper pages for the Main and Mini widgets (see [Wallpapers](#wallpapers))

**Windows integration**
- Autostart, always-on-top and close-to-tray
- Automatic connection recovery

## Installation

**Requirements:** Windows 10/11 x64

1. Download the Setup executable from the [Releases](../../releases) page. If an older version of Istaroth is installed, fully quit it first, including its system-tray process.
2. Run Setup and choose the installation folder and your Windows-startup preference. A first-time install needs an internet connection to download the official Electron runtime, which is validated against its SHA-256 before extraction.
3. Open Istaroth and sign in through the official HoYoLAB page under **Settings → Account**.

> [!WARNING]
> The unsigned installer may trigger a Microsoft SmartScreen reputation warning. A separate antivirus detection should be investigated, not bypassed.

## Settings overview

| Section | What it controls |
| --- | --- |
| **Account** | HoYoLAB sign-in |
| **Windows** | Window and startup behavior |
| **Alerts** | Notifications and quiet hours |
| **Style** | Regional designs and appearance profiles |
| **Main wallpaper** | Wallpaper for the main widget |
| **Mini wallpaper** | Wallpaper for the Mini Widget |

## Wallpapers

Main and Mini wallpapers each have their own top-level settings page under **Settings → Main wallpaper** and **Settings → Mini wallpaper**. Each page has separate image storage, position, blur, darkness and zoom controls, a reset option and a live widget preview.

- The Main page also lets you choose between **Full Widget** and **Resin Card** placement. This choice never affects the Mini Widget.
- Existing wallpaper files are retained.

## Account security and privacy

- Sign-in happens on the official HoYoLAB page, in a separate persistent Electron session.
- Authentication cookies stay in your local Electron user-data profile and are used for authenticated HoYoLAB requests.
- No Istaroth developer-operated analytics or account server is configured.
- Never share your cookies or tokens.

Third-party clients carry account and compatibility risks. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) for details.

## Building from source

The repository contains the Electron application in `app/` and a custom Go graphical Windows installer in `installer/`.

**Run the app** (requires Node.js), from `app/`:

```bash
npm install
npm start
```

**Checks and tests**, from `app/`:

```bash
npm run check
npm run test:startup
npm run test:v22
```

**Build the Windows Setup** (requires Go):

```bash
# 1. Generate the archive the installer embeds
python scripts/build_embedded_app.py

# 2. Build the installer, from installer/
go build -ldflags="-H=windowsgui" -o Istaroth_Setup.exe main.go wizard.go
```

The installer embeds `installer/app.zip`. CI generates the same archive from source and builds a Windows setup artifact. The published installer SHA-256 confirms the download's bytes. It is not a code signature or a guarantee of safety. See [CODE_SIGNING.md](CODE_SIGNING.md).

## Artwork and acknowledgements

Regional banner art uses locally bundled, AI-assisted original illustrations inspired by Genshin Impact settings, not official game screenshots.

Genshin Impact, its names and related intellectual property belong to their respective owners. This is an independent fan project and is not officially endorsed.

## License

The project code is [MIT licensed](LICENSE). Do not assume that external game assets, user wallpapers or trademarks are covered by the source-code license.
