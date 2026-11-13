# 0.11.0 RC1 — Cloud integration (unreleased)

- Add primary mobile gateway pairing flow using short-lived code in URL fragment.
- Add D1-atomic pairing-code reservation and claim proof enforced during preview/complete.
- Add per-user quiet hours with IANA timezones and suppression of resin alerts during quiet periods.
- Improve Telegram login counter to stop concurrent excess guesses.
- Preserve current accounts, Telegram sessions, DATA_KEY and D1 ID using additive migrations.
- Keep unofficial credential-handling gateway restricted until security validation.
- Add one-click sign out of all Community sessions, without affecting other users.
- Regression coverage: 49 local Community tests, plus Worker JavaScript syntax check.
