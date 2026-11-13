# Fix blocked Telegram delivery with a PRIVATE relay

**Why:** The earlier Cloudflare Worker returned `Telegram getMe network connection failed`. Telegram sign-in codes can work through webhook replies, but scheduled resin alerts and website-triggered approval notifications need an outgoing Telegram API call. This relay runs on another HTTPS host that can reach Telegram. It must be owned by you; a random public proxy would be able to impersonate your bot.

## Recommended deployment (Render)

1. Create your own PRIVATE GitHub repository for this relay. Upload `server.mjs` and `package.json` from this `relay` folder. A ready-to-upload standalone ZIP is provided separately.
2. In Render, create a **Web Service** from that repository. Runtime **Node**, build command `npm install --omit=dev`, start command `npm start`. Choose a plan suited to your needed responsiveness; free services can sleep.
3. Set environment variable `BOT_TOKEN` to your current `@Istaroth771_bot` token from BotFather. This secret belongs ONLY in Render's secret environment settings, not source code.
4. Generate a strong random `RELAY_KEY` containing 32+ letters/digits (a private shared secret) and set it as a second Render environment variable. Save it securely because the same value is required in Cloudflare.
5. Deploy, then open `https://YOUR-SERVICE.onrender.com/health`. You should see `{"online":true,"service":"Istaroth Telegram Relay"}`. This checks server readiness, not whether Telegram messages work.
6. Extract **Istaroth Community v0.9.6** and run `CONFIGURE-TELEGRAM-RELAY.cmd`. Paste your HTTPS relay URL, then enter the SAME `RELAY_KEY` privately. This changes only `TELEGRAM_RELAY_URL` (public Worker variable) and `TELEGRAM_RELAY_KEY` (Cloudflare secret), then deploys. It does not reset D1, DATA_KEY, BOT_TOKEN or the Telegram webhook.
7. Sign in to Istaroth Community and click **Send a test notification**. Confirm the Telegram message arrives. Then approve/resend for a friend and verify a real resin threshold crossing.

**Don't claim success until you receive the test message.** Free hosting cold starts, misconfiguration, a blocked bot, or broken HoYoLAB sync can still delay or prevent notifications. All delivery errors are shown in the updated dashboard.

## Security notes

- Deploy only to a trusted host you control. The relay receives Bot API send requests and contains your `BOT_TOKEN` in its private environment. It rejects requests without the matching `RELAY_KEY`.
- Do not paste `BOT_TOKEN`, `RELAY_KEY`, HoYoLAB session cookies, or `.env` files into ChatGPT, screenshots, or a public repository.
- Do not point `TELEGRAM_RELAY_URL` at a third-party untrusted proxy.
- If any secret is exposed, rotate it in both services and redeploy.
