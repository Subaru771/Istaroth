# Istaroth Gateway security release gate

**Status: PRIVATE DEVELOPMENT — NOT CLEARED FOR PUBLIC USE.**

## Implemented in feature branch

- Default-deny HTTP Basic access for all non-health endpoints; `GATEWAY_PUBLIC_PAIRING=1` is NOT a bypass.
- D1-atomic five-minute pairing reservation with a separate 32-byte opaque proof.
- Password-free `POST /api/pairing/claim` before `POST /api/start`.
- One-time, browser-session-bound claim token (not consumed by a different browser).
- Gateway CSRF token bound to the HttpOnly browser session, required for writes and CAPTCHA.
- Session-scoped job status, CAPTCHA, account selection, approval and cancellation.
- No deliberate disk storage of credentials or raw session cookie responses.
- Clear notice that authentication is unofficial and password-handling.

## Remaining public-release blockers

1. **Password risk:** This gateway receives plaintext HoYoLAB passwords and authenticated cookies. HoYoLAB does not offer this project documented OAuth. A third-party password collection service must not be presented as a secure official sign-in flow.
2. **Security review:** Obtain independent review of dependencies, CSRF, CSP, logging, host configuration, password memory, abuse controls, captcha handling, and full data deletion.
3. **Persistent shared rate limits:** Current rate limiting and claim token state are in memory, tied to one Render process. Multi-worker or restart behavior is fail-closed but not production hardened.
4. **OTP and CAPTCHAs:** Provider-specific challenges, device verification and production account safety remain unverified.
5. **Community review:** Verify live D1 migration and historical users, credential decryption, correct pairing ownership, account deletion, and appropriate retention of events and failed notification attempts.
6. **Delivery:** Investigate Cloudflare-to-Telegram HTTP 502 or deploy a private outbound relay under controlled keys. Verify notifications while PCs are completely off.
7. **Testing:** GitHub Actions jobs are currently failing before reporting individual steps; investigate runner/permission or billing restrictions. Do not claim GitHub CI passing.
8. **Deployment:** The Render service tracks `experimental/private-hoyolab-gateway-v1`, NOT the new feature branch. Live services have not been upgraded with this work.

## Intended API contract

- Authenticated Community browser: `POST /api/link/start` -> 24-character code.
- Gateway: `POST /api/pairing/claim` (only code, no HoYoLAB password) -> Community `POST /api/link/claim` reserves D1 code; gateway returns browser-bound one-time claim token.
- Gateway browser `POST /api/start` accepts code + claim token + user credentials, after successful claim.
- Gateway previews authenticated roles with `/api/link/preview` including gateway proof; approval uses `/api/link/complete` including proof. Community consumes code atomically.
- The browser's gateway URL uses a fragment (`#code=...`) rather than a query parameter.

## Secrets and migration

Do not commit BOT_TOKEN, DATA_KEY, WEBHOOK_SECRET, ADMIN_SETUP_KEY, GATEWAY_ACCESS_PASSWORD or live HoYoLAB credentials. Cloudflare `0007` and `0008` migrations are additive. Preserve existing D1 database, DATA_KEY and user records. Back up D1 before any live update. Never switch on public access simply by setting an environment flag.

## Real-device acceptance tests

Test fresh Telegram account, wrong/expired/replayed code, concurrent claim, wrong browser, CAPTCHA, multiple Genshin accounts, explicit approval, credentials redaction, account deletion, resin reminders, quiet hours, friend approvals, Cloudflare/Render restarts, Telegram outage/recovery, and PC-off delivery.
