import { chromium } from '../films/node_modules/playwright-core/index.mjs';
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome' });
const p = await b.newPage({ viewport: { width: 1600, height: 560 }, deviceScaleFactor: 1.5 });
await p.goto('file://' + process.cwd() + '/index.html', { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
await p.screenshot({ path: 'banner.png' });
const q = await b.newPage({ viewport: { width: 160, height: 160 } });
await q.goto('file://' + process.cwd() + '/../../docs/img/logo-animated.svg'); await q.waitForTimeout(2600);
await q.screenshot({ path: 'logo-check.png', omitBackground: true }); await b.close();
