# BankWeave: motion-graphics briefs for the demo video

Five short animated films that wrap the live screen recording. Each brief has the same parts as
a production prompt: inputs, direction, structure, build, gotchas, start. Each one can be built
and rendered on its own: give one brief to Claude Code and it builds the HTML, shows stills,
then renders the MP4.

The whole video, films plus live recording, stays **under 5:00**. See `docs/VIDEO_SCRIPT.md`
for the master timeline and voice-over.

| # | Film | Length | Placed at |
|---|---|---|---|
| 1 | **The ring no bank can see** (the problem) | 40.0 s | 0:00 |
| 2 | **Landing fly-over** (into the product) | 12.0 s | 0:40 |
| 3 | **Card tap to signed report** (the hardware edge) | 10.0 s | 2:50 |
| 4 | **Ask the graph** (MCP) | 12.0 s | 3:40 |
| 5 | **Every claim proven** (end card) | 8.0 s | 4:52 |

---

## Shared brand system (all five films)

**Mark:** the BankWeave logo: a blue **B** whose two bowls are split by one sweeping S-shaped cut,
the thread that only the consortium sees (`frontend/public/logo.png` blue `#0363e4` on
transparent, `frontend/public/logo-white.png` for dark backgrounds, `docs/img/logo.png` on a white
tile). Banks are lanes, the money is the thread, and every film resolves back into the B.

**Palette** (from `frontend/src/app/globals.css`)
| Token | Hex | Use |
|---|---|---|
| deep | `#0b2a5b` | night-blue backgrounds, hero |
| navy | `#0a508f` | gradients, secondary fills |
| cyan (signal) | `#087cf8` | the thread, live data, primary actions |
| sky | `#8ad8fc` | thread on dark, highlights |
| ink | `#f4f6fa` | light canvas |
| paper | `#0c1a2e` | text on light |
| muted | `#5b6b80` | secondary text |
| mist | `#b5bcc6` | bank lanes, inactive |
| ring (red) | `#d93a3f` | suspicious, laundering, broken |
| verify (amber) | `#c97a06` | evidence needing review |
| ok (green) | `#0c9466` | cleared, verified, sealed |

No purple, magenta or orange. Red means laundering or broken only, never decoration.

**Type:** Inter (400/500/600, tight tracking −0.03 to −0.05 em on headlines), JetBrains Mono for
Cypher, ids, hashes and numbers that come from the system. One serif accent is allowed only in
the end-card tail (Instrument Serif italic).

**Motion grammar:** one camera per film, eased; critically damped springs (no bounce); text rises
out of a mask line; shared-element handoffs (the thread is always the same object); nothing
appears from nowhere. **Banned everywhere:** crossfades between shots, particles, lens flares,
camera shake, glitch effects, stock "hacker" imagery, padlock icons, binary rain, Matrix code,
fake numbers.

**Honesty rules on screen:** every number shown comes from `eval/results/*.json` or a cited public
source, with a 14 px source line under it. Hardware is always labelled
"Simulated devices · real cryptography".

**Audio:** one royalty-free electronic track at about 120 BPM with a clear lift (Mixkit free
licence, or synthesize). It sits under the voice-over at −20 LUFS while the voice is speaking,
−14 LUFS in films without voice. SFX are quiet: soft ticks, one low impact per film, whooshes
only on real camera moves.

**Render pipeline (shared):** one HTML file per film, 1920×1080, every style computed in
`window.seek(t)` from absolute time (no CSS transitions, no timers, no `Math.random`; use a seeded
hash). Playwright with Chromium from `~/.cache/ms-playwright/chromium-1243`, fonts loaded before
the first frame, one screenshot per frame at 60 fps, 4 subframes per frame blended with ffmpeg
`tmix` for restrained motion blur, H.264 yuv420p, CRF 16. Contact sheet at 4 fps for review.

---

## Film 1 · The ring no bank can see (problem, 40 s)

<inputs>
Prefilled. Optional: four Unsplash photos (the Unsplash connector needs the account email
confirmed first). Searches: "bank building facade", "analyst at computer night",
"stack of paper documents", "city skyline night aerial". Download through the connector's
`download_asset` so the download is recorded. If no photos are supplied, use the photo-free
fallback in each scene.
</inputs>

