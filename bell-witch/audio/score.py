# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10", "numpy", "scipy", "soundfile"]
# ///
"""THE BELL WITCH: score, voice edit and beat grid.

    MOTION_REEL_SKILL=<skill> uv run bell-witch/audio/score.py

80 BPM, 144 beats = 108 s, D Phrygian / D minor. A horror score built from synthesized strings,
braams, a warped dulcimer/music-box tune, heartbeat pulses and a dying-tape hymn, with the
ElevenLabs ambience beds (night, wind, fire, whispers) underneath. The narration (ElevenLabs
"Bill") and the witch ("Lily", whispered, then doubled and pitched into something else) are cut
phrase by phrase and each phrase's speech onset lands on the grid.

Reads   audio/el/*.mp3 + *.json (eleven.py takes, with character alignment)
Writes  audio/music.wav, audio/vo.wav, beats.json, vo.json (phrases + words in film time)
"""
import json
import os
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from scipy import signal


def _skill_dir():
    if os.environ.get("MOTION_REEL_SKILL"):
        return Path(os.environ["MOTION_REEL_SKILL"])
    found = sorted((Path.home() / ".claude/plugins").glob("**/skills/motion-reel/scripts/dsp.py"))
    if found:
        return found[-1].parent.parent
    sys.exit("set MOTION_REEL_SKILL to the folder that holds the motion-reel SKILL.md")


sys.path.insert(0, str(_skill_dir() / "scripts"))
from dsp import *  # noqa: E402,F403

HERE = Path(__file__).resolve().parent
FILM = HERE.parent
EL = HERE / "el"
BPM = 80
BEAT = 60 / BPM
NBEATS = 144
DUR = NBEATS * BEAT
N = int(SR * DUR)
seed(1817)


def T(b):
    return b * BEAT


# ---------------------------------------------------------------- loading ElevenLabs takes

_cache = {}


def load(name, mono=True):
    if name not in _cache:
        y, _ = librosa.load(EL / f"{name}.mp3", sr=SR, mono=mono)
        _cache[name] = y.astype(np.float64)
    return _cache[name].copy()


def words_of(take):
    """Spoken words with times, the v3 audio tags ([whispers], [long pause]...) dropped."""
    a = json.loads((EL / f"{take}.json").read_text())["alignment"]
    out, cur, depth, s0, e0 = [], "", 0, None, None
    for c, s, e in zip(a["characters"] + [" "], a["character_start_times_seconds"] + [0],
                       a["character_end_times_seconds"] + [0]):
        if c == "[":
            if cur and depth == 0:
                out.append((cur, s0, e0))
            cur, depth = "", depth + 1
            continue
        if c == "]":
            depth -= 1
            cur = ""
            continue
        if depth:
            continue
        if c.isspace():
            if cur:
                out.append((cur, s0, e0))
            cur = ""
            continue
        if not cur:
            s0 = s
        cur += c
        e0 = e
    return out


