# Contributing

Thank you for improving Istaroth. Start with an issue describing the problem or idea, and mention the Windows version and app version.

- Keep HoYoLAB handling read-only; never log raw cookies, account passwords, verification codes, or session tokens.
- Keep game-launching and manual resin editing out of the app unless project requirements explicitly change.
- Test `npm run check`, `npm run test:startup`, and `npm run test:v22` from `app/`.
- When changing the installer, test on Windows and update its embedded `app.zip` from the current `app/` before compiling. The source snapshot shipped in `installer/app.zip` must match the intended release.
- Do not commit `node_modules`, credentials, downloaded runtimes, account histories, or user wallpapers.
- Use your own artwork or permitted assets. Do not add copyrighted Genshin promotional art to the repository without permission.