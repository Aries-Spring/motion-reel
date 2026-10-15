# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10.2", "numpy", "scipy", "soundfile"]
# ///
"""Lyric timing, step 2: PocketSphinx's word times (tools/sphinx_align.py) made musical.

    uv run being-tested/tools/refine.py being-tested     -> lyrics.json, lipsync.json (align.py's formats)

1. Per line, the windowed alignment where it succeeded, else the whole-song pass.
2. Repeats share one performance: the vocal's chroma says pre-chorus + chorus 2 are pre-chorus +
   chorus 1 shifted exactly 136 beats, and the final chorus's first, fifth and sixth lines are
   chorus 1's shifted 297 beats (tools/regcorr check). Those lines are copied on the beat map from
   the chorus-1 take, which is where both sphinx passes agree.
3. Every word start snaps to a vocal onset within 0.18 s when one is there (DP: monotonic, >= 70 ms
   apart, onset strength vs distance from the sphinx time). Word ends run to the next word, capped
   where the vocal energy falls away.
4. Mouth envelope: align.py's recipe (180-3800 Hz band, 100 Hz, gated and compressed to 0..1).
"""
import json, re, sys
from pathlib import Path
import numpy as np, soundfile as sf, librosa
from scipy.signal import butter, sosfiltfilt

film = Path(sys.argv[1])
B = json.loads((film / "beats.json").read_text()); m = np.array(B["map"]); m0 = B["map0"]
U = lambda t: float(np.interp(t, m, np.arange(len(m)) - m0))
TS = lambda u: float(np.interp(u + m0, np.arange(len(m)), m))

sheet, sections = [], []
sec = None
for raw in (film / "docs" / "lyrics_meta.txt").read_text().splitlines():
    s = raw.strip()
    if s.startswith("["): sec = s.strip("[]").lower().replace(" ", "-"); continue
    if not s or s.startswith("(") or s == "...": continue
    sheet.append(s); sections.append(sec)

whole = json.loads((film / "docs" / "sphinx_whole.json").read_text())
win = {l["text"] + f"@{round(l['t0'])}": l for f in ("sphinx_windowed.json", "sphinx_retry.json")
       for l in json.loads((film / "docs" / f).read_text())}   # retry: tighter windows for the bridge and outro
assert len(whole) == len(sheet)
lines = []
for i, L in enumerate(whole):
    best = L
    for k, W in win.items():
        if W["text"] == L["text"] and abs(W["t0"] - L["t0"]) < 6: best = W   # later files win
    lines.append({"text": sheet[i], "section": sections[i], "words": [dict(w) for w in best["words"]]})

def copy_line(src, dst, shift):
    ws = lines[src]["words"]; wd = lines[dst]["words"]
    assert len(ws) == len(wd), (src, dst)
    for a, b in zip(ws, wd):
        b["t0"] = round(TS(U(a["t0"]) + shift), 3); b["t1"] = round(TS(U(a["t1"]) + shift), 3)
for k in range(8):                 # pre-chorus 1 + chorus 1 (lines 8..15) -> pre 2 + chorus 2 (24..31)
    copy_line(8 + k, 24 + k, 136)
for s, d in ((10, 42), (14, 46), (15, 47)):
    copy_line(s, d, 297)

# whispered outro: sphinx pins the first word to the window edge; the vocal has two clear breaths
# per line (202.06-202.82 / 203.67-204.66 and 208.15-209.19 s), so the words go on them
for li, ts in ((48, [(202.08, 202.40), (202.42, 202.82), (203.67, 204.66)]),
               (49, [(208.15, 208.36), (208.38, 208.6), (208.62, 208.74), (208.76, 209.19)])):
    for w, (a, b) in zip(lines[li]["words"], ts): w["t0"], w["t1"] = a, b

# vocal onsets + energy
y, sr = librosa.load(film / "audio" / "stems" / "vocals.wav", sr=22050, mono=True)
hop = 110
env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
on_f = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, backtrack=True, delta=0.03)
on_t = librosa.frames_to_time(on_f, sr=sr, hop_length=hop)
peak_f = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, backtrack=False, delta=0.03)
strength = env[peak_f] / (np.percentile(env, 99) + 1e-9)
rms = librosa.feature.rms(y=y, hop_length=hop)[0]; rdb = 20 * np.log10(rms + 1e-9); rt = librosa.times_like(rms, sr=sr, hop_length=hop)
ref = np.percentile(rdb, 95)

def snap(words, lo, hi):
    n = len(words)
    prior = np.array([w["t0"] for w in words])
    cands = []
    for w in prior:
        c = [(w, 0.9)]                      # staying put costs a little
        for t, s in zip(on_t, strength):
            if abs(t - w) < 0.18 and lo <= t <= hi: c.append((float(t), 0.9 - min(1.0, s) * 0.8 + (abs(t - w) / 0.18) ** 2 * 0.5))
        cands.append(c)
    INF = 1e9
    cost = [np.full(len(c), INF) for c in cands]; back = [np.zeros(len(c), int) for c in cands]
    cost[0] = np.array([c[1] for c in cands[0]])
    for i in range(1, n):
        for j, (t, cj) in enumerate(cands[i]):
            for k, (tp, _) in enumerate(cands[i - 1]):
                if t - tp >= 0.07 and cost[i - 1][k] + cj < cost[i][j]:
                    cost[i][j] = cost[i - 1][k] + cj; back[i][j] = k
    j = int(np.argmin(cost[-1]))
    if cost[-1][j] >= INF: return prior
    out = [0.0] * n
    for i in range(n - 1, -1, -1):
        out[i] = cands[i][j][0]; j = back[i][j]
    return np.array(out)

