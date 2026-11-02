# SignPath Foundation application preparation — Istaroth

**Application:** https://signpath.org/apply  
**Terms:** https://signpath.org/terms.html

SignPath Foundation provides approved open-source projects with access to code signing, but it has discretion to accept or reject an application. **Nothing in this repository implies that Istaroth is already accepted or that its published binary is signed.**

## Facts for the application

| Topic | Istaroth |
| --- | --- |
| Project | Istaroth — Your Companion Throughout Time! |
| Source | https://github.com/Subaru771/Istaroth |
| License | MIT (see `LICENSE`); check that every bundled dependency and asset is redistributable |
| Platform | Windows 10/11 x64 |
| Build | `app/package-lock.json` plus `npm ci`, electron-builder NSIS and ZIP targets |
| Current public release | v1.0 at https://github.com/Subaru771/Istaroth/releases/tag/1.0; unsigned legacy Go installer |
| Future proposed signing target | Reviewed offline electron-builder NSIS EXE; potentially the packaged `Istaroth.exe` for a separate portable ZIP |
| Local accounts | HoYoLAB authentication uses a dedicated local Electron browser partition; sensitive cookies are not uploaded to Istaroth-owned servers |
| Privacy | `PRIVACY.md` |
| Security | `SECURITY.md` |
| Code signing policy | `CODE_SIGNING.md` |

## Requirements still needing human verification

1. **Publish and test an unsigned version of the conventional offline installer first**; the Foundation expects the application to already be released in the form being signed. Do not replace the current v1.0 installer solely to satisfy an application requirement without Windows QA.
2. Confirm the repository owner uses multi-factor authentication on GitHub and SignPath. The assistant cannot verify your account security settings.
3. Designate specific people as authors, code reviewers, and release-signing approvers. For a solo-maintained project, clearly disclose the actual roles rather than inventing reviewers.
4. Show a transparent build provenance path from source commit to GitHub Actions artifact, with no downloaded proprietary installer runtime. Complete tests for clean install, upgrades, uninstall, offline startup and preservation of the legacy user profile.
5. Confirm licensing and ownership of all repository artwork and bundled components. The Foundation's OSS conditions are broader than simply having an MIT `LICENSE` file.
6. Include the required *Code signing policy* link on the home page and download page. **After approval only**, update that policy with any exact foundation credit required by the terms.
7. Each signing request needs manual approval and artifact verification. Signing never makes malware alerts safe to bypass.

## Artifact pipeline design (after approval)

```text
reviewed GitHub commit
        |
   npm ci (locked)
        |
electron-builder offline NSIS / unpacked Windows app
        |
   GitHub Actions artifact
        |
SignPath approval and certificate-based signing (not yet configured)
        |
verify Authenticode publisher and timestamp
        |
generate NEW SHA-256 for exact signed bytes
        |
publish release with checksums and provenance
```

If publishing a portable ZIP, sign its contained `Istaroth.exe` before archiving, then compute the ZIP checksum. Do not sign arbitrary non-Istaroth third-party binaries. The published Go v1.0 executable remains unsigned, even if a later version is signed.

Reference: [SignPath Foundation terms](https://signpath.org/terms.html), which require released and documented open-source software, permission to sign one's own artifacts, repository 2FA, maintainer roles, and manual release approval.
