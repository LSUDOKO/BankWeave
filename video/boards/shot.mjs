import { chromium } from '../films/node_modules/playwright-core/index.mjs';
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--allow-file-access-from-files'] });
for (const n of process.argv.slice(2)) {
  const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.25 });
  await p.goto('file://' + process.cwd() + '/' + n + '.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
  await p.screenshot({ path: n + '.png' }); await p.close();
}
await b.close();
