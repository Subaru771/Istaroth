'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const html = read('index.html');
const css = read('settings-compact.css');
const colorCss = read('color-only.css');
const wallpaperModule = read('wallpaper-v2413.js');
const customWallpaperCss = read('custom-wallpapers.css');
const renderer = read('renderer.js');

assert.match(html, /<link href="settings-compact\.css" rel="stylesheet"\/>/, 'Compact settings stylesheet must be loaded');
assert.doesNotMatch(html, /class="atelier-scene"/, 'Decorative illustration must not return to Settings header');
assert.match(css, /\.settings-screen \.palette-option[\s\S]*?background-image: none !important;/, 'Theme cards must not use scenic image backgrounds');

const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(tabs, [
  'style', 'main-wallpaper', 'mini-wallpaper', 'layout', 'account', 'alerts', 'windows'
], 'All seven settings tabs should be accessible, including two wallpaper pages');
for (const name of tabs) {
  assert.ok(html.includes('data-page="' + name + '"'), 'Missing settings panel: ' + name);
}

assert.ok(html.includes('href="color-only.css"'), 'Image-free CSS must be loaded');
assert.ok(!html.includes('<img '), 'No image elements should be rendered in the app');
assert.ok(colorCss.includes('.widget-screen::before') && colorCss.includes('radial-gradient'), 'Main widget should use color gradients');
assert.ok(customWallpaperCss.includes('html[data-wall-target="full"] #backgroundArt'),
  'Custom Main image layer must become visible when selected');
assert.ok(customWallpaperCss.includes('html[data-resin-wallpaper="yes"]'),
  'Custom Resin image layer must become visible when selected');
assert.ok(customWallpaperCss.includes('.mini-screen[data-wallpaper="yes"] .mini-wallpaper-layer'),
  'Custom Mini image layer must become visible when selected');
assert.ok(!colorCss.includes('--wall-image: none !important') &&
  !colorCss.includes('--resin-wall-image: none !important'),
  'Color-only presets must not override user-selected image variables');
assert.ok(colorCss.includes('--realm-scene: none !important'),
  'Bundled regional scenery must remain disabled');
assert.ok(wallpaperModule.includes('async function load()') &&
  wallpaperModule.includes('await getter()') &&
  wallpaperModule.includes("localStorage.getItem(keyName[scope])"),
  'Main Mini Resin saved wallpaper files must reload after restart');
assert.ok(wallpaperModule.includes("root.dataset.resinWallpaper=files.resin?'yes':'no'"),
  'Resin file presence must control its image layer');
assert.ok(wallpaperModule.includes("image.startsWith('data:image/webp;base64,')") ||
  wallpaperModule.includes('data:image\\/webp;base64,'),
  'Image values must allow only locally encoded WebP images');
assert.ok(!renderer.includes("if(key==='main-wallpaper'||key==='mini-wallpaper')key='style'"),
  'Wallpaper tabs must not redirect to Style');
assert.ok(customWallpaperCss.includes('repeat(7,minmax(0,1fr))'),
  'Seven settings tabs must fit in the window');


assert.ok(!colorCss.includes('url('), 'Color-only stylesheet must not reference image URLs');

const paletteOptions = [...html.matchAll(/class="palette-option" data-palette="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(paletteOptions, [
  'istaroth', 'mondstadt', 'liyue', 'inazuma', 'sumeru',
  'fontaine', 'natlan', 'nodkrai', 'snezhnaya'
], 'All nine selectable themes must remain available');

for (const id of ['mainWpThumbnail', 'miniWpThumbnail', 'resinWpThumbnail',
  'mainWpViewport', 'miniWpViewport']) {
  assert.ok(html.includes('id="' + id + '"'), 'Wallpaper setting/preview must remain: ' + id);
}
console.log('Color-only palettes and restored user wallpaper controls checks passed.');
