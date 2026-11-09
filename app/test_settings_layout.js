'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const html = read('index.html');
const css = read('settings-compact.css');
const colorCss = read('color-only.css');
const wallpaperModule = read('wallpaper-v2413.js');

assert.match(html, /<link href="settings-compact\.css" rel="stylesheet"\/>/, 'Compact settings stylesheet must be loaded');
assert.doesNotMatch(html, /class="atelier-scene"/, 'Decorative illustration must not return to Settings header');
assert.match(css, /\.settings-screen \.palette-option[\s\S]*?background-image: none !important;/, 'Theme cards must not use scenic image backgrounds');

const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(tabs, [
  'style', 'layout', 'account', 'alerts', 'windows'
], 'Only the five non-image settings tabs should be accessible');
for (const name of tabs) {
  assert.ok(html.includes('data-page="' + name + '"'), 'Missing settings panel: ' + name);
}

assert.match(html, /<link href="color-only\\.css" rel="stylesheet"\\/>/, 'Image-free CSS must be loaded');
assert.doesNotMatch(html, /<img\\b/i, 'No image elements should be displayed in the app');
assert.match(colorCss, /\\.widget-screen::before[\\s\\S]*?radial-gradient/, 'Main widget should use colors, not artwork');
assert.match(colorCss, /\\.card-wallpaper[\\s\\S]*?display: none !important;/, 'Uploaded wallpapers must stay hidden');
assert.match(wallpaperModule, /async function load\\(\\)\\{[\\s\\S]*?files\\.main=''\\;files\\.mini=''\\;files\\.resin=''/, 'Do not load saved image files in color-only mode');
assert.doesNotMatch(colorCss, /url\\(/, 'Color-only stylesheet must not reference image URLs');

const paletteOptions = [...html.matchAll(/class="palette-option" data-palette="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(paletteOptions, [
  'istaroth', 'mondstadt', 'liyue', 'inazuma', 'sumeru',
  'fontaine', 'natlan', 'nodkrai', 'snezhnaya'
], 'All nine selectable themes must remain available');

for (const id of ['mainWpThumbnail', 'miniWpThumbnail', 'resinWpThumbnail',
  'mainWpViewport', 'miniWpViewport']) {
  assert.ok(html.includes('id="' + id + '"'), 'Wallpaper setting/preview must remain: ' + id);
}
console.log('Color-only settings and retained wallpaper-data checks passed.');