# ---------------------------------------------------------------- the voice edit
# (id, take, first word, last word, beat of the speech onset, voice)
PHRASES = [
    ("A1", "nA", 0, 12, 8, "narr"),       # In 1817, a farmer named John Bell saw something in his cornfield.
    ("A2", "nA", 13, 16, 18, "narr"),     # Something like a dog.
    ("A3", "nA", 17, 18, 21, "narr"),     # He fired...
    ("A4", "nA", 19, 22, 23.5, "narr"),   # and it was gone.
    ("B1", "nB", 0, 4, 26, "narr"),       # That night... the knocking began.
    ("B2", "nB", 5, 11, 41, "narr"),      # It pulled the quilts from the beds.
    ("B3", "nB", 12, 18, 45, "narr"),     # It slapped the children in the dark.
    ("B4", "nB", 19, 20, 49, "narr"),     # And then...
    ("B5", "nB", 21, 22, 51, "whisper"),  # it spoke.
    ("W1", "w1", 0, 12, 53, "witch"),     # I am a spirit. I was once very happy... but have been disturbed.
    ("C1", "nC", 0, 3, 63, "narr"),       # It called itself Kate.
    ("C2", "nC", 4, 8, 66, "narr"),       # And it hated John Bell.
    ("C3", "nC", 9, 21, 70.5, "narr"),      # December, 1820. They found a vial of something dark in the cupboard.
    ("C4", "nC", 22, 28, 78.5, "narr"),     # They gave a drop to the cat.
    ("C5", "nC", 29, 31, 82, "narr"),     # The cat died.
    ("C6", "nC", 32, 37, 84, "narr"),     # They threw it in the fire...
    ("C7", "nC", 38, 41, 86.5, "narr"),   # and it burned blue.
    ("C8", "nC", 42, 48, 89.5, "narr"),   # The next day, John Bell was dead.
    ("C9", "nC", 49, 56, 94.5, "narr"),     # At his funeral, as they filled the grave...
    ("C10", "nC", 57, 59, 98, "whisper"),  # the witch sang.
    ("W2", "w2", 0, 5, 100.5, "song"),      # Row me up some brandy, O...
    ("W3", "w2", 6, 11, 106, "song", 3.0),  # row me up some brandy, O...
    ("D1", "nD", 0, 4, 110, "narr"),      # In 1821, it left.
    ("D2", "nD", 5, 11, 114, "narr"),     # It promised to return in seven years.
    ("D3", "nD", 12, 13, 118.5, "narr"),  # It did.
    ("D4", "nD", 14, 19, 120.5, "narr"),  # Then it promised one more visit...
    ("D5", "nD", 20, 25, 125, "narr"),    # one hundred and seven years later.
    ("D6", "nD", 26, 31, 129, "narr"),    # No one saw it come back.
    ("D7", "nD", 32, 38, 131.5, "whisper"),  # But no one ever saw it leave.
]


def rms_db(y, hop):
    rms = librosa.feature.rms(y=y, frame_length=hop * 4, hop_length=hop, center=True)[0]
    return 20 * np.log10(rms + 1e-9) - 20 * np.log10(rms.max() + 1e-9)


def pitch(y, steps):
    return librosa.effects.pitch_shift(y.astype(np.float32), sr=SR, n_steps=steps).astype(np.float64)


def compress(x, thresh_db=-22, ratio=3.0, attack=0.004, release=0.09, makeup_db=4):
    e = env_follow(x, attack, release)
    over = np.maximum(20 * np.log10(e + 1e-9) - thresh_db, 0)
    return x * 10 ** ((-over * (1 - 1 / ratio) + makeup_db) / 20)


def conv_st(x, ir):
    """mono x -> stereo wet through a stereo IR."""
    return np.stack([signal.fftconvolve(x, ir[c])[: len(x)] for c in range(2)])


def narr_chain(x):
    x = filt(x, "highpass", 75, 2)
    x = peq(x, 180, 2.0, 0.8)     # chest
    x = peq(x, 420, -2.0, 1.0)    # less boxy
    x = peq(x, 3000, 2.5, 0.9)    # presence
    x = np.tanh(1.3 * x) / np.tanh(1.3)   # a little warmth
    return compress(x)


