// usage: node stills.mjs <filmDir> <outDir> t1 t2 ...
import { chromium } from 'playwright-core';
import path from 'path';
const [dir, outDir, ...ts] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('console', m => console.log('console:', m.text())); p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('file://' + path.resolve(dir, 'index.html')); await p.evaluate(() => window.ready);
for (const t of ts.map(Number)) { await p.evaluate(t => seek(t), t); await p.screenshot({ path: path.join(outDir, `${path.basename(dir)}_${t}.png`) }); }
await b.close();