<direction>
A 40-second explainer of the problem, 1920×1080, 60 fps, under voice-over. Night-blue (`#0b2a5b`
→ `#071c3d` vignette), calm and serious, like a financial-intelligence briefing, not a thriller.
The visual idea: **banks are vertical lanes, money is one thread.** Each bank can only see the
part of the thread inside its own lane; the film ends when the lanes stop being walls and the
thread is seen whole, then folds into the BankWeave mark.
Photos (if used) appear only inside rounded 28 px cards, duotoned to the palette (multiply
`#0b2a5b`, screen `#8ad8fc` at 18%), never full-bleed, never with people's faces as the focus.
Banned: cuts, crossfades, red alarm flashing, dollar-sign icons, money-gun imagery, hooded hackers.
</direction>

<structure>
**S1 · 0.0–4.5 s · One transfer.** Black, then night-blue rises from the bottom. A single sky-blue
dot (12 px) enters left and draws a thread behind it as it travels: an S-curve that crosses five
faint vertical lanes (`#b5bcc6` at 20%, 4 px, 260 px apart, full height). Each lane gets a small
label at its top in Inter 500 14 px muted: "Bank 003 · Bank 012 · Bank 027 · Bank 041 · Bank 058".
Camera: one slow push, scale 1.00 → 1.06. The dot exits right at 4.2 s.
VO: "A criminal moves money through five banks."

**S2 · 4.5–10.0 s · Each bank sees a piece.** The lanes thicken into frosted columns 200 px wide
(white at 6%, 1 px border at 14%). Inside each column only that column's segment of the thread is
drawn; outside them the thread fades to 0 (it is still there, nobody can see it). Each segment
ends in a grey stub circle labelled `External` in JetBrains Mono 12 px. In each column a small
alert card (220×64, radius 14) appears in turn, 0.35 s apart, shows "Alert · score 0.31" and gets
a green "Cleared" chip. Headline rises from a mask line at y 150: **"Each bank sees its own piece."**
(Inter 600, 56 px, white). Sub line, muted: "Each piece looks normal."
VO: "Each bank looks at its own piece. Each piece looks normal. Each bank clears the alert."

**S3 · 10.0–17.0 s · Problem 1: alert fatigue.** Camera drifts right as the columns slide left
and fade to 15% (they stay as a background texture). Right half: a queue of alert rows streams
upward (one row per 0.08 s, 560×44, radius 10), each with a mono id and a tiny score bar. Rows
turn grey with a "false positive" tag at a ratio of 9 in 10. A counter reads up to **85–95%**
(two numbers, not a fake single value), in Inter 600 120 px white, with the source line
"Industry estimates of AML false-positive rates" in 14 px muted. Optional photo card (analyst at
night, 420×280) sits behind the queue at 70% opacity, duotoned.
Title chip top-left: "01 · Alert fatigue".
VO: "Problem one: alert fatigue. 85 to 95 percent of alerts are false positives. Analysts spend
their days clearing innocent customers."

**S4 · 17.0–26.0 s · Problem 2: the blind spot (the measured number).** The queue slides out
left; the columns return to full strength. The thread now draws a real ring: 9 account nodes
(14 px circles) across 4 lanes, edges in red `#d93a3f`. One column (Bank 012) brightens; nodes
outside it dim to stubs. A ring gauge (220 px, 14 px stroke) beside it fills from 0 to
**43.8%** over 1.4 s with a critically damped settle. Then a second figure counts nothing:
**"Whole ring seen: 0%"**. Source line: "Measured on IBM's AML dataset · 36 cross-bank rings ·
best-placed single bank". Title chip: "02 · Blind spots between banks".
VO: "Problem two: blind spots. On IBM's public laundering data we measured it. The best-placed
bank holds 43.8 percent of a ring, and it never sees the whole ring."