def build_vo():
    takes = {k: load(k) for k in ("nA", "nB", "nC", "nD", "w1", "w2")}
    words = {k: words_of(k) for k in takes}
    hop = int(SR * 0.005)
    dbs = {k: rms_db(y, hop) for k, y in takes.items()}

    narr = np.zeros((2, N + SR * 4))
    witch = np.zeros((2, N + SR * 4))
    placed, wout = [], []
    for pid, take, i, j, beat, kind, *lim in PHRASES:
        y, W, db = takes[take], words[take], dbs[take]
        prev_end = W[i - 1][2] if i > 0 else 0.0
        next_start = W[j + 1][1] if j + 1 < len(W) else len(y) / SR
        a = max(0.0, max(prev_end + 0.02, W[i][1] - 0.35))
        b = min(len(y) / SR, min(next_start - 0.02, W[j][2] + 0.6))
        i0, i1 = int(a / 0.005), int(b / 0.005)
        thr = -42 if kind in ("whisper", "witch", "song") else -34
        loud = np.nonzero(db[i0:i1] > thr)[0]
        on = a + loud[0] * 0.005 - 0.012
        off = a + loud[-1] * 0.005 + 0.04
        a = max(a, on - 0.03)
        b = min(b, off + 0.25)
        shift = T(beat) - on
        if lim:
            b = min(b, on + lim[0])
        seg = y[int(a * SR):int(b * SR)].copy()
        fi, fo = int(0.006 * SR), int((0.9 if lim else 0.05) * SR)
        seg[:fi] *= np.linspace(0, 1, fi)
        seg[-fo:] *= np.linspace(1, 0, fo)
        s = int(round((a + shift) * SR))
        if kind in ("narr", "whisper"):
            g = 1.35 if kind == "whisper" else 1.0
            narr[:, s:s + len(seg)] += g * seg
        else:
            if kind == "witch":
                # the spirit: the whisper, a fifth and an octave below it, slightly smeared in time
                lay = seg * 1.0 + pitch(seg, -7) * 0.55 + pitch(seg, -12) * 0.35
                d = int(0.011 * SR)
                st = np.stack([lay, np.concatenate([np.zeros(d), lay[:-d]])])
            else:
                # the song: thin, distant, an octave ghost under it, a slow tape wobble
                lay = filt(seg, "bandpass", [280, 4200], 2) + pitch(seg, -12) * 0.25
                lay = tape(lay, 0.18, 0.55)
                st = np.stack([lay, lay * 0.92])
            witch[:, s:s + st.shape[1]] += st
        placed.append((pid, on + shift, off + shift, kind))
        for k in range(i, j + 1):
            wout.append({"p": pid, "w": W[k][0], "t0": round(W[k][1] + shift, 3), "t1": round(W[k][2] + shift, 3)})

    print("VO edit:")
    for (p0, a0, b0, _), (_, a1, _, _) in zip(placed, placed[1:] + [("", DUR, 0, "")]):
        gap = a1 - b0
        print(f"  {p0:4s} {a0:7.3f}-{b0:7.3f}  (b{a0 / BEAT:6.2f})  gap {gap * 1000:+6.0f} ms" + ("  OVERLAP" if gap < -0.05 else ""))

    # narration chain + a small dark room
    nm = narr_chain(narr.mean(axis=0))
    room = reverb_ir(0.9, 0.22, seed_=11)
    n_out = np.stack([nm, nm]) + 0.10 * conv_st(nm, room)
    # the witch: long dark verb, and a reversed-reverb swell that rises INTO each of her phrases
    wm = witch.mean(axis=0)
    big = reverb_ir(4.0, 1.4, seed_=5)
    big = np.stack([filt(c, "lowpass", 3500) for c in big])
    w_wet = conv_st(wm, big)
    rev = conv_st(wm[::-1], big)[:, ::-1]
    w_out = witch * 0.8 + 0.55 * w_wet + 0.35 * rev
    vo = n_out + w_out
    vo = vo[:, :N]
    vo /= np.abs(vo).max() + 1e-9
    vo *= 0.72
    phrases = [{"id": p, "t0": round(a, 3), "t1": round(b, 3), "kind": k, "beat": round(a / BEAT, 3)} for p, a, b, k in placed]
    return vo, phrases, wout


# ---------------------------------------------------------------- instruments

def tape(x, depth=0.12, rate=0.5, flutter=0.02):
    """Warped tape: slow wow + fast flutter on the read head (depth in semitones)."""
    n = len(x)
    t = tvec(n)
    semis = depth * np.sin(2 * np.pi * rate * t + 1.3) + flutter * np.sin(2 * np.pi * 7.3 * t)
    sp = 2 ** (semis / 12)
    pos = np.cumsum(sp) - sp[0]
    pos = np.clip(pos, 0, n - 1)
    return np.interp(pos, np.arange(n), x)


def dying_tape(x, start, stop, drop=-5.0):
    """Pitch sags toward `drop` semitones between start and stop seconds: a cassette losing power."""
    n = len(x)
    t = tvec(n)
    p = np.clip((t - start) / max(stop - start, 1e-3), 0, 1) ** 1.6
    sp = 2 ** ((drop * p) / 12)
    pos = np.cumsum(sp)
    pos = np.clip(pos - pos[0], 0, n - 1)
    return np.interp(pos, np.arange(n), x)


