# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = [
#   "demucs", "torch", "torchaudio", "soundfile", "numpy", "scipy",
#   "mlx-whisper; sys_platform == 'darwin' and platform_machine == 'arm64'",
#   "faster-whisper; sys_platform != 'darwin' or platform_machine != 'arm64'",
# ]
# ///
"""Lyric video, step 1: the vocal stem and a draft lyric sheet for a supplied song.

    uv run <skill>/scripts/lyrics.py <film> [--track song.mp3]

1. Separates the vocal (Demucs htdemucs, two stems) -> <film>/audio/stems/vocals.wav, no_vocals.wav
   (skipped when they exist). The vocal stem drives the forced alignment and the singer's lip sync;
   no_vocals is the cleaner signal for the beat grid if beats.py struggles.
2. Transcribes the vocal with two Whisper models (large-v3 and large-v3-turbo; mlx-whisper on Apple
   Silicon, faster-whisper elsewhere) in overlapping windows, dropping segments with no vocal energy
   under them (Whisper invents "Thank you." over instrumental tails).
3. Writes <film>/docs/lyrics.txt, a draft in align.py's format ('@ t0 t1 name' windows, one sung line
   per row), and <film>/docs/lyrics_check.md: every window where the models disagree, word by word.

The draft is a draft. Sung words are hard: read lyrics_check.md, settle each disagreement by ear
with the user or by acoustic evidence (align.py --candidates), fix lyrics.txt, then run align.py.
Models download on first run (~1.6 GB each + 80 MB for Demucs) into the Hugging Face cache.
Only for a track the user supplied for this film; the lyric sheet stays in the film folder.
"""
import argparse
import difflib
import json
import platform
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

MLX = sys.platform == "darwin" and platform.machine() == "arm64"
MODELS = ["mlx-community/whisper-large-v3-mlx", "mlx-community/whisper-large-v3-turbo"] if MLX else ["large-v3", "large-v3-turbo"]


def separate(film, track):
    stems = film / "audio" / "stems"
    voc = stems / "vocals.wav"
    if voc.exists():
        print(f"vocal stem: {voc} (exists)")
        return voc
    stems.mkdir(parents=True, exist_ok=True)
    wav = stems / "_in.wav"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(track), "-ar", "44100", "-ac", "2", str(wav)], check=True)
    subprocess.run([sys.executable, "-m", "demucs", "--two-stems=vocals", "-n", "htdemucs", "-o", str(stems), str(wav)], check=True)
    out = stems / "htdemucs" / "_in"
    (out / "vocals.wav").rename(voc)
    (out / "no_vocals.wav").rename(stems / "no_vocals.wav")
    for p in (out, out.parent):
        p.rmdir()
    wav.unlink()
    print(f"vocal stem: {voc}")
    return voc


