# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10", "numpy", "scipy", "soundfile"]
# ///
"""THE WOW! SIGNAL (YouTube Short): score, voice edit and beat grid.

    MOTION_REEL_SKILL=<skill> uv run wow-signal/audio/score.py

100 BPM, 99 beats = 59.4 s, A minor. An analog-sequencer score (1977 by way of a 1997 console):
pulsing bass, 16th-note arps, gated drums, and the signal itself sonified from the real printout:
the six intensities 6 E Q U J 5 = 6, 14, 26, 30, 19, 5 (times the noise) drive a 1420 Hz tone, one
letter per beat. The narration (ElevenLabs "Brian", take vB) is cut into phrases whose speech onsets
land on the grid; the edit ends on "...this piece of paper" so the Short loops into its first line.

Reads   audio/el/vB.mp3 + .json, audio/el/sfx_*.mp3 (ambience beds)
Writes  audio/music.wav, audio/vo.wav, beats.json, vo.json
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
BPM = 100
BEAT = 60 / BPM
NBEATS = 99
DUR = NBEATS * BEAT
N = int(SR * DUR)
TAKE = "vB"
INTENSITY = [6, 14, 26, 30, 19, 5]          # 6 E Q U J 5 (A=10 ... Z=35)
seed(1977)


def T(b):
    return b * BEAT


_cache = {}


def load(name):
    if name not in _cache:
        y, _ = librosa.load(EL / f"{name}.mp3", sr=SR, mono=True)
        _cache[name] = y.astype(np.float64)
    return _cache[name].copy()


def words_of(take):
    """Spoken words with times: the forced alignment (<take>.fa.json) when there is one, since the
    v3 with-timestamps alignment drifts by up to a second over a long take."""
    fa = EL / f"{take}.fa.json"
    if fa.exists():
        return [(w["text"], w["start"], w["end"]) for w in json.loads(fa.read_text())["words"] if w["text"].strip()]
    return words_tts(take)


def words_tts(take):
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
# (id, first word, last word, beat of the speech onset, kind)
PHRASES = [
    ("H1", 0, 12, 0, "narr"),        # This piece of paper might be the only time aliens ever called Earth.
    ("S1", 13, 14, 7, "narr"),     # August, 1977.
    ("S2", 15, 23, 10.25, "narr"),     # A radio telescope in Ohio is listening for aliens.
    ("S3", 24, 41, 15.75, "narr"),      # Late one night, it hears something so loud... letters.
    ("L0", 42, 42, 26, "letter"),      # Six.
    ("L1", 43, 43, 27, "letter"),      # E.
    ("L2", 44, 44, 28, "letter"),      # Q.
    ("L3", 45, 45, 29, "letter"),      # U.
    ("L4", 46, 46, 30, "letter"),      # J.
    ("L5", 47, 47, 31, "narr"),      # Five.
    ("S4", 48, 62, 33, "narr"),      # It rises, peaks, and fades in seventy-two seconds, exactly like a signal from deep space.
    ("S5", 63, 72, 43.5, "narr"),    # On the exact frequency scientists had guessed aliens would use.
    ("S6", 73, 79, 50.5, "narr"),    # Days later, astronomer Jerry Ehman finds it.
    ("S7", 80, 88, 55.5, "narr"),      # He circles it in red... and writes one word.
    ("S8", 89, 95, 63.5, "narr"),    # Telescopes have searched that spot for decades.
    ("S9", 96, 99, 68.5, "whisper"), # It never came back.
    ("S10", 100, 105, 71.5, "narr"), # And the telescope that heard it?
    ("S11", 106, 114, 74.5, "narr"), # Torn down in 1998... to expand a golf course.
    ("S12", 115, 126, 82, "narr"), # In 2024, scientists suggested a natural flash, in a cloud of hydrogen.
    ("S13", 127, 131, 91.5, "narr"),   # But nobody can prove it.
    ("S14", 132, 140, 94, "narr"),   # So all we have... is this piece of paper.
]


def rms_db(y, hop):
    rms = librosa.feature.rms(y=y, frame_length=hop * 4, hop_length=hop, center=True)[0]
    return 20 * np.log10(rms + 1e-9) - 20 * np.log10(rms.max() + 1e-9)


def compress(x, thresh_db=-20, ratio=3.5, attack=0.003, release=0.08, makeup_db=5):
    e = env_follow(x, attack, release)
    over = np.maximum(20 * np.log10(e + 1e-9) - thresh_db, 0)
    return x * 10 ** ((-over * (1 - 1 / ratio) + makeup_db) / 20)


def narr_chain(x):
    x = filt(x, "highpass", 80, 2)
    x = peq(x, 160, 1.5, 0.8)       # chest
    x = peq(x, 380, -2.5, 1.0)      # less boxy
    x = peq(x, 3200, 3.0, 0.9)      # presence: Shorts are watched on phone speakers
    x = peq(x, 8000, 1.5, 0.7)      # air
    x = np.tanh(1.2 * x) / np.tanh(1.2)
    return compress(x)


def build_vo():
    y = load(TAKE)
    W = words_of(TAKE)
    hop = int(SR * 0.005)
    db = rms_db(y, hop)
    narr = np.zeros(N + SR * 4)
    placed, wout = [], []
    def quiet(t0, t1):
        """The quietest 5 ms frame between two times: where a phrase can be cut cleanly."""
        f0, f1 = int(max(0, t0) / 0.005), int(min(len(y) / SR, t1) / 0.005)
        if f1 <= f0 + 1:
            return (t0 + t1) / 2
        return (f0 + int(np.argmin(db[f0:f1]))) * 0.005

    for pid, i, j, beat, kind in PHRASES:
        a = quiet(W[i - 1][2] - 0.05, W[i][1] + 0.06) if i > 0 else 0.0
        b = quiet(W[j][2] - 0.04, W[j + 1][1] + 0.06) if j + 1 < len(W) else len(y) / SR
        i0, i1 = int(a / 0.005), int(b / 0.005)
        thr = -44 if kind == "whisper" else -38
        loud = np.nonzero(db[i0:i1] > thr)[0]
        if not len(loud):
            sys.exit(f"{pid}: no speech between {a:.3f} and {b:.3f} (words {W[i][1]:.2f}-{W[j][2]:.2f}, max {db[i0:i1].max() if i1 > i0 else -999:.1f} dB)")
        on = a + loud[0] * 0.005 - 0.008
        off = a + loud[-1] * 0.005 + 0.03
        a = max(a, on - 0.02)
        target = T(beat) if beat > 0 else 0.04          # the hook speaks on frame 2
        shift = target - on
        if kind == "letter":
            b = min(b, on + 0.56)            # one letter per beat, clean
        seg = y[int(a * SR):int(b * SR)].copy()
        fi, fo = int(0.005 * SR), int((0.06 if kind == "letter" else 0.04) * SR)
        seg[:fi] *= np.linspace(0, 1, fi)
        seg[-fo:] *= np.linspace(1, 0, fo)
        s = int(round((a + shift) * SR))
        g = 1.5 if kind == "whisper" else 1.0
        narr[s:s + len(seg)] += g * seg
        placed.append((pid, on + shift, off + shift, kind))
        for k in range(i, j + 1):
            wout.append({"p": pid, "w": W[k][0], "t0": round(W[k][1] + shift, 3), "t1": round(W[k][2] + shift, 3)})
    print("VO edit:")
    for (p0, a0, b0, _), (_, a1, _, _) in zip(placed, placed[1:] + [("", DUR, 0, "")]):
        gap = a1 - b0
        print(f"  {p0:4s} {a0:7.3f}-{b0:7.3f}  (b{a0 / BEAT:6.2f})  gap {gap * 1000:+6.0f} ms" + ("  OVERLAP" if gap < -0.03 else ""))
    nm = narr_chain(narr)
    room = reverb_ir(0.6, 0.12, seed_=11)
    vo = np.stack([nm, nm]) + 0.05 * np.stack([signal.fftconvolve(nm, room[c])[: len(nm)] for c in range(2)])
    vo = vo[:, :N]
    vo /= np.abs(vo).max() + 1e-9
    vo *= 0.75
    phrases = [{"id": p, "t0": round(a, 3), "t1": round(b, 3), "kind": k, "beat": round(a / BEAT, 3)} for p, a, b, k in placed]
    return vo, phrases, wout


# ---------------------------------------------------------------- instruments

def arp(note, length=0.16, cutoff=2600, res=1.4, square=0.5):
    """Analog sequencer pluck: saw + square, a snappy filter envelope."""
    f = hz(note)
    n = int(length * SR)
    t = tvec(n)
    sq = np.sign(np.sin(2 * np.pi * f * 1.003 * t + rng.uniform(0, 6)))
    x = saw(f, n, rng.uniform()) * (1 - square) + sq * square * 0.7
    x = sweep_filter(x, 260 + cutoff * np.exp(-t / 0.05), "lowpass", res)
    return x * np.exp(-t / (length * 0.45)) * (1 - np.exp(-t / 0.002))


def sigtone(length, env, f=1420.0, noise=0.25):
    """The hydrogen-line tone: a narrow sine, a little band-limited hiss, under an envelope."""
    n = int(length * SR)
    t = tvec(n)
    x = np.sin(2 * np.pi * f * t + 0.6 * np.sin(2 * np.pi * 5.5 * t))
    x += noise * filt(rng.standard_normal(n), "bandpass", [f * 0.85, f * 1.15], 2)
    e = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(env)), env)
    return x * e


def tom(f0=110, length=0.6):
    n = int(length * SR)
    t = tvec(n)
    f = f0 * (1 + 0.8 * np.exp(-t / 0.03))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)
    x += filt(rng.standard_normal(n), "bandpass", [200, 2500]) * np.exp(-t / 0.02) * 0.4
    return np.tanh(1.6 * x) * (1 - np.exp(-t / 0.001))


def hit(length=2.2):
    """Trailer hit: sub drop + noise crack + a low stab."""
    n = int(length * SR)
    t = tvec(n)
    sub = sub_drop(length, 90, 32)
    crack = filt(rng.standard_normal(n), "bandpass", [400, 6000]) * np.exp(-t / 0.05)
    stab = sum(saw(hz(nt), n, rng.uniform()) for nt in ("A1", "E2", "A2")) / 3
    stab = sweep_filter(stab, 150 + 2500 * np.exp(-t / 0.2), "lowpass", 1.1) * np.exp(-t / 0.7)
    return np.tanh(1.5 * (sub * 0.9 + crack * 0.6 + stab * 0.7))


def tick(hi=True):
    n = int(0.04 * SR)
    t = tvec(n)
    f = 3000 if hi else 2200
    return filt(rng.standard_normal(n), "bandpass", [f * 0.7, f * 1.3]) * np.exp(-t / 0.004)


def ping(note="E6", length=1.6):
    """Sonar-like search ping."""
    f = hz(note)
    n = int(length * SR)
    t = tvec(n)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2.01 * t)) * np.exp(-t / 0.35) * (1 - np.exp(-t / 0.003))


def organ(notes, length):
    """Cheesy lounge organ for the golf course."""
    n = int(length * SR)
    t = tvec(n)
    x = np.zeros(n)
    for nt in notes:
        f = hz(nt)
        for m, g in ((1, 1), (2, 0.5), (3, 0.3), (4, 0.2)):
            x += g * np.sin(2 * np.pi * f * m * t * (1 + 0.003 * np.sin(2 * np.pi * 6.5 * t)))
    return x / len(notes) * adsr(n, 0.01, 0.1, 0.8, 0.05) * 0.4


def rim():
    n = int(0.08 * SR)
    t = tvec(n)
    return (np.sin(2 * np.pi * 1700 * t) * 0.6 + filt(rng.standard_normal(n), "bandpass", [1500, 5000])) * np.exp(-t / 0.012)


def bed(name, b0, b1, gain, fade=1.0, lp=None, hp=None):
    x = load(f"sfx_{name}")
    n = int(T(b1 - b0) * SR)
    reps = int(np.ceil(n / len(x))) + 1
    x = np.tile(x, reps)[:n]
    if lp:
        x = filt(x, "lowpass", lp, 2)
    if hp:
        x = filt(x, "highpass", hp, 2)
    k = int(fade * SR)
    x[:k] *= np.linspace(0, 1, k)
    x[-k:] *= np.linspace(1, 0, k)
    return x * gain


# ---------------------------------------------------------------- the score

PROG = [("A", ["A2", "C3", "E3", "B3"]), ("F", ["F2", "A2", "C3", "E3"]), ("C", ["C3", "E3", "G3", "B3"]), ("G", ["G2", "B2", "D3", "A3"])]


def chord_at(b):
    return PROG[int(b // 4) % 4]


def main():
    drums, bass, synth, pad, fx, amb = (Bus(DUR, BPM) for _ in range(6))
    vo, phrases, words = build_vo()
    W = {p["id"]: p for p in phrases}

    def word_t(pid, k=0):
        ws = [w for w in words if w["p"] == pid]
        return ws[k]["t0"]

    # ---- beds: radio static under the space/printout shots, the Ohio night, the computer room
    amb.add(bed("static", 0, 7, 0.22, fade=0.05), 0)
    amb.add(bed("night", 7, 15.75, 0.35, fade=0.6, lp=6000), 7)
    amb.add(bed("computer", 15.75, 26, 0.32, fade=0.4), 15.75)
    amb.add(bed("static", 63.5, 71.5, 0.16, fade=1.0, hp=300), 63.5)
    amb.add(bed("static", 94, 99, 0.18, fade=0.6), 94)

    def groove(b0, b1, kicks=True, claps=True, hats=True, arps=True, bassline=True, cutoff=2600, gain=1.0):
        for b in np.arange(b0, b1, 0.25):
            beat_i = b - np.floor(b)
            if kicks and beat_i == 0:
                drums.add(kick(), b, 0.85 * gain)
            if claps and beat_i == 0 and int(b) % 2 == 1:
                drums.add(clap(), b, 0.35 * gain, pan=0.05)
            if hats and beat_i in (0.5,):
                drums.add(hat(), b, 0.18 * gain, pan=0.2)
            if hats and beat_i in (0.25, 0.75):
                drums.add(hat(), b, 0.06 * gain, pan=-0.2)
            name, notes = chord_at(b)
            if arps:
                seq = [notes[0], notes[2], notes[3], notes[1]]
                nt = seq[int(b * 4) % 4]
                octv = nt[:-1] + str(int(nt[-1]) + 2)
                synth.add(arp(octv, 0.17, cutoff), b, 0.16 * gain, pan=0.3 * np.sin(b * 2.1))
            if bassline and beat_i in (0, 0.5):
                root = notes[0][:-1] + str(int(notes[0][-1]) - 1)
                bass.add(bass_note(root, BEAT * 0.45, 700), b, 0.5 * gain)

    # ---- 0-6.5 HOOK: a hit on frame 0, the static, a pulse that starts the clock
    fx.add(hit(2.5), 0, 0.75)
    pad.add(pad_chord(["A2", "E3", "C4", "B4"], T(6.5), (500, 1800), attack=0.02, release=0.3), 0, 0.22)
    groove(0, 6.5, kicks=False, claps=False, hats=False, arps=True, bassline=True, cutoff=1400, gain=0.8)
    fx.add(sigtone(T(6.5), [0, 0.2, 0.5, 0.3, 0.1, 0]), 0, 0.05)

    # ---- 6.5-15 SETUP: the field, the telescope: arps + a soft four-on-the-floor
    fx.add(whoosh(1.0, 300, 3000), 5.5, 0.18)
    groove(6.5, 15, claps=False, cutoff=1800, gain=0.75)
    pad.add(pad_chord(["A2", "E3", "C4"], T(8.5), (600, 1500)), 6.5, 0.16)

    # ---- 15-26 BUILD: the room, "so loud", the riser into the letters
    groove(15, 25, cutoff=2400, gain=0.9)
    fx.add(riser(T(4.0)), 21, 0.32)
    fx.add(hit(2.0), 25, 0.55)

    # ---- 26-32 LETTERS: each letter its own beat: kick, tom, and the signal at the printed strength
    for k, v in enumerate(INTENSITY):
        b = 26 + k
        drums.add(kick(), b, 0.8)
        drums.add(tom(90 + v * 3), b, 0.35 + 0.012 * v, pan=(k - 2.5) * 0.12)
        fx.add(sigtone(T(0.95), [0, 1, 1, 0.8, 0.4, 0]), b, 0.03 + 0.006 * v)
        synth.add(arp(["A4", "C5", "E5", "A5", "E5", "A4"][k], 0.4, 1800 + 60 * v), b, 0.25)
    pad.add(pad_chord(["A2", "E3", "B3", "C4"], T(7), (400, 2400), attack=0.1), 26, 0.2)

    # ---- 33-43 72 SECONDS: the full groove, and the signal rising and fading across it
    fx.add(hit(1.6), 33, 0.45)
    groove(33, 43, cutoff=3200, gain=1.0)
    env72 = [0] + [v / 30 for v in INTENSITY] + [0]
    fx.add(sigtone(T(10), env72), 33, 0.07)

    # ---- 43.5-50.5 FREQUENCY: the groove filtered down, a held hydrogen-line drone
    groove(43.5, 50.5, claps=False, cutoff=1300, gain=0.8)
    fx.add(sigtone(T(7), [0, 0.6, 0.8, 0.8, 0.6, 0]), 43.5, 0.05)
    pad.add(pad_chord(["F2", "C3", "A3", "E4"], T(7), (500, 2000)), 43.5, 0.2)

    # ---- 50.5-61 DAYS LATER: pad and a clock; a riser into the WOW
    pad.add(pad_chord(["A2", "E3", "C4"], T(10.5), (400, 900), attack=0.4), 50.5, 0.2)
    for b in np.arange(50.5, 61, 0.5):
        drums.add(tick(int(b * 2) % 2 == 0), b, 0.12)
    bass.add(bass_note("A1", T(4.5), 400), 50.5, 0.4)
    bass.add(bass_note("F1", T(6), 400), 55, 0.4)
    fx.add(riser(T(3.5)), 57.5, 0.3)

    # ---- 61-63.5 WOW: the hit, and the score turns major
    fx.add(hit(3.0), 61, 0.6)
    pad.add(pad_chord(["A2", "E3", "A3", "C#4", "E4", "A4"], T(3.2), (800, 4500), attack=0.03, release=0.5), 61, 0.34)
    synth.add(arp("A5", 1.5, 3000), 61, 0.3)
    synth.add(arp("E6", 1.5, 3000), 61.5, 0.2)
    synth.add(arp("C#6", 1.5, 3000), 62, 0.2)

    # ---- 63.5-71.5 DECADES: sparse, searching pings; then nothing
    pad.add(pad_chord(["D3", "F3", "A3", "C4"], T(5), (500, 900), attack=0.3), 63.5, 0.18)
    for b in (63.5, 65.5, 67.5):
        fx.add(ping("E6", 1.6), b, 0.12, pan=0.3 * np.sin(b))
    bass.add(bass_note("D1", T(4.8), 300), 63.5, 0.35)

    # ---- 71.5-80.5 THE TELESCOPE: a question, a crash, and then the golf course
    fx.add(riser(T(3.0)), 71.5, 0.22)
    fx.add(hit(2.0), word_t("S11", 0) / BEAT, 0.5)        # "Torn down"
    golf = word_t("S11", 7)                     # "golf"
    gb = golf / BEAT
    for k, b in enumerate(np.arange(np.floor(gb * 2) / 2, 82, 0.5)):
        ch = [["C4", "E4", "G4", "B4"], ["F3", "A3", "C4", "E4"]][int(k // 2) % 2]
        synth.add(organ(ch, BEAT * 0.4), b, 0.5)
        drums.add(rim(), b + 0.25, 0.25)
        if k % 2 == 0:
            bass.add(bass_note(["C2", "F2"][int(k // 2) % 2], BEAT * 0.4, 500), b, 0.35)

    # ---- 80.5-94 2024: space pads, the flash on "flash", the doubt
    groove(82, 91, kicks=False, claps=False, hats=True, cutoff=1600, gain=0.7)
    pad.add(pad_chord(["A2", "E3", "B3", "G4"], T(12), (400, 2200), attack=0.4), 82, 0.22)
    flash = word_t("S12", 6)                    # "flash,"
    fx.add(hit(2.5), flash / BEAT, 0.5)
    fx.add(riser(T(1.5)), flash / BEAT - 1.5, 0.2)
    fx.add(sigtone(T(3.5), [0, 1, 0.5, 0.2, 0]), flash / BEAT, 0.05)
    bass.add(bass_note("A1", T(3), 300), 91.5, 0.4)

    # ---- 94-99 LOOP: the pulse comes back, rising into the hit that opens the Short
    groove(94, 99, kicks=True, claps=False, hats=True, arps=True, bassline=True, cutoff=2200, gain=0.75)
    pad.add(pad_chord(["A2", "E3", "C4", "B4"], T(5), (500, 1800), attack=0.2), 94, 0.2)
    fx.add(riser(T(3.0)), 96, 0.24)

    # ---- mix
    ir = reverb_ir(2.2, 0.7, seed_=9)
    wet_src = synth.x * 0.4 + pad.x * 0.5 + fx.x * 0.3 + drums.x * 0.06
    wet = np.stack([signal.fftconvolve(wet_src[c], ir[c])[: wet_src.shape[1]] for c in range(2)])
    kick_t = [T(b) for b in range(0, NBEATS)]
    pump = sidechain(kick_t, bass.x.shape[1], 0.3, 0.12)
    bedm = drums.x * 0.9 + bass.x * pump * 0.85 + synth.x * pump * 0.8 + pad.x * 0.8 + fx.x * 0.8 + amb.x * 0.8 + wet * 0.45
    bedm = np.stack([filt(ch, "highpass", 28) for ch in bedm])[:, :N]
    g = np.ones(N)

    def gate(b0, b1, floor=0.0, ramp=0.03):
        a, b = int(T(b0) * SR), int(T(b1) * SR)
        r = int(ramp * SR)
        g[a:b] = np.minimum(g[a:b], floor)
        g[max(0, a - r):a] = np.minimum(g[max(0, a - r):a], np.linspace(1, floor, len(g[max(0, a - r):a])))
        g[b:b + r] = np.minimum(g[b:b + r], np.linspace(floor, 1, len(g[b:b + r])))
    gate(68.4, 71.4, 0.05, 0.08)                    # "It never came back." holds its breath
    gate(25.85, 25.98, 0.15, 0.01)                  # a gap before the letters
    bedm = bedm * g
    bedm /= np.abs(bedm).max() + 1e-9
    bedm *= 0.6
    sf.write(HERE / "music.wav", bedm.T, SR, subtype="PCM_24")
    sf.write(HERE / "vo.wav", vo.T, SR, subtype="PCM_24")

    grid = {"bpm": BPM, "period": BEAT, "offset": 0.0, "designed_bpm": BPM,
            "beats": [round(T(b), 5) for b in range(NBEATS + 1)],
            "downbeats": [round(T(b), 5) for b in range(0, NBEATS + 1, 4)],
            "sections": {"hook": [0, 7], "setup": [7, 15.75], "build": [15.75, 26], "letters": [26, 33],
                         "seventy_two": [33, 43.5], "frequency": [43.5, 50.5], "ehman": [50.5, 61],
                         "wow": [61, 63.5], "decades": [63.5, 71.5], "golf": [71.5, 82], "theory": [82, 94],
                         "loop": [94, 99]},
            "source": "wow-signal/audio/score.py (designed grid)"}
    (FILM / "beats.json").write_text(json.dumps(grid, indent=1))
    (FILM / "vo.json").write_text(json.dumps({"phrases": phrases, "words": words}, indent=1))
    print(f"music.wav + vo.wav ({DUR:.1f} s), beats.json, vo.json ({len(phrases)} phrases, {len(words)} words)")


if __name__ == "__main__":
    main()
