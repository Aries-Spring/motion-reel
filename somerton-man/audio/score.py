# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10", "numpy", "scipy", "soundfile"]
# ///
"""THE SOMERTON MAN (YouTube Short): score, voice edit and beat grid.

    MOTION_REEL_SKILL=<skill> uv run somerton-man/audio/score.py

100 BPM, 99 beats = 59.4 s, D minor. A 1948 noir bed (walking upright bass, brushes, vibraphone, a
muted horn line) cut with trailer hits, and a santur-like line in D Phrygian dominant for the book of
Persian poems. The narration (ElevenLabs "Brian", take sA, force-aligned) is cut into phrases whose
speech onsets land on the grid; the last line ("...or what he meant by two words:") runs into the first
("Tamám Shud."), so the Short loops.

Reads   audio/el/sA.mp3 + sA.fa.json, audio/el/sfx_*.mp3 (beds)
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
TAKE = "sA"
seed(1948)


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
    ("P1", 0, 1, 0, "narr"),         # Tamám Shud.
    ("P2", 2, 12, 3, "narr"),        # Two words, found in a secret pocket... on a dead man.
    ("P3", 13, 14, 10.5, "narr"),    # December, 1948.
    ("P4", 15, 26, 13.5, "narr"),    # He's found on an Australian beach, every label removed from his clothes.
    ("P5", 27, 28, 21.5, "narr"),    # No wallet.
    ("P6", 29, 30, 23, "narr"),      # No name.
    ("P7", 31, 38, 24.5, "narr"),    # And no one can say what killed him.
    ("P8", 39, 52, 28, "narr"),      # The scrap was torn from the last page of a book of Persian poems.
    ("P9", 53, 57, 34.5, "narr"),    # It means: it is finished.
    ("P10", 58, 73, 39, "narr"),     # Then a man hands in the book. He'd found it in the back of his car.
    ("P11", 74, 82, 45.5, "narr"),   # Inside the back cover: a phone number... and this.
    ("P12", 83, 87, 54, "narr"),     # It has never been solved.
    ("P13", 88, 99, 57.5, "narr"),   # The number leads to a nurse who lives just up the beach.
    ("P14", 100, 116, 63, "narr"),   # Shown a cast of his face, she looks ready to faint... and says she doesn't know him.
    ("P15", 117, 124, 72.5, "narr"), # For over seventy years, he has no name.
    ("P16", 125, 135, 77, "narr"),   # Then, DNA from hair caught in that cast gives researchers one:
    ("P17", 136, 137, 85, "narr"),   # Carl Webb.
    ("P18", 138, 156, 89, "narr"),   # But we still don't know how he died, what the code says... or what he meant by two words:
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

def upright(note, length=0.5, gain=1.0):
    """Upright bass pizzicato: a low Karplus-Strong pluck with a thump."""
    f = hz(note)
    x = ks_pluck(f, length, bright=0.25, buzz=0.0)
    n = len(x)
    t = tvec(n)
    thump = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.18) * 0.8
    return filt((x * 0.9 + thump) * (1 - np.exp(-t / 0.002)), "lowpass", 1200) * gain


def brush(swish=False):
    n = int((0.22 if swish else 0.06) * SR)
    t = tvec(n)
    x = filt(rng.standard_normal(n), "bandpass", [2000, 9000])
    env = np.sin(np.pi * np.clip(t / (n / SR), 0, 1)) ** 0.7 if swish else np.exp(-t / 0.012)
    return x * env


def vibe(note, length=2.4, trem=5.5):
    """Vibraphone: sine + tuned 4th partial, motor tremolo."""
    f = hz(note)
    n = int(length * SR)
    t = tvec(n)
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / 0.15)
    x *= np.exp(-t / (length * 0.45)) * (1 - np.exp(-t / 0.002))
    return x * (0.75 + 0.25 * np.sin(2 * np.pi * trem * t))


def santur(note, length=1.2):
    """Hammered dulcimer: a bright metallic pluck, doubled a few cents apart."""
    f = hz(note)
    a = ks_pluck(f, length, bright=0.85, buzz=0.15)
    b = ks_pluck(f * 1.004, length, bright=0.85, buzz=0.15)
    return (a + b) * 0.5


def horn(note, length):
    """A muted trumpet line: saw through a nasal bandpass, slow vibrato."""
    f = hz(note)
    n = int(length * SR)
    t = tvec(n)
    v = 1 + 0.006 * np.sin(2 * np.pi * 5 * t) * np.clip(t / 0.4, 0, 1)
    x = saw(f * v, n, rng.uniform())
    x = filt(filt(x, "bandpass", [700, 2600], 2), "lowpass", 3000)
    return x * adsr(n, 0.06, 0.2, 0.75, 0.15)


def hit(length=2.2):
    n = int(length * SR)
    t = tvec(n)
    sub = sub_drop(length, 85, 30)
    crack = filt(rng.standard_normal(n), "bandpass", [300, 5000]) * np.exp(-t / 0.05)
    stab = sum(saw(hz(nt), n, rng.uniform()) for nt in ("D2", "A2", "D3", "F3")) / 4
    stab = sweep_filter(stab, 150 + 2200 * np.exp(-t / 0.22), "lowpass", 1.1) * np.exp(-t / 0.7)
    return np.tanh(1.5 * (sub * 0.9 + crack * 0.5 + stab * 0.7))


def tick(hi=True):
    n = int(0.04 * SR)
    t = tvec(n)
    f = 3000 if hi else 2200
    return filt(rng.standard_normal(n), "bandpass", [f * 0.7, f * 1.3]) * np.exp(-t / 0.004)


def heartbeat():
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
    return filt(np.tanh(1.5 * out), "lowpass", 200, 2)


def arp(note, length=0.16, cutoff=2600):
    f = hz(note)
    n = int(length * SR)
    t = tvec(n)
    x = saw(f, n, rng.uniform()) * 0.6 + np.sign(np.sin(2 * np.pi * f * 1.003 * t)) * 0.3
    x = sweep_filter(x, 260 + cutoff * np.exp(-t / 0.05), "lowpass", 1.3)
    return x * np.exp(-t / (length * 0.45)) * (1 - np.exp(-t / 0.002))


def bed(name, b0, b1, gain, fade=1.0, lp=None, hp=None):
    x = load(f"sfx_{name}")
    n = int(T(b1 - b0) * SR)
    x = np.tile(x, int(np.ceil(n / len(x))) + 1)[:n]
    if lp:
        x = filt(x, "lowpass", lp, 2)
    if hp:
        x = filt(x, "highpass", hp, 2)
    k = int(fade * SR)
    x[:k] *= np.linspace(0, 1, k)
    x[-k:] *= np.linspace(1, 0, k)
    return x * gain


# D minor walking line, one note per beat, through Dm - Gm/D - A7 - Dm
WALK = ["D2", "F2", "A2", "C3", "G2", "Bb2", "D3", "Bb2", "A2", "C#3", "E3", "G2", "D2", "A1", "C2", "C#2"]
CHORDS = [["D3", "F3", "A3", "C4"], ["G3", "Bb3", "D4", "F4"], ["A3", "C#4", "E4", "G4"], ["D3", "F3", "A3", "E4"]]


def main():
    bass, drums, keys_, fx, amb, mel = (Bus(DUR, BPM) for _ in range(6))
    vo, phrases, words = build_vo()

    def wt(pid, k=0):
        return [w for w in words if w["p"] == pid][k]["t0"] / BEAT

    def walk(b0, b1, gain=1.0, brushes=True):
        for b in np.arange(np.ceil(b0), b1, 1.0):
            nt = WALK[int(b) % 16]
            bass.add(upright(nt, BEAT * 0.95), b, 0.62 * gain)
            if brushes:
                drums.add(brush(True), b - 0.08, 0.05 * gain)
                if int(b) % 2 == 1:
                    drums.add(brush(False), b, 0.16 * gain, pan=0.15)
                drums.add(brush(False), b + 0.66, 0.06 * gain, pan=-0.2)

    def vibes(b0, b1, gain=0.18):
        for b in np.arange(b0, b1, 4):
            ch = CHORDS[int(b // 4) % 4]
            for k, nt in enumerate(ch):
                keys_.add(vibe(nt.replace("3", "4").replace("44", "5"), T(4) * 0.95), b + k * 0.08, gain / len(ch) * 2.2, pan=(k - 1.5) * 0.25)

    # ---- beds
    amb.add(bed("crackle", 0, 99, 0.10, fade=0.02), 0)
    amb.add(bed("waves", 3, 28, 0.40, fade=1.0, lp=5000), 3)
    amb.add(bed("waves", 54, 63, 0.25, fade=1.0, lp=4000), 57.5)

    # ---- 0-3 HOOK: a hit, a held minor-major seventh on the vibes
    fx.add(hit(2.8), 0, 0.7)
    for k, nt in enumerate(["D4", "F4", "A4", "C#5"]):
        keys_.add(vibe(nt, T(3.2)), 0.02 * k, 0.16)
    # ---- 3-28 the beach: the walk starts under "two words"
    walk(3, 21, gain=0.8)
    vibes(4, 20, 0.16)
    fx.add(hit(1.6), 10.5, 0.35)                 # December 1948
    for b in (21.5, 23):                          # No wallet. No name.
        keys_.add(sum(keys([nt], T(0.6)) for nt in ["D3", "F3", "Ab3"]) / 3, b, 0.5)
        fx.add(sub_drop(0.8, 70, 35), b, 0.35)
    bass.add(upright("D1", T(3)), 24.5, 0.6)
    fx.add(riser(T(3.5)), 24.5, 0.18)

    # ---- 28-39 THE BOOK: santur in D Phrygian dominant over a drone
    fx.add(hit(2.2), 28, 0.45)
    keys_.add(harmonium(["D2", "A2", "D3"], T(11), 1400), 28, 0.22)
    line = [("D5", 28.5), ("Eb5", 29), ("F#5", 29.5), ("G5", 30), ("A5", 31), ("Bb5", 31.5), ("A5", 32), ("G5", 32.5),
            ("F#5", 33.5), ("Eb5", 34), ("D5", 34.5), ("A4", 36.5), ("Bb4", 37), ("A4", 37.5), ("F#4", 38), ("D4", 38.5)]
    for nt, b in line:
        mel.add(santur(nt, 1.0), b, 0.22, pan=0.25 * np.sin(b * 2))
    # ---- 39-45.5 THE CAR: the walk again
    walk(39, 45.5, gain=0.9)
    vibes(40, 44, 0.14)
    # ---- 45.5-54 THE CODE: down to a drone, pencil and ticks, the hit on "this"
    keys_.add(harmonium(["D2", "A2"], T(9), 900), 45.5, 0.18)
    this = wt("P11", 8)
    fx.add(hit(2.5), this, 0.6)
    for b in np.arange(np.ceil(this * 2) / 2, 54, 0.5):
        drums.add(tick(int(b * 2) % 2 == 0), b, 0.12)
    solved = wt("P12", 4)
    fx.add(hit(2.0), solved, 0.45)                # "solved": the stamp
    # ---- 57.5-72.5 THE NURSE: walk + a muted horn line, heartbeat on "faint"
    walk(57.5, 72, gain=0.85)
    for nt, b, L in [("A4", 58, 1.5), ("G4", 59.5, 0.5), ("F4", 60, 1), ("E4", 61, 1), ("D4", 62, 2),
                     ("F4", 64, 1), ("A4", 65, 1), ("C5", 66, 1.5), ("Bb4", 67.5, 0.5), ("A4", 68, 2)]:
        mel.add(horn(nt, T(L) * 0.95), b, 0.16, pan=-0.15)
    faint = wt("P14", 10)
    for k in range(3):
        drums.add(heartbeat(), faint + k * 0.75, 0.55)
    # ---- 72.5-85 SEVENTY YEARS: ticking, then the lab: arps rising into the name
    for b in np.arange(72.5, 77, 0.5):
        drums.add(tick(int(b * 2) % 2 == 0), b, 0.12)
    keys_.add(pad_chord(["D3", "A3", "C4", "F4"], T(12.5), (400, 2600), attack=0.5), 72.5, 0.2)
    for b in np.arange(77, 85, 0.25):
        nt = ["D5", "F5", "A5", "C6"][int(b * 4) % 4]
        mel.add(arp(nt, 0.14, 1500 + 200 * (b - 77)), b, 0.10 + 0.012 * (b - 77))
    fx.add(riser(T(4)), 81, 0.3)
    webb = wt("P17", 0)
    fx.add(hit(3.0), webb, 0.7)
    for k, nt in enumerate(["D3", "A3", "D4", "F#4", "A4"]):
        keys_.add(vibe(nt, T(4)), webb + 0.03 * k, 0.16)
    keys_.add(pad_chord(["D3", "A3", "D4", "F#4"], T(4), (700, 3500), attack=0.05, release=0.6), webb, 0.25)
    # ---- 89-99 THE QUESTIONS: the walk returns, thins, and leaves room for the loop's hit
    walk(89, 97, gain=0.7)
    vibes(89, 97, 0.14)
    fx.add(riser(T(3.0)), 96, 0.2)

    # ---- mix
    ir = reverb_ir(2.4, 0.8, seed_=9)
    wet_src = keys_.x * 0.5 + mel.x * 0.45 + fx.x * 0.25 + drums.x * 0.1
    wet = np.stack([signal.fftconvolve(wet_src[c], ir[c])[: wet_src.shape[1]] for c in range(2)])
    bedm = bass.x * 0.95 + drums.x * 0.8 + keys_.x * 0.85 + fx.x * 0.8 + amb.x * 0.8 + mel.x * 0.85 + wet * 0.45
    bedm = np.stack([filt(ch, "highpass", 28) for ch in bedm])[:, :N]
    g = np.ones(N)

    def gate(b0, b1, floor=0.0, ramp=0.03):
        a, b = int(T(b0) * SR), int(T(b1) * SR)
        r = int(ramp * SR)
        g[a:b] = np.minimum(g[a:b], floor)
        g[max(0, a - r):a] = np.minimum(g[max(0, a - r):a], np.linspace(1, floor, len(g[max(0, a - r):a])))
        g[b:b + r] = np.minimum(g[b:b + r], np.linspace(floor, 1, len(g[b:b + r])))
    gate(98.4, 99.0, 0.25, 0.3)                   # a breath before the loop's hit
    bedm = bedm * g
    bedm /= np.abs(bedm).max() + 1e-9
    bedm *= 0.6
    sf.write(HERE / "music.wav", bedm.T, SR, subtype="PCM_24")
    sf.write(HERE / "vo.wav", vo.T, SR, subtype="PCM_24")
    grid = {"bpm": BPM, "period": BEAT, "offset": 0.0, "designed_bpm": BPM,
            "beats": [round(T(b), 5) for b in range(NBEATS + 1)],
            "downbeats": [round(T(b), 5) for b in range(0, NBEATS + 1, 4)],
            "sections": {"hook": [0, 3], "beach": [3, 28], "book": [28, 39], "car": [39, 45.5], "code": [45.5, 57.5],
                         "nurse": [57.5, 72.5], "seventy_years": [72.5, 85], "name": [85, 89], "questions": [89, 99]},
            "source": "somerton-man/audio/score.py (designed grid)"}
    (FILM / "beats.json").write_text(json.dumps(grid, indent=1))
    (FILM / "vo.json").write_text(json.dumps({"phrases": phrases, "words": words}, indent=1))
    print(f"music.wav + vo.wav ({DUR:.1f} s), beats.json, vo.json ({len(phrases)} phrases, {len(words)} words)")


if __name__ == "__main__":
    main()