**S5 · 26.0–33.0 s · Problem 3: proof by hand.** The ring shrinks into the top-left corner (it
stays visible). Centre: a report page (640×820, white, radius 18, slight 6° tilt that settles
to 2°). Sentences appear as grey bars; each bar tries to connect a dashed line to a scattered
evidence scrap (screenshot thumbnails, a sticky note, an email snippet, optional "paper documents"
photo card). Three of the dashed lines break (amber `#c97a06`, a small gap opens). Title chip:
"03 · Reports nobody can verify". Headline: **"Today, the proof is put together by hand."**
VO: "Problem three: proof. A suspicious activity report has to justify itself, and today that
proof is put together by hand."

**S6 · 33.0–40.0 s · The turn.** Everything clears except the five columns and the dim ring. The
column walls slide down out of frame together (0.8 s, ease-in-out), so the lanes become thin
lines again. The thread redraws once, whole, in cyan `#087cf8`, through all the ring nodes
(1.2 s). Camera pulls back and the scene compresses horizontally until the five lanes become the
three lanes of the logo and the ring's thread becomes the logo's S-curve (shared element: the same
path morphs, no fade). The mark sits at 160 px in the centre; the wordmark **BankWeave** wipes out
to its right (Inter 600, 84 px, white); under it, word by word (0.06 s per word): "Many banks,
one ring, **every claim proven.**" (last three words in sky `#8ad8fc`). Hold 1.5 s. Final frame
matches Film 2's first frame colour so the cut is invisible.
VO: "BankWeave sees the whole ring, and proves every claim."
</structure>

<build>
1. One HTML file; lanes, thread and nodes in one SVG; the thread is a single path whose `d` is
   interpolated per scene (precompute the path points; morph by resampling both paths to 200
   points).
2. Thread drawing uses `stroke-dasharray` / `stroke-dashoffset` computed from `t`.
3. Column visibility = SVG `clipPath` per column; the thread outside the clips is a second copy at
   opacity 0 → 0.06 (barely there, by design).
4. Counters use closed-form critically damped interpolation, rounded only for display.
5. The 43.8% and 0% figures are read from `eval/results/E2_consortium_vs_single_bank.json` at
   build time, not typed by hand.
6. Photos: preload, apply the duotone with an SVG filter (`feColorMatrix` + `feComponentTransfer`).
7. Render at 60 fps with 4 subframes; review the S6 morph frame by frame.
</build>

<gotchas>
The headline in S2 and the chip in S3 must not occupy the same space at the same time: the
outgoing text finishes its exit before the next one rises. Five lanes at 260 px spacing must still
fit after the S3 camera drift: check the right edge. The logo morph only reads if the lane count
change (5 → 3) happens while the scene is compressing: merge lanes 1+2 and 4+5 in the same move.
Keep red for the ring edges and broken lines only.
</gotchas>

<start>
Show 5 stills before rendering: 3.0 s (the thread crossing lanes), 8.0 s (columns with cleared
alerts), 14.0 s (queue and 85–95%), 22.0 s (ring and 43.8% gauge), 38.5 s (logo and tagline).
</start>

---

## Film 2 · Landing fly-over (12 s)

Adapted from the 3D page fly-over brief, cut to 12 s and 1920×1080 so it drops straight into the
master edit.

<inputs>
Prefilled: link https://bankweave.vercel.app · brand BankWeave · mark as above · closing line
"Find the laundering ring" / *"no single bank can see."* · music: the shared track.
</inputs>

<direction>
A 12-second 3D fly-over of the BankWeave landing page, 1920×1080 at 60 fps. The page lies flat on
a bright studio floor (`#f4f6fa` in the middle, `#e7ebf1` in the corners) with a soft wide shadow
and 24 px rounded corners. One continuous camera, never a cut: it starts low over the night-blue
hero and glides backwards down the page at one steady speed while looking up it, rises straight
overhead to show the whole page as one strip, then dives into the hero and lands it as a card
under a two-line title. Focus is thin in front of the subject and almost none behind it. Cards
float slightly above the page with soft shadows; the console screenshot, the bento cards and the
stat chips lift off and stand up toward the lens as the camera passes them. Four small tiles of the
BankWeave mark lift off beside the hero's "Open the console" button and stay until the end card.
Title in Inter 600; the italic tail in Instrument Serif.
Banned: cuts, crossfades, stops or surges in the glide, the camera turning sideways, zoom in and
back out, glows, text over the page before the end card.
</direction>

