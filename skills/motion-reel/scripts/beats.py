# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10", "numpy", "scipy", "soundfile"]
# ///
"""Music + beat grid for a film: measure a supplied track, or synthesize a bed. -> beats.json

    uv run <skill>/scripts/beats.py <film> --track song.mp3 [--start auto|SECONDS]
    uv run <skill>/scripts/beats.py <film> --synth [--bpm auto|128] [--key D]
        [--mode major|minor|mixolydian|dorian] [--flavor house|tabla|lofi] [--drop BAR] [--seed N]

Writes <film>/audio/music.wav (48 kHz stereo, peak -3 dBFS; mix.mjs masters later) and
<film>/beats.json: offset, period, beats, downbeats, sections, bar_energy + fit stats.
The film reads the grid; the shot list is written against it. Duration comes from film.json.

--track: the excerpt starts on a downbeat (auto = the loudest window that fits), is cut hard on
         the downbeat and faded over the last 0.5 s. The grid is measured, never assumed.
--synth: bpm auto picks the tempo nearest 128 that makes the duration whole bars. Sections:
         intro (bars before --drop), main, end (last bar: the resolve under the end card).
"""

import argparse
import json
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dsp  # noqa: E402
from dsp import SR, Bus, bass_note, bol, clap, crash, harmonium, hat, hz, kick, keys, ks_pluck, measure_beats, \
    midi, note_name, pad_chord, pluck, reverb, sidechain, sub_drop  # noqa: E402

MODES = {  # scale degrees (semitones) and a 4-chord loop as (degree index, quality)
    "major": ([0, 2, 4, 5, 7, 9, 11], [(0, ""), (4, ""), (5, "m"), (3, "")]),              # I V vi IV
    "minor": ([0, 2, 3, 5, 7, 8, 10], [(0, "m"), (5, ""), (2, ""), (6, "")]),              # i VI III VII
    "mixolydian": ([0, 2, 4, 5, 7, 9, 10], [(0, ""), (6, ""), (3, ""), (0, "")]),          # I bVII IV I
    "dorian": ([0, 2, 3, 5, 7, 9, 10], [(0, "m"), (3, ""), (0, "m"), (6, "")]),            # i IV i bVII
}


def chord(root_midi, quality, octave_shift=0):
    third = 3 if quality == "m" else 4
    r = root_midi + 12 * octave_shift
    return [note_name(r), note_name(r + 7), note_name(r + 12 + third), note_name(r + 19)], note_name(r - 12)


def auto_bpm(duration, target=128, lo=112, hi=136):
    best = None
    for bpm in np.arange(lo, hi + 0.001, 0.5):
        beats = duration * bpm / 60
        if abs(beats / 4 - round(beats / 4)) < 1e-6:
            if best is None or abs(bpm - target) < abs(best - target):
                best = float(bpm)
    return best or float(target)


