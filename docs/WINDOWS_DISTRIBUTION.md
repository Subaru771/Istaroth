# Windows distribution and migration

Istaroth uses electron-builder to prepare two **offline** Windows x64 distributions from the same tracked Electron source and version-locked npm dependencies.

| Artifact | How it runs | Network required to install? | Installed shortcuts/uninstaller |
| --- | --- | --- | --- |
| Offline NSIS Setup (`.exe`) | Install the application with a conventional Windows wizard | **No** runtime download | Yes |
| Portable ZIP | Extract **all files** to a folder and run `Istaroth.exe` | **No** runtime download | No installer or uninstaller |

Both v1.0.1 distribution artifacts **bundle Electron**. Istaroth may still use the network for requested HoYoLAB synchronization and GitHub update checks. *Portable* means no installer is required: the app continues to store its settings and HoYoLAB browser session in the Windows user's existing `%APPDATA%\Teyvat Pulse` profile, rather than alongside the EXE. The ZIP must be extracted fully, not run from within Explorer's ZIP preview. Keep its extraction folder fixed if you enable Start with Windows.

## Build from tracked source

From `app/`, on Windows x64 with Node.js 22 installed:

```powershell
npm ci
npm run check
npm run test:startup
npm run test:v22
npm run build:win
```

The files are generated in `app/dist/`. GitHub Actions runs the same locked installation, builds both outputs, inspects the embedded `app.asar`, verifies the portable ZIP structure and writes separate SHA-256 checksum files. For production use, download the EXE/ZIP and matching SHA-256 directly from [GitHub Releases](https://github.com/Subaru771/Istaroth/releases/tag/v1.0.1), not from unreviewed mirrors.

## Compatibility and QA before public release

**Public releases:** The original v1.0 Go installer remains archived at its [v1.0 release](https://github.com/Subaru771/Istaroth/releases/tag/1.0). The [v1.0.1 release](https://github.com/Subaru771/Istaroth/releases/tag/v1.0.1) distributes a tested conventional offline NSIS installer and portable ZIP. Both remain **unsigned** and may be flagged by SmartScreen.

The main widget, mini widget, themes, HoYoLAB connection, install/uninstall and reinstall were tested on Windows. Before recommending the upgrade broadly, continue checking these scenarios on additional Windows 10/11 x64 PCs:

1. On a clean Windows user account, install NSIS with Wi-Fi off: launch, create and remove shortcuts, and uninstall successfully.
2. Extract and launch the ZIP offline. Confirm moving or deleting the ZIP folder cannot accidentally remove profile data.
3. On a machine with legacy Go-installer Istaroth, exit Istaroth including the tray icon. Install the NSIS candidate and verify the existing HoYoLAB login, wallpapers and history survive.
4. Check that a second copy is not left running and that changing install directories does not create conflicting shortcuts or registry auto-start entries. The old Go and new NSIS installers use different registration mechanisms and can coexist; do **not** silently uninstall the old installation during migration.
5. Confirm startup enable/disable and a portable-app moved-folder scenario. Verify that disabling Start with Windows does not leave a stale entry.
6. Verify HoYoLAB sign-in and read-only sync using your own account. Test network loss and API failure without posting real cookies or UIDs to GitHub.
7. Verify both SHA-256 files against the **exact final release binaries**. Any rebuild or code signing changes the hash.

Do not label a build signed without a verified Authenticode certificate. Do not auto-execute downloaded unsigned installers. If a real malware detection appears, investigate it rather than instructing users to bypass it.

## Maintaining the legacy installer

The old runtime-downloading Go setup lives in `installer/` for historical source reproduction and migration troubleshooting. The standard v1.0.1 offline NSIS and ZIP packages are built directly from `app/` and do not depend on `installer/app.zip` or the Go installer. See [CODE_SIGNING.md](../CODE_SIGNING.md) for signing.
