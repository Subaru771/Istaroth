# Privacy — Istaroth v1.0.2 candidate

Istaroth is an unofficial Windows desktop companion. **There is no developer-operated account, analytics or telemetry service.** The app communicates directly with services needed for the features below.

| Data | Why it is used | Where it goes |
| --- | --- | --- |
| HoYoLAB cookies | Authenticate read-only account queries | Stored in a dedicated persistent Electron browser session on this PC and sent to supported official HoYoLAB/HoYoverse API hosts |
| Genshin UID, region and nickname | Select an account | Stored locally and used for API requests |
| Resin readings, alerts and settings | Display timers and history | Stored locally, not sent to an Istaroth server |
| Color themes and appearance preferences | Customize the color-only widgets | Stored locally on your PC |
| Wallpapers from earlier versions | No longer used by v1.0.2 | Preserved locally for compatibility; never loaded, uploaded, or deleted by the new version |
| Release metadata | Check for new versions | The app may contact the public GitHub Releases API for `Subaru771/Istaroth`; checks can be disabled; unsigned EXEs are not executed automatically |
| Offline installer and portable ZIP | Run Istaroth without a runtime download during installation | Electron is bundled in the GitHub release package |

**Cookie protection (v1.0.2 candidate):** Only the least-privileged HoYoLAB cookies needed for read-only requests are forwarded to official API hosts; high-privilege tokens are filtered. Electron's isolated browser profile remains responsible for cookie storage. The application checks OS encryption support but this check alone does **not** guarantee every persisted cookie is encrypted. An updated sign-in may be required after upgrading.

**Local storage:** To keep upgrades compatible, Istaroth uses the legacy `%APPDATA%\Teyvat Pulse` data directory and `persist:teyvatpulse-hoyolab` browser partition. These names are not publicly displayed product versions and must not be renamed without a migration.

**Disconnect:** Disconnecting HoYoLAB clears the dedicated browser session's cookies and cache. App preferences and local history may remain until the user deletes them. Uninstalling may intentionally preserve the user profile for later reinstallations.

HoYoLAB cookies are sensitive authentication credentials. Never post them, session tokens, or unredacted logs in GitHub issues. See [SECURITY.md](SECURITY.md).

This project is not affiliated with, sponsored by, or endorsed by HoYoverse or Cognosphere. Unofficial endpoints may change.
