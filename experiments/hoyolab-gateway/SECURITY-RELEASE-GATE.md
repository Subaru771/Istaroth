# Gateway release gate

**Status: PRIVATE TEST ONLY. Do not enable `GATEWAY_PUBLIC_PAIRING=1` in production.**

The current public-pairing mode bypasses HTTP Basic authentication for all non-health endpoints. A valid pairing code is checked but not reserved atomically at `/api/start`. It must not be treated as a substitute for a Telegram-authenticated, single-use handoff.

Before public access:

1. Introduce a Community-signed short-lived authorization ticket bound to Telegram user, browser state, audience, and a unique nonce; verify and consume the nonce atomically in D1.
2. Require authorization on every sensitive gateway endpoint, including job status, CAPTCHA and approval; enforce CSRF tokens for state-changing operations.
3. Enforce shared rate limits and bounded concurrency; verify trusted proxy client addresses.
4. Add explicit user consent and deletion/revocation flows; never log passwords, cookies, pairing codes or tokens.
5. Audit Community D1 encryption, ownership, `/api/link/check`, `/api/link/preview`, `/api/link/complete`, Telegram login verification, cron scheduling and Telegram outbound errors.
6. Run negative tests for replay, concurrent redemption, cross-account linking, CSRF, forged cookies, and expiry; test real provider login privately.
7. Confirm Render deployment revision and Cloudflare Worker revision separately; never interpret `/health` as proof of authentication or Telegram delivery.

Preserve existing D1 database, encryption keys, accounts, and Telegram settings. No schema migration or key rotation should be performed without a tested backup and rollback plan.
