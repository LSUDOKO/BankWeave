const LOGO = '../../frontend/public/logo-white.png';
const SEG = {
  dur: 9.2,
  preload: [LOGO],
  build(s) {
    s.classList.add('navy');
    s.innerHTML = `
<style>
 .glow{position:absolute;left:50%;top:40%;width:1100px;height:1100px;margin:-550px 0 0 -550px;border-radius:50%;background:radial-gradient(circle,rgba(8,124,248,.35) 0%,rgba(8,124,248,0) 62%)}
 .grid{position:absolute;inset:-100px;background-image:radial-gradient(rgba(140,196,255,.18) 1.6px,transparent 1.6px);background-size:44px 44px}
 .mark{position:absolute;left:50%;top:300px;width:200px;height:200px;margin-left:-100px}
 .mark img{width:100%;height:100%}
 .mark .halo{position:absolute;inset:-40px;border-radius:50%;border:3px solid rgba(61,155,255,.6)}
 .word{position:absolute;left:0;right:0;top:528px;text-align:center;font-size:118px;font-weight:800;letter-spacing:-.035em;color:#fff}
 .tag{position:absolute;left:0;right:0;top:690px;text-align:center;font-size:52px;font-weight:600;letter-spacing:-.015em;color:#cfe3ff}
 .tag span{display:inline-block;margin:0 .14em}
 .tag span.hl{color:#5fb0ff}
 .low{position:absolute;left:0;right:0;top:880px;text-align:center;font-size:25px;color:#9fb6d8;font-weight:500}
 .low .sep{color:#3d6cad;margin:0 18px}
 .low code{font-family:'JetBrains Mono',monospace;font-size:23px;color:#d9e8ff;background:rgba(255,255,255,.07);padding:6px 12px;border-radius:8px;border:1px solid rgba(140,196,255,.2)}
 .low .r2{margin-top:22px}
</style>
<div class="grid" id="grid"></div><div class="glow" id="glow"></div>
<div class="mark" id="mark"><div class="halo" id="halo"></div><img src="${LOGO}"></div>
<div class="word" id="word">BankWeave</div>
<div class="tag" id="tag"><span>Many banks,</span><span>one ring,</span><span class="hl">every claim proven.</span></div>
<div class="low" id="low"><div>bankweave.vercel.app<span class="sep">·</span>github.com/LSUDOKO/BankWeave</div><div class="r2"><code>claude mcp add --transport http bankweave https://bankweave-api.onrender.com/mcp</code></div></div>`;
  },
  update(t) {
    $('grid').style.transform = `translate(${-t * 6}px, ${-t * 4}px)`; $('grid').style.opacity = .5 + .5 * prog(t, 0, 1.5);
    $('glow').style.transform = `scale(${.9 + .08 * Math.sin(t * 1.3)})`;
    const m = eout(prog(t, .2, 1.3));
    $('mark').style.opacity = prog(t, .2, .7); $('mark').style.transform = `translateY(${(1 - m) * 40}px) scale(${.7 + .3 * m}) rotate(${(1 - m) * -12}deg)`;
    const h = prog(t, .9, 2.1); $('halo').style.opacity = (1 - h) * (h > 0 ? 1 : 0); $('halo').style.transform = `scale(${.8 + h * .6})`;
    const w = eout(prog(t, .7, 1.6)); $('word').style.opacity = w; $('word').style.transform = `translateY(${(1 - w) * 30}px)`; $('word').style.letterSpacing = `${-.035 + (1 - w) * .05}em`;
    // lift logo+word slightly when tagline arrives
    const lift = io(prog(t, 3.7, 4.4)) * 40;
    $('mark').style.marginTop = -lift + 'px'; $('word').style.marginTop = -lift + 'px';
    const ts = [4.15, 5.1, 6.1];
    [...$('tag').children].forEach((sp, i) => { const q = eout(prog(t, ts[i], ts[i] + .5)); sp.style.opacity = q; sp.style.transform = `translateY(${(1 - q) * 22}px)`; });
    $('tag').style.marginTop = -lift + 'px';
    const l = eout(prog(t, 7.0, 7.7)); $('low').style.opacity = l; $('low').style.transform = `translateY(${(1 - l) * 18}px)`;
  }
};
