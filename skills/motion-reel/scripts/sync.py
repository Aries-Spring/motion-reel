# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10", "numpy", "matplotlib"]
# ///
"""Plot the mix's onset envelope against the film's visual hits.

    node <skill>/scripts/render.mjs --film <film> --hits && uv run <skill>/scripts/sync.py <film>

Run from the project folder. Writes out/<film>/sync.png. For each visual hit it reports the nearest
audio onset and the offset (positive = sound after picture).
"""
import json
import sys
from pathlib import Path

import librosa
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path.cwd()
if len(sys.argv) < 2 or not (ROOT / sys.argv[1] / "film.json").exists():
    sys.exit("usage: uv run sync.py <film>   (from the folder that holds <film>/film.json)")
FILM = sys.argv[1]
OUT = ROOT / "out" / FILM
hits = json.loads((OUT / "hits.json").read_text())
y, sr = librosa.load(ROOT / FILM / "audio" / "mix.wav", sr=None, mono=True)
hop = 128
env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
times = librosa.times_like(env, sr=sr, hop_length=hop)
onsets = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, backtrack=True,
                                    units="time", delta=0.04)

DUR = json.loads((ROOT / FILM / "film.json").read_text()).get("duration", 15)
ROWS = int(np.ceil(DUR / 3.75))
fig, axes = plt.subplots(ROWS, 1, figsize=(22, 2.75 * ROWS))
for k, ax in enumerate(axes):
    a, b = k * 3.75, (k + 1) * 3.75
    m = (times >= a) & (times < b)
    ax.plot(times[m], env[m], color="#141413", lw=0.8)
    for o in onsets[(onsets >= a) & (onsets < b)]:
        ax.axvline(o, color="#87867f", lw=0.6, ls=":")
    for h in hits:
        if a <= h["t"] < b:
            ax.axvline(h["t"], color="#D97757", lw=1.6, alpha=0.85)
            ax.text(h["t"], env.max() * 0.92, f" {h['label']}", rotation=90, va="top", fontsize=8, color="#9E5037")
    ax.set_xlim(a, b)
    ax.set_yticks([])
axes[0].set_title("onset envelope (black), detected onsets (dotted), visual hits (clay)")
fig.tight_layout()
fig.savefig(OUT / "sync.png", dpi=90)

rows = []
for h in hits:
    d = onsets - h["t"]
    near = d[np.argmin(np.abs(d))] if len(d) else np.nan
    rows.append((h["beat"], h["label"], near * 1000))
    print(f"b{h['beat']:<6} {h['label']:<22} nearest onset {near * 1000:+7.1f} ms")
off = np.array([r[2] for r in rows])
print(f"\n{np.sum(np.abs(off) <= 20)}/{len(off)} hits within 20 ms of an onset; "
      f"median |offset| {np.median(np.abs(off)):.1f} ms")
