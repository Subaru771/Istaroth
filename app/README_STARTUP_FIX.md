# Istaroth v2.2.1 — Windows startup hotfix

This is a repair update for the existing **Windows Istaroth v2.2** installation. It does not install Electron again and is not an iOS update.

## Install without CMD
1. Quit Istaroth completely from its tray icon: right click **Quit completely**.
2. Double-click `Istaroth_v2.2.1_Startup_Repair.exe` on your Windows PC (extract it from the ZIP first if needed).
3. The repair tool locates your existing per-user installation, backs up the six changed app files, replaces them, and registers **Istaroth** itself in the current user's Windows Startup Run key. It never starts Genshin Impact.
4. Reopen the installed **Istaroth** shortcut. Under **Settings → Account**, the Windows startup status now shows the actual registered executable, and **Repair Windows startup** can re-register it.
5. Check **Windows Settings → Apps → Startup** and make sure **Istaroth** is enabled. Sign out and sign back in to test.

The repair tool uses no CMD windows and requires no Node.js or administrator privileges. If you installed Istaroth in an unsupported custom location, it will show a clear error rather than changing unrelated files. Your saved settings, login cookies, wallpaper and history are not replaced. The repair utility is unsigned, so Microsoft Defender SmartScreen may warn about the publisher. Only run it if you trust its source.

## What was broken
Earlier versions checked for an existing `startup-preference.json` file. If the file said startup was enabled, the app sometimes **did not re-register a missing or outdated Windows startup entry**. Windows was therefore never instructed to launch the widget, even if the UI toggle looked enabled. The repair reads the actual per-user `Run` registry entry and re-creates it when missing or stale. User-disabled entries in Windows Startup Apps are respected until you explicitly click repair or enable the switch.

## Manual alternative without installing anything
- Press `Win + R`, enter `shell:startup`, and press Enter.
- Search **Istaroth** in the Start Menu. Right-click → **Open file location** (if available), then copy the **Istaroth shortcut** into the Startup folder you just opened.
- This starts only the widget at sign-in. If you use the shortcut method, consider disabling the app's built-in startup toggle to avoid two launch entries (the app has a single-instance lock but duplicate entries are still unnecessary).

## Technical notes
- Registry: `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run` value `Istaroth`, pointing to the installed `electron.exe` (GUI application, no script).
- The app verifies the target path and indicates when Windows has disabled its startup entry.
- Six files updated: `main.js`, `windows-startup.js`, `preload.js`, `renderer.js`, `index.html`, `package.json`.
- It preserves all six original tabs, mini widget, history, and HoYoLAB code. No game launch or resin edit controls are introduced.
- Windows native startup has **not** been run in this environment. The executable was cross-compiled and verified as a PE32+ Windows GUI program. All JavaScript startup unit tests pass.
