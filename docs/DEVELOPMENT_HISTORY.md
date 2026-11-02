# Pre-public development history

These are internal build identifiers used during development before the first public release, Istaroth 1.0. They were not published as formal GitHub releases.

## v2.4.18 — Theme-aware Done button

- The Settings Done button now follows the active region’s accent, depth, and highlight colors.
- Kept Istaroth’s distinctive purple-and-gold appearance while allowing a custom accent to influence it.
- Added palette-aware hover, pressed, and keyboard focus treatments.
- No changes to the Done action, Wallpaper controls, layout, account sync, or Mini Widget.

## v2.4.17 — Resin card wallpaper editor

- Removed the View Mini Widget/Show Mini Widget action from Wallpaper settings; Done returns to the current widget.
- Added a dedicated independent resin card wallpaper editor with its own image, darkness, blur, zoom and X/Y positioning.
- Main full-background and Mini wallpaper images retain independent local storage.
- Migrates a legacy Main “Resin card only” wallpaper into the new card channel while retaining its original image file.
- Other features are unchanged.

## v2.4.16 — View the Widget You Just Edited

- After editing Mini wallpaper, Done now opens the real Mini Widget, not the Main Widget.
- After editing Main wallpaper, Done opens the real Main Widget.
- Back to widget preserves the original navigation behavior.
- Made the Done button clearly say which widget it opens and clarified the Mini preview.
- Preserves independent Main/Mini wallpaper files and controls; no changes to other features.

## v2.4.16 — Wallpaper visibility fix

- Corrected Main Widget wallpaper being masked by a fixed dark tint even at Darkness 0%.
- Darkness now adjusts the rendered photo in Card Only and Full Main Widget placements.
- Main wallpaper preview and actual widget share the same corrected styles.
- Mini wallpaper and all settings remain independently stored and rendered, unchanged.

## v2.4.14 — Separate Main / Mini wallpaper pages

- Moved each wallpaper editor to its own Settings category; no in-page Main/Mini switch or mixed controls.
- Removed the remaining Main wallpaper target selectors affecting Mini backgrounds.
- Browser-tested both ways with distinct images, all controls, removals, themes and settings navigation.
- Preserved both wallpaper files and all unrelated features.

## v2.4.14 — Wallpaper Studio rebuilt from scratch

- Replaced only the Wallpaper settings page and its renderer. Two genuinely independent Main and Mini wallpaper editors, each with its own controls, local image storage, live preview, and reset.
- Removed the CSS that previously made the Main full-widget wallpaper appear in Mini. Mini now uses its own dedicated image layer.
- Existing Main wallpaper and independent Mini wallpaper are migrated in place without deleting data.
- Preserved all other tabs and functionality, including the independent layout controls from v2.4.12.

## v2.4.14 — Separate Main and Mini settings

- Main and Mini widgets now have independent wallpaper files, overlay/blur/zoom/position values and editable controls.
- Wallpaper live preview switches to and edits the matching widget only.
- Layout section now has distinct Main and Mini panels, with independent Mini font size, recovery-time visibility, and next-resin timer controls.
- Existing main wallpapers, profiles, sign-in sessions and other settings remain intact.
- Regional art remains in Style only.

## v2.4.10 — Illustrated Artwork in Customization Only

- Removed built-in regional pictures from the full dashboard, resin display and Mini Widget.
- Retained all nine enhanced illustrations in **Customization → Style**, including the theme-responsive gallery header.
- The illustrated header is no longer shown when viewing other settings categories.
- Preserved regional theme colors, existing settings, custom wallpaper support, HoYoLAB synchronization, startup behavior, and the graphical installer.

## v2.4.9 — Public release

- Updated Istaroth tagline to **Your Companion Throughout Time!** across app branding, installer, package metadata and release documentation.
- No changes to settings, regional themes, windows startup or HoYoLAB integrations.

## v2.4.8 — Public release release

- Prepared open-source documentation, distributable Windows setup and checksum.
- Nine illustrated region themes and six reorganized settings sections.
- Verified source and embedded installer app snapshot match.

## 2.4.8 — Enhanced Artwork & Reorganized Settings

- Upscaled the original approved nine regional illustrations from 1100×244 to 2200×488 pixels, and the atelier source header image from 860×398 to 1720×796, using faithful high-quality interpolation and restrained sharpening; no scenery redesign.
- Reorganized Settings into Style, Wallpaper, Layout, Account, Alerts, and Windows.
- Moved Always on Top, close-to-tray, floating mini widget, startup registration and repair into Windows.
- Moved notifications, alert threshold and quiet hours into Alerts.
- Kept HoYoLAB credentials, connection and sync timing under Account; all settings IDs and saved data remain unchanged.
- Preserved regional art, wallpaper uploads, saved profiles, Mini Resin, HoYoLAB, and Windows installer behavior.

