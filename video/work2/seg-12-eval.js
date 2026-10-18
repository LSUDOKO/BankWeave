const HZ = 1.08, HX = 345;
const SEG = {
  dur: 13.5,
  preload: ['shots/eval.png'],
  build(s) {
    const w = makeWin(s, { url: 'bankweave.vercel.app/evaluation', x: 110, y: 34, w: 1700, h: 956 });
    this.im = makeImg(w.vp, 'shots/eval.png');
    this.rings = [0, 1, 2, 3, 4].map(() => makeRing(w.vp));
    this.labs = [
      [makeLabel(s, 'a', "Best single bank sees <span class=\"m\">43.8%</span> of a ring <span class=\"dim\">·</span> <span class=\"m\">0</span> of 36 rings whole"), .5, 2.6],
      [makeLabel(s, 'b', 'Graph triage beats the rules <span class="dim">· held-out F1</span> <span class="m">0.205</span> <span class="dim">vs</span> <span class="m">0.126</span>'), 2.8, 5.4],
      [makeLabel(s, 'c', '<span class="m">25/28</span> SARs passed the provenance gate <span class="dim">· fidelity</span> <span class="m">0.988</span>'), 5.6, 8.8],
      [makeLabel(s, 'd', 'Where we fell short, the page says so'), 9.0, 13.9],
    ];
  },
  update(t) {
    const yc = kf(t, [[0, 0], [2.3, 40], [2.85, 700], [5.2, 715], [5.65, 1500], [8.6, 1515], [9.05, 1880], [13.5, 1900]]);
    const y = yc * 1.2; cam(this.im, HX, y, HZ);
    const R = (css) => [(css[0] * 1.2 - HX) * HZ, (css[1] * 1.2 - y) * HZ, css[2] * 1.2 * HZ, css[3] * 1.2 * HZ];
    placeRing(this.rings[0], t, .8, 2.6, R([316, 456, 196, 54]));
    placeRing(this.rings[1], t, 1.2, 2.6, R([509, 456, 196, 54]));
    placeRing(this.rings[2], t, 3.2, 5.45, R([304, 944, 1272, 44]));
    placeRing(this.rings[3], t, 5.95, 8.85, R([330, 1700, 394, 142]));
    placeRing(this.rings[4], t, 9.4, 13.8, R([300, 1916, 414, 252]));
    for (const [l, a, b] of this.labs) showLabel(l, t, a, b);
  }
};
