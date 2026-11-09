# Changelog

## v1.1.1 — Responsive color-only layout fix

- Rebalanced Main Widget typography for compact 510×680 and standard 610×770 windows, including users with older large-font settings.
- Rebuilt the titlebar flex sizing to keep the brand separate from the control buttons.
- Reduced the navigation rail to free room for the content and show all journal destinations.
- Constrained resin numbers, resin caps and synchronization badges so they cannot overflow the card.
- Kept progress, recovery details, refresh and other journal panels scrollable and readable at narrow widths.
- Reset Electron page zoom after loading to avoid a magnified saved layout.
- Added compact-window regression tests; retained the color-only visuals and all saved HoYoLAB data.


## v1.1.0 — In development (not yet released)

- Switched Main, Mini, Resin, and Settings surfaces to pure color palettes and gradients; removed decorative images.
- Removed wallpaper tabs from Settings while keeping existing image files in their user profiles untouched.
- Disabled wallpaper loading and display to prevent old custom pictures from appearing after upgrading.
- Kept the nine selectable region colors, accent color, font, layout, account, and alerts.

- Reworked the Settings header into a compact, image-free layout.
- Replaced illustrated regional theme cards with accessible color swatches and responsive three-column choices.
- Retained all original wallpaper data internally for compatibility; the color-only interface now exposes five Settings tabs.
- Added Settings layout regression tests to GitHub Actions.
- Updated Windows QA artifact naming to derive the version from the application manifest, avoiding obsolete v1.0 labels.

The latest published Windows installer is still **v1.0.1**. The v1.1.0 candidate requires Windows build and installation verification before release.


## v1.0.1 — Offline Windows packaging

- Replaced the runtime-downloading Go setup with a conventional Electron-bundled NSIS installer.
- Added a fully extractable Windows x64 portable ZIP.
- Built both from locked dependencies and published an individual SHA-256 checksum for each.
- Kept HoYoLAB account and wallpaper data under the legacy `Teyvat Pulse` user profile for compatibility.
- Verified Main/Mini widgets, HoYoLAB connectivity, NSIS install, uninstall and reinstall on a Windows PC.

Both v1.0.1 packages are **unsigned**, and a matching checksum does not constitute code signing.

## v1.0 — Initial public release

- Original Resin monitoring and recovery estimates via HoYoLAB.
- Main and compact Mini widgets, system tray, startup support and reminders.
- Nine themes, appearance presets and independent wallpaper controls.
- Local resin history, alerts, quiet hours and available HoYoLAB information panels.
- Windows graphical installer and first-run Electron runtime verification.

The **v1.0 installer is unsigned** and integration uses unofficial HoYoLAB endpoints. The installer and its published checksum are described in the [README](README.md).

Older internal development identifiers were not public release versions.
