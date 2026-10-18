const CLOUD = [[1.5, 'gif/falkordb-cloud-instance_001.png'], [2.2, 'gif/falkordb-cloud-instance_002.png'], [3.7, 'gif/falkordb-cloud-instance_003.png']];
const FR = JSON.parse('[' + [21, 22, 23, 24, 25, 26, 27, 28, 29, 30].map(i => `[${[27.1, 28.6, 30.1, 30.9, 31.7, 32.5, 33.3, 34.1, 35.6, 37.1][i - 21]}, "gif/falkordb-browser_0${i}.png"]`).join(',') + ']');
const FB = '../../docs/img/falkordb/';
const ST = [
  ['C', '01-browser-cross-bank-ring.png', 7.5, 10.6, 'Cross-bank ring <span class="dim">·</span> 12 nodes <span class="dim">·</span> <span class="m">1.85 ms</span>', [880, 628, 230, 38]],
  ['D', '02-browser-pagerank.png', 10.6, 12.7, '<span class="m">algo.pageRank</span> <span class="dim">·</span> <span class="m">3.55 ms</span>', [445, 628, 256, 38]],
  ['E', '05-browser-sar-provenance.png', 12.7, 16.8, 'SAR → Sentence → Claim → Evidence <span class="dim">·</span> <span class="m">0.61 ms</span>', [880, 628, 260, 38]],
  ['F', '06-browser-vector-knn.png', 16.8, 21.9, 'HNSW vector KNN <span class="dim">·</span> behaviour twins <span class="dim">·</span> <span class="m">0.36 ms</span>', [445, 628, 300, 38]],
];
const SEG = {
  dur: 21.9,
  preload: [...CLOUD.map(x => x[1]), ...FR.map(x => x[1]), ...ST.map(x => FB + x[1])],
  build(s) {
    const scene = id => { const d = el('div', { class: 'scene', id }); s.appendChild(d); return d; };
    this.wA = makeWin(scene('A'), { url: 'app.falkordb.cloud · Deployments › Instances', x: 80, y: 70, w: 1760, h: 810 });
    this.iA = makeImg(this.wA.vp, CLOUD[0][1]);
    this.wB = makeWin(scene('B'), { url: 'browser.falkordb.com · connected to our FalkorDB Cloud instance', x: 80, y: 70, w: 1760, h: 776, dark: true });
    this.iB = makeImg(this.wB.vp, FR[0][1]);
    this.st = ST.map(([id, f]) => { const w = makeWin(scene(id), { url: 'browser.falkordb.com · connected to our FalkorDB Cloud instance', x: 80, y: 70, w: 1760, h: 777, dark: true }); return { img: makeImg(w.vp, FB + f), ring: makeRing(w.vp) }; });
    this.labs = [
      [makeLabel(s, 'la', 'Not a mock-up: our FalkorDB Cloud instance <span class="dim">· AWS ap-south-1 · v4.22.0</span>'), 1.0, 4.15],
      [makeLabel(s, 'lb', "FalkorDB's own Browser <span class=\"dim\">· connected to the Cloud instance</span>"), 4.5, 7.45],
      ...ST.map(([id, f, a, b, h]) => [makeLabel(s, 'l' + id, h), a + .25, b - .05]),
    ];
    this.labs[this.labs.length - 1][2] = 22.3;
  },
  update(t) {
    vis($('A'), t, -1, 4.2); setSrc(this.iA, gifAt(CLOUD, 1.5 + t * .62));
    cam(this.iA, ...kf(t, [[0, [0, 0, 1.6]], [1.2, [0, 0, 1.6]], [4.4, [120, 30, 2.0]]], sio));
    vis($('B'), t, 4.2, 7.5); setSrc(this.iB, gifAt(FR, 28.0 + (t - 4.2) * 2.2));
    cam(this.iB, ...kf(t, [[4.2, [0, 0, 1.6]], [7.9, [60, 20, 1.72]]], sio));
    ST.forEach(([id, f, a, b, h, r], i) => {
      vis($(id), t, a, b); const c = kf(t, [[a, [0, 0, 1.1224]], [b + .4, [101, 45, 1.2]]], sio);
      cam(this.st[i].img, ...c);
      placeRing(this.st[i].ring, t, a + .6, b + .3, [(r[0] - c[0]) * c[2], (r[1] - c[1]) * c[2], r[2] * c[2], r[3] * c[2]]);
    });
    for (const [l, a, b] of this.labs) showLabel(l, t, a, b);
  }
};
