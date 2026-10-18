"""Assemble the BankWeave demo video from films, screen clips, narration and captions.

Inputs (all under video/):
  films/film1.mp4            the problem film (has its own music)
  films/film3|4|5.mp4        motion-graphics stings (optional; skipped if missing)
  clips/<segment>.mp4        silent screen recordings, 1920x1080
  vo/<segment>.mp3           narration, vo/<segment>.words.json word timings
Output: bankweave-demo.mp4 (1920x1080, 30 fps, H.264 + AAC, captions burned in)
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
W = Path(os.environ.get("VBUILD", "/tmp/bankweave-vbuild"))  # tmpfs: the root disk is nearly full
W.mkdir(parents=True, exist_ok=True)
FPS = 30
LEAD = 0.45   # silence before the voice starts in each segment
TAIL = 0.6    # breath after the voice ends

# (video source, narration id or None, minimum length, how loud the source's own audio stays)
PLAN = [
    ("films/film1.mp4", "00-problem", 40.0, 0.28),
    ("clips/01-landing.mp4", "01-landing", 0, 0),
    ("clips/02-explainer.mp4", "02-explainer", 0, 0),
    ("clips/03-dashboard.mp4", "03-dashboard", 0, 0),
    ("clips/04-alerts.mp4", "04-alerts", 0, 0),
    ("clips/05-ring.mp4", "05-ring", 0, 0),
    ("clips/06-case.mp4", "06-case", 0, 0),
    ("clips/07-approval.mp4", "07-approval", 0, 0),
    ("films/film3.mp4", None, 0, 0),
    ("clips/08-hardware.mp4", "08-hardware", 0, 0),
    ("films/film4.mp4", None, 0, 0),
    ("clips/09-mcp.mp4", "09-mcp", 0, 0),
    ("clips/10-browser.mp4", "10-browser", 0, 0),
    ("clips/11-lab.mp4", "11-lab", 0, 0),
    ("clips/12-eval.mp4", "12-eval", 0, 0),
    ("films/film5.mp4|clips/13-end.mp4", "13-end", 0, 0),
]


LONG = "--long" in sys.argv
if LONG:
    # main cut: the whiteboard explains problems 01 and 02, so it replaces the film's first 26 s;
    # the film picks up at "Problem three: proof" with only that part of the narration
    PLAN[0:1] = [("whiteboard/whiteboard.mp4", None, 0, 1.0),
                 ("films/film1-tail.mp4", "00b-problem3", 13.8, 0.28)]


def dur(p: Path) -> float:
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)])
    return float(out.decode().strip())


def run(*a):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *a], check=True)


def ts(t: float) -> str:
    h, r = divmod(max(t, 0), 3600)
    m, s = divmod(r, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def restore(words, text):
    """WordBoundary drops punctuation; map each word back onto the script text to recover it."""
    pos, out = 0, []
    for k, w in enumerate(words):
        i = text.find(w["w"], pos)
        if i < 0:
            out.append(w); continue
        nxt = text.find(words[k + 1]["w"], i + len(w["w"])) if k + 1 < len(words) else len(text)
        if nxt < 0:
            nxt = i + len(w["w"])
        out.append({**w, "w": text[i:nxt].strip()})
        pos = i + len(w["w"])
    return out


def chunks(words):
    """Group words into caption lines: break at sentence ends or after ~7 words / 42 chars."""
    out, cur = [], []
    for w in words:
        cur.append(w)
        text = " ".join(x["w"] for x in cur)
        if w["w"].endswith((".", "?", "!", ":")) or len(cur) >= 8 or len(text) > 44:
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


LINES = json.load(open(ROOT / "vo" / "lines.json"))
segs, captions, t0 = [], [], 0.0
bed_start, own_music = 0.0, True
for i, (src, vo, minlen, keep) in enumerate(PLAN):
    path = next((ROOT / s for s in src.split("|") if (ROOT / s).exists()), None)
    if path is None:
        print("skip (missing)", src)
        continue
    vlen = dur(path)
    vo_path = ROOT / "vo" / f"{vo}.mp3" if vo else None
    lead = {"00-problem": 1.0, "00b-problem3": 0.55}.get(vo, LEAD)
    T = vlen if not vo else max(minlen, lead + dur(vo_path) + TAIL)
    if not vo:
        T = vlen
    out = W / f"seg{i:02d}.mp4"
    vf = (f"scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0b2a5b,"
          f"fps={FPS},tpad=stop_mode=clone:stop_duration=30,trim=duration={T:.3f},setpts=PTS-STARTPTS,format=yuv420p")
    has_audio = b"audio" in subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", str(path)])
    inputs = ["-i", str(path)]
    parts = []
    if vo:
        inputs += ["-i", str(vo_path)]
        parts.append(f"[1:a]aresample=48000,adelay={int(lead*1000)}|{int(lead*1000)},apad,atrim=duration={T:.3f}[v]")
    if has_audio and (keep or not vo):
        parts.append(f"[0:a]aresample=48000,volume={keep or 1.0},apad,atrim=duration={T:.3f}[s]")
    if not parts:
        parts.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={T:.3f}[v]")
    labels = "".join(f"[{p.split('[')[-1]}" for p in parts)
    n = len(parts)
    fc = ";".join(parts) + (f";{labels}amix=inputs={n}:normalize=0,aformat=channel_layouts=stereo[a]" if n > 1 else f";{labels}aformat=channel_layouts=stereo[a]")
    run(*inputs, "-filter_complex", f"[0:v]{vf}[vv];{fc}", "-map", "[vv]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", str(FPS), "-c:a", "aac", "-b:a", "192k", "-ar", "48000", str(out))
    if vo:
        words = restore(json.load(open(ROOT / "vo" / f"{vo}.words.json")), LINES[vo])
        for c in chunks(words):
            a = t0 + lead + c[0]["t"]
            b = t0 + lead + c[-1]["t"] + c[-1]["d"] + 0.12
            captions.append((a, b, " ".join(x["w"] for x in c)))
    segs.append(out)
    if own_music and keep:
        bed_start = t0 + T
    else:
        own_music = False
    print(f"{i:02d} {path.name:22s} {T:6.2f}s  at {t0:6.2f}s")
    t0 += T

# captions: Inter Tight, white on a soft navy box, lower third
for k in range(len(captions) - 1):
    a, b, s = captions[k]
    captions[k] = (a, min(b, captions[k + 1][0] - 0.02), s)
ass = W / "captions.ass"
with open(ass, "w") as f:
    f.write("[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\n"
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
            "Style: Cap,Inter Tight,42,&H00FFFFFF,&H00FFFFFF,&H405B2A0B,&H405B2A0B,-1,0,0,0,100,100,0,0,3,16,0,2,160,160,60,1\n\n"
            "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    for a, b, s in captions:
        f.write(f"Dialogue: 0,{ts(a)},{ts(b)},Cap,,0,0,0,,{s}\n")

lst = W / "list.txt"
lst.write_text("".join(f"file '{p}'\n" for p in segs))
joined = W / "joined.mp4"
run("-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(joined))
total = dur(joined)

# music bed: a soft synthesised pad from the end of the problem film onwards, ducked well under the voice
pad = W / "pad.wav"
run("-f", "lavfi", "-i",
    f"aevalsrc='0.20*sin(2*PI*110*t)*(0.6+0.4*sin(2*PI*0.07*t))+0.14*sin(2*PI*164.81*t)*(0.6+0.4*sin(2*PI*0.05*t+1))"
    f"+0.12*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*0.09*t+2))+0.08*sin(2*PI*277.18*t)*(0.5+0.5*sin(2*PI*0.06*t+3))':s=48000:d={total:.2f}",
    "-af", f"lowpass=f=900,aecho=0.8:0.7:120|240:0.25|0.18,volume=0.11,afade=t=in:st={bed_start:.2f}:d=3,"
           f"afade=t=out:st={max(total-4,0):.2f}:d=4", "-ac", "2", str(pad))
final = ROOT / ("bankweave-demo-long.mp4" if LONG else "bankweave-demo.mp4")
run("-i", str(joined), "-i", str(pad), "-filter_complex",
    f"[0:v]ass={ass}[v];[1:a]volume=volume=0:enable='lt(t,{bed_start:.2f})'[p];[0:a][p]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]",
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", str(final))
print(f"wrote {final} {dur(final):.1f}s, {os.path.getsize(final)/1e6:.1f} MB")
