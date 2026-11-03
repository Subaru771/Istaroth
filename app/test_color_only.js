'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dir = __dirname;
const html = fs.readFileSync(path.join(dir,'index.html'),'utf8');
const theme = fs.readFileSync(path.join(dir,'color-only.css'),'utf8');
const main = fs.readFileSync(path.join(dir,'main.js'),'utf8');
const preload = fs.readFileSync(path.join(dir,'preload.js'),'utf8');
const studio = fs.readFileSync(path.join(dir,'wallpaper-v2413.js'),'utf8');
const pkg = require('./package.json');
assert.doesNotMatch(html, /<img\b/i, 'An in-app image element is still present');
assert.doesNotMatch(html, /data-(?:tab|page)="(?:main|mini)-wallpaper"/, 'Wallpaper UI is still visible');
assert.match(html,/href="color-only\.css"/);
assert.match(theme,/\.palette-option/);
assert.match(theme,/\.widget-screen::before/);
assert.match(theme,/\.mini-screen::before/);
assert.match(theme,/\.brand-glyph/);
assert.doesNotMatch(main,/handleTrusted\('wallpaper:/, 'Wallpaper upload IPC remains enabled');
assert.doesNotMatch(preload,/wallpaper(?:Mini|Resin)?(?:Set|Get|Clear):/, 'Wallpaper bridge exposed');
assert.doesNotMatch(studio,/wallpaperGet|wallpaperMiniGet|wallpaperResinGet|createImageBitmap|new Image\(/, 'Legacy wallpaper loader remains');
for (const file of fs.readdirSync(dir).filter(f=>f.endsWith('.css'))) {
  assert.doesNotMatch(fs.readFileSync(path.join(dir,file),'utf8'),/url\(\s*['"]?assets\//i, 'Illustration references persist in '+file);
}
assert.ok(pkg.build.files.includes('color-only.css'));
assert.ok(pkg.build.files.includes('assets/icon.ico'));
assert.ok(pkg.build.files.includes('assets/icon.png'));
assert.ok(!pkg.build.files.includes('assets/**/*'), 'Unused artwork is still bundled');
console.log('Color-only themes verified: no illustrations, wallpaper uploads, or bundled theme-art assets.');
