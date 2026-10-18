// Terminal built from REAL outputs captured from the hosted MCP (video/work2/mcp/*.txt) and the real `claude mcp add/list` CLI.
const TOOLS = ['engine_overview', 'list_graphs', 'graph_schema', 'list_cases', 'get_case', 'explain_claim', 'account_network', 'trace_money_path', 'find_rings', 'top_hubs', 'connected_components', 'similar_accounts', 'search_customers', 'list_alerts', 'triage_alert', 'typology_guidance', 'run_readonly_cypher'];
const URL_ = 'https://bankweave-api.onrender.com/mcp';
const k = s => `<span class="k">"${s}"</span>`, str = s => `<span class="s">"${s}"</span>`, num = s => `<span class="n">${s}</span>`;
// [time, kind, content, opts]  kind: type (typed after prompt), out (appears), raw
const S1 = [
  [0.6, 'type', `claude mcp add --transport http bankweave ${URL_}`, { end: 3.9 }],
  [4.45, 'out', `Added HTTP MCP server bankweave with URL: ${URL_} to local config`],
  [5.0, 'type', 'claude mcp list', { end: 5.5 }],
  [5.8, 'out', '<span class="c">Checking MCP server health…</span>'],
  [6.5, 'out', `bankweave: ${URL_} (HTTP) - <span class="ok">✔ Connected</span>`],
  [7.1, 'gap'],
  [7.2, 'out', `<span class="rq">→ POST /mcp</span>  <span class="m">tools/list</span>`],
  [7.55, 'out', `<span class="rs">←</span> <span class="big">17 tools</span>  <span class="c">· every one annotated</span> ${k('readOnlyHint')}: <span class="n">true</span>`, { id: 'n17' }],
];
const S2 = [
  [10.45, 'rq', `<span class="rq">→ POST /mcp</span>  <span class="m">tools/call</span> <span class="tn">explain_claim</span>  {${k('case_id')}: ${str('C-64cbd23a')}, ${k('claim_id')}: ${str('CL-237a5887')}}`],
  [11.5, 'out', `<span class="rs">←</span> <span class="c">result · graph case_C-64cbd23a · 311.1 ms</span>`],
  [11.65, 'out', '{'],
  [11.72, 'out', `  ${k('claim')}: { ${k('id')}: ${str('CL-237a5887')},`],
  [11.79, 'out', `             ${k('text')}: ${str('Account e215eb is where funds in the structure pool (collection hub)')} … },`],
  [11.86, 'out', `  <span id="hp">${k('paths')}: ${num(3)}</span>,`],
  [11.93, 'out', `  <span id="hi">${k('independent_sources')}: ${num(1)}</span>,`],
  [12.0, 'out', `  <span id="hn">${k('naive_confidence')}: ${num('0.593')}</span>,`],
  [12.07, 'out', `  <span id="he">${k('echo_proof_confidence')}: ${num('0.259')}</span>,`],
  [12.14, 'out', `  <span id="hv">${k('verdict')}: <span class="s">"NOT independently corroborated: all support traces to 1 origin(s)"</span></span>,`],
  [12.21, 'out', `  ${k('origin_groups')}: [{ ${k('origin')}: ${str('algo:pagerank:C-64cbd23a:e215eb3d53820ba0')}, ${k('multiplicity')}: ${num(3)} }],`],
  [12.28, 'out', `  <span id="hc1">${k('cypher')}: { ${k('supports')}: <span class="s">"MATCH (c:Claim {id:$id})-[:SUPPORTED_BY]->(e:Evidence)</span></span>`],
  [12.35, 'out', `<span id="hc2"><span class="s">                WHERE e.state IN ['active', 'needs_verification']</span></span>`],
  [12.42, 'out', `<span id="hc3"><span class="s">                RETURN e.id AS id, e.kind AS kind, e.origin AS origin, …"</span>, ${k('challenges')}: <span class="s">"MATCH …"</span>, … },</span>`],
  [12.49, 'out', `  ${k('params')}: { ${k('id')}: ${str('CL-237a5887')} }, ${k('ms')}: ${num('311.1')}`],
  [12.56, 'out', '}'],
  [21.9, 'gap'],
  [21.95, 'rq', `<span class="rq">→ POST /mcp</span>  <span class="m">tools/call</span> <span class="tn">run_readonly_cypher</span>  {${k('cypher')}: <span class="s">"MATCH (a:Account) <span class="wr">SET a.x = 1</span> RETURN a"</span>}`],
  [22.85, 'out', `<span class="rs">←</span> ${k('isError')}: <span class="err">true</span>  <span class="refused">REFUSED</span>`, { id: 'ref1' }],
  [23.0, 'out', `  <span class="err">Error executing tool run_readonly_cypher: read-only: write clauses are not allowed</span>`, { id: 'ref2' }],
];
const SEG = {
  dur: 26.1,
  build(s) {
    s.classList.add('navy');
    s.innerHTML = `
<style>
 .term{position:absolute;left:90px;top:56px;width:1740px;height:968px;border-radius:18px;overflow:hidden;background:#0c1322;box-shadow:0 40px 100px -20px rgba(0,0,0,.6),0 0 0 1px rgba(140,196,255,.14)}
 .term .tb{height:46px;background:#161f33;display:flex;align-items:center;padding:0 18px;gap:8px;border-bottom:1px solid #0a0f1b}
 .term .tb i{width:13px;height:13px;border-radius:50%;background:#ff5f57;display:block}.term .tb i:nth-child(2){background:#febc2e}.term .tb i:nth-child(3){background:#28c840}
 .term .tb .tt{position:absolute;left:0;right:0;text-align:center;font:500 17px Inter;color:#8a97b0}
 .scr{position:absolute;left:0;right:0;top:46px;bottom:0;padding:28px 40px;font:400 23px/35px 'JetBrains Mono',monospace;color:#d6e2f5;white-space:pre;font-variant-ligatures:none;font-feature-settings:'calt' 0,'liga' 0}
 .ln{min-height:35px;position:relative}
 .p{color:#3ddc97;font-weight:700}.p .d{color:#7cc4ff;font-weight:500}
 .k{color:#8cc4ff}.s{color:#b9e3a6}.n{color:#ffd479;font-weight:600}.c{color:#7b8aa6}.ok{color:#3ddc97;font-weight:700}
 .rq{color:#c79bff;font-weight:700}.rs{color:#3ddc97;font-weight:700}.m{color:#fff;font-weight:700}.tn{color:#ffd479;font-weight:700}
 .big{color:#fff;font-weight:800}.err{color:#ff7b7b;font-weight:600}.wr{color:#ff9d6b;text-decoration:underline;text-decoration-color:rgba(255,123,123,.7)}
 .refused{display:inline-block;margin-left:14px;padding:0 12px;border-radius:7px;background:#ff5c5c;color:#fff;font-weight:800;font-size:19px;line-height:30px;letter-spacing:.06em}
 .caret{display:inline-block;width:13px;height:26px;background:#d6e2f5;vertical-align:-5px;margin-left:2px}
 .grid{display:grid;grid-template-columns:repeat(3,480px);gap:4px 30px;padding-left:28px;margin-top:6px}
 .grid div{color:#ffd479;opacity:0}.grid div::before{content:'◆ ';color:#3b6db3}
 .hl{border-radius:6px;transition:none}
 #dim{position:absolute;left:0;right:0;top:46px;bottom:0;background:rgba(5,10,20,.55);opacity:0;pointer-events:none}
 .callout{position:absolute;left:130px;top:722px;width:1480px;padding:26px 44px;display:grid;grid-template-columns:auto 1fr;column-gap:56px;align-items:center;border-radius:22px;background:#fff;color:#0b1b33;box-shadow:0 30px 80px -10px rgba(0,0,0,.6);opacity:0;font-family:Inter}
 .callout .h{grid-column:1/3;font-size:22px;font-weight:600;color:#55657f;letter-spacing:.02em;text-transform:uppercase}
 .callout .row{display:flex;align-items:baseline;gap:22px;margin-top:6px}
 .callout .a{font:700 64px 'JetBrains Mono',monospace;color:#c0392b;text-decoration:line-through;text-decoration-thickness:5px;opacity:.75}
 .callout .arrow{font-size:52px;color:#087cf8;font-weight:700}
 .callout .b{font:800 92px 'JetBrains Mono',monospace;color:#0a8f5a}
 .callout .sub{font-size:34px;font-weight:600;color:#0b2a5b}
 .callout .sub2{margin-top:8px;font-size:24px;color:#55657f}
</style>
<div class="term"><div class="tb"><i></i><i></i><i></i><div class="tt">bankweave — zsh · MCP over HTTP · ${URL_}</div></div>
 <div class="scr" id="s1"></div><div class="scr" id="s2"></div><div id="dim"></div>
 <div class="callout" id="call"><div class="h">explain_claim · CL-237a5887</div>
  <div class="row"><span class="a" id="ca">0.593</span><span class="arrow">→</span><span class="b" id="cb">0.259</span></div>
  <div><div class="sub">3 paths, but 1 independent source</div><div class="sub2">naive confidence counts paths · echo-proof counts distinct origins</div></div></div>
</div>`;
    const mk = (scr, lines) => lines.map(([t0, kind, c, o = {}]) => {
      const d = el('div', { class: 'ln' }); if (o.id) d.id = o.id; $(scr).appendChild(d);
      if (kind === 'type') d.innerHTML = `<span class="p">➜ <span class="d">bankweave</span></span> <span class="tx"></span><span class="caret"></span>`;
      else if (kind !== 'gap') d.innerHTML = c;
      return { d, t0, kind, c, o };
    });
    this.L1 = mk('s1', S1); this.L2 = mk('s2', S2);
    const g = el('div', { class: 'grid', id: 'grid' }); g.innerHTML = TOOLS.map(n => `<div>${n}</div>`).join(''); $('s1').appendChild(g);
  },
  update(t) {
    const run = (L) => { for (const x of L) {
      if (x.kind === 'type') {
        const n = Math.round(x.c.length * prog(t, x.t0 + .2, x.o.end)); x.d.querySelector('.tx').textContent = x.c.slice(0, n);
        x.d.style.opacity = t >= x.t0 ? 1 : 0;
        const nextT = (L[L.indexOf(x) + 1] || {}).t0 ?? 1e9; const caret = x.d.querySelector('.caret');
        caret.style.opacity = t >= x.t0 && t < nextT && (t < x.o.end || Math.floor(t * 2.2) % 2 === 0) ? 1 : 0;
      } else if (x.kind === 'rq') { x.d.style.opacity = prog(t, x.t0, x.t0 + .15); x.d.style.clipPath = `inset(0 ${100 - 100 * eout(prog(t, x.t0, x.t0 + .7))}% 0 0)`; }
      else x.d.style.opacity = prog(t, x.t0, x.t0 + .08);
    } };
    run(this.L1); run(this.L2);
    // tool grid staggered
    [...$('grid').children].forEach((d, i) => { const q = prog(t, 7.85 + i * .1, 8.1 + i * .1); d.style.opacity = q; d.style.transform = `translateX(${(1 - q) * -14}px)`; });
    const n17 = $('n17'); n17.style.background = `rgba(8,124,248,${.35 * (prog(t, 7.6, 7.9) - prog(t, 9.6, 10.1))})`;
    // screen switch (scroll up) at 10.2
    const sw = io(prog(t, 10.1, 10.45));
    $('s1').style.transform = `translateY(${-sw * 400}px)`; $('s1').style.opacity = 1 - sw;
    $('s2').style.visibility = t >= 10.3 ? 'visible' : 'hidden';
    // highlights
    const hl = (id, a, b, col) => { const q = prog(t, a, a + .25) * (1 - prog(t, b, b + .3)); $(id).style.background = `rgba(${col},${.38 * q})`; $(id).style.boxShadow = `0 0 0 ${5 * q}px rgba(${col},${.38 * q})`; };
    hl('hp', 12.65, 19.8, '255,212,121'); hl('hi', 13.85, 19.8, '255,212,121');
    hl('hn', 18.1, 19.8, '255,110,110'); hl('he', 16.3, 19.8, '61,220,151'); hl('hv', 14.6, 19.8, '255,212,121');
    for (const id of ['hc1', 'hc2', 'hc3']) hl(id, 19.85, 22.0, '140,196,255');
    // freeze: dim + callout 15.2 – 19.8
    const f = prog(t, 15.1, 15.5) * (1 - prog(t, 19.6, 19.95));
    $('dim').style.opacity = 0;
    const c = eout(prog(t, 15.2, 15.7)) * (1 - prog(t, 19.55, 19.9));
    $('call').style.opacity = c; $('call').style.transform = `translateY(${(1 - c) * 26}px) scale(${.96 + .04 * c})`;
    $('ca').style.opacity = .2 + .55 * prog(t, 18.1, 18.5); $('cb').style.transform = `scale(${1 + .06 * Math.sin(prog(t, 16.4, 17.0) * Math.PI)})`;
    // refusal flash
    const r = prog(t, 22.85, 23.1) * (1 - prog(t, 25.6, 26.1) * 0);
    $('ref2').style.background = `rgba(255,92,92,${.16 * r})`; $('ref2').style.borderRadius = '6px';
  }
};