<structure>
Flight 0–6.6 s, rise 6.2–7.6 s, overhead 7.6–7.8 s, dive 7.8–8.3 s, title card 8.3–12.0 s.
Camera 56° off straight-down, 1360 px from the look-at point, centred on the hero's headline
"Find the laundering ring no single bank can see".
- 0–0.5: glide eases in from rest. 0.1–1.2: the four mark tiles lift, grow to 140–180 px and hang
  outside the page's top corners; hero chips rise 60 px and stand up 30°.
- 1.1–1.4: glide reaches cruise (≈770 page px/s) as the hero falls behind.
- 1.4: "The console" section title crosses the centre; its screenshot lifts 110 px and stands up
  46°; two stat chips fly to ≈200 px and pass the frame edges at 2.2.
- 2.6–6.0: "Why a consortium graph", the bento grid, the FAQ pass at the same steady speed, each
  sharp as it crosses the middle; one mark tile drifts past the left edge, close and blurred, at 4.5.
- 6.0–6.6: glide eases off as the footer ("Triaged, investigated, cited, signed, approved.")
  arrives, footer title sharp at 6.5.
- 6.2–7.6: rise, zooming out at an even rate while the tilt flattens; the page's bottom edge settles
  42 px above the frame bottom.
- 7.6–7.8: whole page as one centred strip, creeping 3% closer.
- 7.8–8.3: dive; the top edge stays pinned while the page grows, everything below the hero fades
  into the floor colour, the hero lands as a 1340 px card with 38 px corners at y 330; two mark
  tiles sit on its top corners.
- 8.35: white badge pill (mark + "BankWeave", 22 px) fades in at y 60.
- 8.45: line 1 "Find the laundering ring" at 76 px, one word every 0.06 s.
- 8.7: italic tail "no single bank can see." at 84 px in `#8b8b92`, one word every 0.05 s, each
  rising 16 px out of a 12 px blur in 0.34 s.
- 9.0–12.0: hold, the card creeping 2% closer. The last 0.3 s match-cuts to the live console
  (the same hero card scales into the browser window of the screen recording).
</structure>

<build>
1. Capture: Playwright, Chromium, 1440 px wide, device scale 2. Scroll to the bottom once so the
   scroll reveals finish (`.hero-in` and reveal classes), then lock the page. Mark lifting pieces
   with `data-layer`; screenshot the page with them hidden, then each piece alone on transparent
   with 28 px padding; save positions to JSON.
2. One WebGL2 film page: the page is a textured quad, each piece its own quad at its height, drawn
   lowest first, mipmaps + 16× anisotropic filtering.
3. Camera from one speed curve integrated into page position (0 at 0 s, 0.5 by 0.5 s, 1.0 by
   1.4 s, held 0.94–1.1 to 6.0 s, easing to 0.12 by 6.7 s). Focal length 1880 px, 56° tilt,
   distance easing 1360 → 1700 px, never back in.
4. Depth of field per pixel: blur = 75 × (focus − depth)/depth in front, 6 × (depth − focus)/depth
   behind, capped 120 px, 40 golden-angle taps.
5. Lifted pieces stand up about their own middle; shadow = same picture in flat `#0c1a2e`, offset
   (0.10z, 4 + 0.36z), blur 7 + 0.5z, 24% opacity.
6. Render on the GPU (`--enable-gpu --ignore-gpu-blocklist`), 60 fps, 16 subframes across 0.7 of a
   frame, H.264.
</build>

<gotchas>
The hero is dark navy on a light floor: fade pieces into the floor colour, not to transparent,
or the dark shows through. The Render API may be asleep when capturing; the landing page itself is
static on Vercel, but wait for the dashboard screenshot images to load before capturing. Keep
lifts small (20–40 px) except the named ones. Measure a 30 fps preview with optical flow: the glide
speed must never dip.
</gotchas>

<start>
Capture the page, then show stills at 0, 1.4, 2.2, 4.5, 7.7 and 9.5 s before rendering.
</start>

