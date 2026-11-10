# Istaroth — Friends & Resin Alerts (Telegram preview)

Istaroth can notify **selected, consenting Telegram friends** when your Original Resin is almost full or full. The feature is optional; it doesn't change the existing personal HoYoLAB sync or Windows notifications.

## Setup

1. In Telegram, open **@BotFather** and create your own bot using /newbot. Keep the issued token private.
2. In Istaroth, sign in to HoYoLAB, enable Real-Time Notes, and leave **Automatic refresh** on. We recommend 5–15 minutes.
3. Open **Settings → Alerts → Friend notifications**. Paste your BotFather token and click **Connect Telegram bot**. Istaroth validates the bot through Telegram, then encrypts the token using Windows' OS-backed Electron safeStorage.
4. Click **Copy invite** and send the resulting private Telegram invitation link only to friends who want alerts. Each friend opens the link in Telegram and presses **Start**.
5. Click **Refresh friends** (the app also checks automatically). New friends begin with **alerts paused**. Explicitly enable each chosen friend and set their threshold: **160, 180, 190, or 200** (full).
6. Click **Test** to verify delivery. A friend can send **/stop** to the bot to unsubscribe.

**Important:** Your Windows PC must remain on, online, and running Istaroth. This version does **not** use a cloud notification backend. The game itself can be closed. Enabling **Close to system tray** and **Open when Windows starts** makes operation more convenient.

The alert contains only the selected Genshin character nickname, an estimated resin count, and an unsubscribe instruction. No HoYoLAB cookie or password is sent to Telegram or friends. The bot token is never sent to the renderer after connecting, and it is stored encrypted at rest.

## Notification rules

- Alerts are based on the existing authenticated HoYoLAB resin estimate and require a reading less than **30 minutes old**.
- Recipients are individually enabled and their thresholds are independently configurable.
- An alert sends once per friend and threshold until a later fresh resin estimate falls below that threshold; then a new cycle can alert.
- The existing **Quiet hours** setting also suppresses outbound friend alerts, based on the sender PC's local clock.
- Telegram delivery is retried after a short delay on network failure.
- You can remove a friend, rotate the invite link, or disconnect the bot. Rotating the link does not remove already-approved friends.
- Bots cannot initiate chat with people who never started them.

## Troubleshooting

**No one appears:** Ask the friend to click Start in the private bot chat, then use **Refresh friends**. Only the account owner should run this bot through Istaroth; an external bot service or Telegram webhook competing for updates can prevent invitations from reaching Istaroth.

**No alert arrives:** Ensure the friend is enabled, the bot is not blocked, the threshold was reached, HoYoLAB data was refreshed recently, the PC and Istaroth are running, and quiet hours are not active. Use **Test** to distinguish Telegram delivery from resin tracking.

**Credentials cannot be restored:** If Windows OS encryption becomes unavailable or your saved configuration was moved to another computer, reconnect the bot using a newly issued token. Istaroth does not store an unencrypted fallback.

**Future option:** A hosted relay could later support delivery while PCs are off. This preview deliberately avoids storing HoYoLAB credentials on a server.
