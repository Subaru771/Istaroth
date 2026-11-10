# Community inside Windows Istaroth

The Istaroth Windows application now includes a **Community** tab alongside Resin, Daily, Account, Explore, Combat, TCG and History.

## What is integrated

- The **full Istaroth Community web app** runs in an embedded, sandboxed Chromium view inside the original Istaroth Windows interface; it is not simply a button that opens your browser.
- Uses a separate persistent Electron session partition called persist:istaroth-community. The local HoYoLAB login remains isolated and is never transferred automatically.
- Community users sign in through a shared Telegram bot and connect their own verified Genshin account, choose 160/180/190/200 notifications, approve friends and manage subscriptions.
- The Community cloud backend continues scheduled notifications **after Windows is closed or powered off**, once deployed and while HoYoLAB sessions remain valid.
- The Community tab includes Connect, Expand, Reload, Copy HoYoLAB session (native consent warning), Clear clipboard and Disconnect this PC. Disconnecting this PC signs out its isolated web session; it does not delete the remote Community account or turn off the remote Worker.
- Existing local resin tracker, mini/resin widgets, nine color themes, custom Main/Resin/Mini wallpapers, local Telegram friend alerts and single-user Cloud mode remain.

## Initial setup

**Important:** Integration does not deploy a server automatically. Until a trusted Community service exists, this tab displays setup instructions.

1. First deploy **Istaroth Community App v0.1**, the separate multi-user Cloudflare Worker/PWA package delivered earlier, using its INSTALL-ON-CLOUDFLARE.cmd. It is *not* the old single-user Istaroth-Cloudflare-Worker.zip; the personal Worker has a different API and will be rejected.
2. Configure D1, scheduled checks, a private Telegram bot and secrets in that Community service. Open the resulting HTTPS URL at istaroth-community.<your-subdomain>.workers.dev in a browser first, verify its /health endpoint and perform a live Telegram/HoYoLAB test.
3. Install the Community-enabled Istaroth Windows preview.
4. Open the new **Community** tab and paste your exact Community Worker URL. Only a HTTPS istaroth-community.<subdomain>.workers.dev origin is accepted. Press **Connect Community**.
5. The hosted web app loads *inside Istaroth*. Select **Continue with Telegram**, open the bot and enter its code in the Community page.
6. To add HoYoLAB, supply your own authenticated cookie manually, or select **Copy HoYoLAB session** in the Community tab. That action requires explicit native confirmation. It only copies the sensitive credential to the Windows clipboard. Paste it into the hosted Community form yourself, then select **Clear clipboard**.
7. Choose your own thresholds and approve friends from the embedded Overview and Friends tabs. Telegram notifications continue from the cloud when Windows is closed.

**Avoid duplicate alerts:** Local Windows friend alerts, personal Cloud mode and Community alerts are independent. Pause one when you enable another for the same friend.

## Privacy, boundaries and limitations

Web cookies, account identity and cached site resources use a separate Chromium partition from your desktop HoYoLAB account. Remote pages have no Node integration or preload bridge; sandboxing is enabled and desktop IPC is unavailable. Navigation is restricted to the configured Community origin, with Telegram bot links opened in the default browser. Unknown popups are blocked, and the native view is removed when switching to Settings or Mini.

**Security warning:** A hosted Community backend must decrypt an authenticated HoYoLAB session to refresh resin while your PC is off. Connect only to a service you own or trust. The source MVP has simulated API tests but has not been security-audited or tested as a public service. Cloudflare or HoYoLAB restrictions may prevent real sync. An online /health endpoint is not proof that notifications can be delivered.

There is no official, centrally hosted Community URL bundled with the app. The server must first be deployed separately from the earlier Community package. For safety the first desktop preview accepts dedicated workers.dev sites only, not arbitrary or custom domains.

## Development tests

From app/ run npm run check, npm run test:community, and npm run test:layout.

Istaroth is an unofficial fan project, unaffiliated with HoYoverse, Telegram or Cloudflare.
