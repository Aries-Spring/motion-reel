"""Synthesis + measurement toolkit for motion-reel scores (numpy/scipy/librosa, all seeded).

Import from a film's own audio/score.py when the generic bed from beats.py isn't enough:

    import sys; sys.path.insert(0, "<skill>/scripts")   # see references/examples/score_vo.py
    from dsp import *

Instruments return mono float arrays at SR; Bus places them on a beat grid in stereo.
"""

import re
import subprocess

import librosa
import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

SR = 48000
rng = np.random.default_rng(20260929)


def seed(n):
    global rng
    rng = np.random.default_rng(n)


NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6,
        "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def midi(note):
    m = re.match(r"([A-G][#b]?)(-?\d)", note)
    return NOTE[m.group(1)] + 12 * (int(m.group(2)) + 1)


def hz(note):
    """'D5' / 'F#4' / 440 -> Hz."""
    return float(note) if not isinstance(note, str) else 440.0 * 2 ** ((midi(note) - 69) / 12)


def note_name(m):
    return ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][m % 12] + str(m // 12 - 1)


# ---------------------------------------------------------------- dsp helpers

def tvec(n):
    return np.arange(n) / SR


def filt(x, kind, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype=kind, fs=SR, output="sos"), x)


def peq(x, f0, gain_db, q=1.0):
    """RBJ peaking EQ."""
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / (2 * q)
    b = np.array([1 + al * A, -2 * np.cos(w), 1 - al * A])
    a = np.array([1 + al / A, -2 * np.cos(w), 1 - al / A])
    return signal.lfilter(b / a[0], a / a[0], x)


