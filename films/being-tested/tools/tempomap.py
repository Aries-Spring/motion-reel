# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10.2", "numpy", "scipy", "soundfile"]
# ///
"""Variable-tempo beat map for a track that drifts (this one speeds up from ~131 to ~137.5 bpm).

    MOTION_REEL_SKILL=<skill> uv run being-tested/tools/tempomap.py being-tested [--downbeat SECONDS]

beats.py fits ONE straight line t = offset + k*period; on a drifting track that line is up to 200 ms
off. This keeps beats.py's fields (so every skill script still runs) and adds a measured beat for
every beat of the song:
  map      [t of beat -p, ..., t of beat 0, t of beat 1, ...]   (seconds)
  map0     index of beat 0 in map (the first downbeat)
lib/motion.js (this film's copy) interpolates U(t) / TS(u) through the map. offset/period become the
line through beat 0 with the song's mean period; film.js linearises its HITS against that line so
render.mjs --hits (offset + b * period) lands every hit on the measured beat.
"""
import json, os, sys
from pathlib import Path
import numpy as np
import librosa
from scipy.ndimage import median_filter
from scipy.interpolate import UnivariateSpline

sys.path.insert(0, os.path.join(os.environ["MOTION_REEL_SKILL"], "scripts"))
import dsp  # noqa: E402

film = Path(sys.argv[1])
downbeat = float(sys.argv[sys.argv.index("--downbeat") + 1]) if "--downbeat" in sys.argv else None
SR, HOP = 44100, 128
y, _ = librosa.load(film / "audio" / "song.mp3", sr=SR, mono=True)
env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP, aggregate=np.median)
fps = SR / HOP
dur = len(y) / SR

# 1. local tempo every 2 s from the autocorrelation of a 12 s window, smoothed into a curve
cent, bpms = [], []
win = int(12 * fps)
for s in range(0, len(env) - win, int(2 * fps)):
    seg = env[s:s + win] - env[s:s + win].mean()
    ac = librosa.autocorrelate(seg)
    lag = np.arange(len(ac)) / fps
    with np.errstate(divide="ignore"):
        b = 60 / lag
    m = (b > 122) & (b < 146)
    i = int(np.argmax(np.where(m, ac, -np.inf)))
    a0, a1, a2 = ac[i - 1], ac[i], ac[i + 1]
    d = 0.5 * (a0 - a2) / (a0 - 2 * a1 + a2)
    cent.append((s + win / 2) / fps)
    bpms.append(60 / ((i + d) / fps))
cent, bpms = np.array(cent), median_filter(np.array(bpms), 7, mode="nearest")
frame_t = librosa.frames_to_time(np.arange(len(env)), sr=SR, hop_length=HOP)
curve = np.interp(frame_t, cent, bpms)

# 2. dynamic-programming tracker on that curve, snapped to backtracked onsets (true attacks)
_, frames = librosa.beat.beat_track(onset_envelope=env, sr=SR, hop_length=HOP, bpm=curve, tightness=300, units="frames", trim=False)
tracked = librosa.frames_to_time(frames, sr=SR, hop_length=HOP)
onsets = librosa.onset.onset_detect(onset_envelope=env, sr=SR, hop_length=HOP, backtrack=True, units="time")
snap = np.array([onsets[np.argmin(np.abs(onsets - t))] if np.min(np.abs(onsets - t)) < 0.035 else t for t in tracked])

# 3. index every beat by the local period (fills a dropped beat, merges a doubled one), then a
#    smoothing spline of time vs beat index: the tempo moves smoothly, the onsets jitter
loc = lambda t: 60 / np.interp(t, cent, bpms)
idx = [0]
for a, b in zip(snap[:-1], snap[1:]):
    idx.append(idx[-1] + max(1, int(round((b - a) / loc((a + b) / 2)))))
idx = np.array(idx, float)
keep = np.ones(len(snap), bool)
for _ in range(5):
    sp = UnivariateSpline(idx[keep], snap[keep], k=3, s=keep.sum() * 0.012 ** 2)
    res = snap - sp(idx)
    keep = np.abs(res) < max(0.012, 3 * np.median(np.abs(res[keep])))
k_all = np.arange(idx[0] - 4, idx[-1] + 8)
grid = sp(k_all)
# extend past the tracked ends with the end periods, then clip to the song
p0, p1 = grid[1] - grid[0], grid[-1] - grid[-2]
while grid[0] - p0 > -p0: grid = np.concatenate([[grid[0] - p0], grid]); k_all = np.concatenate([[k_all[0] - 1], k_all])
while grid[-1] + p1 < dur + p1: grid = np.concatenate([grid, [grid[-1] + p1]]); k_all = np.concatenate([k_all, [k_all[-1] + 1]])
grid = grid[grid > -0.05]
inl = np.abs(res[keep])
print(f"tracked {len(snap)} beats, {keep.sum()} inliers, spline rms {np.sqrt(np.mean(inl ** 2)) * 1000:.1f} ms, "
      f"tempo {60 / np.diff(grid)[:20].mean():.2f} -> {60 / np.diff(grid)[-20:].mean():.2f} bpm")

# 4. downbeat phase (harmonic change + kick, as beats.py), beat 0 = the first downbeat
if downbeat is not None:
    phase = int(np.argmin(np.abs(grid - downbeat))) % 4
else:
    phase, why = dsp.downbeat_phase(y, SR, grid)
    print(f"downbeat phase {phase}: score {why['score']}")
map0 = phase
offset = float(grid[map0])
period = float((grid[-1] - grid[map0]) / (len(grid) - 1 - map0))

# 5. bar energy on the real bars
rms = librosa.feature.rms(y=y, hop_length=512)[0]
rt = librosa.times_like(rms, sr=SR, hop_length=512)
bars = grid[map0::4]
bar_energy = [round(float(rms[(rt >= a) & (rt < b)].mean()), 4) for a, b in zip(bars[:-1], bars[1:]) if b <= dur + 0.01]

old = json.loads((film / "beats.json").read_text())
old.update({
    "bpm": round(60 / period, 3), "period": round(period, 6), "offset": round(offset, 5),
    "beats": [round(float(t), 5) for t in grid if t < dur], "map": [round(float(t), 5) for t in grid], "map0": int(map0),
    "downbeats": [round(float(t), 5) for t in grid[map0::4] if t < dur], "bar_energy": bar_energy,
    "detected": [round(float(t), 4) for t in snap], "fit_inliers": int(keep.sum()),
    "fit_residual_ms": round(float(np.sqrt(np.mean(inl ** 2)) * 1000), 2),
    "tempo_curve": {"t": [round(float(x), 2) for x in cent], "bpm": [round(float(x), 3) for x in bpms]},
    "source": "song.mp3, whole track; variable-tempo map (tools/tempomap.py)",
})
(film / "beats.json").write_text(json.dumps(old, indent=1))
print(f"beat 0 at {offset:.3f}s; {len(grid)} mapped beats; mean period {period * 1000:.2f} ms -> {film}/beats.json")
