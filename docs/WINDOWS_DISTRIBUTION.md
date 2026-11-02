# Windows distribution and migration

Istaroth uses electron-builder to prepare two **offline** Windows x64 distributions from the same tracked Electron source and version-locked npm dependencies.

| Artifact | How it runs | Network required to install? | Installed shortcuts/uninstaller |
| --- | --- | --- | --- |
| Offline NSIS Setup (`.exe`) | Install the application with a conventional Windows wizard | **No** runtime download | Yes |
| Portable ZIP | Extract **all files** to a folder and run `Istaroth.exe` | **No** runtime download | No installer or uninstaller |

Both candidate artifacts **bundle Electron**. Istaroth may still use the network for requested HoYoLAB synchronization and GitHub update checks. *Portable* means no installer is required: the app continues to store its settings and HoYoLAB browser session in the Windows user's existing `%APPDATA%\Teyvat Pulse` profile, rather than alongside the EXE. The ZIP must be extracted fully, not run from within Explorer's ZIP preview. Keep its extraction folder fixed if you enable Start with Windows.

## Build from tracked source

From `app/`, on Windows x64 with Node.js 22 installed:

```powershell
npm ci
npm run check
npm run test:startup
npm run test:v22
npm run build:win
```

The files are generated in `app/dist/`. GitHub Actions runs the same locked installation, builds both outputs, inspects the embedded `app.asar`, verifies the portable ZIP structure and writes separate SHA-256 checksum files. Download QA outputs from the successful workflow run's **Artifacts**, not from an unreviewed external mirror.

## Compatibility and QA before public release

**The current public v1.0 download is still the legacy unsigned Go installer.** The new packages are *candidates*, not an automatic upgrade. Do not substitute them for the released installer or claim that the unsigned ZIP avoids SmartScreen/antivirus scrutiny.

Before adopting the offline NSIS as the release installer, verify all of the following on **an actual Windows 10/11 x64 PC**:

1. On a clean Windows user account, install NSIS with Wi-Fi off: launch, create and remove shortcuts, and uninstall successfully.
2. Extract and launch the ZIP offline. Confirm moving or deleting the ZIP folder cannot accidentally remove profile data.
3. On a machine with legacy Go-installer Istaroth, exit Istaroth including the tray icon. Install the NSIS candidate and verify the existing HoYoLAB login, wallpapers and history survive.
4. Check that a second copy is not left running and that changing install directories does not create conflicting shortcuts or registry auto-start entries. The old Go and new NSIS installers use different registration mechanisms and can coexist; do **not** silently uninstall the old installation during migration.
5. Confirm startup enable/disable and a portable-app moved-folder scenario. Verify that disabling Start with Windows does not leave a stale entry.
6. Verify HoYoLAB sign-in and read-only sync using your own account. Test network loss and API failure without posting real cookies or UIDs to GitHub.
7. Verify both SHA-256 files against the **exact final release binaries**. Any rebuild or code signing changes the hash.

Do not label a build signed without a verified Authenticode certificate. Do not auto-execute downloaded unsigned installers. If a real malware detection appears, investigate it rather than instructing users to bypass it.

## Maintaining the legacy installer

The old runtime-downloading Go setup lives in `installer/` for historical source reproduction and migration troubleshooting. The standard offline NSIS and ZIP packages are built directly from `app/` and do not depend on `installer/app.zip` or the Go installer. See [CODE_SIGNING.md](../CODE_SIGNING.md) for signing.
