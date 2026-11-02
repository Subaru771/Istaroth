# Istaroth 1.0 — launch and community kit

*This is a reusable promotion draft and checklist. It does not mean posts have been sent or communities have approved them.*

## Where to start

1. Add GitHub topics: `genshin-impact`, `hoyolab`, `electron`, `resin-tracker`, `windows`, `desktop-widget`, `open-source`.
2. Confirm the current public [release download](https://github.com/Subaru771/Istaroth/releases/tag/1.0), checksum, screenshots and README work in a logged-out browser.
3. Capture a **real, clean** Mini Widget screenshot and a 20–35-second screen recording on Windows, with no username, UID, notifications or cookies visible.
4. Share with a community whose rules permit open-source utilities. Be clear that the installer is unsigned and the app uses unofficial HoYoLAB APIs; avoid posting the same promotional message everywhere.
5. Ask early testers to file GitHub issues including Windows version, installer phase, errors and sanitized logs.

## Short community post

**Title:** I made Istaroth, a free open-source Genshin Resin widget for Windows

I released the first version of **Istaroth — Your Companion Throughout Time!** It's a Windows desktop companion with HoYoLAB Resin information, a small floating Mini Widget, recovery reminders, nine region-inspired themes and separate wallpapers for the Main Widget, Resin Card and Mini Widget.

It's free and the source is public: https://github.com/Subaru771/Istaroth

**Important:** The Windows 1.0 installer is unsigned and has not undergone an independent security audit. First install downloads a verified Electron runtime. Sign-in opens HoYoLAB's official page inside the desktop app; the app locally uses session cookies to request account data. Istaroth isn't affiliated with HoYoVerse.

Feedback, issues and suggestions are welcome! I'd especially appreciate help testing the install and login experience.

## Demo storyboard (30 seconds)

| Time | Screen | Caption |
|---|---|---|
| 0–5 sec | Istaroth Main Widget | Track Resin without launching the game |
| 5–10 sec | Switch to Mini Widget | A compact floating desktop view |
| 10–17 sec | Style gallery | Nine themed looks |
| 17–24 sec | Independent wallpaper controls | Main, Resin Card and Mini settings |
| 24–30 sec | GitHub page and release | Free, open source, Windows 10/11 |

**Recording guardrails:** Use test/offline data when possible; never show credentials, cookies, session tokens, UID or personal account details.

## Release announcement checklist

- [x] Public repository and release exist
- [x] Version 1.0 installer attached
- [x] Changelog, privacy, security and code-signing policies present
- [x] Screenshot previews in README
- [x] Repo checksum published
- [ ] Real Mini Widget screenshot without personal data
- [ ] Test standard NSIS candidate on clean Windows
- [ ] Upload a short video demonstration
- [ ] Add GitHub topics (repository settings)
- [ ] Post to an appropriate community after checking rules
- [ ] Collect first reproducible bug reports
