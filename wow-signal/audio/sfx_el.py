# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10", "numpy", "scipy", "soundfile"]
# ///
"""Lay the ElevenLabs sound effects onto the film's own hit list, after sfx.mjs.

    node <skill>/scripts/sfx.mjs bell-witch && uv run bell-witch/audio/sfx_el.py

Every hit in film.js with opts.el gets that sample (audio/el/sfx_<el>.mp3) with its first attack ON
the hit's frame, so picture and sound still share one source of truth (out/bell-witch/hits.json).
opts: slice (k-th attack of a multi-hit take, e.g. one knock of six), elGain (else gain), cut (s),
pan. The result is summed into audio/sfx.wav.
"""
import json
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

SR = 48000
HERE = Path(__file__).resolve().parent
FILM = HERE.parent
OUT = FILM.parent / "out" / FILM.name
EL_STEM = 0.55
_cache = {}


def load(name):
    if name not in _cache:
        y, _ = librosa.load(HERE / "el" / f"sfx_{name}.mp3", sr=SR, mono=True)
        _cache[name] = y.astype(np.float64)
    return _cache[name]


def attacks(y):
    """Onset times (s) of the take's attacks, backtracked to where each starts."""
    env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=128)
    on = librosa.onset.onset_detect(onset_envelope=env, sr=SR, hop_length=128, backtrack=True, units="time", delta=0.2)
    return on


def main_attack(y):
    """Where the take's strongest attack begins (backtracked), within its first 1.5 s."""
    env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=128)
    on = librosa.onset.onset_detect(onset_envelope=env, sr=SR, hop_length=128, backtrack=False, units="frames")
    bt = librosa.onset.onset_backtrack(on, env) if len(on) else on
    on, bt = on[on * 128 / SR < 1.5], bt[on * 128 / SR < 1.5]
    if not len(on):
        return first_attack(y)
    k = int(np.argmax(env[on]))
    return max(0.0, bt[k] * 128 / SR - 0.003)


def first_attack(y):
    hop = 64
    rms = librosa.feature.rms(y=y, frame_length=hop * 4, hop_length=hop)[0]
    db = 20 * np.log10(rms + 1e-9) - 20 * np.log10(rms.max() + 1e-9)
    i = np.nonzero(db > -24)[0]
    return max(0.0, (i[0] * hop) / SR - 0.004) if len(i) else 0.0


def main():
    hits = json.loads((OUT / "hits.json").read_text())
    x, sr = sf.read(HERE / "sfx.wav", always_2d=True)
    assert sr == SR, sr
    x = x.T.copy()
    n = x.shape[1]
    placed = []
    for h in hits:
        o = h.get("opts") or {}
        if "el" not in o:
            continue
        y = load(o["el"])
        if "slice" in o:
            on = attacks(y)
            k = int(o["slice"]) % len(on)
            a = max(0.0, on[k] - 0.003)
            b = on[k + 1] - 0.01 if k + 1 < len(on) else len(y) / SR
            seg = y[int(a * SR):int(min(b, a + 0.9) * SR)].copy()
            lead = 0.003
        else:
            lead = first_attack(y) if o.get("align") == "first" else main_attack(y)
            seg = y.copy()
        if "cut" in o:
            seg = seg[: int((lead + o["cut"]) * SR)].copy()
        f = min(len(seg), int(0.05 * SR))
        seg[-f:] *= np.linspace(1, 0, f)
        g = o.get("elGain", o.get("gain", 1.0)) * EL_STEM
        pan = o.get("pan", 0.0)
        gl, gr = g * np.sqrt((1 - pan) / 2) * np.sqrt(2), g * np.sqrt((1 + pan) / 2) * np.sqrt(2)
        at = int(round((h["t"] - lead) * SR))
        s0, s1 = max(0, at), min(n, at + len(seg))
        if s1 <= s0:
            continue
        x[0, s0:s1] += gl * seg[s0 - at:s1 - at]
        x[1, s0:s1] += gr * seg[s0 - at:s1 - at]
        placed.append(f"b{h['beat']} {o['el']}")
    sf.write(HERE / "sfx.wav", x.T, SR, subtype="FLOAT")
    print(f"{len(placed)} ElevenLabs effects on hits -> audio/sfx.wav (peak {20 * np.log10(np.abs(x).max() + 1e-9):.1f} dBFS)")
    print("  " + ", ".join(placed))


if __name__ == "__main__":
    main()
