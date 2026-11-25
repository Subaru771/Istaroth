# Istaroth Community — Celestial Atelier Web UI

This package updates **only the websites**, not the Windows/Electron app. It is based on the user-provided `Istaroth-new-ui3.zip`. The modified project files are:

- `experiments/community-cloud/public/index.html`: refreshed welcome copy, small text corrections, site theme color.
- `experiments/community-cloud/public/modern.css`: cohesive celestial visual design, responsive layouts, resin dashboard, sign-in, friends/settings, controls.
- `experiments/community-cloud/public/sw.js`: bump offline cache key and include the new stylesheet in cached assets.
- `experiments/hoyolab-gateway/static/style.css`: matching gateway and captcha-page styles.

No JS application handlers, worker APIs, data models, database migrations, Electron app code, HoYoLAB credential handling or Telegram notification logic have been changed.

## Deployment

**Community (Cloudflare Workers):** Review `experiments/community-cloud/README.md` and current secrets. From `experiments/community-cloud/`, use `npm run check` and `npm test`, then `npm run deploy` only after verifying security/configuration and intended environment. Deployment updates the existing Worker and bundled public assets. Do not recreate your D1 database or rotate secrets for a stylesheet update.

**HoYoLAB gateway (Render):** Deploy the `experiments/hoyolab-gateway` service with the same existing settings, after reviewing the gateway release gate. Only `static/style.css` is changed. This is **an unofficial login gateway that processes HoYoLAB credentials**; the existing project documentation explicitly says it is not production-approved. Keep private until its security review and testing are complete.

## Verification

- Both updated CSS files parsed without syntax errors.
- Community JavaScript syntax checks passed.
- Browser render of unauthenticated and mock dashboard pages checked at desktop (1440px) and phone (390px); no horizontal overflow after the responsive fix.
- Community suite: **29 passing / 20 failing** in both the original baseline and this edition. No new failures.
- Gateway suite: **10 passing / 1 failing** in both the original baseline and this edition. No new failures.
- Live sign-in, Telegram delivery, API connectivity, and security of the gateway were **not** validated.

## Preview files

Preview images are provided separately in the chat. The mock dashboard screenshots use illustrative numbers only; they are not from a real HoYoLAB session.