def sweep_filter(x, fc, kind="bandpass", q=1.2, block=64):
    """Time-varying biquad: fc is an array (Hz) the length of x."""
    y = np.zeros_like(x)
    zi = np.zeros(2)
    for s in range(0, len(x), block):
        f0 = float(np.clip(fc[min(s + block // 2, len(x) - 1)], 30, SR * 0.45))
        w = 2 * np.pi * f0 / SR
        alpha = np.sin(w) / (2 * q)
        c = np.cos(w)
        b = np.array([alpha, 0, -alpha]) if kind == "bandpass" else np.array([(1 - c) / 2, 1 - c, (1 - c) / 2])
        a = np.array([1 + alpha, -2 * c, 1 - alpha])
        y[s:s + block], zi = signal.lfilter(b / a[0], a / a[0], x[s:s + block], zi=zi)
    return y


def saw(freq, n, phase0=0.0):
    """PolyBLEP sawtooth; freq scalar or per-sample array."""
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    dt = f / SR
    ph = (phase0 + np.cumsum(dt)) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    t1 = ph[m] / dt[m]
    y[m] -= t1 + t1 - t1 * t1 - 1
    m = ph > 1 - dt
    t2 = (ph[m] - 1) / dt[m]
    y[m] -= t2 * t2 + t2 + t2 + 1
    return y


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.1):
    t = tvec(n)
    e = np.where(t < a, t / a, s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    return e * np.clip((n / SR - t) / r, 0, 1)


def layer(*xs):
    out = np.zeros(max(len(x) for x in xs))
    for x in xs:
        out[: len(x)] += x
    return out


def env_follow(x, attack, release):
    """Peak envelope follower (seconds)."""
    a, r = np.exp(-1 / (attack * SR)), np.exp(-1 / (release * SR))
    k = 48
    y = np.abs(x)
    yd = y[: len(y) // k * k].reshape(-1, k).max(axis=1)
    a, r = a ** k, r ** k
    out = np.zeros_like(yd)
    e = 0.0
    for i, v in enumerate(yd):
        e = a * e + (1 - a) * v if v > e else r * e + (1 - r) * v
        out[i] = e
    return np.interp(np.arange(len(y)), np.arange(len(yd)) * k, out)


# ---------------------------------------------------------------- drums

def kick(soft=False):
    n = int(0.42 * SR)
    t = tvec(n)
    f = 44 + 120 * np.exp(-t / 0.028) + 24 * np.exp(-t / 0.12)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.3) * (1 - np.exp(-t / 0.0012))
    click = filt(rng.standard_normal(n) * np.exp(-t / 0.002), "highpass", 1800) * 0.3
    x = np.tanh(1.8 * (body + click)) / np.tanh(1.8)
    return filt(x, "lowpass", 260, 4) * 1.6 if soft else x


def clap(tight=False):
    n = int(0.35 * SR)
    t = tvec(n)
    e = np.zeros(n)
    for d in (0.0, 0.009, 0.019):
        e += np.exp(-np.maximum(t - d, 0) / 0.005) * (t >= d)
    e += 0.7 * np.exp(-np.maximum(t - 0.028, 0) / (0.05 if tight else 0.1)) * (t >= 0.028)
    x = filt(rng.standard_normal(n), "bandpass", [900, 3400]) * e
    return x + np.sin(2 * np.pi * 200 * t) * np.exp(-t / 0.03) * 0.4


def hat(open_=False):
    n = int((0.3 if open_ else 0.07) * SR)
    t = tvec(n)
    x = filt(rng.standard_normal(n), "highpass", 7500, 4)
    for f in (3120, 4150, 5310, 6770):
        x += 0.12 * np.sign(np.sin(2 * np.pi * f * t))
    return filt(x, "highpass", 6000) * np.exp(-t / (0.1 if open_ else 0.02))


def crash(length=1.6):
    n = int(length * SR)
    t = tvec(n)
    x = filt(rng.standard_normal(n), "highpass", 3500)
    for f in (2733, 3471, 4389, 5812, 7123, 8290):
        x += 0.15 * np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * np.sin(2 * np.pi * f * 1.414 * t)
    return x * np.exp(-t / (length * 0.45)) * (1 - np.exp(-t / 0.002))


# Tabla: the dayan's syahi makes its modes near-harmonic (it rings like a pitch); the bayan's
# pitch is bent upward by the heel of the palm (the "ge" glide).
def dayan(kind="na", f0=587.33):
    n = int(0.6 * SR)
    t = tvec(n)
    modes = {"na": [(1, 1.0, 0.22), (2, 0.55, 0.12), (3, 0.35, 0.07), (4, 0.2, 0.05), (5, 0.12, 0.03)],
             "tin": [(1, 0.5, 0.3), (2, 0.8, 0.2), (3, 0.3, 0.08), (4.1, 0.15, 0.04)]}.get(
        kind, [(1, 0.6, 0.03), (2.3, 0.4, 0.02), (3.7, 0.3, 0.015)])
    x = sum(a * np.sin(2 * np.pi * f0 * m * t * (1 + 0.004 * np.exp(-t / 0.02))) * np.exp(-t / d) for m, a, d in modes)
    x += filt(rng.standard_normal(n) * np.exp(-t / 0.003), "bandpass", [1500, 7000]) * 0.5
    return x * (1 - np.exp(-t / 0.0004))


def bayan(kind="ge", glide=1.0):
    n = int(0.7 * SR)
    t = tvec(n)
    if kind == "ka":
        x = filt(rng.standard_normal(n), "bandpass", [150, 900]) * np.exp(-t / 0.025)
        return x + np.sin(2 * np.pi * 110 * t) * np.exp(-t / 0.03) * 0.6
    f = 82 + 55 * glide * (1 - np.exp(-t / 0.09))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.32)
    x += 0.3 * np.sin(2 * np.pi * np.cumsum(2 * f) / SR) * np.exp(-t / 0.12)
    x += filt(rng.standard_normal(n) * np.exp(-t / 0.004), "lowpass", 900) * 0.6
    return np.tanh(1.4 * x) * (1 - np.exp(-t / 0.001))


def bol(name, glide=1.0, sa=587.33):
    """Tabla bols (Keherwa theka: dha ge na ti | na ka dhi na)."""
    return {
        "dha": lambda: layer(dayan("na", sa) * 0.8, bayan("ge", glide)),
        "dhi": lambda: layer(dayan("tin", sa) * 0.7, bayan("ge", glide)),
        "ge": lambda: bayan("ge", glide), "ka": lambda: bayan("ka"),
        "ti": lambda: dayan("ti", sa), "tin": lambda: dayan("tin", sa),
    }.get(name, lambda: dayan("na", sa))()


# ---------------------------------------------------------------- tonal

def ks_pluck(f, length=0.9, bright=0.6, buzz=0.35):
    """Karplus-Strong with a soft-clipping bridge (sitar / rabab buzz when buzz > 0)."""
    n = int(length * SR)
    L = int(SR / f)
    frac = SR / f - L
    line = list(filt(rng.standard_normal(L + 2), "lowpass", 2000 + 7000 * bright) * 0.9)
    out = np.zeros(n)
    y1, idx, m = 0.0, 0, len(line)
    for i in range(n):
        a, b = line[idx % m], line[(idx + 1) % m]
        v = (1 - frac) * a + frac * b
        s = 0.996 * 0.5 * (v + y1)
        y1 = v
        line[idx % m] = s + buzz * 0.25 * (np.tanh(3 * s) - s)
        out[i] = v
        idx += 1
    t = tvec(n)
    return out * (1 - np.exp(-t / 0.0008)) * np.clip((length - t) / 0.05, 0, 1)


def pad_chord(notes, length, cutoff, attack=0.08, release=0.25, voices=5, detune=0.12):
    """Detuned-saw chord, stereo (2, n). cutoff scalar or (start, end)."""
    n = int(length * SR)
    L, R = np.zeros(n), np.zeros(n)
    for ni, note in enumerate(notes):
        f = hz(note)
        for v in range(voices):
            cents = (v - (voices - 1) / 2) / ((voices - 1) / 2) * detune * 100
            x = saw(f * 2 ** (cents / 1200), n, phase0=rng.uniform())
            pan = 0.5 + 0.35 * ((v + ni) % 2 * 2 - 1) * (abs(v - 2) / 2)
            L += x * np.sqrt(1 - pan)
            R += x * np.sqrt(pan)
    fc = np.full(n, float(cutoff)) if np.isscalar(cutoff) else np.geomspace(cutoff[0], cutoff[1], n)
    L, R = sweep_filter(L, fc, "lowpass", 0.8), sweep_filter(R, fc, "lowpass", 0.8)
    return np.stack([L, R]) * adsr(n, attack, 0.6, 0.75, release) / (len(notes) * voices) ** 0.5


def pluck(notes, length=0.22, cutoff=3200):
    n = int(length * SR)
    t = tvec(n)
    x = sum(saw(hz(nt), n, phase0=rng.uniform()) + saw(hz(nt) * 1.005, n) for nt in notes)
    x = sweep_filter(x, 300 + cutoff * np.exp(-t / 0.045), "lowpass", 1.6)
    return x * np.exp(-t / 0.09) * (1 - np.exp(-t / 0.002)) / len(notes)


def bass_note(note, length, cutoff=900):
    n = int(length * SR)
    t = tvec(n)
    f = hz(note)
    x = saw(f, n) * 0.6 + np.sin(2 * np.pi * f * t) * 0.8
    x = sweep_filter(x, 120 + cutoff * np.exp(-t / 0.06), "lowpass", 1.4)
    return np.tanh(1.6 * x) * adsr(n, 0.003, 0.12, 0.65, 0.03)


def harmonium(notes, length, cutoff=2600):
    """Reedy drone: pulse waves, slow beating between two reeds."""
    n = int(length * SR)
    t = tvec(n)
    x = np.zeros(n)
    for nt in notes:
        for det in (1.0, 1.0035):
            ph = (hz(nt) * det * t + rng.uniform()) % 1
            x += np.where(ph < 0.3, 1.0, -0.43)
    return filt(x, "lowpass", cutoff) / len(notes) * adsr(n, 0.06, 0.4, 0.85, 0.2)


def keys(notes, length):
    """Soft electric-piano-ish chord (FM), for lofi beds."""
    n = int(length * SR)
    t = tvec(n)
    x = sum(np.sin(2 * np.pi * hz(nt) * t + 1.2 * np.exp(-t / 0.25) * np.sin(2 * np.pi * hz(nt) * t)) for nt in notes)
    return x / len(notes) * np.exp(-t / 1.1) * (1 - np.exp(-t / 0.003))


# ---------------------------------------------------------------- transitions (for scores)

def whoosh(length, f0, f1, peak=0.6, q=1.1, shape=2.0):
    n = int(length * SR)
    p = np.linspace(0, 1, n)
    x = sweep_filter(rng.standard_normal(n), f0 * (f1 / f0) ** p, "bandpass", q)
    return x * np.where(p < peak, (p / peak) ** shape, ((1 - p) / (1 - peak)) ** 1.5)


def riser(length):
    n = int(length * SR)
    p = np.linspace(0, 1, n)
    t = tvec(n)
    noise = sweep_filter(rng.standard_normal(n), 250 * (40 ** p), "bandpass", 2.0)
    f = 180 * (6 ** (p ** 1.6))
    tone = saw(f, n) * 0.25 + np.sin(2 * np.pi * np.cumsum(f * 2) / SR) * 0.2
    tone = sweep_filter(tone, 400 * (15 ** p), "lowpass", 0.9)
    return (noise * 0.9 + tone) * p ** 2.2 * (1 - np.exp(-(length - t) / 0.004))


def sub_drop(length=1.1, f0=72, f1=30):
    n = int(length * SR)
    t = tvec(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.25)
    return np.tanh(1.8 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.5) * (1 - np.exp(-t / 0.003)))


def reverb_ir(length=1.6, decay=0.4, seed_=3):
    r = np.random.default_rng(seed_)
    n = int(length * SR)
    t = tvec(n)
    ir = np.stack([r.standard_normal(n), r.standard_normal(n)]) * np.exp(-t / decay)
    ir = np.stack([filt(ch, "lowpass", 6000) for ch in ir])
    ir[:, : int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    return ir / np.sqrt((ir ** 2).sum(axis=1, keepdims=True))


def reverb(x, wet=0.3, **kw):
    ir = reverb_ir(**kw)
    w = np.stack([signal.fftconvolve(x[c], ir[c])[: x.shape[1]] for c in range(2)])
    return x + wet * w


# ---------------------------------------------------------------- arrangement

class Bus:
    """A stereo track on a beat grid: add(sig, beat, gain, pan)."""

    def __init__(self, duration, bpm):
        self.beat = 60 / bpm
        self.n = int(SR * duration)
        self.x = np.zeros((2, self.n + SR * 3))

    def add(self, sig, beat, gain=1.0, pan=0.0, at=None):
        start = int(round((beat * self.beat if at is None else at) * SR))
        if start < 0:
            sig = sig[..., -start:]
            start = 0
        if sig.ndim == 1:
            a = (pan + 1) / 2
            sig = np.stack([sig * np.sqrt(1 - a), sig * np.sqrt(a)])
        end = min(start + sig.shape[1], self.x.shape[1])
        self.x[:, start:end] += gain * sig[:, : end - start]


def sidechain(t_hits, n, depth=0.5, release=0.1):
    """Gain curve that ducks after each time in t_hits (kick pump)."""
    t = tvec(n)
    g = np.ones(n)
    for kt in t_hits:
        m = t >= kt
        g[m] = np.minimum(g[m], 1 - depth * np.exp(-(t[m] - kt) / release))
    return g


# ---------------------------------------------------------------- measurement + mastering

def measure_beats(y, sr, bpm_hint, n_beats=None, t0=0.0):
    """Beat grid t = offset + k*period from the audio: librosa's tracker, snapped to backtracked
    onsets (true attacks), then a least-squares line with outlier rejection. Times relative to t0."""
    hop = 128
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop, aggregate=np.median)
    _, frames = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=hop, start_bpm=bpm_hint,
                                        tightness=400, units="frames")
    tracked = librosa.frames_to_time(frames, sr=sr, hop_length=hop)
    onsets = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, backtrack=True, units="time")
    snapped = []
    for bt in tracked:
        near = onsets[np.abs(onsets - bt) < 0.04]
        snapped.append(float(near[np.argmin(np.abs(near - bt))]) if len(near) else float(bt))
    snapped = np.array(snapped)
    period0 = float(np.median(np.diff(snapped)))
    k = np.round((snapped - snapped[0]) / period0) + np.round(snapped[0] / period0)
    keep = np.ones(len(k), bool)
    for _ in range(4):
        A = np.stack([np.ones_like(k[keep]), k[keep]], axis=1)
        (offset, period), *_ = np.linalg.lstsq(A, snapped[keep], rcond=None)
        resid = snapped - (offset + period * k)
        keep = np.abs(resid) < max(0.006, 2.5 * np.median(np.abs(resid[keep])))
    resid = resid[keep]
    # re-express relative to t0, as the grid line nearest the start (a hair negative is fine)
    offset = (offset - t0) % period
    if offset > 0.9 * period:
        offset -= period
    n = n_beats or int((len(y) / sr) / period) + 1
    beats = [round(offset + period * i, 5) for i in range(n)]
    return {
        "bpm": round(60 / period, 3), "period": round(float(period), 6), "offset": round(float(offset), 5),
        "beats": beats, "detected": [round(x - t0, 4) for x in snapped.tolist()],
        "fit_inliers": int(keep.sum()), "fit_residual_ms": round(float(np.sqrt(np.mean(resid ** 2))) * 1000, 2),
    }


def ebur128(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true",
                        "-f", "null", "-"], capture_output=True, text=True)
    s = r.stderr[r.stderr.rfind("Summary:"):]
    return (float(re.search(r"I:\s+(-?[\d.]+) LUFS", s).group(1)),
            float(re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", s).group(1)))


def limit(x, ceiling_db=-1.3, look_ms=4.0):
    """Look-ahead brickwall on 4x-oversampled peaks (true-peak safe)."""
    ceiling = 10 ** (ceiling_db / 20)
    over = signal.resample_poly(x, 4, 1, axis=1)
    peak = np.abs(over).max(axis=0).reshape(-1, 4).max(axis=1)[: x.shape[1]]
    g = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    L = int(look_ms / 1000 * SR) | 1
    g = minimum_filter1d(g, L)
    g = uniform_filter1d(g, L)
    return x * minimum_filter1d(g, 3)