def synth(film, duration, bpm, key, mode, flavor, drop_bar):
    beat = 60 / bpm
    n_beats = int(round(duration / beat))
    bars = n_beats // 4
    drop = min(drop_bar, max(bars - 2, 0)) * 4
    last = (bars - 1) * 4
    scale, prog = MODES[mode]
    root = midi(f"{key}3")

    drums, perc, bass, music = (Bus(duration, bpm) for _ in range(4))
    loop = [chord(root + scale[d], q) for d, q in prog]

    for b in range(n_beats):
        bar = b // 4
        main = drop <= b < last
        if b < drop:
            drums.add(kick(soft=True), b, 0.5)
            drums.add(hat(), b + 0.5, 0.12, pan=0.25)
        elif main:
            drums.add(kick(), b, 1.0)
            if b % 2 == 1:
                drums.add(clap(), b, 0.45 if flavor != "lofi" else 0.3, pan=0.05)
            drums.add(hat(), b + 0.5, 0.24, pan=0.25)
            if flavor == "house":
                for s in (0.25, 0.75):
                    drums.add(hat(), b + s, 0.08, pan=-0.3)
        if flavor == "tabla" and b < last:
            theka = ["dha", "ge", "na", "ti", "na", "ka", "dhi", "na"]
            for k in (0, 1):
                bl = theka[(b % 4) * 2 + k]
                perc.add(bol(bl, glide=1.6 if bl == "dhi" else 1.0, sa=hz(f"{key}5")), b + 0.5 * k, 0.45 if k == 0 else 0.3, pan=-0.18)
        # chord changes each bar
        if b % 4 == 0 and b < last:
            notes, broot = loop[bar % 4]
            L = 4 * beat + 0.1
            if b < drop:
                music.add(harmonium(notes[:3], L, 1600) if flavor == "tabla" else pad_chord(notes, L, (500, 1400), attack=0.05), b, 0.3)
            elif flavor == "lofi":
                music.add(keys(notes, L), b, 0.35)
                music.add(keys(notes, L * 0.5), b + 2.5, 0.2)
            else:
                music.add(pad_chord(notes, L, 2600, attack=0.01), b, 0.34)
        if main:
            notes, broot = loop[bar % 4]
            for h in (0, 0.5):
                up = h == 0.5 and flavor == "house"
                nt = broot[:-1] + str(int(broot[-1]) + (1 if up else 0))
                bass.add(bass_note(nt, beat / 2 * 0.9, 1100), b + h, 0.62 if h == 0 else 0.5)
            if flavor == "house" and b % 2 == 0:
                music.add(pluck([n[:-1] + str(int(n[-1]) + 1) for n in notes[1:]]), b + 0.5, 0.25, pan=0.15)
            if flavor == "tabla" and b % 4 == 3:
                for j, deg in enumerate((4, 5, 6, 7)):
                    music.add(ks_pluck(hz(note_name(root + 12 + scale[deg % 7] + 12 * (deg // 7))), 0.5, 0.7, 0.45), b + j * 0.25, 0.25, pan=0.2)
    # the drop and the end card get a proper landing
    if drop > 0:
        rev = crash(0.9)[::-1] * 0.7
        music.add(rev, drop - 0.9 / beat, 0.25)
        drums.add(sub_drop(1.0, 80, 32), drop, 0.6)
        drums.add(crash(1.4), drop, 0.25)
    notes, _ = chord(root, "m" if scale[2] == 3 else "")
    music.add(pad_chord(notes + [note_name(midi(notes[-1]) + 5)], 4 * beat + 1.0, (5000, 1400), attack=0.005, release=0.8), last, 0.5)
    drums.add(kick(), last, 1.0)
    drums.add(crash(2.2), last, 0.3)
    drums.add(sub_drop(1.2, 70, 30), last, 0.5)

    N = drums.n
    duck = sidechain([i * beat for i in range(drop, last)], drums.x.shape[1], 0.5, 0.1)
    mix = drums.x + perc.x * 0.85 + (bass.x + reverb(music.x, 0.35)) * duck
    mix = mix[:, :N]
    fade = int(0.35 * SR)
    mix[:, -fade:] *= np.linspace(1, 0, fade) ** 2
    mix *= 10 ** (-3 / 20) / (np.abs(mix).max() + 1e-9)

    grid_src = (drums.x + perc.x * 0.5 + bass.x)[:, :N].mean(axis=0)
    grid = measure_beats(grid_src.astype(np.float32), SR, bpm, n_beats=n_beats + 1)
    grid["sections"] = ([{"name": "intro", "beat": 0}] if drop else []) + \
        [{"name": "main", "beat": drop}, {"name": "end", "beat": last}]
    grid["source"] = f"synth {flavor} {key} {mode} {bpm} bpm (beats.py), grid measured on the drum stem"
    return mix, grid


def track(film, path, duration, start):
    y, sr = librosa.load(path, sr=SR, mono=False)
    if y.ndim == 1:
        y = np.stack([y, y])
    mono = y.mean(axis=0)
    full = measure_beats(mono, SR, 120)
    period, offset = full["period"], full["offset"]
    # downbeat phase: which of the 4 beat positions carries the most low-end attack (the kick on 1)
    low = librosa.onset.onset_strength(y=dsp.filt(mono, "lowpass", 150), sr=SR, hop_length=512)
    lt = librosa.times_like(low, sr=SR, hop_length=512)
    bts = np.array(full["beats"])
    at = np.interp(bts, lt, low)
    phase = int(np.argmax([at[p::4].mean() for p in range(4)]))
    downs = bts[phase::4]
    fits = downs[downs + duration <= len(mono) / SR]
    if not len(fits):
        raise SystemExit(f"track is shorter than {duration}s")
    if start == "auto":
        rms = librosa.feature.rms(y=mono, hop_length=512)[0]
        rt = librosa.times_like(rms, sr=SR, hop_length=512)
        score = [rms[(rt >= d) & (rt < d + duration)].mean() for d in fits]
        t0 = float(fits[int(np.argmax(score))])
    else:
        t0 = float(fits[np.argmin(np.abs(fits - float(start)))])
    a, b = int(t0 * SR), int((t0 + duration) * SR)
    cut = y[:, a:b].copy()
    fi, fo = int(0.005 * SR), int(0.5 * SR)
    cut[:, :fi] *= np.linspace(0, 1, fi)
    cut[:, -fo:] *= np.linspace(1, 0, fo) ** 2
    cut *= 10 ** (-3 / 20) / (np.abs(cut).max() + 1e-9)
    # measure the grid inside the excerpt (tempo can drift over a whole song)
    grid = measure_beats(mono[max(0, a - SR):b].astype(np.float32), SR, full["bpm"], t0=min(t0, 1.0))
    n = int(duration / grid["period"]) + 1
    grid["beats"] = [round(grid["offset"] + grid["period"] * i, 5) for i in range(n)]
    grid["sections"] = []
    grid["source"] = f"{Path(path).name} from {t0:.3f}s (downbeat), grid measured in the excerpt"
    return cut, grid


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("film")
    ap.add_argument("--track")
    ap.add_argument("--start", default="auto")
    ap.add_argument("--synth", action="store_true")
    ap.add_argument("--bpm", default="auto")
    ap.add_argument("--key", default="D")
    ap.add_argument("--mode", default="major", choices=MODES)
    ap.add_argument("--flavor", default="house", choices=["house", "tabla", "lofi"])
    ap.add_argument("--drop", type=int, default=None, help="bar the main section starts (0-based)")
    ap.add_argument("--duration", type=float)
    ap.add_argument("--seed", type=int, default=20260929)
    a = ap.parse_args()
    if bool(a.track) == bool(a.synth):
        ap.error("pass exactly one of --track or --synth")

    film = Path(a.film)
    cfg = json.loads((film / "film.json").read_text()) if (film / "film.json").exists() else {}
    duration = a.duration or float(cfg.get("duration", 15))
    dsp.seed(a.seed)
    (film / "audio").mkdir(parents=True, exist_ok=True)

    if a.synth:
        bpm = auto_bpm(duration) if a.bpm == "auto" else float(a.bpm)
        bars = int(round(duration * bpm / 240))
        drop = a.drop if a.drop is not None else (1 if bars <= 6 else 2 if bars <= 10 else 4)
        mix, grid = synth(film, duration, bpm, a.key, a.mode, a.flavor, drop)
    else:
        mix, grid = track(film, a.track, duration, a.start)

    grid["beats"] = [b for b in grid["beats"] if b < duration + 0.5]
    grid["downbeats"] = grid["beats"][::4]
    # energy per bar: where the track lifts, for the shot list
    mono = mix.mean(axis=0)
    bar_s = grid["period"] * 4
    grid["bar_energy"] = [round(float(np.sqrt(np.mean(mono[int((grid["offset"] + i * bar_s) * SR):int((grid["offset"] + (i + 1) * bar_s) * SR)] ** 2) + 1e-12)), 4)
                          for i in range(int(duration / bar_s))]
    grid["duration"] = duration
    sf.write(film / "audio" / "music.wav", mix.T, SR, subtype="PCM_24")
    (film / "beats.json").write_text(json.dumps(grid, indent=1))
    print(f"{grid['source']}")
    print(f"grid: {grid['bpm']} bpm, offset {grid['offset'] * 1000:.1f} ms, {len(grid['beats'])} beats, "
          f"fit {grid['fit_inliers']} inliers, rms {grid['fit_residual_ms']} ms")
    if grid["sections"]:
        print("sections: " + ", ".join(f"{s['name']} @ beat {s['beat']}" for s in grid["sections"]))
    print(f"-> {film}/audio/music.wav, {film}/beats.json")


if __name__ == "__main__":
    main()
