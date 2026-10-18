import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto('file://' + process.cwd() + '/page.html?seg=' + (process.argv[2] || '13-end'));
await p.waitForFunction(() => window.ready);
for (let f = 0; f < 10; f++) { const t0 = Date.now(); await p.evaluate(t => seek(t), f / 30); const t1 = Date.now(); await p.screenshot({ type: 'jpeg', quality: 92 }); console.log(f, t1 - t0, Date.now() - t1); }
await b.close();
