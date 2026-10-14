# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["torch", "torchaudio", "soundfile", "numpy", "scipy", "librosa>=0.10"]
# ///
"""Lyric video, step 2: word timing for the lyric sheet, and the singer's mouth.

    uv run <skill>/scripts/align.py <film>                          -> <film>/lyrics.json, <film>/lipsync.json
    uv run <skill>/scripts/align.py <film> --candidates FILE        rank alternative readings of a phrase

Forced alignment (torchaudio MMS_FA, a CTC acoustic model) of <film>/docs/lyrics.txt against the
vocal stem from lyrics.py (<film>/audio/stems/vocals.wav), window by window. On the project this was
built for it landed words a median 9 ms from the vocal onsets, against 30 ms for Whisper's own word
timestamps; the run prints the same check for your song.

lyrics.txt
    # comments
    @ <t0> <t1> <name>        an alignment window (seconds in the song); keep windows to 5-20 s
    One sung line per row
    acronyms|a_c_r_o_n_y_m_s  a word's spoken form for the aligner (underscores = spaces);
                              digits are spelled out automatically, other symbols are dropped
lyrics.json   {lines: [{text, section, t0, t1, words: [{w, t0, t1, score}]}]}   (seconds, song time)
lipsync.json  {rate: 100, open: [...]}   mouth openness 0..1 from the vocal envelope (180-3800 Hz)

--candidates FILE: '@ t0 t1' then one candidate reading per row (spoken form, plain words). Prints
each candidate's CTC loss per token over that window, best first. Small differences (< ~0.05) are
noise: break ties with meaning, rhyme and the user's ear, never with the score alone.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio
from scipy.signal import butter, resample_poly, sosfiltfilt

NUM = {"0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine"}


def spoken(word):
    if "|" in word:
        return word.split("|", 1)[1].replace("_", " ").split()
    w = word.lower()
    w = re.sub(r"\d", lambda m: " " + NUM[m.group(0)] + " ", w)
    w = re.sub(r"[^a-z' ]", " ", w)
    return [x for x in w.split() if x]


def load_vocal(film):
    voc = film / "audio" / "stems" / "vocals.wav"
    if not voc.exists():
        sys.exit(f"{voc} missing: run lyrics.py first (it separates the vocal)")
    y, sr = sf.read(voc)
    y = y.mean(axis=1) if y.ndim > 1 else y
    return y, sr, resample_poly(y, 16000 // 100, sr // 100).astype(np.float32)


def model():
    b = torchaudio.pipelines.MMS_FA
    return b.get_model(with_star=False).eval(), b.get_tokenizer(), b.get_aligner()


def emission(m, v16, a, b):
    wav = torch.from_numpy(v16[int(a * 16000):int(b * 16000)]).unsqueeze(0)
    with torch.inference_mode():
        em, _ = m(wav)
    return em, wav.shape[1] / em.shape[1] / 16000


def candidates(film, path):
    _, _, v16 = load_vocal(film)
    m, tok, _ = model()
    block = None
    blocks = []
    for raw in Path(path).read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("@"):
            _, a, b = line.split()[:3]
            block = (float(a), float(b), []); blocks.append(block)
        else:
            block[2].append(line)
    for a, b, cands in blocks:
        em, _ = emission(m, v16, a, b)
        lp = em.log_softmax(-1)[0]
        res = []
        for c in cands:
            ids = [i for w in tok(spoken(c) if "|" in c else [x for w in c.split() for x in spoken(w)]) for i in w]
            loss = torch.nn.functional.ctc_loss(lp.unsqueeze(1), torch.tensor([ids]), torch.tensor([lp.shape[0]]), torch.tensor([len(ids)]), blank=0, reduction="sum")
            res.append((float(loss) / len(ids), c))
        print(f"== {a:.2f}-{b:.2f} s")
        for sc, c in sorted(res):
            print(f"   {sc:6.3f}  {c}")


def align(film):
    y, sr, v16 = load_vocal(film)
    m, tok, aligner = model()
    windows, cur = [], None
    sheet = film / "docs" / "lyrics.txt"
    for raw in sheet.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("@"):
            parts = line.split(maxsplit=3)
            cur = {"t0": float(parts[1]), "t1": float(parts[2]), "section": parts[3] if len(parts) > 3 else f"w{len(windows) + 1}", "lines": []}
            windows.append(cur)
        elif cur is None:
            sys.exit(f"{sheet}: a lyric line comes before the first '@ t0 t1 name' window")
        else:
            cur["lines"].append(line)
    out = []
    for win in windows:
        em, ratio = emission(m, v16, win["t0"], win["t1"])
        display, toks = [], []
        for li, line in enumerate(win["lines"]):
            for word in line.split():
                pieces = spoken(word)
                if not pieces:
                    continue
                display.append((li, word.split("|")[0], len(pieces)))
                toks.extend(pieces)
        spans = aligner(em[0], tok(toks))
        k = 0
        lines = [{"text": " ".join(w.split("|")[0] for w in l.split()), "section": win["section"], "words": []} for l in win["lines"]]
        for li, word, n in display:
            sp = spans[k:k + n]; k += n
            lines[li]["words"].append({"w": word, "t0": round(win["t0"] + sp[0][0].start * ratio, 3), "t1": round(win["t0"] + sp[-1][-1].end * ratio, 3),
                                       "score": round(float(np.mean([s.score for piece in sp for s in piece])), 3)})
        for L in lines:
            if not L["words"]:
                continue
            L["t0"], L["t1"] = L["words"][0]["t0"], L["words"][-1]["t1"]
            # CTC confidence is low on sung vocals even when right; text that doesn't match the audio
            # shows instead as words crushed into a frame or two
            crushed = sum(1 for w in L["words"] if w["t1"] - w["t0"] < 0.035)
            flag = f"  <- check: {crushed} word(s) squeezed to < 35 ms" if crushed >= max(2, len(L["words"]) // 3) else ""
            print(f"{L['t0']:7.2f}-{L['t1']:7.2f} [{L['section']}] {L['text'][:60]}{flag}")
            out.append(L)
    (film / "lyrics.json").write_text(json.dumps({"source": "docs/lyrics.txt aligned to audio/stems/vocals.wav (MMS_FA)", "lines": out}, indent=1))

    # check: how far word starts sit from the vocal's own onsets
    import librosa
    yv, svr = librosa.load(film / "audio" / "stems" / "vocals.wav", sr=22050, mono=True)
    env = librosa.onset.onset_strength(y=yv, sr=svr, hop_length=110)
    on = librosa.onset.onset_detect(onset_envelope=env, sr=svr, hop_length=110, backtrack=True, units="time", delta=0.05)
    d = np.array([on[np.argmin(np.abs(on - w["t0"]))] - w["t0"] for L in out for w in L["words"]]) if len(on) else np.array([0.0])
    print(f"word starts vs vocal onsets: median {np.median(d) * 1000:+.0f} ms, {np.mean(np.abs(d) < 0.06) * 100:.0f}% within 60 ms")

    # mouth: 100 Hz envelope of the vocal band, gated, compressed to 0..1
    band = sosfiltfilt(butter(4, [180, 3800], "bandpass", fs=sr, output="sos"), y)
    hop = sr // 100
    rms = np.sqrt(np.array([np.mean(band[i:i + hop] ** 2) for i in range(0, len(band) - hop, hop)]) + 1e-12)
    db = 20 * np.log10(rms)
    ref = np.percentile(db[db > -60], 95) if np.any(db > -60) else -20
    o = np.clip((db - (ref - 30)) / 30, 0, 1) ** 1.3
    o = np.convolve(o, np.ones(3) / 3, mode="same")
    (film / "lipsync.json").write_text(json.dumps({"rate": 100, "open": [round(float(x), 3) for x in o]}))
    print(f"-> {film}/lyrics.json ({len(out)} lines), {film}/lipsync.json ({len(o)} frames)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("film")
    ap.add_argument("--candidates")
    a = ap.parse_args()
    if a.candidates:
        candidates(Path(a.film), a.candidates)
    else:
        align(Path(a.film))
