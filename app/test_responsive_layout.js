'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
const html=read('index.html');
const css=read('layout-rescue.css');
const color=read('color-only.css');
const pkg=require('./package.json');

assert.ok(html.includes('href="color-only.css"'), 'Color-only theme must be active');
assert.ok(html.includes('href="layout-rescue.css"'), 'Layout fix stylesheet must be loaded');
assert.ok(html.indexOf('href="layout-rescue.css"')>html.indexOf('href="color-only.css"'),
  'Layout safety overrides must come after the theme stylesheet');
assert.ok(pkg.build.files.includes('layout-rescue.css'), 'Window bundle must include responsive CSS');
assert.equal(pkg.version,'1.1.1', 'Installer must identify new UI version');

// Regression: controls and dashboard panels are operational, not replaced with a mockup.
for(const id of ['frame','widgetScreen','dashboardTabs','pane-resin','mainTitle','resinNumber',
  'resinCap','accountButton','settingsButton','minimizeButton','closeButton',
  'recovery-row','refreshButton']){
  if(id==='recovery-row')assert.ok(html.includes('class="recovery-row"'));
  else assert.ok(html.includes('id="'+id+'"'), 'Missing functional control: '+id);
}
assert.equal((html.match(/class="dash-tab(?: active)?"/g)||[]).length,7,
  'All seven journal sections must still be accessible');

// Screenshot reported large letter spacing, titlebar overlap, and clipped resin reading.
// Test that final CSS addresses these specific causes in a narrow Windows window.
const expected=[
  'font-size: clamp(12.5px',
  'min-width: 0',
  '.chrome .window-actions',
  '.chrome .brand-words strong',
  '.widget-screen .dashboard-tabs',
  'grid-template-columns: 58px minmax(0, 1fr)',
  '.widget-screen #pane-resin',
  'overflow-y: auto !important',
  '.widget-screen .headline h1',
  '.widget-screen .resin-number',
  'white-space: nowrap !important',
  '.widget-screen .resin-cap',
  '.widget-screen .recovery-row',
  '@media (max-width: 440px)',
  '@media (max-height: 550px)'
];
for(const token of expected) assert.ok(css.includes(token),'Missing viewport safety control: '+token);
assert.ok(css.includes('grid-template-columns: 48px minmax(0,1fr)'),
  'Extra-small windows must use a narrower navigation rail');
assert.ok(css.includes('font-size: 52px !important'), 'Narrow resin number needs a fixed size cap');
assert.doesNotMatch(css,/url\s*\(/, 'Responsive override must introduce no picture assets');
assert.ok(color.includes('.card-wallpaper')&&color.includes('display: none !important'),
  'Color-only image suppression must remain enabled');
console.log('Responsive Istaroth window regression checks passed.');