## v2.4.7 — Premium Windows Setup

- Replaced the legacy Teyvat Pulse-branded setup sidebar with Istaroth branding and the official hourglass icon.
- Rebuilt the five-step installer with celestial navy, plum, gold and ivory colors, a polished progress screen, and clear option cards.
- Increased setup text contrast and made rendering flicker-resistant.
- Kept existing installation, shortcuts, automatic Windows startup repair, uninstall logic and Electron integrity verification.
- Application content, settings, and user data compatibility are unchanged from v2.4.6.

## 2.4.6 — No Polygons Anywhere

- Removed polygon/vector scenery everywhere in the UI.
- The dashboard, mini widget and settings header now use the same illustrated region artwork.
- The header artwork changes with the selected region.
- Removed symbolic geometry overlays from dashboard, resin card and mini widget.
- Preserved all existing app functions, HoYoLAB sync, mini widget, themes and installer behavior.

## 2.4.6 — Regional Header Fix

- The large Settings/Atelier header now displays the matching illustration for each of the nine regional themes.
- Removed obsolete geometric SVG/polygon overlays and the static clock illustration from the regional header.
- Preserved all regional cards, palettes, wallpaper settings, saved profiles, accessibility options and existing features.

## 2.4.4 — Illustrated region cards
- Replaced SVG polygon scene backgrounds with the same painted scenery shown in the approved reference.
- Retained live HTML text and regional selection; all customizations and profile migration stay intact.
- Replaced the settings hero polygon scene with the approved celestial clock illustration.

## 2.4.3 — Celestial Atelier
- Rebuilt theme gallery to match the approved visual direction, with responsive layout and illustrated cards.
- Created original hourglass/time-rings logo used throughout the application and setup.
- Increased settings window to 1060 × 900 (clamped to desktop work area).
- Kept nine regional presets, custom appearances, data migration, and functionality.

# Changelog

## 2.4.2 — Core Regions Update
- Exactly nine supported visual presets, including lore-specific Nod-Krai and Snezhnaya.
- Original per-region scenic vector ornaments across the dashboard and mini widget.
- Removed Dragonspine, Chasm, Enkanomiya, Abyss, Celestia, Khaenri'ah as standalone themes.
- Removed themes safely migrate to Istaroth without discarding custom fonts, wallpapers, profiles or other settings.
- HoYoLAB synchronization and Windows startup are unchanged.

## v2.4.1 — Realms Update

- Added Dragonspine, the Chasm, Enkanomiya, Natlan, Celestia, and Khaenri’ah themes.
- All twelve realms and the Istaroth preset are available in Appearance.
- Rebuilt Abyss as violet, indigo and magenta rather than flat black.
- Gave each realm coordinated backgrounds, navigation, cards, buttons, and mini widgets.
- Preserved custom accent, typography, wallpaper adjustments, profile saving, HoYoLAB sync, history, alerts, and startup configuration.
- The default is still Istaroth, and existing saved themes remain unchanged.

## v2.4.0 — Celestial Chronicle
- New Istaroth first-run theme and celestial artwork.
- Seven themes (Istaroth plus all six existing regional palettes).
- Brand-consistent resin, mini widget, sidebar, chronicle, and settings surfaces.
- User wallpapers and preferences retain priority; existing preferences are never reset.
- No game launch button and no manual resin entry.
- Preserved original HoYoLAB storage identity for user data migration.

## Istaroth v2.3.4 — Public rebrand

- New name and tagline: **Istaroth — Your Companion Throughout Time!**.
- Renamed Windows application, icons, shortcuts, setup wizard and updater artifacts.
- Existing Windows HoYoLAB sessions, resin history and wallpapers kept under legacy profile paths for compatibility.
- No manual resin editing or Genshin launch controls.
- No visible Updates settings page.

# Changelog

## v2.3.4 — early public release candidate (2026-11-01)

- Windows graphical setup wizard with a refined, Genshin-inspired presentation
- Built-in Windows startup-registration checks and repair support
- Original Resin syncing through HoYoLAB with Mini Resin Widget, floating mode, and tray indicator
- Smart notifications, sleep/network recovery, and local resin history
- Daily, Account, Explore, Combat, TCG, and History journal views where data is available
- Regional palettes, wallpaper upload, saved appearance settings
- Removed manual resin editing and direct Genshin game launch
- Removed the visible Updates settings tab (background update service remains but no trusted release source is preconfigured)

**Release limitations:** unsigned Windows installer, unofficial HoYoLAB API, and no independent security audit. Actual Windows/HoYoLAB functionality was confirmed by the project creator; builds from source and Windows installer were not independently security-audited.
