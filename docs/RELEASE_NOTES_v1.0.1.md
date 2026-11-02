# Istaroth v1.0.1 — Offline Windows Release

Istaroth is a free, open-source, unofficial Genshin Impact desktop companion for Windows 10/11 x64.

## What's new

- **Standard Windows installer:** Conventional electron-builder NSIS setup; Electron is included and no runtime download is required during installation.
- **Portable edition:** Extract the full ZIP and run `Istaroth.exe`; no installer needed. Settings and HoYoLAB session still reside in your Windows user profile.
- **Verification:** Separate SHA-256 files for the exact NSIS installer and portable ZIP.
- Original Resin tracking, Mini Widget, nine themes, wallpapers, alerts, and HoYoLAB connectivity remain available.

## Install

**Installer:** Download `Istaroth-v1.0.1-Setup-Windows-x64-UNSIGNED.exe`, quit any running Istaroth tray process, then run Setup.

**Portable:** Download `Istaroth-v1.0.1-Portable-Windows-x64-UNSIGNED.zip`, fully extract it to a folder, and run `Istaroth.exe`. Do not run it from within the ZIP viewer.

**Upgrading from v1.0:** Istaroth intentionally keeps the legacy `%APPDATA%\Teyvat Pulse` profile to preserve your settings, wallpapers and existing HoYoLAB login. If you already installed the old Go-based version, close it completely before running the new NSIS installer. If you see duplicate program entries or shortcuts, remove the obsolete installation separately; do not delete your personal profile folder.

## Verify downloads (Windows Command Prompt)

```cmd
certutil -hashfile Istaroth-v1.0.1-Setup-Windows-x64-UNSIGNED.exe SHA256
certutil -hashfile Istaroth-v1.0.1-Portable-Windows-x64-UNSIGNED.zip SHA256
```

Compare each output to its same-named `.sha256` release asset. The hashes are generated from the **actual published build**, not copied from the previous release.

## Security and limitations

**Both builds are unsigned.** Windows SmartScreen can flag an unknown publisher. An antivirus malware detection should be investigated, not bypassed. Checksums verify exact bytes, not publisher identity or freedom from malware.

Istaroth is an independent fan-made tool, not affiliated with HoYoverse or Cognosphere. HoYoLAB features use unofficial interfaces that may change. No developer-operated account server is required.

Source code, reproducible build workflow, and [code-signing policy](https://github.com/Subaru771/Istaroth/blob/main/CODE_SIGNING.md) are public.
