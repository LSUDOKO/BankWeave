// usage: node render.mjs <seg-id> [--stills t1,t2,..] [--workers N]  -> ../clips/<seg-id>.mp4
import { chromium } from 'playwright-core';
import { spawnSync } from 'child_process';
import fs from 'fs';
const id = process.argv[2];
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const FPS = 30, W = Number(arg('--workers') || 6);
const CH = process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
async function open() {
  const b = await chromium.launch({ executablePath: CH, args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await p.goto('file://' + process.cwd() + '/page.html?seg=' + id);
  await p.waitForFunction(() => window.ready, null, { timeout: 90000 });
  return { b, p };
}
if (arg('--stills')) {
  const { b, p } = await open();
  for (const t of arg('--stills').split(',').map(Number)) { await p.evaluate(t => seek(t), t); await p.screenshot({ path: `stills/${id}_${t}.png` }); }
  await b.close(); process.exit(0);
}
const { b: b0, p: p0 } = await open(); const dur = await p0.evaluate(() => SEG.dur); await b0.close();
const N = Math.round(FPS * dur), dir = `/tmp/claude-1000/-home-arpit-Desktop-hackathon-projects-BankWeave/931075de-73fe-4b81-b09f-3d94472fedfc/scratchpad/frames/${id}`;
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const t0 = Date.now(); let done = 0;
await Promise.all([...Array(W).keys()].map(async w => {
  const { b, p } = await open();
  for (let f = w; f < N; f += W) {
    await p.evaluate(t => seek(t), f / FPS);
    await p.screenshot({ type: 'jpeg', quality: 95, path: `${dir}/f${String(f).padStart(5, '0')}.jpg` });
    if (++done % 150 === 0) console.log(`${id} ${done}/${N} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await b.close();
}));
const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', `${dir}/f%05d.jpg`, '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-color_range', 'tv', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', `../clips/${id}.mp4`], { stdio: 'inherit' });
console.log(id, 'done', N, 'frames', ((Date.now() - t0) / 1000).toFixed(0) + 's', 'ffmpeg', r.status);
