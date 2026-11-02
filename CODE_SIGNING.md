# Code signing policy — Istaroth v1.0

**Status:** Istaroth v1.0 is currently **unsigned**. This page describes the intended signing process, not an existing certificate or an approved signing service.

## Build and release provenance

- Project: https://github.com/Subaru771/Istaroth
- Releases: https://github.com/Subaru771/Istaroth/releases
- Maintainer, reviewer and signing approver: repository owner (Subaru771)
- [Privacy policy](PRIVACY.md) and [Security policy](SECURITY.md)
- Source and CI build instructions are public in this repository.

## Windows distribution targets

The new Windows build workflow produces a conventional **offline NSIS installer** plus a **portable ZIP** from locked npm dependencies. Both are unsigned QA candidates until Windows compatibility tests pass. The currently published v1.0 Go installer remains unchanged.

A signature on the NSIS installer does **not** sign the embedded portable `Istaroth.exe` inside a ZIP. Signing the portable executable requires a signing step **before** packaging the ZIP, followed by re-hashing the resulting ZIP. See [Windows distribution and migration QA](docs/WINDOWS_DISTRIBUTION.md).

## Applying for free open-source signing

The project intends to apply to [SignPath Foundation](https://signpath.org/apply). **Approval is not guaranteed.** SignPath requires an already released, documented, appropriately licensed and reputable open-source project, verifiable build provenance and manual release approval. Read its [conditions](https://signpath.org/terms.html) and the [prepared application checklist](docs/SIGNPATH_PREPARATION.md). The foundation also expects a distributed build in the form proposed for signing, verifiable reputation, clear maintainer roles, repository multi-factor authentication and manual approval for each signing request.

If accepted, the project will disclose the exact approved signing workflow, certificate issuer and verification steps here. We will not claim that SignPath signs our releases before its approval.

## Signing using a developer-held certificate

If the maintainer obtains a trusted code-signing certificate separately, the `scripts/sign-windows-installer.ps1` script signs the existing installer using a certificate stored securely in the Windows certificate store. It requires the Windows SDK SignTool, SHA-256 signing and an RFC 3161 timestamp. The script verifies the signature and generates a new checksum.

A self-signed certificate does **not** make a Windows download a trusted publisher. Never commit private keys, PFX exports, PINs, or passwords.

## Release controls

1. Build only from reviewed public source; run CI and check bundled dependencies.
2. Sign the **final** EXE with an approved certificate or signing provider and add a trusted timestamp.
3. Verify the Authenticode certificate chain, timestamp and file identity before publishing.
4. Generate and publish a **new SHA-256 checksum after signing**.
5. Clearly mark previous release binaries as unsigned and avoid retroactively claiming they were signed.

Signatures provide publisher identity and file integrity, but are not a security audit or guarantee that SmartScreen warnings will disappear immediately.
