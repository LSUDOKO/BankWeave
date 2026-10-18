import { chromium } from '../films/node_modules/playwright-core/index.mjs';
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('file://' + process.cwd() + '/index.html'); await p.waitForTimeout(800);
await p.screenshot({ path: 'thumbnail.png' }); await b.close();
