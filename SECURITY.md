# Security — Istaroth v1.0

Istaroth is an independent fan project using unofficial HoYoLAB endpoints. It **has not undergone an independent security audit**.

**Never put HoYoLAB cookies, session tokens, passwords, or verification codes in public issues or logs.** For a security vulnerability, use GitHub's private security reporting where available.

Istaroth uses a dedicated Electron browser session for HoYoLAB sign-in. Its main process can access selected cookies to authenticate API requests; this is sensitive even when login occurs on the official page. The installer downloads an Electron runtime from a pinned GitHub URL and verifies its SHA-256.

The [v1.0 release hash](checksums/Istaroth_Setup_v1.0.exe.sha256) verifies the bytes of the exact public installer. A SHA-256 checksum does **not** authenticate the publisher, prevent a malicious replacement of both files, or replace code signing and malware scanning.

The v1.0 installer is **unsigned**. A SmartScreen reputation warning is different from a Defender malware detection. Do not bypass a malware detection without investigating it. Review [CODE_SIGNING.md](CODE_SIGNING.md) and [PRIVACY.md](PRIVACY.md) for more information.
