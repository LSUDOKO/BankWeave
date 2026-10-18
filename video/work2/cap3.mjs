import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
await p.goto('https://bankweave.vercel.app/evaluation', { waitUntil:'networkidle', timeout:90000 });
await p.waitForTimeout(3000);
const r = await p.evaluate(() => {
  const leaf = re => [...document.querySelectorAll('*')].filter(e => e.children.length===0 && re.test(e.textContent.trim()));
  const box = e => { const r=e.getBoundingClientRect(); return [Math.round(r.x+scrollX),Math.round(r.y+scrollY),Math.round(r.width),Math.round(r.height)]; };
  const out={};
  for (const [k,re] of Object.entries({E2:/^E2/,E1:/^E1/,E6:/^E6/,E3:/^E3/,E5:/^E5/,miss:/^miss$/,weak:/^weak$/,calib:/^Graph score, calibrated/,rulesrow:/^Rules without the graph/,r2528:/^25\/28$/,fid:/fidelity 0\.988/,s438:/^43\.8%$/,s00:/^0\.0%$/,heldout:/^held-out result$/})) out[k]=leaf(re).map(box);
  // card containers for E6 etc: climb to nearest rounded card
  const card = re => { const e=leaf(re)[0]; let c=e; while(c && !(getComputedStyle(c).borderRadius!=='0px' && c.getBoundingClientRect().width>600)) c=c.parentElement; return c?box(c):null; };
  out.cardE2=card(/^E2/); out.cardE1=card(/^E1/); out.cardE6=card(/^E6/);
  const row = e => { let c=e; while(c && c.tagName!=='TR') c=c.parentElement; return c?box(c):null; };
  out.rowCalib = row(leaf(/^Graph score, calibrated/)[0]);
  return out;
});
console.log(JSON.stringify(r));
await b.close();