---

## Film 3 · Card tap to signed report (hardware edge, 10 s)

Adapted from the Apple-keynote square sting: white, bright, glassy, but 1920×1080 and in BankWeave
blues.

<inputs>
Prefilled: real values from the Hardware Lab (terminal id `D00063`, IFD serial `A0009101`, the
Mumbai → Delhi preset). Optional: a screenshot of EMVLab decoding field 55
(`docs/img/falkordb/03-browser-card-taps.png`, `docs/media/emvlab-decode.gif`).
</inputs>

<direction>
A 10-second sting, 1920×1080, 60 fps, that shows one idea: **the evidence chain starts at the card
tap and ends in a human signature.** Light, precise, keynote feel: page `#fdfdfb`, ice `#e6f0fa`,
deep `#0b2a5b`, cyan `#087cf8`, ok green `#0c9466`, a gold touch ring (`#d9b45a`) only on the
security key. Every shot enters already moving and leaves on an accelerating move; blur follows
speed and direction. A permanent 14 px label bottom-left: "Simulated devices · real cryptography".
Banned: crossfades, chip-hacking imagery, padlocks, glows on text.
</direction>

<structure>
- **0.0–1.6 · Tap.** A card (credit-card proportions, deep-blue gradient, white contactless mark)
  slides in from the right, accelerating then easing, and taps a frosted POS terminal (screen reads
  "D00063"). On contact: a single ring pulse in cyan (one, not repeating) and a soft click.
- **1.6–3.2 · Bytes.** The terminal's screen unfolds into a strip of ISO 8583 fields and EMV TLV in
  JetBrains Mono (`9F26`, `9F36 ATC`, `9F1E A0009101`), typing at about 1 char per frame with tiny
  holds. The fields `terminal_id`, `emv_atc`, `gps` lift out as three chips.
- **3.2–4.8 · Into the graph.** The chips fly into a small graph: Card node, Terminal node, Account
  node; they become the properties of a `USES_DEVICE` edge (the label types itself on the edge). A
  second and third card join the same terminal within the same beat: the terminal node turns red,
  label "3 cards · 30 s · mule ring".
- **4.8–6.4 · Into a claim.** The graph shrinks into a card titled "Claim · shared terminal" with
  an evidence row reading `origin attr:D00063`; two more evidence rows stack; at the bottom a
  Merkle root hash types in, 64 hex chars, mono, truncated with "…".
- **6.4–8.2 · Signed.** A security key (white USB-C key with a gold touch ring) rises from below; a
  fingertip shape presses; the ring brightens once; a green seal "Signed · ES256" stamps (spring,
  no bounce) onto the claim card.
- **8.2–10.0 · Seal breaks.** One evidence row turns amber "revoked"; the Merkle hash re-types
  with different characters; the seal splits along a diagonal into two halves that drift 8 px apart
  in red: "Merkle seal broken". Hard cut to the live Hardware Lab recording on the beat.
</structure>

<build>
Same pipeline as the shared section. Hex strings come from a real dossier
(`/cases/<id>/dossier`) captured before the build; never generate random hex. The terminal, card
and key are SVG drawings, not images.
</build>

<gotchas>
Mono text typing at 60 fps looks frantic: advance by characters on a 30 fps grid. The amber
"revoked" state must read before the seal splits (hold 0.3 s). Keep the "simulated" label legible
on every frame.
</gotchas>

<start>
Show stills at 1.4, 2.8, 4.4, 7.6 and 9.4 s before rendering.
</start>

---

## Film 4 · Ask the graph (MCP, 12 s)

Adapted from the chat-composer launch film: a prompt, a think phase, a drop, an answer.

<inputs>
Prefilled: client Claude; request typed into it: "Find the laundering rings across banks and
prove the strongest one."; MCP endpoint `bankweave-api.onrender.com/mcp`; tool names from
`backend/app/mcp_server.py`: `find_rings`, `trace_money_path`, `explain_claim`, `run_readonly_cypher`.
</inputs>

