# Istaroth Cloudflare Gateway (staging only)

This isolated Cloudflare Worker is **not a replacement for the working Render Gateway** yet. It provides an always-responsive health endpoint and a Durable Object session prototype. It does **not** receive or process HoYoLAB credentials. No Community URLs or production settings are changed.

## Why it cannot be switched on yet
The existing Render gateway uses Python `genshin[auth]` for international HoYoLAB password login, GeeTest v3/v4 CAPTCHA, account selection, and Community pairing. Cloudflare Workers cannot execute that Python authentication library unchanged. A JS/Workers implementation must be developed and verified against real supported login flows before handling credentials.

## Staging deployment
From this directory run `npm install`, `npm test`, then `npx wrangler deploy`. This creates a separate Worker named `istaroth-gateway-staging`; it does not touch `istaroth-community` or Render.

## Production cutover requirements
1. Port authentication and GeeTest challenge handling without bypassing verification.
2. Bind short-lived login jobs to secure browser sessions using Durable Objects; add CSRF, origin checks, rate limits, and safe expiry.
3. Preserve atomic Community pairing claim and explicit approval.
4. Test real HoYoLAB sign-in, challenge, session expiry, concurrency, and account linking.
5. Only after validation, update the Community gateway link and readiness check to the new production host; retain Render as rollback.

Do not direct users to the staging Worker to enter credentials.
