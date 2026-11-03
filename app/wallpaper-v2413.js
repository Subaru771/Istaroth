'use strict';
// Compatibility adapter for pre-v1.0.2 preferences.
// Image wallpapers have been deliberately removed. We leave legacy files
// untouched on disk so older installations can still read their data.
const WallpaperStudio = Object.freeze((() => {
  function apply() {
    const root = document.documentElement;
    root.style.setProperty('--wall-image', 'none');
    root.style.setProperty('--resin-wall-image', 'none');
    root.style.setProperty('--resin-present', '0');
    root.dataset.wallTarget = 'none';
    const mini = document.getElementById('miniScreen');
    if (mini) {
      mini.style.setProperty('--wp13-mini-image', 'none');
      mini.dataset.wallpaper = 'no';
    }
    // These controls are layout choices, not images; keep them working.
    const settings = typeof state === 'undefined' ? null : state?.ui?.miniAppearance;
    if (settings) {
      root.style.setProperty('--mini-text-size', String((settings.textSize || 100) / 100));
      root.dataset.miniReady = settings.showReady ? 'on' : 'off';
      root.dataset.miniNext = settings.showNext ? 'on' : 'off';
    }
  }
  return {
    load: async () => { apply(); },
    apply,
    render: () => {},
    bind: () => {},
    show: () => {},
    updateReadings: () => {},
    _diagnostic: () => ({ images: { main: '', mini: '', resin: '' }, mode: 'colors-only' })
  };
})());