<direction>
A 12-second film, 1920×1080, 60 fps, 2D only, one continuous take. Warm light canvas `#f4f6fa`,
dark UI `#0c1a2e`, cyan `#087cf8` for the send button and live data, a soft iridescent ring around
the composer limited to the brand blues (cyan → sky → navy, no pink or purple). Shared-element
transitions only: the send button becomes the tool-call rail; the tool result becomes the answer
card.
Banned: crossfades, blur-ins, 3D, particles, camera moves that reverse direction.
</direction>

<structure>
120 BPM, 24 beats.
- **Beats 0–6 · Ask.** Push slowly into a composer (about 2.5× zoom). Type the request over two
  fixed lines with a natural keystroke rhythm. A small connector chip under the composer:
  "BankWeave MCP · read-only".
- **Beat 6 · Send.** Press send; a cyan ripple turns the text into a chat bubble; pull back once to
  reveal a chat window.
- **Beats 6–12 · Tools.** The send button stretches into a vertical rail; four tool-call pills land
  on beats 8, 9, 10, 11: `find_rings` → `trace_money_path` → `explain_claim` →
  `run_readonly_cypher`. Each pill expands for half a beat to show one line of real Cypher
  (`CALL algo.SPpaths(...)`) and a time in ms, then collapses.
- **Beat 12 · The drop.** A deep-blue circle expands from the last pill to fill the frame in
  ≈0.35 s; on it, the ring draws itself: nodes across four bank lanes, the thread in sky blue.
- **Beats 12–18 · Answer.** The blue contracts into an answer card in the chat: "Ring across
  4 banks · hub account · 12 independent origins", each phrase underlined with a thin link to an
  evidence id. A pill reads "Every result includes the Cypher it ran".
- **Beats 18–24 · Lock.** A small badge slides in: "GRAPH.RO_QUERY · writes refused by FalkorDB".
  The chat window scales down into the BankWeave mark, hard cut to the live Claude recording.
</structure>

<build>
Same pipeline. Copy the Cypher strings and ms timings from a real MCP call (Lab → MCP tools)
before building; do not invent query text.
</build>

<gotchas>
Keep the typed request on fixed lines so the camera never follows a wrapping cursor. The flood must
reach the farthest corner in ≈0.35 s or it reads as a flash. Set z-index so pills never float above
the flood.
</gotchas>

<start>
Show the beat map and 4 stills (ask, tools, drop, answer) before rendering.
</start>

---

## Film 5 · Every claim proven (end card, 8 s)

<inputs>
Prefilled: mark, wordmark, tagline, live URL `bankweave.vercel.app`, repo URL, "Built on FalkorDB"
(plain text, no FalkorDB logo unless you have permission to use it).
</inputs>

<direction>
An 8-second end card, 1920×1080, 60 fps, night-blue radial background (`#071c3d` corners,
`#0b2a5b` centre). Calm and final. Banned: glow halos, particles, spinning logos.
</direction>

<structure>
- **0.0–1.2:** three bank lanes draw from top to bottom in mist grey (staggered 0.1 s), 220 px
  tall, centred.
- **1.2–2.2:** a sky-blue thread draws across them in one stroke, and the lanes and thread resolve
  into the B mark (`logo-white.png`) with a mask wipe.
- **2.2–3.0:** the mark scales down to 120 px and moves left; the wordmark "BankWeave" wipes out
  from behind it (Inter 600, 96 px, white), mark and letters never overlapping.
- **3.0–4.2:** under it, word by word: "Many banks, one ring," (white) then *"every claim proven."*
  (Instrument Serif italic, sky blue).
- **4.2–5.0:** a thin row fades up: `bankweave.vercel.app · github.com/LSUDOKO/BankWeave · Built on
  FalkorDB` (JetBrains Mono 20 px, muted).
- **5.0–8.0:** hold, everything creeping 2% closer. Music resolves on 5.0.
</structure>

<build>Same pipeline. Use `frontend/public/logo-white.png` for the mark.</build>

<gotchas>Check the repo URL before rendering. The italic tail must sit on the same baseline as the
first half.</gotchas>

<start>Show stills at 1.0, 2.6 and 6.0 s.</start>
