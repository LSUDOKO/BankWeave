const G = n => `gif/${n}`;
const WOK = [[0, '000'], [1.5, '001'], [1.8, '002'], [2.1, '003'], [2.4, '004'], [2.7, '005'], [3.0, '006'], [4.1, '008'], [5.6, '009'], [5.9, '010'], [7.4, '011'], [8.9, '012'], [9.2, '013']].map(([t, i]) => [t, G(`wokwi-esp32_${i}.png`)]);
const EMV = [0, 1.5, 2.3, 3.8].map((t, i) => [t, G(`emvlab-decode_00${i}.png`)]);
const FB = '../../docs/img/falkordb/';
const HW = ['hw-Terminals', 'hw-Security_key', 'hw-Enclave', 'hw-ESP32_on_Wokwi'].map(n => `shots/${n}.png`);
// hardware lab camera: crop off the sidebar, tabs near top
const HZ = 1.08, HX = 345, HY = 548;
const tabX = css => (css * 1.2 - HX) * HZ, tabY = css => (css * 1.2 - HY) * HZ;
const TABS = { Terminals: [308, 97], 'Security key': [409, 115], Enclave: [528, 84], 'ESP32 on Wokwi': [617, 145] };
const tabC = n => [tabX(TABS[n][0] + TABS[n][1] / 2) - 6, tabY(480 + 20) - 8];
const SEG = {
  dur: 37.3,
  preload: [...WOK.map(x => x[1]), ...EMV.map(x => x[1]), FB + '03-browser-card-taps.png', FB + '04-browser-terminal-node.png', ...HW],
  build(s) {
    const scene = (id) => { const d = el('div', { class: 'scene', id }); s.appendChild(d); return d; };
    // A: Wokwi
    const a = scene('A'); this.wA = makeWin(a, { url: 'wokwi.com/projects/new/esp32 · simulated ESP32-DevKitC', x: 80, y: 70, w: 1760, h: 810, dark: true });
    this.iA = makeImg(this.wA.vp, WOK[0][1]); this.rA = makeRing(this.wA.vp);
    // B, C: FalkorDB browser stills
    const b = scene('B'); this.wB = makeWin(b, { url: 'browser.falkordb.com · connected to FalkorDB Cloud', x: 80, y: 70, w: 1760, h: 777, dark: true });
    this.iB = makeImg(this.wB.vp, FB + '03-browser-card-taps.png');
    const c = scene('C'); this.wC = makeWin(c, { url: 'browser.falkordb.com · connected to FalkorDB Cloud', x: 80, y: 70, w: 1760, h: 777, dark: true });
    this.iC = makeImg(this.wC.vp, FB + '04-browser-terminal-node.png'); this.rC = makeRing(this.wC.vp);
    // D: EMVLab
    const d = scene('D'); this.wD = makeWin(d, { url: 'emvlab.org/tlvutils · independent EMV TLV decoder', x: 80, y: 70, w: 1760, h: 810 });
    this.iD = makeImg(this.wD.vp, EMV[0][1]); this.rD = makeRing(this.wD.vp);
    // E: hardware lab (live site screenshots)
    const e = scene('E'); this.wE = makeWin(e, { url: 'bankweave.vercel.app/hardware-lab', x: 110, y: 34, w: 1700, h: 956 });
    this.iE = HW.map(src => makeImg(this.wE.vp, src)); this.cur = makeCursor(this.wE.vp);
    // labels
    const L = (id, h) => makeLabel(s, id, h);
    this.labs = [
      [L('l1', 'ESP32 card terminal <span class="dim">· running in the Wokwi simulator</span>'), 2.2, 5.5],
      [L('l2', 'Card A tap <span class="dim">→</span> HTTPS POST to the live API'), 5.7, 9.6],
      [L('l3', '<span class="m">00 APPROVED</span> <span class="dim">·</span> EMV field 55 in the serial log'), 9.8, 12.15],
      [L('l4', 'CARD_TXN edges in FalkorDB Cloud <span class="dim">·</span> <span class="m">0.41 ms</span>'), 12.5, 15.85],
      [L('l5', 'Terminal POS-MUM <span class="dim">·</span> Mumbai <span class="dim">·</span> GPS <span class="m">19.076, 72.8777</span>'), 16.1, 18.55],
      [L('l6', 'EMVLab decodes field 55 <span class="dim">· PAN, ATC, cryptogram, IFD serial</span>'), 18.9, 22.55],
      [L('l7', 'Approval <span class="dim">=</span> security-key signature over the Merkle root'), 24.3, 27.6],
      [L('l8', 'Tamper-evident enclave <span class="dim">· quarantines itself if tampered</span>'), 27.95, 31.8],
      [L('l9', 'Simulated devices <span class="dim">·</span> real cryptography'), 32.1, 37.6],
    ];
  },
  update(t) {
    // A: Wokwi. map clip time -> gif source time
    const sA = t < 2.1 ? lerp(2.4, 3.3, t / 2.1) : t < 5.6 ? lerp(3.3, 5.5, prog(t, 2.1, 5.6)) : t < 9.7 ? lerp(5.6, 8.8, prog(t, 5.6, 9.7)) : 8.95;
    setSrc(this.iA, gifAt(WOK, sA));
    vis($('A'), t, -1, 12.2);
    cam(this.iA, ...kf(t, [[0, [0, 0, 1.4667]], [1.6, [0, 0, 1.4667]], [3.6, [320, 40, 2.0]], [6.0, [320, 40, 2.0]], [8.6, [320, 140, 2.0]], [9.9, [600, 276, 2.93]], [12.6, [600, 276, 2.93]]]));
    placeRing(this.rA, t, 10.2, 12.4, [6, 600, 1748, 148]);
    // B / C stills, slow push
    vis($('B'), t, 12.2, 15.9); cam(this.iB, ...kf(t, [[12.2, [0, 0, 1.1224]], [16.3, [214, 60, 1.3]]], sio));
    vis($('C'), t, 15.9, 18.6); cam(this.iC, ...kf(t, [[15.9, [214, 60, 1.3]], [19.0, [300, 70, 1.38]]], sio));
    { const z = kf(t, [[15.9, 1.3], [19.0, 1.38]], sio), x0 = kf(t, [[15.9, 214], [19.0, 300]], sio), y0 = kf(t, [[15.9, 60], [19.0, 70]], sio);
      placeRing(this.rC, t, 16.4, 18.9, [(1398 - x0) * z, (240 - y0) * z, 152 * z, 230 * z]); }
    // D: EMVLab
    vis($('D'), t, 18.6, 22.6); setSrc(this.iD, gifAt(EMV, (t - 18.6) * 1.6));
    cam(this.iD, ...kf(t, [[18.6, [0, 0, 1.4667]], [21.1, [0, 0, 1.4667]], [22.2, [100, 0, 2.5]], [23.0, [100, 0, 2.5]]]));
    placeRing(this.rD, t, 21.9, 23.2, [(147 - 100) * 2.5, (127 - 0) * 2.5, 200 * 2.5, 48 * 2.5]);
    // E: hardware lab tabs
    vis($('E'), t, 22.6, 99, .35);
    const tabsT = [[22.6, 0], [24.05, 1], [27.75, 2], [31.85, 3]];
    let cur = 0; for (const [a, i] of tabsT) if (t >= a) cur = i;
    this.iE.forEach((im, i) => {
      const a = tabsT[i][0], o = i === 0 ? 1 : prog(t, a, a + .22);
      im.style.opacity = i <= cur ? o : 0; im.style.zIndex = i;
      const local = t - a;
      const y = i === 0 ? kf(t, [[22.6, 320], [23.6, HY]]) : HY + Math.min(local, 4.5) * 9;
      cam(im, HX, y, HZ);
    });
    placeCursor(this.cur, t, [[22.7, [900, 700]], [23.75, tabC('Security key')], [24.4, tabC('Security key')], [26.6, [1050, 520]], [27.4, tabC('Enclave')], [28.3, tabC('Enclave')], [30.8, [1200, 560]], [31.55, tabC('ESP32 on Wokwi')], [32.4, tabC('ESP32 on Wokwi')], [34.0, [1500, 900]]], [23.85, 27.55, 31.65], [22.8, 34.0]);
    for (const [l, a, b] of this.labs) showLabel(l, t, a, b);
  }
};
