# Contributing to Istaroth v1.0

Issues and focused pull requests are welcome. Include the Istaroth version, Windows version and reproducible steps, but **never paste HoYoLAB cookies, passwords, session tokens or unredacted account logs**.

Development is in `app/` (Electron) and `installer/` (Go). Before proposing a change, run `npm run check`, `npm run test:startup` and `npm run test:v22` from `app/`. Check GitHub Actions for additional tests on pull requests.

Keep authentication read-only, maintain the existing local profile and cookie partition so upgrades do not sign users out, and test installer changes on Windows. Do not commit downloaded Electron runtimes, `node_modules`, credentials, user histories, or personal wallpapers. Only contribute artwork and code you are permitted to license.
