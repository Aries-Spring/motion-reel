# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10", "numpy", "scipy", "soundfile"]
# ///
"""WORKED EXAMPLE (the Chai Dhaba spot): a bespoke score with a talking character's VO on the grid.
Copy to <film>/audio/score.py and rewrite TAKE, PHRASES, the harmony and the arrangement for your film.

    uv run <film>/audio/score.py

What it shows: build_vo() cuts a force-aligned take (motion-reel-voice's tts tool) into phrases and lands each
phrase's speech onset on a beat, prints the gaps (fix any OVERLAP by moving a phrase), maps the
language's letters to visemes (here Urdu), and exports lipsync.json (100 Hz mouth envelope from the
processed VO + viseme segments + words + phrases, all in film time). main() writes music.wav and
vo.wav as separate stems (mix.mjs ducks the music under the voice) and measures beats.json on the
drums alone, so the voice can't pull the grid off the kick.

Reads  <film>/audio/vo/<TAKE>.mp3 + .fa.json
Writes <film>/audio/music.wav, <film>/audio/vo.wav, <film>/beats.json, <film>/lipsync.json

120 BPM, 4/4, 40 beats = 20.0 s, D Khamaj. A bhangra chaal on synthesized dhol (dagga + tilli)
over four-on-the-floor from the title drop; the whisper at beat 22 drops to a sneaking bass.
"""
import json
import os
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import uniform_filter1d

# the skill's synthesis toolkit: MOTION_REEL_SKILL (the folder holding SKILL.md), else a user-level
# install, else a plugin install
def _skill_dir():
    if os.environ.get("MOTION_REEL_SKILL"):
        return Path(os.environ["MOTION_REEL_SKILL"])
    user = Path.home() / ".claude/skills/motion-reel"
    if (user / "scripts/dsp.py").exists():
        return user
    found = sorted((Path.home() / ".claude/plugins").glob("**/skills/motion-reel/scripts/dsp.py"))
    if found:
        return found[-1].parent.parent
    sys.exit("can't find the motion-reel skill: set MOTION_REEL_SKILL to the folder that holds its SKILL.md")


SKILL = _skill_dir()
sys.path.insert(0, str(SKILL / "scripts"))
from dsp import *  # noqa: E402,F403

HERE = Path(__file__).resolve().parent
FILM = HERE.parent
BPM = 120
BEAT = 60 / BPM
DUR = 20.0
N = int(SR * DUR)
TAKE = "bill_t2"
seed(20260929)


def T(b):
    return b * BEAT


# ---------------------------------------------------------------- instruments (dsp.py has the rest)

def dagga(pitch=1.0, gain=1.0):
    """The dhol's bass head, hit with the curved stick: a boom that drops in pitch."""
    n = int(0.55 * SR)
    t = tvec(n)
    f = (68 + 62 * np.exp(-t / 0.045)) * pitch
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.26)
    x += 0.35 * np.sin(2 * np.pi * np.cumsum(f * 1.52) / SR) * np.exp(-t / 0.09)
    x += filt(rng.standard_normal(n) * np.exp(-t / 0.006), "bandpass", [180, 1500]) * 0.7
    return np.tanh(1.7 * x * gain) * (1 - np.exp(-t / 0.0008))


def tilli(bright=1.0):
    """The dhol's thin head, hit with the cane: a dry crack with a short ring."""
    n = int(0.18 * SR)
    t = tvec(n)
    x = filt(rng.standard_normal(n), "bandpass", [1400, 7000]) * np.exp(-t / (0.006 * bright))
    x += 0.5 * np.sin(2 * np.pi * 440 * t * (1 + 0.03 * np.exp(-t / 0.01))) * np.exp(-t / 0.05)
    x += 0.25 * np.sin(2 * np.pi * 1130 * t) * np.exp(-t / 0.02)
    return x * (1 - np.exp(-t / 0.0003))


