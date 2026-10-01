// Component behaviour test only. Real mobile rendering needs a browser viewport.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../../app/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const dom = new JSDOM(`<!doctype html><body><header class="cal-header"><div class="cal-header-inner">
  <a class="cal-brand" href="index.html">Caleane</a>
  <nav id="site-navigation" aria-label="Main navigation"><a href="platform.html">Platform</a><a href="pricing.html">Pricing</a></nav>
  <div class="cal-header-actions"><a data-app-link="login" href="get-started.html?mode=login">Log in</a></div>
  <button class="cal-menu-toggle" data-site-menu aria-controls="site-navigation" aria-expanded="false">Menu</button>
  </div></header><main>Page content</main></body>`, {
  url: 'http://localhost:4332/', runScripts: 'outside-only', pretendToBeVisual: true,
});
const { window } = dom;
const media = { matches: true, listeners: new Set(),
  addEventListener(type, callback) { this.listeners.add(callback); },
  removeEventListener(type, callback) { this.listeners.delete(callback); } };
window.matchMedia = () => media;
window.eval(await readFile(new URL('../../web/assets/website-ui.js', import.meta.url), 'utf8'));
const settle = () => new Promise(resolve => setTimeout(resolve, 40));
const trigger = () => window.document.querySelector('[data-site-menu]');
assert.equal(window.document.querySelector('#site-navigation'), null);
trigger().click(); await settle();
assert.equal(trigger().getAttribute('aria-expanded'), 'true');
assert.ok(window.document.querySelector('.ui-mobile-menu'));
assert.equal(window.document.activeElement.textContent, 'Platform');
window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
assert.equal(window.document.querySelector('.ui-mobile-menu'), null);
assert.equal(window.document.activeElement, trigger());
trigger().click(); await settle();
// Do not navigate in the component test; the click still runs the close handler.
const link = window.document.querySelector('.ui-mobile-menu a');
link.addEventListener('click', event => event.preventDefault());
link.click(); await settle();
assert.equal(window.document.querySelector('.ui-mobile-menu'), null);
trigger().click(); await settle();
media.matches = false; media.listeners.forEach(callback => callback()); await settle();
assert.equal(window.document.querySelector('.ui-mobile-menu'), null);
assert.equal(window.document.querySelectorAll('#site-navigation').length, 1);
assert.equal(window.document.querySelector('#site-navigation a').textContent, 'Platform');
dom.window.close();
console.log('PASS: mobile menu opens, focuses its first link, closes with Escape, restores focus, closes on navigation and restores desktop navigation on resize.');