def bowed(f, length, bright=900, vib=0.003, attack=0.35, release=0.35):
    n = int(length * SR)
    t = tvec(n)
    v = 1 + vib * np.sin(2 * np.pi * 5.2 * t + rng.uniform(0, 6))
    x = sum(saw(f * v * d, n, rng.uniform()) for d in (0.996, 1.0, 1.0045)) / 3
    x = filt(x, "lowpass", bright, 2)
    a = np.clip(t / (length * attack), 0, 1) ** 1.5
    r = np.clip((length - t) / (length * release), 0, 1)
    return x * a * r


def cluster(freqs, length, trem=9.0, bright=5000, attack=0.4):
    """High tremolo strings, sul ponticello: thin, glassy, nervous."""
    n = int(length * SR)
    t = tvec(n)
    x = np.zeros(n)
    for f in freqs:
        x += saw(f * (1 + 0.002 * np.sin(2 * np.pi * 4.7 * t + rng.uniform(0, 6))), n, rng.uniform())
    x = filt(filt(x, "highpass", 900, 2), "lowpass", bright, 2)
    tr = 0.55 + 0.45 * np.sign(np.sin(2 * np.pi * trem * t + rng.uniform(0, 6)))
    tr = uniform(tr, int(0.006 * SR))
    env = np.clip(t / (length * attack), 0, 1) ** 2 * np.clip((length - t) / 0.4, 0, 1)
    return x * tr * env / len(freqs)


def uniform(x, k):
    return np.convolve(x, np.ones(k) / k, mode="same")


def glass(freqs, length):
    n = int(length * SR)
    t = tvec(n)
    x = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * (0.6 + 0.4 * np.sin(2 * np.pi * (0.13 + 0.07 * k) * t)) for k, f in enumerate(freqs))
    return x / len(freqs) * np.clip(t / 2.0, 0, 1) * np.clip((length - t) / 1.5, 0, 1)


def braam(length=4.0, root=None, bright=2600, dist=2.6):
    root = root or hz("D1")
    n = int(length * SR)
    t = tvec(n)
    x = np.zeros(n)
    for m, g in ((1, 1.0), (1.5, 0.55), (2, 0.7), (2.378, 0.45), (3, 0.3), (4.757, 0.15)):
        for d in (0.994, 1.0, 1.007):
            x += g * saw(root * m * d, n, rng.uniform())
    fc = 160 + bright * np.exp(-t / 0.45)
    x = sweep_filter(x, fc, "lowpass", 1.1)
    x = np.tanh(dist * x / 3) * 0.9
    f = root * (1 + 0.6 * np.exp(-t / 0.06))
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR)
    env = (1 - np.exp(-t / 0.006)) * np.exp(-t / (length * 0.38))
    return (x * 0.75 + sub * 0.9) * env


def slam(length=1.6):
    """Wooden impact: a fist on a log wall, enormous."""
    n = int(length * SR)
    t = tvec(n)
    f = 52 + 90 * np.exp(-t / 0.03)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.35)
    x += filt(rng.standard_normal(n), "bandpass", [120, 1800]) * np.exp(-t / 0.05) * 0.9
    x += filt(rng.standard_normal(n), "highpass", 3000) * np.exp(-t / 0.012) * 0.4
    return np.tanh(2.2 * x) * (1 - np.exp(-t / 0.0008))


def heart(g=1.0):
    def thump(f0, dur, k):
        n = int(dur * SR)
        t = tvec(n)
        f = f0 + 45 * np.exp(-t / 0.018)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / k) * (1 - np.exp(-t / 0.002))
    out = np.zeros(int(0.7 * SR))
    a, b = thump(56, 0.4, 0.07), thump(47, 0.45, 0.09) * 0.75
    out[:len(a)] += a
    s = int(0.21 * SR)
    out[s:s + len(b)] += b
    return filt(np.tanh(1.5 * out), "lowpass", 200, 2) * g


