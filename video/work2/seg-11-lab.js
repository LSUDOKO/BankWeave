const SH = ['lab-Graphs', 'lab-algo-run', 'lab-Engine_features', 'lab-insp-run'].map(n => `shots/${n}.png`);
const HZ = 1.08, HX = 345, HY = 464;
const V = (ix, iy, cy) => [(ix - HX) * HZ, (iy - cy) * HZ];
const SEG = {
  dur: 13.6,
  preload: SH,
  build(s) {
    const w = makeWin(s, { url: 'bankweave.vercel.app/lab', x: 110, y: 34, w: 1700, h: 956 });
    this.im = SH.map(src => makeImg(w.vp, src)); this.cur = makeCursor(w.vp);
    this.r1 = makeRing(w.vp); this.r2 = makeRing(w.vp); this.r3 = makeRing(w.vp); this.r4 = makeRing(w.vp);
    this.labs = [
      [makeLabel(s, 'a', 'FalkorDB Lab <span class="dim">· 36 graphs, nodes, edges and memory, live</span>'), .4, 2.3],
      [makeLabel(s, 'b', '17 engine features <span class="dim">·</span> one click'), 2.55, 4.4],
      [makeLabel(s, 'c', 'Native algorithms <span class="dim">· run live via</span> <span class="m">GRAPH.RO_QUERY</span>'), 4.55, 5.75],
      [makeLabel(s, 'd', 'Full-text <span class="dim">+</span> HNSW vector indexes'), 5.9, 7.65],
      [makeLabel(s, 'e', 'JavaScript UDFs <span class="dim">·</span> FLEX <span class="dim">·</span> per-bank ACLs'), 7.95, 10.45],
      [makeLabel(s, 'f', 'Query profiles <span class="dim">·</span> <span class="m">GRAPH.PROFILE</span> <span class="dim">operator by operator</span>'), 10.75, 14],
    ];
  },
  update(t) {
    const starts = [0, 2.25, 7.7, 10.5];
    const ys = [
      kf(t, [[0, 0], [.9, 0], [2.0, HY]]),
      kf(t, [[2.25, HY], [4.4, HY], [5.0, 908], [5.6, 908], [6.3, 2266], [7.8, 2300]]),
      kf(t, [[7.7, 225], [10.5, 195]], lin),
      kf(t, [[10.5, 300], [13.6, 272]], lin),
    ];
    let cur = 0; starts.forEach((a, i) => { if (t >= a) cur = i; });
    this.im.forEach((im, i) => { im.style.zIndex = i; im.style.opacity = i > cur ? 0 : i < cur ? 1 - prog(t, starts[cur] + .25, starts[cur] + .26) : i === 0 ? 1 : prog(t, starts[i], starts[i] + .25); cam(im, HX, ys[i], HZ); });
    // rings
    const y1 = ys[1];
    placeRing(this.r1, t, 2.5, 4.45, [...V(1416 * 1.2 - 8, 482 * 1.2 - 8, y1), 127 * 1.2 * HZ + 18, 40 * 1.2 * HZ + 18]);
    placeRing(this.r2, t, 5.0, 5.75, [...V(360, 945, y1), 760 * HZ, 440 * HZ]);
    placeRing(this.r3, t, 6.5, 7.75, [...V(360, 2480, y1), 760 * HZ, 500 * HZ]);
    placeRing(this.r4, t, 11.0, 13.8, [...V(1125, 560, ys[3]), 750 * HZ, 520 * HZ]);
    const tabAlg = V((392 + 86) * 1.2, 430 * 1.2, HY), runAll = V((1416 + 70) * 1.2, (482 + 26) * 1.2, HY);
    placeCursor(this.cur, t, [[.6, [700, 600]], [2.0, [tabAlg[0] - 6, tabAlg[1] - 8]], [2.5, [tabAlg[0] - 6, tabAlg[1] - 8]], [3.3, runAll], [4.4, runAll]], [2.1], [.6, 4.45]);
    for (const [l, a, b] of this.labs) showLabel(l, t, a, b);
  }
};