def transcribe(model, y16, windows):
    """Whisper over windows (seconds); returns [{t0, t1, text, words:[{w,t0,t1}]}] in song time."""
    segs = []
    if MLX:
        import mlx_whisper
        run = lambda a: mlx_whisper.transcribe(a, path_or_hf_repo=model, word_timestamps=True, language="en",
                                               condition_on_previous_text=False)["segments"]
    else:
        from faster_whisper import WhisperModel
        wm = WhisperModel(model, device="auto", compute_type="auto")
        run = lambda a: [{"start": s.start, "end": s.end, "text": s.text, "words": [{"word": w.word, "start": w.start, "end": w.end} for w in (s.words or [])],
                          "no_speech_prob": s.no_speech_prob} for s in wm.transcribe(a, language="en", word_timestamps=True, condition_on_previous_text=False)[0]]
    for a, b in windows:
        # no no_speech_prob filter: Whisper scores sung vocals over a mix as likely "no speech" and would
        # drop whole verses; hallucinations are caught by the vocal-energy check in main() instead
        for s in run(y16[int(a * 16000):int(b * 16000)]):
            segs.append({"t0": s["start"] + a, "t1": s["end"] + a, "text": s["text"].strip(),
                         "words": [{"w": w["word"].strip(), "t0": w["start"] + a, "t1": w["end"] + a} for w in s.get("words", [])]})
    # overlapping windows: keep each stretch of song from the window it was most central in
    segs.sort(key=lambda s: s["t0"])
    out = []
    for s in segs:
        if out and s["t0"] < out[-1]["t1"] - 0.3:
            continue
        out.append(s)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("film")
    ap.add_argument("--track", help="the song (default: <film>/audio/music.wav)")
    a = ap.parse_args()
    film = Path(a.film)
    track = Path(a.track) if a.track else film / "audio" / "music.wav"
    if not track.exists():
        sys.exit(f"{track} missing: pass --track song.mp3")
    voc = separate(film, track)

    y, sr = sf.read(voc)
    y = y.mean(axis=1) if y.ndim > 1 else y
    y16 = resample_poly(y, 160, sr // 100).astype(np.float32) if sr != 16000 else y.astype(np.float32)
    dur = len(y16) / 16000
    # vocal activity (to drop hallucinated segments and to report what has no words)
    hop = 160
    rms = np.sqrt(np.array([np.mean(y16[i:i + 1024] ** 2) for i in range(0, len(y16) - 1024, hop)]) + 1e-12)
    db = 20 * np.log10(rms)
    active = lambda t0, t1: np.mean(db[int(t0 * 100):max(int(t0 * 100) + 1, int(t1 * 100))] > np.percentile(db, 95) - 25)

    windows = [(max(0.0, s), min(dur, s + 30.0)) for s in np.arange(0, dur, 28.0)]
    runs = {}
    for m in MODELS:
        print(f"transcribing with {m} ...")
        runs[m] = [s for s in transcribe(m, y16, windows) if active(s["t0"], s["t1"]) > 0.3]
    # windows for the sheet: stretches of song where either model hears singing, split where the vocal
    # pauses > 1 s; each window's draft comes from whichever model heard more words there (one model's
    # blind spot must never silently delete a verse), and the other reading goes to the check list
    every = sorted([s for m in MODELS for s in runs[m]], key=lambda s: s["t0"])
    spans = []
    for s in every:
        gap = s["t0"] - spans[-1][1] if spans else 9e9
        # join across short pauses, but keep alignment windows under ~18 s (split at the next pause)
        if spans and gap <= 1.0 and (s["t1"] - spans[-1][0] < 18 or gap < 0.2):
            spans[-1][1] = max(spans[-1][1], s["t1"])
        else:
            spans.append([s["t0"], s["t1"]])
    inside = lambda segs, a, b: [s for s in segs if s["t0"] < b and s["t1"] > a]
    docs = film / "docs"; docs.mkdir(exist_ok=True)
    lines = ["# Draft lyric sheet from Whisper (" + ", ".join(MODELS) + "). Check docs/lyrics_check.md, fix by ear,",
             "# then: uv run <skill>/scripts/align.py <film>",
             "# '@ t0 t1 name' = an alignment window in seconds; one sung line per row; word|spoken_form for",
             "# acronyms, numbers and symbols (e.g. AI|a_i, 2025|twenty_twenty_five).", ""]
    check = ["# Lyric check: where the two models disagree", "",
             "Settle each one by ear with the user, or score the candidates against the vocal:",
             "`uv run <skill>/scripts/align.py <film> --candidates docs/candidates.txt` (see references/lyrics.md).", ""]
    primary = []
    for gi, (a0, b0) in enumerate(spans, 1):
        t0, t1 = max(0.0, a0 - 0.4), min(dur, b0 + 0.4)
        reads = {m: inside(runs[m], a0, b0) for m in MODELS}
        words = {m: sum(len(s["text"].split()) for s in reads[m]) for m in MODELS}
        best = max(MODELS, key=lambda m: words[m]); other = [m for m in MODELS if m != best][0]
        primary.extend(reads[best])
        # Whisper's segments can run 30 s+; rebuild sung lines from its words (a new line at a pause
        # > 0.35 s or after 10 words), then pack lines into alignment windows of <= 16 s
        ws = [w for s in reads[best] for w in s["words"]] or [{"w": s["text"], "t0": s["t0"], "t1": s["t1"]} for s in reads[best]]
        sung = []
        for w in ws:
            if sung and (w["t0"] - sung[-1][-1]["t1"] > 0.35 or len(sung[-1]) >= 10):
                sung.append([w])
            elif sung:
                sung[-1].append(w)
            else:
                sung.append([w])
        packs = []
        for ln in sung:
            if packs and ln[-1]["t1"] - packs[-1][0][0]["t0"] <= 16:
                packs[-1].append(ln)
            else:
                packs.append([ln])
        for pi, pk in enumerate(packs):
            a1 = t0 if pi == 0 else max(0.0, pk[0][0]["t0"] - 0.4)
            b1 = t1 if pi == len(packs) - 1 else min(dur, pk[-1][-1]["t1"] + 0.4)
            lines.append(f"@ {a1:.2f} {b1:.2f} part{gi}{'abcdefghij'[pi] if len(packs) > 1 else ''}")
            lines.extend(" ".join(w["w"] for w in ln) for ln in pk)
        mine, theirs = " ".join(s["text"] for s in reads[best]), " ".join(s["text"] for s in reads[other])
        wa, wb = mine.split(), theirs.split()
        sm = difflib.SequenceMatcher(a=[w.lower().strip(",.?!") for w in wa], b=[w.lower().strip(",.?!") for w in wb])
        diffs = [(" ".join(wa[i1:i2]), " ".join(wb[j1:j2])) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != "equal"]
        if diffs:
            check.append(f"## part{gi}  {t0:.2f}-{t1:.2f} s  (draft from {best.split('/')[-1]})")
            check.append(f"- {best.split('/')[-1]}: {mine}")
            check.append(f"- {other.split('/')[-1]}: {theirs or '(nothing)'}")
            check.extend(f"  - `{x or '(nothing)'}` vs `{y or '(nothing)'}`" for x, y in diffs)
            check.append("")
    # stretches with vocal energy but no words: vocalise, ad-libs, or words both models missed
    covered = np.zeros(int(dur * 100) + 1, bool)
    for s in primary:
        covered[int(s["t0"] * 100):int(s["t1"] * 100)] = True
    act = db > np.percentile(db, 95) - 25
    gaps, start = [], None
    for i in range(min(len(act), len(covered))):
        v = act[i] and not covered[i]
        if v and start is None: start = i
        if not v and start is not None:
            if i - start > 150: gaps.append((start / 100, i / 100))
            start = None
    if gaps:
        check.append("## Vocal with no words transcribed (vocalise? missed words?)")
        check.extend(f"- {a:.1f}-{b:.1f} s" for a, b in gaps)
    sheet = docs / "lyrics.txt"
    if sheet.exists():
        sheet = docs / "lyrics_draft.txt"
        print("docs/lyrics.txt exists: the new draft goes to docs/lyrics_draft.txt")
    sheet.write_text("\n".join(lines) + "\n")
    (docs / "lyrics_check.md").write_text("\n".join(check) + "\n")
    json.dump(runs, open(film / "audio" / "transcripts.json", "w"), indent=1)
    print(f"-> {sheet}, {docs / 'lyrics_check.md'} ({sum(1 for c in check if c.startswith('## part'))} windows to check), audio/transcripts.json")


if __name__ == "__main__":
    main()
