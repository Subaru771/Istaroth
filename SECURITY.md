# Security policy

This is a independent fan project that uses unofficial HoYoLAB endpoints. It has not received a third-party security audit. **Do not post HoYoLAB cookies, session tokens, passwords, or email codes in GitHub Issues.**

For reproducible investigation, share the version, Windows version, and redacted error or diagnostic text. For a potentially exploitable security issue, prefer GitHub's private vulnerability reporting (enable it in the repository's Settings → Security) rather than a public Issue. This repository cannot currently promise a response SLA.

The setup downloads the Electron runtime from a pinned GitHub URL and checks its SHA-256. Public installer downloads will have matching SHA-256 files. Checksums only verify the bytes; they do not replace code signing, antivirus scans, or code review.

Microsoft SmartScreen may warn about an unsigned/unrecognized binary. **Do not bypass a separate Microsoft Defender malware detection.** Report the threat name and affected filename for investigation.