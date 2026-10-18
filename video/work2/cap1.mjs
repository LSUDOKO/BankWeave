import { chromium } from 'playwright-core';
import fs from 'fs';
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
p.on('pageerror', e => console.log('ERR', e.message));
const meta = {};
async function rects(names){ return p.evaluate(ns => ns.map(n => { const el=[...document.querySelectorAll('button')].find(e=>e.innerText.trim()===n); if(!el) return null; const r=el.getBoundingClientRect(); return {n, x:r.x+scrollX, y:r.y+scrollY, w:r.width, h:r.height}; }), names); }
async function grab(name, tabs){ await p.waitForTimeout(3500); const h = await p.evaluate(()=>document.documentElement.scrollHeight); await p.screenshot({ path:`shots/${name}.png`, fullPage:true }); meta[name]={h, tabs: await rects(tabs)}; console.log(name,h); }
// hardware lab
const HT=['Terminals','Security key','Enclave','ESP32 on Wokwi'];
await p.goto('https://bankweave.vercel.app/hardware-lab', { waitUntil:'networkidle', timeout:90000 });
for (const t of HT) { await p.click(`button:text-is("${t}")`); await grab('hw-'+t.replace(/\W+/g,'_'), HT); }
// lab
const LT=['Graphs','Algorithms & indexes','Inspector','MCP tools','Engine features'];
await p.goto('https://bankweave.vercel.app/lab', { waitUntil:'networkidle', timeout:90000 });
for (const t of LT) { await p.click(`button:text-is("${t}")`); await grab('lab-'+t.replace(/\W+/g,'_'), LT); }
await p.goto('https://bankweave.vercel.app/evaluation', { waitUntil:'networkidle', timeout:90000 });
await grab('eval', []);
fs.writeFileSync('shots/meta.json', JSON.stringify(meta,null,1));
await b.close();
