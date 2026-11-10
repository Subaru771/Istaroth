# Istaroth Community in Windows Istaroth

The **Community** tab is now part of Istaroth's standard dashboard, alongside Resin, Daily, Account, Explore, Combat, TCG and History. The existing local resin tracker, HoYoLAB session, color themes and user wallpapers are unchanged.

## How it works

Istaroth Community is a **separate multi-user app** with its own Cloudflare Worker, D1 database, Telegram sign-in and encrypted per-user HoYoLAB credentials. The Windows app opens the deployed Community app in a sandboxed Electron window. It does not silently send your current desktop HoYoLAB cookie or copy private Telegram bot credentials to the cloud.

**The shared app must be deployed once** by its operator. A personal (single-user) Istaroth cloud resin Worker is *not* the same service, and that URL will not provide multi-user accounts.

The source package `Istaroth-Community-App-v0.1.zip` was produced separately. Its `INSTALL-ON-CLOUDFLARE.cmd` deploys the multi-user Worker and app. The shared service is not automatically published when the Windows installer is built.

1. Deploy the Istaroth Community app ZIP to Cloudflare using its own setup guide.
2. Confirm `https://<your-community-address>/health` returns `{"service":"Istaroth Community","online":true}`.
3. Open Windows Istaroth → **Community** tab.
4. Paste the **HTTPS URL of the multi-user app**, then click **Connect Community**.
5. Click **Check connection**. When it reports online, click **Open Community**.
6. Log in through Telegram in the isolated window and connect your Genshin account to Community if you consent to cloud credential storage.
7. Manage your separate Community friends and alerts there. Once deployed, cloud sync does not require the Windows PC to remain on.

## Security and limits

- The desktop UI accepts only an HTTPS host with no URL-embedded credentials, query parameters or non-default port. Local/private loopback and single-label hosts are blocked.
- Remote app content runs in a separate sandboxed BrowserWindow without Node.js integration or a preload bridge. Permission prompts are denied. Navigation outside its configured origin is blocked; Telegram links open in the default browser.
- The hosted multi-user service handles its own authentication and account separation. The Windows integration only persists the service URL; **no account tokens, passwords or HoYoLAB session are transferred** between the two applications.
- The personal cloud Worker integration under Settings → Alerts remains separate and unchanged.
- Deployment and live tests require your own Cloudflare account and Telegram bot. Connecting Windows Istaroth to a URL does not automatically deploy a Worker or make its service operational.
- Istaroth Community is currently a web app shown in a dedicated native window, not a rewritten local desktop version of its backend.

The Community ZIP is an MVP and should be audited further before a large public launch, especially its handling of long-lived HoYoLAB credentials.
