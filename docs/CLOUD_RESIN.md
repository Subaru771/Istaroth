# Istaroth Cloud Resin Alerts — without a running PC

**What this does:** A private Cloudflare Worker reads your account's HoYoLAB Real-Time Notes every five minutes and sends Telegram messages to friends you explicitly approve. Once deployed, **neither Istaroth, Windows nor Genshin must remain open**. All friends need is Telegram.

**This version is one private deployment per Genshin account / bot.** It is not a multi-user hosted service. You control the Cloudflare account and its secrets. A working connection depends on HoYoLAB allowing requests from Cloudflare and your session remaining valid. Run a real cloud sync test before relying on it.

## Requirements

- A free Cloudflare account with Workers and D1 enabled, Node.js installed on your PC for initial deployment.
- A Telegram bot you create via @BotFather. **Do not reuse a bot that is simultaneously being polled by the local version of Istaroth.** Cloud mode uses a Telegram webhook.
- A valid HoYoLAB session for **your own** account, with Battle Chronicle Real-Time Notes enabled.
- You must explicitly consent to holding your HoYoLAB session at Cloudflare. This cookie can grant access to parts of your account. Cloudflare secret storage is not zero-knowledge or equivalent to an OAuth read-only scope. Only deploy to a Cloudflare account you control.

## Initial setup (once)

1. Clone or download this GitHub repository. Open a terminal in its cloud folder.
2. Run: npx wrangler login
3. Create the free database: npx wrangler d1 create istaroth-resin
4. Copy the database ID printed by Wrangler into cloud/wrangler.toml, replacing REPLACE_WITH_YOUR_D1_DATABASE_ID.
5. In the same wrangler.toml, enter your Genshin **ROLE_UID** (8–12 digits), **ROLE_REGION** (os_asia, os_euro, os_usa or os_cht), and **ROLE_NAME**. Set **TIMEZONE** and optional quiet hours. Never add passwords or cookies to this file.
6. Run: npx wrangler d1 migrations apply istaroth-resin --remote
7. Deploy the Worker once: npx wrangler deploy. Keep the resulting HTTPS workers.dev address.

### Configure secret values

Run each command below **from cloud/** and paste the appropriate secret when prompted. These values must **not** go into source code, wrangler.toml, GitHub, screenshots or chat messages.

- npx wrangler secret put TELEGRAM_BOT_TOKEN — Telegram token provided by @BotFather. You can use the bot already created for local Istaroth, but stop the old local bot first.
- npx wrangler secret put OWNER_API_KEY — generate a new random, long key (for example, run Python: python -c "import secrets; print(secrets.token_urlsafe(36))").
- npx wrangler secret put TELEGRAM_WEBHOOK_SECRET — create a different long value containing only letters, numbers, underscore and hyphen. One way: python -c "import secrets; print(secrets.token_urlsafe(36))".
- npx wrangler secret put INVITE_CODE — create a third independent value: python -c "import secrets; print(secrets.token_urlsafe(24))".
- npx wrangler secret put HOYOLAB_COOKIE — **your own current HoYoLAB session cookie header** (sensitive). In Istaroth's Settings → Alerts → Cloud mode, click **Copy HoYoLAB session (sensitive)**. Confirm the native warning. Paste *only* into the Wrangler prompt for this secret, and then click **Clear clipboard**. This does not upload your session automatically.

Cloudflare stores these as Worker secrets, separate from D1. The bot token and cookie are not available from Istaroth's public source or from the recipient management API. They can still be accessed by the running Worker and by administrators of your Cloudflare account, so protect that account with MFA.

8. Run npx wrangler deploy again after setting secrets. The public URL /health should now report that the service is online. This is not the same as successful HoYoLAB authentication.
9. In Windows Istaroth → Settings → Alerts → Cloud mode, enter the HTTPS workers.dev address and the **OWNER_API_KEY** value. Click Connect cloud mode.
10. Click **Activate Telegram bot** to register your Worker webhook. Then click **Test HoYoLAB sync**. You must see a recent, accurate resin reading with no error in the status panel. If it fails, check your session, UID, region, Real-Time Notes setting, or Cloudflare/HoYoLAB restrictions.
11. Copy the cloud invite to your friends. They open it in Telegram and tap Start. Refresh cloud status, then individually enable only the chosen friends and set 160, 180, 190 or 200 resin. Send a test message to verify Telegram delivery.

### What runs when the PC is switched off?

- The Cloudflare Worker cron runs every 5 minutes and fetches HoYoLAB directly, using the secret configured above.
- It stores only the latest resin reading and recipient preferences in D1.
- It sends a Telegram alert once per enabled friend when their threshold is reached, respecting the cloud quiet hours.
- If resin decreases below that friend's threshold, the next crossing can alert again. If a send fails, it retries on a later cron run.
- The friends can send /stop to immediately unsubscribe; you can pause or remove them in Istaroth whenever you next open the PC.
- If the HoYoLAB session expires, Cloudflare blocks the endpoint, or another API error occurs, the Worker **does not send new threshold alerts from stale data**. Cloudflare cron scheduling and HTTP service uptime are not guaranteed to be second-accurate.

The Windows application is only needed for initial credential setup and managing friends. Once configured, you can close the app and turn the PC off. Manage/pause or update credentials from another computer by deploying/editing the same Worker.

## Security and privacy

- The **OWNER_API_KEY** grants administration rights; keep it private. The Windows app stores it using OS-backed encryption.
- Telegram bot tokens and HoYoLAB cookies remain Cloudflare **secrets**. The Worker sends only your public Genshin nickname and a resin estimate to recipients who opted in.
- Cloud recipients are paused until the owner enables them. Telegram webhook calls must have the correct Telegram secret header.
- Pause cloud alerts before disconnecting your desktop. **Disconnect this PC only removes the PC's encrypted owner key; it does not stop the Worker.** To stop the Worker, use Pause cloud alerts or remove/deactivate the Worker in Cloudflare.
- To revoke the HoYoLAB session from the Worker, run npx wrangler secret delete HOYOLAB_COOKIE. You may also need to revoke the underlying login session at HoYoLAB. Recreating/rotating Telegram token requires repeating webhook activation.
- The Cloudflare account operator sees stored recipient Telegram IDs and any technical request metadata. Cloudflare Workers and D1 are third-party services.
- Do not publish your wrangler.toml after adding sensitive data; it should contain only non-secret role metadata and the D1 ID.

## Troubleshooting

- **Connected but no alert:** Confirm Test HoYoLAB sync returns a *fresh* reading. Confirm the friend tapped Start, is enabled, and has a threshold below current resin. Check the cloud quiet hours and the friend has not blocked your bot.
- **No friends appear:** Click Activate Telegram bot again, and have the friend open the new private invite and press Start. Telegram webhooks and local getUpdates polling cannot run simultaneously on the same bot.
- **HoYoLAB error:** Refresh your HoYoLAB session in the Windows app and update HOYOLAB_COOKIE with the new credential using Wrangler. If the site blocks Cloudflare IP addresses, fully unattended official-data synchronization may not be possible through this hosting route.
- **Still seeing an old count:** The Worker requires a live HoYoLAB response and will not assume a local PC reading is current.

This is unofficial software and is not affiliated with HoYoverse, Telegram, or Cloudflare.
