# Privacy — Istaroth v1.0

Istaroth is an unofficial Windows desktop companion. **There is no developer-operated account, analytics or telemetry service.** The app communicates directly with services needed for the features below.

| Data | Why it is used | Where it goes |
| --- | --- | --- |
| HoYoLAB cookies | Authenticate read-only account queries | Stored in a dedicated persistent Electron browser session on this PC and sent to supported official HoYoLAB/HoYoverse API hosts |
| Genshin UID, region and nickname | Select an account | Stored locally and used for API requests |
| Resin readings, alerts and settings | Display timers and history | Stored locally, not sent to an Istaroth server |
| Optional Telegram friend alert data | Deliver opt-in alerts to specific friends | Your BotFather token (Windows-encrypted), their Telegram chat IDs/display names and individual preferences are stored locally; selected resin estimates/nickname are sent to Telegram only when enabled |
| Theme preferences and wallpapers | Personalize the widgets | Stored locally on your PC |
| Release metadata | Check for new versions | The app may contact the public GitHub Releases API for `Subaru771/Istaroth`; checks can be disabled; unsigned EXEs are not executed automatically |
| Electron runtime archive | Complete first installation | Downloaded from the official Electron GitHub release and verified against a pinned SHA-256 |

**Local storage:** To keep upgrades compatible, Istaroth uses the legacy `%APPDATA%\Teyvat Pulse` data directory and `persist:teyvatpulse-hoyolab` browser partition. These names are not publicly displayed product versions and must not be renamed without a migration.

**Friend alerts:** Off until you connect a Telegram bot and individually enable opted-in recipients. Bot tokens are sent to Telegram for API authentication but never to friends or an Istaroth service. Friends can send /stop to leave; you can remove friends or disconnect the bot. No HoYoLAB cookies are forwarded to Telegram. The feature runs only while Istaroth is running.

**Disconnect:** Disconnecting HoYoLAB clears the dedicated browser session's cookies and cache. App preferences and local history may remain until the user deletes them. Uninstalling may intentionally preserve the user profile for later reinstallations.

HoYoLAB cookies are sensitive authentication credentials. Never post them, session tokens, or unredacted logs in GitHub issues. See [SECURITY.md](SECURITY.md).

This project is not affiliated with, sponsored by, or endorsed by HoYoverse or Cognosphere. Unofficial endpoints may change.
