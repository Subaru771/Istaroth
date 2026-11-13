# Istaroth Community — Cloud Security Integration (v0.11.0 RC1)

This is a **development snapshot, not a production-approved release**. The source is for Cloudflare Workers + D1 and integrates with the separately deployed Render HoYoLAB gateway.

## Mobile journey

1. Open Community on a phone and sign in with Telegram.
2. Select **Connect HoYoLAB**. Community generates a short-lived pairing code.
3. Open the gateway in a browser tab. Only the pairing code is in a URL fragment, never the query string.
4. The privately hosted gateway verifies and atomically claims the code before requesting HoYoLAB credentials.
5. Verify the listed Genshin account and explicitly approve linking.

**The gateway is not HoYoLAB, does not provide official OAuth, and handles the user's plaintext password during login.** Do not invite general users before a professional review and successful real-device tests. For now the gateway MUST remain private; `GATEWAY_PUBLIC_PAIRING=1` is NOT a safe substitute for gateway access control.

## Current additions

- Primary mobile gateway button, with legacy cookie/browser helper/Windows methods moved to an optional collapsed area.
- One-time D1 gateway code claim with opaque 32-byte proof, checked on account preview and completion. Existing unclaimed Windows codes retain compatibility.
- Per-recipient quiet hours (IANA timezone, configurable start/end); muted resin alerts are **skipped**, not backlogged.
- Concurrent Telegram login attempt counter verification.
- New additive migrations `0007_notification_quiet_hours.sql` and `0008_gateway_claim.sql`.

## Safe Cloudflare deployment

From `Istaroth-Community-App` run `UPDATE-EXISTING-COMMUNITY.cmd` on Windows **only after review and gateway compatibility tests**. It checks the existing database ID, applies additive migrations, deploys Worker/assets, and verifies `/health`. It does not rotate DATA_KEY, BOT_TOKEN, WEBHOOK_SECRET, or recreate D1.

## Security limitations / release gate

- A one-time pairing code is a bearer capability until claimed. A malicious actor with the code can race to claim it. Do not log codes.
- The claim proof is only a gateway-to-Community transfer restriction, **not** a substitute for the gateway's own authentication and CSRF protection.
- The gateway's unofficial password login remains restricted, unreviewed, and may require additional HoYoLAB verification.
- True PC-off Telegram delivery depends on a working outbound Telegram path or privately configured relay. This archive cannot prove live delivery.
- Real HoYoLAB login, CAPTCHA, Telegram delivery, and Render/Cloudflare revisions must be independently verified prior to release.
- Account disconnect removes stored cloud credentials but **does not revoke HoYoLAB sessions at HoYoLAB**; users must revoke sessions through their account security controls.

## Local tests

`npm run check && npm test` (Node 22+). Tests use simulated Telegram and HoYoLAB APIs. They **do not** attest to live cloud provider connectivity.