def tick(hi=True):
    n = int(0.05 * SR)
    t = tvec(n)
    f = 2600 if hi else 1900
    x = filt(rng.standard_normal(n), "bandpass", [f * 0.7, f * 1.4]) * np.exp(-t / 0.004)
    x += np.sin(2 * np.pi * f * t) * np.exp(-t / 0.01) * 0.3
    return x


def spiccato(note, length=0.28):
    f = hz(note)
    n = int(length * SR)
    t = tvec(n)
    x = sum(saw(f * d, n, rng.uniform()) for d in (0.997, 1.003)) / 2
    x = sweep_filter(x, 300 + 1800 * np.exp(-t / 0.03), "lowpass", 1.2)
    return x * np.exp(-t / 0.07) * (1 - np.exp(-t / 0.003))


def dulcimer(note, length=2.2, gain=1.0):
    """Plucked + a music-box partial: the tune a child would hum in that house."""
    f = hz(note)
    p = ks_pluck(f, length, bright=0.45, buzz=0.05)
    n = len(p)
    t = tvec(n)
    box = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.9) + 0.35 * np.sin(2 * np.pi * f * 4.02 * t) * np.exp(-t / 0.18)
    return (0.8 * p + 0.35 * box * (1 - np.exp(-t / 0.002))) * gain


def shepard(length, f_lo=55, octaves=6, rate=0.11):
    """Endlessly rising tone: octave-spaced partials under a fixed bell-shaped spectral envelope."""
    n = int(length * SR)
    t = tvec(n)
    x = np.zeros(n)
    center = np.log2(f_lo) + octaves / 2
    for k in range(octaves):
        pos = (k + rate * t) % octaves
        f = f_lo * 2 ** pos
        amp = np.exp(-0.5 * ((np.log2(f) - center) / (octaves / 5)) ** 2)
        x += amp * np.sin(2 * np.pi * np.cumsum(f) / SR)
    return x / octaves * np.clip(t / 3, 0, 1)


def rev_swell(sig, length):
    """Reverse a sound's reverb tail so it rises INTO the hit (anchor = end)."""
    ir = reverb_ir(length, length / 3, seed_=17)
    w = np.stack([signal.fftconvolve(sig, ir[c]) for c in range(2)])
    w = w[:, : int(length * SR)][:, ::-1]
    return w / (np.abs(w).max() + 1e-9)


def loop_to(x, length, xf=1.5):
    """Loop a bed to `length` seconds with equal-power crossfades."""
    n = int(length * SR)
    k = int(xf * SR)
    out = np.zeros(n + len(x))
    pos = 0
    fade_in = np.sqrt(np.linspace(0, 1, k))
    fade_out = np.sqrt(np.linspace(1, 0, k))
    while pos < n:
        y = x.copy()
        y[:k] *= fade_in
        y[-k:] *= fade_out
        out[pos:pos + len(y)] += y
        pos += len(x) - k
    return out[:n]


def bed(name, b0, b1, gain, fade=1.5, lp=None, hp=None):
    """An ElevenLabs ambience under beats b0..b1 with fades."""
    x = load(f"sfx_{name}")
    x = loop_to(x, T(b1 - b0) + fade)
    if lp:
        x = filt(x, "lowpass", lp, 2)
    if hp:
        x = filt(x, "highpass", hp, 2)
    n = len(x)
    k = int(fade * SR)
    x[:k] *= np.linspace(0, 1, k) ** 1.5
    x[-k:] *= np.linspace(1, 0, k) ** 1.5
    return x * gain


# ---------------------------------------------------------------- the score