def dhol_roll(length, n_hits, g0=0.2, g1=0.8):
    """Accelerating tilli roll into a hit (hits bunch up toward the end)."""
    out = np.zeros(int(length * SR) + SR // 4)
    for k in range(n_hits):
        p = k / (n_hits - 1)
        tt = length * (1 - (1 - p) ** 1.8)
        s = tilli(0.8 + 0.4 * p) * (g0 + (g1 - g0) * p)
        i = int(tt * SR)
        out[i:i + len(s)] += s[: len(out) - i]
        if k % 3 == 0:
            d = dagga(1.0 + 0.2 * p, 0.6) * (0.2 + 0.5 * p)
            out[i:i + len(d)] += d[: len(out) - i]
    return out


def shaker():
    n = int(0.09 * SR)
    t = tvec(n)
    return filt(rng.standard_normal(n), "highpass", 5000) * np.sin(np.pi * np.clip(t / 0.09, 0, 1)) ** 2


def scratch(length=0.32):
    """Record scratch for 'Nahin!': back-and-forth pitch zips of the drone."""
    n = int(length * SR)
    t = tvec(n)
    pos = np.sin(np.pi * np.clip(t / length, 0, 1) * 2.0) * 0.5            # forward, back
    rate = np.gradient(pos) * SR * 3.0
    f = 420 * np.abs(rate) + 60
    x = saw(f, n) * 0.6 + filt(rng.standard_normal(n), "bandpass", [600, 4000]) * np.abs(rate) * 0.6
    x = sweep_filter(x, 500 + 3000 * np.abs(rate), "lowpass", 1.5)
    return np.tanh(2 * x) * np.clip(np.abs(rate) * 1.5, 0, 1)


def rabab(note, length=0.5, gain=1.0):
    return ks_pluck(hz(note), length, bright=0.75, buzz=0.5) * gain


# ---------------------------------------------------------------- VO edit

# (first word, last word) in the take's forced alignment (spaces and dashes dropped), the beat its
# speech onset lands on, and the Roman-Urdu line (the supers and the shot list use these)
PHRASES = [
    (0, 0, 1, "OYE!"),
    (1, 3, 2, "CHAI PEENI HAI?"),
    (4, 4, 4, "NAHIN!"),
    (5, 6, 5, "DHABA CHALAO!"),
    (7, 7, 7, "CHAI"),
    (8, 8, 8, "DHABA!"),
    (9, 10, 9.5, "HAR BAARI:"),
    (11, 12, 11, "SIKKAY DO"),
    (13, 14, 12.5, "CARD UTHAO"),
    (15, 16, 14, "CARD KHELO"),
    (17, 18, 16, "WAITER RAKHO!"),
    (19, 20, 18, "RECIPE LAGAO"),
    (21, 22, 20, "GAHAK KHENCHO"),
    (23, 26, 22, "DOSTON KE GAHAK CHHEENO!"),     # whispered
    (29, 30, 25, "PAISA NAHIN"),                  # ("yaad rakho", words 27-28, left out)
    (31, 33, 27, "GAHAK JITWATE HAIN!"),
    (34, 37, 30.5, "TEEN SE PAANCH KHILADI"),
    (38, 39, 34, "CHAI DHABA!"),
]
WHISPER = {13}

# Urdu letters -> mouth shapes: labials close, ف bites, و rounds, ی spreads, ا/ہ/ع open.
VIS = {}
for ch in "مبپ":
    VIS[ch] = "M"
VIS["ف"] = "F"
for ch in "وؤُ":
    VIS[ch] = "O"
for ch in "یےئيِ":
    VIS[ch] = "E"
for ch in "اآعہھهَةأ":
    VIS[ch] = "A"


def viseme(ch):
    if ch.isspace() or ch in "،۔؟!—-[]:":
        return None
    return VIS.get(ch, "C")


def build_vo():
    y, _ = librosa.load(HERE / "vo" / f"{TAKE}.mp3", sr=SR, mono=True)
    fa = json.loads((HERE / "vo" / f"{TAKE}.fa.json").read_text())
    words = [w for w in fa["words"] if w["text"].strip(" —-")]
    chars = [(c["text"], c["start"], c["end"]) for c in fa["characters"]]

    hop = int(SR * 0.005)
    rms = librosa.feature.rms(y=y, frame_length=hop * 4, hop_length=hop)[0]
    db = 20 * np.log10(rms + 1e-9) - 20 * np.log10(rms.max())

    vo = np.zeros(N + SR)
    placed, segs, wout = [], [], []
    for pi, (i, j, beat, roman) in enumerate(PHRASES):
        prev_end = words[i - 1]["end"] if i > 0 else 0.0
        next_start = words[j + 1]["start"] if j + 1 < len(words) else len(y) / SR
        a = max(0.0, (prev_end + words[i]["start"]) / 2)
        b = min(len(y) / SR, (words[j]["end"] + next_start) / 2)
        i0, i1 = int(a / 0.005), int(b / 0.005)
        loud = np.nonzero(db[i0:i1] > (-40 if pi in WHISPER else -32))[0]
        on = a + loud[0] * 0.005 - 0.015
        off = a + loud[-1] * 0.005 + 0.03
        shift = T(beat) - on
        seg = y[int(a * SR):int(b * SR)].copy()
        fi, fo = int(0.004 * SR), int(0.012 * SR)
        seg[:fi] *= np.linspace(0, 1, fi)
        seg[-fo:] *= np.linspace(1, 0, fo)
        if pi in WHISPER:
            seg *= 10 ** (7 / 20)
        s = int(round((a + shift) * SR))
        vo[s:s + len(seg)] += seg
        placed.append((on + shift, off + shift, roman))
        for c, s0, s1 in chars:
            if a - 0.01 <= s0 < b - 0.01:
                v = viseme(c)
                if v:
                    segs.append([round(s0 + shift, 3), round(s1 + shift, 3), v])
        for k in range(i, j + 1):
            wout.append({"i": k, "p": pi, "t0": round(words[k]["start"] + shift, 3),
                         "t1": round(words[k]["end"] + shift, 3), "ur": words[k]["text"]})

    print("VO edit:")
    for (a0, b0, l0), (a1, _, _) in zip(placed, placed[1:] + [(DUR, 0, "")]):
        gap = a1 - b0
        print(f"  {l0:26s} {a0:6.3f}-{b0:6.3f}  gap {gap * 1000:+5.0f} ms" + ("  OVERLAP" if gap < 0 else ""))
    phrases = [{"p": k, "t0": round(a, 3), "t1": round(b, 3), "roman": r, "beat": PHRASES[k][2]}
               for k, (a, b, r) in enumerate(placed)]
    return vo[:N], segs, wout, phrases


def compress(x, thresh_db=-22, ratio=3.0, attack=0.004, release=0.08, makeup_db=4):
    e = env_follow(x, attack, release)
    over = np.maximum(20 * np.log10(e + 1e-9) - thresh_db, 0)
    return x * 10 ** ((-over * (1 - 1 / ratio) + makeup_db) / 20)


def vo_chain(x):
    x = filt(x, "highpass", 90, 2)
    x = peq(x, 220, -2.5, 1.0)       # less boxy
    x = peq(x, 3200, 3.5, 0.9)       # presence: the words cut through the dhol
    x = peq(x, 9500, 2.0, 0.7)       # air
    return compress(x)


# ---------------------------------------------------------------- the score

def main():
    drums, perc, bass, music, fx = (Bus(DUR, BPM) for _ in range(5))

    vo, segs, words, phrases = build_vo()

    # harmony, per beat range: D Khamaj (D Mixolydian). I - bVII - IV - V
    Dc, Cc, Gc, Ac = (["D3", "A3", "F#4", "A4"], "D2"), (["C3", "G3", "E4", "G4"], "C2"), \
                     (["G2", "D3", "B3", "D4"], "G1"), (["A2", "E3", "C#4", "E4"], "A1")
    harmony = [(0, Dc), (8, Dc), (12, Cc), (16, Gc), (20, Ac), (22, Dc), (25, Dc), (28, Cc), (30, Gc),
               (32, Ac), (34, Dc)]

    def chord_at(b):
        cur = harmony[0][1]
        for hb, ch in harmony:
            if b >= hb:
                cur = ch
        return cur

    # ---- intro (b0-4): harmonium drone + tabla answering the hook; "Nahin!" scratches it to a stop
    music.add(harmonium(["D3", "A3", "D4"], T(4.0), 2000), 0, 0.30)
    for b, bl, g in ((0, "dha", 0.7), (0.75, "na", 0.3), (1.5, "dhi", 0.35), (2.75, "na", 0.3),
                     (3.0, "ti", 0.25), (3.25, "ti", 0.25), (3.5, "dha", 0.45)):
        perc.add(bol(bl), b, g, pan=-0.15)
    for b in np.arange(0.5, 4, 0.5):
        drums.add(shaker(), b + 0.25, 0.12, pan=0.3)
    fx.add(scratch(0.3), 3.93, 0.5)

    # ---- b5-8: "Dhaba chalao!" -> a dhol roll that accelerates into CHAI (b7) and DHABA (b8)
    fx.add(dhol_roll(T(2.0), 22, 0.12, 0.7), 5, 0.55, pan=-0.1)
    fx.add(riser(T(3.0)), 5, 0.22)
    music.add(harmonium(["D3", "A3", "F#4"], T(3.0), (1400)), 5, 0.18)

    # ---- the groove: b8-22 and b25-40 (the whisper b22-25 drops out)
    def groove_on(b):
        return (8 <= b < 22) or (25 <= b < 40)

    for b in range(8, 40):
        if not groove_on(b) or b >= 38:
            continue
        drums.add(kick(), b, 0.9)
        if b % 2 == 1:
            drums.add(clap(), b, 0.4, pan=0.05)
        drums.add(hat(), b + 0.5, 0.2, pan=0.25)
        if 12 <= b < 22 or 27 <= b < 34:
            drums.add(hat(), b + 0.75, 0.07, pan=-0.3)
    drums.add(kick(), 38, 1.0)
    # bhangra chaal on the dhol, swung 16ths: dagga on 0, 1.5, 2, 3.5 ; tilli fills the rest
    sw = 0.08
    for bar in range(2, 10):
        for pos, kind, g in ((0, "d", 0.8), (0.5, "t", 0.4), (1.0, "t", 0.5), (1.5, "d", 0.6),
                             (1.75 + sw / 2, "t", 0.3), (2.0, "d", 0.75), (2.5, "t", 0.4),
                             (3.0, "t", 0.5), (3.25 + sw / 2, "t", 0.25), (3.5, "d", 0.6),
                             (3.75 + sw / 2, "t", 0.35)):
            b = bar * 4 + pos
            if not groove_on(b) or b >= 38.5:
                continue
            perc.add(dagga(1.0, 0.9) if kind == "d" else tilli(), b, g, pan=-0.2 if kind == "t" else 0)
    # dhol roll into the whisper exit (b25) and into the end card (b34)
    fx.add(dhol_roll(T(1.0), 9, 0.1, 0.5), 24, 0.45, pan=0.1)
    fx.add(dhol_roll(T(3.5), 26, 0.1, 0.75), 30.5, 0.4, pan=-0.1)

    # ---- bass: eighths on the root with an octave bounce; sneaking staccato under the whisper
    for b2 in range(16, 80):
        beat = b2 / 2
        if not groove_on(beat) or beat >= 38:
            continue
        root = chord_at(beat)[1]
        note = root[:-1] + str(int(root[-1]) + (1 if b2 % 2 else 0))
        bass.add(bass_note(note, BEAT / 2 * 0.85, 1000), beat, 0.5 if b2 % 2 else 0.62)
    for b, nt in ((22, "D2"), (22.75, "F2"), (23.5, "G2"), (24, "G#2"), (24.5, "A2")):
        bass.add(bass_note(nt, BEAT * 0.3, 600), b, 0.75)
    for b in np.arange(22, 25, 0.5):
        drums.add(shaker(), b + 0.25, 0.1, pan=-0.2)
        perc.add(dayan("ti"), b, 0.12, pan=0.2)
    bass.add(bass_note("D2", T(1.8), 700), 38, 0.6)

    # ---- harmonium chords (off-beat stabs, the bhangra bounce) and a rabab answering the voice
    for b2 in range(16, 76):
        beat = b2 / 2
        if not groove_on(beat) or b2 % 2 == 0 or beat >= 38:
            continue
        music.add(harmonium(chord_at(beat)[0][1:], BEAT * 0.38, 2400), beat, 0.16)
    music.add(harmonium(["D3", "A3", "D4", "F#4"], T(2.2), 2600), 38, 0.25)
    lick = [("A4", 3.0), ("B4", 3.25), ("C5", 3.5),                                  # "chai peeni hai?" answer
            ("D5", 6.0), ("F#5", 6.25), ("A5", 6.5),                                 # into the drop
            ("D6", 8.5), ("C6", 9.0),                                                 # after DHABA!
            ("A5", 17.0), ("B5", 17.25), ("C6", 17.5),                                # after waiter
            ("D6", 19.5), ("A5", 21.0), ("F#5", 21.5),
            ("E5", 24.0), ("D5", 24.5),                                               # the whisper's tail
            ("F#5", 26.0), ("A5", 26.25),
            ("D6", 29.0), ("C6", 29.25), ("A5", 29.5), ("B5", 29.75), ("C6", 30.0),
            ("F#5", 33.0), ("G5", 33.25), ("A5", 33.5),
            ("D6", 35.0), ("C6", 35.5), ("A5", 36.0), ("F#5", 36.5), ("D6", 38.0)]
    for nt, b in lick:
        music.add(rabab(nt, 1.2 if b in (8.5, 38.0) else 0.45), b, 0.26, pan=0.25)

    # ---- mix the bed: kick pump, reverb, the grid measured on the drums alone
    kick_t = [T(b) for b in range(8, 39) if groove_on(b)]
    pump = sidechain(kick_t, bass.x.shape[1], 0.45, 0.1)
    ir = reverb_ir(1.4, 0.35)
    wet_src = music.x * 0.35 + perc.x * 0.1 + fx.x * 0.12
    wet = np.stack([signal.fftconvolve(wet_src[c], ir[c])[: wet_src.shape[1]] for c in range(2)])
    bed = drums.x * 0.85 + perc.x * 0.8 + bass.x * pump * 0.8 + music.x * pump * 0.75 + fx.x * 0.7 + wet * 0.45
    bed = np.stack([filt(ch, "highpass", 28) for ch in bed])[:, :N]
    # a hard stop on "Nahin!" (b4-5): only the scratch survives
    g = np.ones(N)
    a, b = int(T(3.97) * SR), int(T(5.0) * SR)
    g[a:b] = 0
    keep = fx.x[:, a:b] * 0.7
    bed[:, a:b] = keep
    bed /= np.abs(bed).max() + 1e-9
    bed *= 0.5
    fade = int(0.3 * SR)
    bed[:, -fade:] *= np.linspace(1, 0, fade) ** 2
    sf.write(HERE / "music.wav", bed.T, SR, subtype="PCM_24")

    grid_src = (drums.x + perc.x * 0.6)[:, :N].mean(axis=0)
    grid = measure_beats(grid_src, SR, BPM, n_beats=41)
    grid.update({"designed_bpm": BPM, "downbeats": grid["beats"][::4],
                 "sections": {"hook": [0, 8], "turn": [8, 18], "customers": [18, 22], "whisper": [22, 25],
                              "rule": [25, 30.5], "players": [30.5, 34], "end": [34, 40]},
                 "source": "chai/audio/score.py drum + dhol stems, librosa beat_track + onsets, linear fit"})
    (FILM / "beats.json").write_text(json.dumps(grid, indent=1))
    print(f"beats: {grid['bpm']} bpm, offset {grid['offset'] * 1000:.1f} ms, "
          f"{grid['fit_inliers']}/{len(grid['detected'])} inliers, fit rms {grid['fit_residual_ms']} ms")

    # ---- VO: process, write, and derive the mouth from it
    v = vo_chain(vo)
    v = v / (np.abs(v).max() + 1e-9) * 0.7
    sf.write(HERE / "vo.wav", np.stack([v, v]).T, SR, subtype="PCM_24")
    hop = SR // 100
    fr = np.sqrt(np.maximum(uniform_filter1d(v ** 2, hop * 3)[::hop], 0))
    op = np.clip((20 * np.log10(fr + 1e-9) - 20 * np.log10(fr.max()) + 40) / 34, 0, 1)
    sm, e = np.zeros_like(op), 0.0
    for i, x in enumerate(op):
        e += (x - e) * (0.75 if x > e else 0.4)      # mouths open fast, close a touch slower
        sm[i] = e
    (FILM / "lipsync.json").write_text(json.dumps({
        "rate": 100, "open": [round(float(x), 3) for x in sm], "visemes": segs,
        "words": words, "phrases": phrases}, ensure_ascii=False))
    print(f"lipsync: {len(segs)} visemes, {len(words)} words, {len(phrases)} phrases")


if __name__ == "__main__":
    main()
