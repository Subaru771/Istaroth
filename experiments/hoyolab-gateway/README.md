# Istaroth HoYoLAB Gateway — real international login integration (private testing)

This code implements a **real** HoYoLAB international email/password login using [`genshin.py`](https://github.com/seriaati/genshin.py) (pinned `genshin[auth]==1.7.31`). It is **not** a mock account provider. When HoYoLAB accepts a login, the gateway attempts to verify the session with your deployed Community's actual API and links a selected game character to the Telegram-authenticated Community account.

**This is not a verified production login.** No real HoYoLAB credentials or live CAPTCHA were available for testing. Automated tests use a mock for the remote provider; they validate the application's workflow and security properties but cannot certify external login or deliverability. HoYoLAB may reject unaffiliated clients, require further email verification, block an IP, or change APIs. Never claim a successful real login until you have tested it privately.

## What users do (phone only)

1. Open your existing [Istaroth Community](https://istaroth-community.gxcccgx123.workers.dev/) in Safari or Chrome, sign in with Telegram, and generate a five-minute helper/pairing code.
2. Open **your privately deployed gateway HTTPS URL** in a new browser tab on that phone.
3. Paste the code. Enter a HoYoLAB login name and password **on your own trusted gateway**. The gateway sends the credentials via HTTPS to HoYoLAB; **it receives the plaintext password briefly and can potentially impersonate the user**. This is not an official HoYoLAB sign-in page.
4. If requested, complete a genuine GeeTest CAPTCHA. The browser sends the verification result to the gateway, which submits it to HoYoLAB.
5. If real authentication and Community verification succeed, choose a returned Genshin UID and approve the one-time transfer. The Community database encrypts the resulting session as for its existing desktop pairing process. No extra phone app or PC is required to keep using Community after pairing.

> Never deploy an operator-controlled password gateway for public users without professional security review, a privacy policy and the users' informed consent. HoYoverse warns against providing account credentials to third-party services. A gateway operated by someone else can log passwords despite what its source promises. Test with a dedicated test HoYoLAB account, not an account with purchases or valuable progress.

## Deployment on Render (private test)

This project is independent from Cloudflare. **It does not change D1, `DATA_KEY`, BOT_TOKEN, or the Worker.** It calls Community's existing `/api/link/preview` and `/api/link/complete` endpoints.

1. Push these source files to a **private** GitHub repository. Do not push real credentials.
2. In Render, create a **Python Web Service**, connect the repository, and set build command `pip install -r requirements.txt`.
3. Set start command `uvicorn gateway:app --host 0.0.0.0 --port $PORT --proxy-headers` and environment variable `COMMUNITY_ORIGIN=https://istaroth-community.gxcccgx123.workers.dev`.
4. Ensure Render provides an HTTPS address. Open `https://YOUR-RENDER-URL/health` and confirm `online: true`.
5. Open the gateway HTTPS homepage on a phone and use a freshly generated Community pairing code. Prefer a dedicated test account.

`render.yaml` contains the same deployment configuration. There is no separate Android/iOS application and no desktop extension. Production deployment should use a secure service plan with predictable uptime and bounded login concurrency. Free plans may suspend during login and lose in-memory sessions.

## How it works

- The gateway immediately starts HoYoLAB's actual unofficial API login after the user submits credentials.
- CAPTCHA challenges are relayed as browser-visible GeeTest challenges; they are never bypassed automatically.
- On success, `ltoken_v2`, `ltuid_v2` and related necessary session cookies remain only in transient process memory for at most five minutes while Community verifies them.
- The user chooses a validated UID and authorizes the one-time transfer to Community. The gateway never returns raw cookie values to the browser, and clears its stored session after submission or error.
- The password isn't written to files, inserted in query strings, or deliberately logged. **This is a statement about the supplied code, not a security guarantee against host or operator access.**
- Requires Community v0.10.1 (or later) with the `/api/link/start`, `/api/link/preview`, and `/api/link/complete` routes.

## Tested here

```sh
python -m pip install -r requirements.txt pytest pytest-asyncio
pytest -q
```

The tests substitute a fake HoYoLAB login result to verify that only verified accounts are selectable and one-time pairing is consumed. All live API calls need testing on an actual private account and deployed network. Local tests cannot guarantee that GeeTest will accept the browser challenge under Render.

## Known limitations and release gate

- **No passwordless OAuth:** HoYoLAB does not offer a documented third-party Battle Chronicle authorization endpoint. Here the gateway receives credentials and is therefore *more sensitive* than YLTA's token-only import.
- **Verification edge cases:** An email verification challenge or new authentication method may not be supported. The gateway reports an error instead of faking success.
- **Expiry:** Both Gateway job and Community pairing code expire after five minutes. If a CAPTCHA takes too long, generate a fresh code.
- **Public release prohibited until review:** Rate limiting is process-local only, session storage is in process RAM, CSRF protection and authorization have not been audited, dependency vulnerabilities have not been audited, and a single Render worker is assumed. Multi-worker deployments require shared, encrypted transient sessions with correct locking.
- **Cloud outgoing Telegram delivery** is a separate issue and can still fail if Cloudflare cannot contact Telegram.

## Security checks

- Run only behind HTTPS.
- Restrict the service to your own test account or network initially.
- Do not share or paste HoYoLAB passwords, verification codes or cookies into ChatGPT or GitHub.
- When a test login is finished, revoke the session or change credentials if you distrust the host or believe they were exposed.
- Review HoYoverse terms and account safety warnings before expanding to users.

## Windows private-repository publisher (v1.0.1)

Double-click `PUBLISH-PRIVATE-GITHUB.cmd`. If Git or GitHub CLI is missing, the script attempts installation through Microsoft's Windows Package Manager (`winget`), then asks you to sign in via your browser before creating a **private** repository. You may need to approve the installation. If your Windows PC does not have winget, the script explains the prerequisite rather than uploading source anywhere.

This only publishes source code. You still need to connect a private Render service, and the gateway has **not** been live-tested against a HoYoLAB account or approved for use with other people's passwords.