def main():
    low, strings, perc, fx, amb, tune = (Bus(DUR, BPM) for _ in range(6))

    vo, phrases, words = build_vo()

    # ---------------- cold open (b0-8): knocks are SFX; a sub rumble, then the 1817 card hit at b4
    low.add(bowed(hz("D1"), T(8), 220, attack=0.6), 0, 0.30)
    fx.add(rev_swell(load("sfx_whispers")[: SR * 3], T(1.0)), 3, 0.35)
    low.add(braam(5.0, hz("D1"), 1400, 2.0), 4, 0.55)
    amb.add(bed("night", 3, 26, 0.55, fade=2.0), 3)

    # ---------------- the cornfield (b8-26): drone, the warped dulcimer tune, the creature, the shot
    low.add(bowed(hz("D2"), T(14.5), 600), 8, 0.22)
    low.add(bowed(hz("A1"), T(14.5), 500), 8.1, 0.16)
    melody = [("A4", 8), ("D5", 9), ("C5", 9.5), ("A4", 10), ("G4", 11), ("F4", 12), ("E4", 12.5), ("D4", 13),
              ("A4", 14), ("D5", 15), ("F5", 15.5), ("E5", 16), ("C5", 17)]
    for nt, b in melody:
        tune.add(dulcimer(nt, 2.4, 0.5), b, 0.55, pan=0.25 * np.sin(b))
    # b18 "Something like a dog": a wrong note and a string stab
    tune.add(dulcimer("G#4", 3.0, 0.6), 18, 0.6, pan=-0.2)
    strings.add(cluster([hz("D5"), hz("Eb5"), hz("G#5"), hz("A5")], T(4.5), trem=11, attack=0.08), 18, 0.42)
    fx.add(rev_swell(slam(0.6), T(1.0)), 17, 0.25)
    strings.add(cluster([hz("D4"), hz("Eb4"), hz("A4")], T(3.5), trem=7, attack=0.6), 19, 0.25)
    # b22.5 the shot: everything stops; only tinnitus rings until the night
    n_t = int(T(4.0) * SR)
    tt = tvec(n_t)
    tinn = np.sin(2 * np.pi * 3870 * tt) * np.exp(-tt / 1.8) * (1 - np.exp(-tt / 0.08))
    fx.add(tinn, 22.6, 0.05, pan=0.3)

    # ---------------- night (b26-41): the cabin, the knocking, the montage
    amb.add(bed("wind", 25, 63, 0.40, fade=2.5, lp=5000), 25)
    low.add(bowed(hz("D1"), T(15.5), 300, attack=0.5), 25.5, 0.30)
    low.add(bowed(hz("Eb2"), T(10), 500, attack=0.7), 30, 0.12)
    for b in range(31, 41):
        perc.add(heart(1.0), b, 0.55 if b < 39 else 0.75)
    for b in (31, 33, 35, 37):
        low.add(braam(2.6, hz("D1") * (1 + 0.06 * ((b - 31) / 2)), 1800, 2.4), b, 0.38)
        perc.add(slam(1.2), b, 0.5)
    strings.add(cluster([hz("D5"), hz("Eb5"), hz("E5"), hz("F5"), hz("G#5")], T(3.0), trem=13, attack=0.9), 38, 0.45)
    fx.add(riser(T(2.0)), 39, 0.28)

    # ---------------- the haunting (b41-53): a fragile music box, slow heart; "And then..." drops out
    for nt, b in [("D6", 41), ("F6", 42), ("A5", 43), ("G5", 44.5), ("F5", 46), ("E5", 47), ("D5", 48)]:
        tune.add(dulcimer(nt, 2.6, 0.32), b, 0.5, pan=0.4)
    for b in range(41, 49, 2):
        perc.add(heart(0.8), b, 0.35)
    low.add(bowed(hz("D1"), T(8.2), 240, attack=0.3, release=0.1), 41, 0.25)
    strings.add(glass([hz("A5"), hz("Bb5")], T(8)), 41, 0.10)
    fx.add(rev_swell(load("sfx_whispers")[SR * 2:SR * 5], T(2.0)), 51, 0.45)

    # ---------------- the voice (b53-63): near silence: sub, glass, whispers circling
    low.add(bowed(hz("D1") * 0.5, T(10), 160, attack=0.2), 53, 0.45)
    strings.add(glass([hz("A5"), hz("Bb5"), hz("E6")], T(10)), 53, 0.13)
    amb.add(bed("whispers", 53, 62, 0.22, fade=2.0, hp=400), 53)

    # ---------------- KATE (b63-70): braam, then the ostinato starts
    low.add(braam(5.0, hz("D1"), 2600, 3.0), 63, 0.62)
    perc.add(slam(1.4), 63, 0.45)
    amb.add(bed("fire", 64, 89, 0.42, fade=2.0), 64)
    for k, b in enumerate(np.arange(66, 86, 0.5)):
        nt = ["D2", "D2", "Eb2", "D2"][k % 4]
        strings.add(spiccato(nt, 0.3), b, 0.20 + 0.25 * (b - 66) / 20, pan=-0.15)
        if b >= 70:
            perc.add(tick(k % 2 == 0), b, 0.10 + 0.12 * (b - 70) / 16, pan=0.35)
    # ---------------- the vial (b70-86): rising strings, tension into the blue fire
    low.add(bowed(hz("D1"), T(16.5), 350, attack=0.4, release=0.05), 70, 0.28)
    strings.add(cluster([hz("D4"), hz("Eb4"), hz("A4"), hz("Bb4")], T(8), trem=8, attack=0.8), 70, 0.22)
    strings.add(cluster([hz("D5"), hz("Eb5"), hz("A5"), hz("Bb5"), hz("E6")], T(8.4), trem=14, attack=0.9), 78, 0.32)
    fx.add(riser(T(4.0)), 82, 0.36)
    # b80.75 the cat: everything holds its breath for "The cat died"; b82
    # b86 BLUE: the biggest hit so far
    low.add(braam(6.0, hz("D1"), 3800, 3.4), 86, 0.85)
    perc.add(slam(1.8), 86, 0.6)
    fx.add(crash(3.0), 86, 0.25)

    # ---------------- death (b89-94): a bell, a held minor chord on a dying harmonium
    low.add(bowed(hz("D1"), T(5.5), 260, attack=0.15), 89, 0.25)
    hymn = np.zeros(int(T(20) * SR))
    for b, ch in [(0, ["D3", "F3", "A3", "D4"]), (4, ["Bb2", "F3", "Bb3", "D4"]), (8, ["G2", "D3", "Bb3", "D4"]),
                  (12, ["A2", "E3", "A3", "C#4"]), (16, ["D3", "F3", "A3", "D4"])]:
        h = harmonium(ch, T(4.4), 1700)
        s = int(T(b) * SR)
        hymn[s:s + len(h)] += h[: len(hymn) - s]
    hymn = dying_tape(tape(hymn, 0.15, 0.4), T(12), T(20), -4.0)
    tune.add(hymn, 89.5, 0.30)

    # ---------------- funeral (b94-108): graveyard night bed, the witch's song over a thinning hymn
    amb.add(bed("night", 93, 111, 0.40, fade=2.0, lp=3500), 93)
    strings.add(glass([hz("D6"), hz("Eb6")], T(10)), 99, 0.08)
    low.add(bowed(hz("D1"), T(15.5), 200, attack=0.3), 95, 0.24)

    # ---------------- the promise (b108-129): heartbeat accelerating, a Shepard rise, year stamps
    low.add(bowed(hz("D1"), T(21.5), 320, attack=0.2, release=0.02), 110, 0.30)
    beats_h = list(range(110, 118, 2)) + list(range(118, 125)) + list(np.arange(125, 131.5, 0.5))
    for b in beats_h:
        perc.add(heart(1.0), b, 0.42 + 0.3 * (b - 110) / 21)
    fx.add(shepard(T(21.5), 55, 6, 0.09), 110, 0.10)
    for b in (110, 114, 118.5, 125):
        low.add(braam(2.4, hz("D1"), 1400 + 300 * (b - 110) / 4, 2.2), b, 0.30)
    strings.add(cluster([hz("D5"), hz("Eb5"), hz("E5"), hz("F5"), hz("F#5"), hz("G5")], T(8.5), trem=16, attack=0.95), 123, 0.38)
    fx.add(riser(T(5.0)), 126.5, 0.30)

    # ---------------- b129.5: silence for the whisper. b135: the scare. b136: the title.
    # (the scream, its slam and the knocks are SFX hits; the score supplies the weight under them)
    tail = np.sin(2 * np.pi * 3870 * tvec(int(T(5) * SR))) * 0.5 * np.clip(np.linspace(0, 1, int(T(5) * SR)) * 3, 0, 1)
    fx.add(tail, 132, 0.012)
    # the scare is cut dead a beat later, so the title lands out of silence
    def chop(x, secs):
        n = int(secs * SR)
        y = x[..., :n].copy()
        f = int(0.025 * SR)
        y[..., -f:] *= np.linspace(1, 0, f)
        return y
    low.add(chop(braam(7.0, hz("D1"), 4200, 3.6), T(0.9)), 137, 1.0)
    fx.add(chop(crash(4.0), T(0.9)), 137, 0.35)
    low.add(braam(8.0, hz("D1"), 900, 1.8), 138, 0.55)
    strings.add(glass([hz("D5"), hz("A5"), hz("Eb6")], T(6.0)), 138, 0.08)

    # ---------------- mix the bed
    ir = reverb_ir(3.2, 1.0, seed_=9)
    wet_src = strings.x * 0.5 + tune.x * 0.55 + perc.x * 0.12 + fx.x * 0.3 + low.x * 0.08
    wet = np.stack([signal.fftconvolve(wet_src[c], ir[c])[: wet_src.shape[1]] for c in range(2)])
    mixb = low.x * 0.9 + strings.x * 0.7 + perc.x * 0.95 + fx.x * 0.8 + amb.x * 0.75 + tune.x * 0.8 + wet * 0.5
    mixb = np.stack([filt(ch, "highpass", 26) for ch in mixb])[:, :N]
    # structural silences: the shot (b22.5-25.2) and the held breath before the scare (b129.4-135)
    g = np.ones(N)

    def gate(b0, b1, floor=0.0, ramp=0.03):
        a, b = int(T(b0) * SR), int(T(b1) * SR)
        r = int(ramp * SR)
        g[a:b] = np.minimum(g[a:b], floor)
        g[max(0, a - r):a] = np.minimum(g[max(0, a - r):a], np.linspace(1, floor, min(r, a)))
        g[b:b + r] = np.minimum(g[b:b + r], np.linspace(floor, 1, len(g[b:b + r])))
    gate(22.55, 25.0, 0.0, 0.01)
    gate(49.0, 50.6, 0.08, 0.25)        # "And then..." holds its breath
    gate(80.6, 82.0, 0.05, 0.08)        # the cat
    gate(131.3, 136.98, 0.0, 0.25)
    gate(137.92, 138.0, 0.0, 0.01)
    keep_fx = fx.x[:, :N]
    mixb = mixb * g + keep_fx * (1 - g) * 0.8      # tinnitus and the held whine survive the gates
    mixb /= np.abs(mixb).max() + 1e-9
    mixb *= 0.62
    fade = int(0.8 * SR)
    mixb[:, -fade:] *= np.linspace(1, 0, fade) ** 2
    sf.write(HERE / "music.wav", mixb.T, SR, subtype="PCM_24")
    sf.write(HERE / "vo.wav", vo.T, SR, subtype="PCM_24")

    # ---------------- grid: designed (every musical event is placed on it), so written, not guessed
    grid = {"bpm": BPM, "period": BEAT, "offset": 0.0, "designed_bpm": BPM,
            "beats": [round(T(b), 5) for b in range(NBEATS + 1)],
            "downbeats": [round(T(b), 5) for b in range(0, NBEATS + 1, 4)],
            "sections": {"cold_open": [0, 8], "cornfield": [8, 26], "night": [26, 41], "haunting": [41, 53],
                         "voice": [53, 63], "kate": [63, 70], "vial": [70, 89], "death": [89, 94],
                         "funeral": [94, 110], "promise": [110, 131.5], "silence": [131.5, 137],
                         "scare": [137, 138], "title": [138, 144]},
            "source": "bell-witch/audio/score.py (designed grid; all score events placed on it)"}
    (FILM / "beats.json").write_text(json.dumps(grid, indent=1))
    (FILM / "vo.json").write_text(json.dumps({"phrases": phrases, "words": words}, indent=1))
    print(f"music.wav + vo.wav ({DUR:.1f} s), beats.json ({BPM} bpm, {NBEATS} beats), vo.json ({len(phrases)} phrases, {len(words)} words)")


if __name__ == "__main__":
    main()
