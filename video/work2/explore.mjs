import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
p.on('pageerror', e => console.log('ERR', e.message));
for (const path of ['hardware-lab','lab','evaluation']) {
  await p.goto('https://bankweave.vercel.app/' + path, { waitUntil: 'networkidle', timeout: 90000 });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `shots/x-${path}.png` });
  const tabs = await p.$$eval('[role=tab], button', els => els.map(e => e.innerText.trim()).filter(Boolean).slice(0, 60));
  console.log(path, JSON.stringify(tabs));
  console.log('height', await p.evaluate(() => document.documentElement.scrollHeight));
}
await b.close();
