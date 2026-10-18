// usage: node render.mjs <filmDir> <seconds> <out.mp4>   (30 fps, PNG frames piped to ffmpeg)
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import path from 'path';
const [dir, dur, out] = process.argv.slice(2);
const FPS = 30, N = Math.round(FPS * Number(dur));
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('file://' + path.resolve(dir, 'index.html')); await p.evaluate(() => window.ready);
const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', path.resolve(out)], { stdio: ['pipe', 'inherit', 'inherit'] });
const t0 = Date.now();
for (let f = 0; f < N; f++) {
  await p.evaluate(t => seek(t), f / FPS);
  const buf = await p.screenshot({ type: 'png' });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (f % 60 === 0) console.log(`${dir} frame ${f}/${N} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close(); console.log('done', out);
