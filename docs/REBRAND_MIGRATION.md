# Istaroth rebrand: Windows migration

- Visible title: **Istaroth** — **Your Companion Throughout Time!**.
- Installer upgrades an existing Teyvat Pulse installation when detected, rather than forcing a second runtime download.
- Older shortcuts, startup entry and uninstall registry entry are retired only after new installation succeeds.
- Existing `%APPDATA%\Teyvat Pulse` user-data profile is **intentionally preserved** for saved HoYoLAB cookies, saved wallpapers, localStorage and resin history. App UI and shortcut names are Istaroth.
- Browser session partition `persist:teyvatpulse-hoyolab` and legacy localStorage keys are intentionally retained to avoid signing you out.
- No Genshin executable launcher or manual resin editor was reintroduced.
- The Windows installer is unsigned. Confirm its checksums and review source if concerned.
