'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const html = read('index.html');
const css = read('settings-compact.css');

assert.match(html, /<link href="settings-compact\.css" rel="stylesheet"\/>/, 'Compact settings stylesheet must be loaded');
assert.doesNotMatch(html, /class="atelier-scene"/, 'Decorative illustration must not return to Settings header');
assert.match(css, /\.settings-screen \.palette-option[\s\S]*?background-image: none !important;/, 'Theme cards must not use scenic image backgrounds');

const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(tabs, [
  'style', 'main-wallpaper', 'mini-wallpaper', 'layout', 'account', 'alerts', 'windows'
], 'All seven settings tabs must stay accessible');
for (const name of tabs) {
  assert.ok(html.includes('data-page="' + name + '"'), 'Missing settings panel: ' + name);
}

const paletteOptions = [...html.matchAll(/class="palette-option" data-palette="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(paletteOptions, [
  'istaroth', 'mondstadt', 'liyue', 'inazuma', 'sumeru',
  'fontaine', 'natlan', 'nodkrai', 'snezhnaya'
], 'All nine selectable themes must remain available');

for (const id of ['mainWpThumbnail', 'miniWpThumbnail', 'resinWpThumbnail',
  'mainWpPreview', 'miniWpPreview']) {
  assert.ok(html.includes('id="' + id + '"'), 'Wallpaper setting/preview must remain: ' + id);
}
console.log('Settings layout regression checks passed.');
