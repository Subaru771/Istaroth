# Privacy and account security — Istaroth v2.4.8

Istaroth is an unofficial, open-source desktop app. **No developer-operated analytics, login, or telemetry server is configured in this release.** The app connects to external services to operate:

| Information | Purpose | Destination / retention |
|---|---|---|
| HoYoLAB sign-in cookies | Authenticate game data requests | Stored in a dedicated persistent Electron browser session on your Windows computer; sent to HoYoLAB/HoYoverse endpoints as needed |
| Genshin UID, region, nickname | Select account and associate readings | Saved locally in app settings and included in requests to HoYoLAB |
| Resin readings, history, notification settings | Track resin and alert at thresholds | Saved locally on device; not uploaded to a Istaroth server |
| Custom wallpapers, themes | Personalization | Saved locally on device |
| Automatic update check (if independently configured) | Check public GitHub release metadata | Contacts GitHub; no trusted repository is preconfigured in this version |
| Electron runtime download at first install | Install runtime | Downloaded from the official Electron GitHub release and checked against a hardcoded SHA-256 |

**Where files are stored:** Application preferences and history are saved in the Windows Electron user-data folder. HoYoLAB session data is kept in an isolated persistent Chromium partition. Disconnecting the HoYoLAB account clears the dedicated session storage and cache; existing locally saved history may remain until deleted with the app's local data.

**No password collection:** The app opens the official HoYoLAB website for login. It does not provide a custom field asking for your HoYoLAB password. As with any signed-in third-party client, it accesses authenticated cookies to request data. Do not share your cookies or token with anyone.

**Third-party service warning:** The underlying HoYoLAB endpoints are unofficial and may not be approved for third-party use. HoYoverse warns that third-party applications can present account-security risks; review its terms and guidance before using this app.

**Uninstall and removal:** Uninstall from Windows Installed Apps, then manually delete Istaroth's local app data if you want to clear remaining settings, screenshots, and session files. Disconnect in the app first when possible.

Privacy notice reflects the current source, not an independent audit. For questions, file a GitHub Issue after the public repository is created, without sharing account tokens, cookies, or identifying data.

**Rebrand compatibility:** On Windows, Istaroth deliberately retains `%APPDATA%\Teyvat Pulse` as its existing local profile folder and reuses the established HoYoLAB session partition. No account data is sent to any migration service.