for li, L in enumerate(lines):
    lo = lines[li - 1]["words"][-1]["t0"] + 0.07 if li else 0
    hi = lines[li + 1]["words"][0]["t0"] - 0.07 if li + 1 < len(lines) else 1e9
    t0s = snap(L["words"], lo, hi)
    for i, w in enumerate(L["words"]):
        w["t0"] = round(float(t0s[i]), 3)
    for i, w in enumerate(L["words"]):
        nxt = L["words"][i + 1]["t0"] if i + 1 < len(L["words"]) else None
        end = max(w["t1"], w["t0"] + 0.12)
        if nxt is not None: end = nxt
        # cap where the vocal energy drops 18 dB under its 95th percentile for 80 ms
        k = np.searchsorted(rt, w["t0"] + 0.08)
        while k < len(rt) - 8 and rt[k] < end and not np.all(rdb[k:k + 8] < ref - 18): k += 1
        w["t1"] = round(float(min(end, rt[min(k, len(rt) - 1)])), 3)
        w["w"] = re.sub(r"\(\d+\)$", "", w["w"])
    L["t0"], L["t1"] = L["words"][0]["t0"], L["words"][-1]["t1"]
    # display words: the sheet's own spelling and punctuation, mapped onto the aligned tokens
    disp = L["text"].split(); toks = L["words"]
    if len(disp) != len(toks):  # IDE was aligned as three letters: fold them back into one word
        merged, i = [], 0
        for dw in disp:
            n = 3 if re.sub(r"[^A-Za-z]", "", dw).lower() == "ide" else 1
            g = toks[i:i + n]; i += n
            merged.append({"w": g[0]["w"], "t0": g[0]["t0"], "t1": g[-1]["t1"]})
        toks = merged
    for d, w in zip(disp, toks): w["w"] = d
    L["words"] = toks

# a line never runs into the next one: words that start after the next line's first word are
# respaced evenly between the last word that fits and 0.12 s before it
for li in range(len(lines) - 1):
    W, nxt = lines[li]["words"], lines[li + 1]["words"][0]["t0"]
    bad = [i for i, w in enumerate(W) if w["t0"] > nxt - 0.12]
    if bad:
        i0 = bad[0]; a = W[i0 - 1]["t0"] if i0 else lines[li]["words"][0]["t0"]
        n = len(W) - i0 + 1
        for j, i in enumerate(range(i0, len(W))):
            W[i]["t0"] = round(a + (nxt - 0.12 - a) * (j + 1) / n, 3)
        print(f"line {li}: respaced {len(bad)} word(s) before line {li + 1}")
    for i, w in enumerate(W):
        lim = W[i + 1]["t0"] if i + 1 < len(W) else nxt - 0.03
        w["t1"] = round(min(max(w["t1"], w["t0"] + 0.08), lim), 3)
    lines[li]["t0"], lines[li]["t1"] = W[0]["t0"], W[-1]["t1"]

d = np.array([on_t[np.argmin(np.abs(on_t - w["t0"]))] - w["t0"] for L in lines for w in L["words"]])
print(f"{sum(len(L['words']) for L in lines)} words; starts on a vocal onset (<20 ms): {np.mean(np.abs(d) < 0.02) * 100:.0f}%")
for i, L in enumerate(lines):
    long = [w["w"] for w in L["words"][:-1] if w["t1"] - w["t0"] > 1.3]
    print(f"{i:2d} {L['section']:<13} {L['t0']:7.2f}-{L['t1']:7.2f}  b{U(L['t0']):6.1f}  {len(L['words'])}w{'  long: ' + ','.join(long) if long else ''}")
(film / "lyrics.json").write_text(json.dumps({"source": "docs/lyrics_meta.txt aligned to audio/stems/vocals.wav (PocketSphinx + repeats + onset snap; tools/refine.py)", "lines": lines}, indent=1))

# mouth envelope, as align.py
yv, svr = sf.read(film / "audio" / "stems" / "vocals.wav"); yv = yv.mean(1) if yv.ndim > 1 else yv
band = sosfiltfilt(butter(4, [180, 3800], "bandpass", fs=svr, output="sos"), yv)
h = svr // 100
r = np.sqrt(np.array([np.mean(band[i:i + h] ** 2) for i in range(0, len(band) - h, h)]) + 1e-12)
db = 20 * np.log10(r); rf = np.percentile(db[db > -60], 95)
o = np.clip((db - (rf - 30)) / 30, 0, 1) ** 1.3
o = np.convolve(o, np.ones(3) / 3, mode="same")
(film / "lipsync.json").write_text(json.dumps({"rate": 100, "open": [round(float(x), 3) for x in o]}))
print(f"-> lyrics.json ({len(lines)} lines), lipsync.json ({len(o)} frames)")
